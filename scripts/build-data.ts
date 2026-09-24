/**
 * ETL 主入口：商圈数据 → public/data/{index.json, details/s{N}.json}
 * 数据源优先级：../trade-area-data/district-12dim/*.md（全量，可用 TRADE_AREA_MD_DIR 覆盖）
 *               → data/raw/*.xlsx（旧格式兜底，md 源存在时不启用，避免重复商圈）
 * 用法：npm run etl
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import type { DataIndex, DistrictDetail } from '../src/types';
import { parseXlsxFile } from './parse-xlsx';
import { parseMdFile } from './parse-md';
import { computePercentiles, deriveMetrics } from './normalize';
import { computeScore } from '../src/scoring/model';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const MD_DIR =
  process.env.TRADE_AREA_MD_DIR ?? path.resolve(ROOT, '..', 'trade-area-data', 'district-12dim');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const DETAILS_DIR = path.join(OUT_DIR, 'details');
const SHARD_SIZE = 50;

/** 从文件名取稳定 id：优先 NNN_ 前缀，否则用去扩展名后的名字 */
function idFromFilename(filename: string, used: Set<string>): string {
  const base = filename.replace(/\.(xlsx?|md)$/i, '');
  const prefix = base.match(/^(\d{1,4})[-_]/)?.[1];
  let id = prefix ? prefix.padStart(4, '0') : base;
  while (used.has(id)) id = `${id}x`;
  used.add(id);
  return id;
}

async function main() {
  const mdFiles = fs.existsSync(MD_DIR)
    ? fs.readdirSync(MD_DIR).filter((f) => /\.md$/i.test(f) && !f.startsWith('.')).sort()
    : [];
  const useMd = mdFiles.length > 0;

  if (!useMd && !fs.existsSync(RAW_DIR)) {
    console.error(`未找到数据源：${MD_DIR}（md）与 ${RAW_DIR}（xlsx）均不可用`);
    process.exit(1);
  }
  const files = useMd
    ? mdFiles
    : fs
        .readdirSync(RAW_DIR)
        .filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$') && !f.startsWith('.'))
        .sort();
  if (!files.length) {
    console.error(`数据源下没有可解析文件（md: ${MD_DIR} / xlsx: ${RAW_DIR}）`);
    process.exit(1);
  }
  console.log(`📂 数据源：${useMd ? `${MD_DIR}（md，${files.length} 个文件）` : `${RAW_DIR}（xlsx 兜底）`}`);

  const districts: DistrictDetail[] = [];
  const warnings: string[] = [];
  const failures: Array<{ file: string; error: string }> = [];
  const usedIds = new Set<string>();
  const metricKeyCount = new Map<string, number>();

  for (const file of files) {
    try {
      const srcDir = useMd ? MD_DIR : RAW_DIR;
      const { district, warnings: w } = useMd
        ? parseMdFile(path.join(srcDir, file), file)
        : parseXlsxFile(path.join(srcDir, file), file);
      district.id = idFromFilename(file, usedIds);
      warnings.push(...w);
      districts.push(district);
      for (const [k, v] of Object.entries(district.metrics)) {
        if (v !== undefined) metricKeyCount.set(k, (metricKeyCount.get(k) ?? 0) + 1);
      }
    } catch (err) {
      failures.push({ file, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // 省市共识回填：部分源文本只写市不写省（沈阳市…）、或 12 维批次整行缺地址。
  // 用已成功解析的「城市→省」映射回填空缺，城市也缺的在名称/地址/区位文本里找已知城市名（取最靠前）。
  const cityProvince = new Map<string, string>();
  for (const d of districts) {
    if (d.province && d.city && !cityProvince.has(d.city)) cityProvince.set(d.city, d.province);
  }
  let backfilled = 0;
  for (const d of districts) {
    const before = `${d.province}|${d.city}`;
    if (d.city && !d.province) d.province = cityProvince.get(d.city) ?? '';
    if (!d.city) {
      const text = `${d.name} ${d.address} ${d.dimensions['所在区位']?.text ?? ''}`;
      let hit: { idx: number; city: string; prov: string } | null = null;
      for (const [city, prov] of cityProvince) {
        const idx = text.indexOf(city.replace(/市$/, ''));
        if (idx >= 0 && (!hit || idx < hit.idx)) hit = { idx, city, prov };
      }
      if (hit) {
        d.city = hit.city;
        if (!d.province) d.province = hit.prov;
      }
    }
    if (`${d.province}|${d.city}` !== before) backfilled++;
  }

  // 派生指标 + 百分位 + 默认评分
  const derivedList = districts.map(deriveMetrics);
  const percentiles = computePercentiles(districts, derivedList);
  districts.forEach((d, i) => {
    d.percentiles = percentiles[i];
    d.score = computeScore(d.metrics, d.percentiles).score;
  });

  // 按 id 排序后分片，保证 shard 分配稳定
  districts.sort((a, b) => a.id.localeCompare(b.id));
  districts.forEach((d, i) => {
    d.shard = Math.floor(i / SHARD_SIZE);
  });

  // 写产物（先清旧分片，避免残留）
  fs.rmSync(DETAILS_DIR, { recursive: true, force: true });
  fs.mkdirSync(DETAILS_DIR, { recursive: true });

  const shardCount = Math.ceil(districts.length / SHARD_SIZE);
  for (let s = 0; s < shardCount; s++) {
    const chunk = districts.filter((d) => d.shard === s);
    fs.writeFileSync(path.join(DETAILS_DIR, `s${s}.json`), JSON.stringify(chunk));
  }

  const index: DataIndex = {
    generatedAt: new Date().toISOString(),
    total: districts.length,
    districts: districts.map(({ dimensions: _d, ...summary }) => summary),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index));

  // —— 报告 ——
  console.log(`✅ 解析完成：${districts.length}/${files.length} 个商圈，${shardCount} 个详情分片，省市共识回填 ${backfilled} 个`);
  if (failures.length) {
    console.error(`\n❌ 失败 ${failures.length} 个：`);
    for (const f of failures) console.error(`  - ${f.file}: ${f.error}`);
  }
  if (warnings.length) {
    console.warn(`\n⚠️ 警告 ${warnings.length} 条（前 20 条）：`);
    for (const w of warnings.slice(0, 20)) console.warn(`  - ${w}`);
  }
  console.log('\n指标抽取率（top 缺失项）：');
  const missing = Object.keys({
    buildingArea: 0, parking: 0, merchants: 0, firstStores: 0, pop3km: 0,
    trafficWeekday: 0, trafficWeekend: 0, trafficPeak: 0, rent: 0, openedYear: 0,
    crowdA: 0, crowdB: 0, crowdC: 0, competitors: 0,
  } as Record<string, number>)
    .map((k) => ({ k, hit: metricKeyCount.get(k) ?? 0 }))
    .sort((a, b) => a.hit - b.hit);
  for (const { k, hit } of missing.slice(0, 6)) {
    console.log(`  ${k}: ${hit}/${districts.length} (${Math.round((hit / districts.length) * 100)}%)`);
  }
  const withScore = districts.filter((d) => d.score !== null).length;
  console.log(`\n可评分商圈：${withScore}/${districts.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
