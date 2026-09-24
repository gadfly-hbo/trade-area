/**
 * 用「渠道项目管理清单.xlsx」回填 district-12dim/*.md 的两类缺失：
 *   1) 项目性质行末尾追加 【项目评级】X（森马五级：S/A+/A/B/C；源无评级或已有标记则跳过）
 *   2) 尾部 12 维批次缺「项目名称及地址」行 → 在主表首行插入，地址=省+市+区+详细地址
 * 默认 dry-run 只打印将发生的改动；--apply 真正写文件。可重复执行（幂等）。
 * 用法：./node_modules/.bin/tsx scripts/backfill-md.ts [--apply]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import * as XLSXns from 'xlsx';

// xlsx 是 CJS 包（同 parse-xlsx 的兼容导入）。
// 注意：该文件声明了 1048576 行的空区域，readFile（非 dense）会陷入超慢循环，必须 readFileSync + dense。
const XLSX = ((XLSXns as { default?: typeof XLSXns }).default ?? XLSXns) as typeof XLSXns;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const XLSX_PATH = process.env.CHANNEL_XLSX ?? path.join(ROOT, 'data', 'reference', '渠道项目管理清单.xlsx');
const MD_DIR =
  process.env.TRADE_AREA_MD_DIR ?? path.resolve(ROOT, '..', 'trade-area-data', 'district-12dim');
const APPLY = process.argv.includes('--apply');

/** 匹配用归一化：去空白与间隔号，全角括号转半角 */
function norm(s: string): string {
  return s.replace(/\s+/g, '').replace(/·/g, '').replace(/（/g, '(').replace(/）/g, ')');
}

interface ChannelRecord {
  rating: string;
  province: string;
  city: string;
  district: string;
  detail: string;
}

function loadChannelList(): Map<string, ChannelRecord> {
  const wb = XLSX.read(fs.readFileSync(XLSX_PATH), { type: 'buffer', dense: true });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    blankrows: false,
  });
  const header = (rows[0] ?? []).map((h) => String(h ?? '').trim());
  const col = (name: string) => header.indexOf(name);
  const cName = col('项目名称');
  const cRating = col('森马项目评级');
  const cProv = col('省份');
  const cCity = col('城市');
  const cDist = col('区县');
  const cAddr = col('项目地址');
  if ([cName, cRating, cAddr].some((i) => i < 0)) throw new Error('缺少必要列：项目名称/森马项目评级/项目地址');

  const map = new Map<string, ChannelRecord>();
  for (const r of rows.slice(1)) {
    const name = norm(String(r?.[cName] ?? ''));
    if (!name) continue;
    if (map.has(name)) continue; // 重名取首条
    map.set(name, {
      rating: String(r?.[cRating] ?? '').trim(),
      province: String(r?.[cProv] ?? '').trim(),
      city: String(r?.[cCity] ?? '').trim(),
      district: String(r?.[cDist] ?? '').trim(),
      detail: String(r?.[cAddr] ?? '').trim(),
    });
  }
  return map;
}

/** 完整地址：直辖市用 城市+区+详址，其他拼 省+市+区+详址 */
function fullAddress(rec: ChannelRecord): string {
  const parts =
    rec.province === rec.city || !rec.province
      ? [rec.city, rec.district, rec.detail]
      : [rec.province, rec.city, rec.district, rec.detail];
  return parts.filter(Boolean).join('');
}

const NAME_ROW = /^(项目名称及地址|项目名称与地址|项目名称\/地址)$/;
const NATURE_ROW = /^项目性质$/;

/** 行首单元格清洗（去加粗/空白/「1. 」序号前缀，与 parse-md 的 cleanRowName 对齐） */
function cleanCell(cell: string): string {
  return cell.replace(/\*\*/g, '').replace(/\s+/g, '').replace(/^（?\d+）?[.、]?/, '');
}

interface TableEdit {
  /** 0-based 行号 → 新内容 */
  replace: Map<number, string>;
  /** 在该 0-based 行号前插入 */
  insertBefore: Map<number, string>;
  appendedRating: boolean;
  insertedNameRow: boolean;
  samples: string[];
}

/**
 * 在主表块（匹配维度行最多的连续 '|' 块）里做两类定位与编辑。
 */
