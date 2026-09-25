/**
 * 解析单个商圈 markdown → DistrictDetail（与 parse-xlsx 同构，下游共用）。
 * 数据源为 trade-area-data/district-12dim/NNN_商圈名.md，正文含「13 行表格」，
 * 兼容三种排版变体：2 列、3 列（带序号列）、行名加粗；行名允许空白变体（周边 3 公里人口）。
 * 校验/修正说明等次要表格里的行名可能撞上维度名，因此只做精确+别名匹配（不做包含兜底），
 * 并取匹配行数最多的连续表格块作为主表。
 */
import * as fs from 'node:fs';
import type { DistrictDetail, DimensionDetail, DimensionKey } from '../src/types';
import { DIMENSION_KEYS } from '../src/types';
import { DIMENSION_ALIASES, stripMarkers } from './parse-xlsx';
import { extractMetrics } from './extract-metrics';
import { extractRating } from './extract-metrics';
import { parseRegion } from './regions';

export interface ParseResult {
  district: DistrictDetail;
  warnings: string[];
}

/** 行名清洗：去空白、加粗星号、编号前缀 */
function cleanRowName(cell: string): string {
  return cell.replace(/\*\*/g, '').replace(/\s+/g, '').replace(/^（?\d+）?[.、]?/, '');
}

/** 严格匹配：仅精确或别名命中（防次要表格的长句行名误撞维度） */
function matchDimensionKeyStrict(rowName: string): DimensionKey | null {
  const n = cleanRowName(rowName);
  for (const key of DIMENSION_KEYS) {
    if (n === key || DIMENSION_ALIASES[key].some((a) => a.replace(/\s+/g, '') === n)) return key;
  }
  return null;
}

interface TableBlock {
  rows: Array<{ key: DimensionKey; value: string }>;
}

/** 按连续 '|' 行切块，块内提取命中维度的行；行名允许在第 1 或第 2 列（3 列序号表） */
function extractBlocks(lines: string[]): TableBlock[] {
  const blocks: TableBlock[] = [];
  let cur: TableBlock | null = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('|')) {
      cur = null;
      continue;
    }
    const inner = t.split('|').slice(1, -1).map((c) => c.trim());
    if (!inner.length || inner.every((c) => /^:?-{2,}:?$/.test(c))) continue;

    let nameIdx = -1;
    for (const i of [0, 1]) {
      if (i < inner.length && matchDimensionKeyStrict(inner[i])) {
        nameIdx = i;
        break;
      }
    }
    if (nameIdx < 0) continue; // 表头或无关行
    const key = matchDimensionKeyStrict(inner[nameIdx])!;
    const value = inner.slice(nameIdx + 1).join(' | ').trim();
    if (!cur) {
      cur = { rows: [] };
      blocks.push(cur);
    }
    cur.rows.push({ key, value });
  }
  return blocks;
}

/** 主表 = 匹配行数最多的块；仍缺的维度从其余块补齐（覆盖表格被拆开的文件） */
function collectDimensions(
  blocks: TableBlock[],
  filename: string,
  warnings: string[],
): Partial<Record<DimensionKey, string>> {
  const raw: Partial<Record<DimensionKey, string>> = {};
  const filled = new Set<DimensionKey>();
  const merge = (rows: TableBlock['rows']) => {
    for (const { key, value } of rows) {
      if (filled.has(key)) continue;
      if (!value) {
        warnings.push(`${filename}: 维度「${key}」内容为空`);
        continue;
      }
      raw[key] = value;
      filled.add(key);
    }
  };
  const best = blocks.reduce<TableBlock | null>(
    (acc, b) => (!acc || b.rows.length > acc.rows.length ? b : acc),
    null,
  );
  if (!best) return raw;
  merge(best.rows);
  for (const b of blocks) if (b !== best) merge(b.rows);
  return raw;
}

/** 从「项目名称及地址」行取地址：行政区段（省/市/自治区/直辖市裸名，到句读或括号为止） */
function extractAddress(name: string, rowText: string): string {
  if (!rowText) return '';
  const cleaned = stripMarkers(rowText).text;
  const rest = name && cleaned.startsWith(name) ? cleaned.slice(name.length) : cleaned;
  const m = rest.match(
    /[\u4e00-\u9fa5]{1,10}(?:省|市|自治区|特别行政区|北京|上海|天津|重庆)[^；;。（(]*/,
  );
  if (!m) return '';
  // 双写前缀（天津天津市西青区…）折叠为一个
  return m[0].replace(/^(([\u4e00-\u9fa5]{2,3}))\2市/, '$2市').trim();
}

export function parseMdContent(content: string, filename: string): ParseResult {
  const warnings: string[] = [];
  const rawDimensions = collectDimensions(extractBlocks(content.split(/\r?\n/)), filename, warnings);

  const missing = DIMENSION_KEYS.filter((k) => rawDimensions[k] === undefined);
  if (missing.length) warnings.push(`${filename}: 缺失维度 ${missing.join('、')}`);

  // 名称以文件名为准（NNN_商圈名.md），稳定且无来源标记污染
  const name = filename.replace(/\.md$/i, '').replace(/^\d+[-_]?/, '');
  const nameRow = rawDimensions['项目名称与地址'] ?? '';
  // 尾部批次只有 12 维（无名称行），退回「所在区位」行找行政区段
  const address = extractAddress(name, nameRow) || extractAddress('', rawDimensions['所在区位'] ?? '');
  if (!address) warnings.push(`${filename}: 未解析出地址`);

  const rating = extractRating(rawDimensions['项目性质'] ?? '');
  const { province, city } = parseRegion(address);

  const dimensions: Partial<Record<DimensionKey, DimensionDetail>> = {};
  for (const key of DIMENSION_KEYS) {
    const raw = rawDimensions[key];
    if (raw) dimensions[key] = stripMarkers(raw);
  }

  const inferred: NonNullable<DistrictDetail['inferred']> = {};
  const metrics = extractMetrics(
    Object.fromEntries(Object.entries(rawDimensions)) as Record<string, string>,
    inferred,
  );

  return {
    district: {
      id: '',
      name,
      address,
      province,
      city,
      rating,
      metrics,
      ...(Object.keys(inferred).length ? { inferred } : {}),
      percentiles: {},
      score: null,
      shard: 0,
      dimensions,
    },
    warnings,
  };
}

export function parseMdFile(path: string, filename: string): ParseResult {
  return parseMdContent(fs.readFileSync(path, 'utf8'), filename);
}