function editMd(content: string, name: string, rec: ChannelRecord | undefined): TableEdit | null {
  const lines = content.split('\n');
  // 分组：连续以 '|' 开头的行为一个块
  interface Block { start: number; end: number; nameRow: number; natureRow: number; dimRows: number }
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim().startsWith('|')) { i++; continue; }
    const start = i;
    let nameRow = -1;
    let natureRow = -1;
    let dimRows = 0;
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      const inner = lines[i].trim().split('|').slice(1, -1).map((c) => cleanCell(c));
      const cell0 = inner[0] ?? '';
      const cell1 = inner[1] ?? '';
      if (NAME_ROW.test(cell0) || NAME_ROW.test(cell1)) nameRow = i;
      if (NATURE_ROW.test(cell0) || NATURE_ROW.test(cell1)) natureRow = i;
      if (nameRow === i || natureRow === i) dimRows++;
      i++;
    }
    blocks.push({ start, end: i - 1, nameRow, natureRow, dimRows });
  }
  const main = blocks
    .filter((b) => b.nameRow >= 0 || b.natureRow >= 0)
    .sort((a, b) => b.dimRows - a.dimRows || a.start - b.start)[0];
  if (!main) return null;

  const edit: TableEdit = { replace: new Map(), insertBefore: new Map(), appendedRating: false, insertedNameRow: false, samples: [] };

  // 1) 评级追加到项目性质行末
  if (rec?.rating && main.natureRow >= 0) {
    const line = lines[main.natureRow];
    if (!line.includes('【项目评级】')) {
      const m = line.match(/^(.*?)\s*\|\s*$/);
      if (m) {
        const newLine = `${m[1]}【项目评级】${rec.rating} |`;
        edit.replace.set(main.natureRow, newLine);
        edit.appendedRating = true;
        edit.samples.push(`+评级 ${line.replace(/^\|.*?\|\s*/, '').slice(-40)}… → …${newLine.slice(-46)}`);
      }
    }
  }

  // 2) 缺「项目名称及地址」行 → 插到首个维度行之前（表头/分隔行之后）
  if (main.nameRow < 0) {
    const addr = rec ? fullAddress(rec) : '';
    if (addr) {
      const insertAt = main.natureRow >= 0 ? main.natureRow : main.start;
      const newLine = `| 项目名称及地址 | ${name}，${addr} |`;
      edit.insertBefore.set(insertAt, newLine);
      edit.insertedNameRow = true;
      edit.samples.push(`+名称行 ${newLine}`);
    }
  }
  return edit;
}

function applyEdits(content: string, edit: TableEdit): string {
  const lines = content.split('\n');
  const out: string[] = [];
  lines.forEach((line, idx) => {
    if (edit.insertBefore.has(idx)) out.push(edit.insertBefore.get(idx)!);
    out.push(edit.replace.get(idx) ?? line);
  });
  return out.join('\n');
}

function main() {
  const channel = loadChannelList();
  const files = fs.readdirSync(MD_DIR).filter((f) => /\.md$/i.test(f)).sort();
  let ratingAdded = 0;
  let nameRowAdded = 0;
  let noChannelRecord = 0;
  const noChannelNames: string[] = [];
  let noAddress = 0;
  let changed = 0;
  const samples: string[] = [];

  for (const file of files) {
    const p = path.join(MD_DIR, file);
    const content = fs.readFileSync(p, 'utf8');
    const name = norm(file.replace(/\.md$/i, '').replace(/^\d+[-_]?/, ''));
    const rec = channel.get(name);
    if (!rec) {
      noChannelRecord++;
      noChannelNames.push(file);
    }
    const edit = editMd(content, file.replace(/\.md$/i, '').replace(/^\d+[-_]?/, ''), rec);
    if (!edit) {
      noAddress++; // 主表定位失败（理论不该发生）
      continue;
    }
    if (edit.appendedRating) ratingAdded++;
    if (edit.insertedNameRow) nameRowAdded++;
    if (edit.replace.size || edit.insertBefore.size) {
      changed++;
      if (samples.length < 8) samples.push(`${file}: ${edit.samples.join(' ; ')}`);
      if (APPLY) fs.writeFileSync(p, applyEdits(content, edit));
    }
  }

  for (const s of samples) console.log(`  · ${s}`);

  console.log(`${APPLY ? '✅ 已应用' : '🔍 dry-run（加 --apply 生效）'}：`);
  console.log(`  md 文件 ${files.length}，改动 ${changed}`);
  console.log(`  追加【项目评级】: ${ratingAdded}`);
  console.log(`  插入项目名称及地址行: ${nameRowAdded}`);
  console.log(`  Excel 无记录: ${noChannelRecord}${noChannelNames.length ? `（${noChannelNames.slice(0, 10).join('、')}${noChannelNames.length > 10 ? '…' : ''}）` : ''}`);
  if (noAddress) console.log(`  主表定位失败: ${noAddress}`);
}

main();
