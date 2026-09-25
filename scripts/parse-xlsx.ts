/**
 * 解析单个商圈 xlsx → DistrictDetail（不含 percentile/score/shard，由 build-data 统一补）。
 * 按行名匹配维度，不依赖固定行号；格式漂移时缺失容忍。
 */
import * as XLSXns from 'xlsx';
import type { WorkBook } from 'xlsx';
import type { DistrictDetail, DimensionDetail, DimensionKey } from '../src/types';
import { DIMENSION_KEYS } from '../src/types';
import { extractMetrics, extractNameAddress, extractRating } from './extract-metrics';
import { parseRegion } from './regions';

// xlsx 是 CJS 包：Node ESM（tsx）下具名导出挂在 default，Vite/vitest 下在命名空间
const XLSX = ((XLSXns as { default?: typeof XLSXns }).default ?? XLSXns) as typeof XLSXns;

/** 行名的常见变体 → 标准维度 key */
export const DIMENSION_ALIASES: Record<DimensionKey, string[]> = {
  '项目名称与地址': ['项目名称与地址', '项目名称及地址', '项目名称/地址'],
  '项目性质': ['项目性质'],
  '所在区位': ['所在区位'],
  '商业级别与体量': ['商业级别与体量', '商业级别与体量 ', '级别与体量'],
  '开业时间': ['开业时间'],
  '周边3公里人口': ['周边3公里人口', '周边3km人口', '周边三公里人口'],
  '核心客群': ['核心客群'],
  '日均客流': ['日均客流'],
  '交通条件': ['交通条件'],
  '核心定位': ['核心定位'],
  '最大优势': ['最大优势'],
  '最大短板': ['最大短板'],
  '业绩参考': ['业绩参考'],
};

function normalizeRowName(name: string): string {
  return name.replace(/\s+/g, '').replace(/^（\d+）/, '');
}

function matchDimensionKey(rowName: string): DimensionKey | null {
  const n = normalizeRowName(rowName);
  for (const key of DIMENSION_KEYS) {
    if (n === key || DIMENSION_ALIASES[key].some((a) => n === a)) return key;
    // 行名可能带编号前缀或细微措辞差：包含匹配兜底
    if (n.includes(key)) return key;
  }
  return null;
}

/** 拆出来源/可信度标记，返回清洗后文本与标记 */
export function stripMarkers(text: string): DimensionDetail {
  const sources: string[] = [];
  let confidence: DimensionDetail['confidence'] = null;

  const srcRe = /\[检索[·:]([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = srcRe.exec(text)) !== null) sources.push(m[1].trim());

  const confRe = /\[([AB])\]/g;
  while ((m = confRe.exec(text)) !== null) confidence = m[1] as 'A' | 'B';

  const cleaned = text
    .replace(/\[检索[·:][^\]]+\]/g, '')
    .replace(/\[[AB]\]/g, '')
    .replace(/【项目评级】[A-Z]\+?/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  return { text: cleaned, sources, confidence };
}

export interface ParseResult {
  district: DistrictDetail;
  warnings: string[];
}

export function parseWorkbook(wb: WorkBook, filename: string): ParseResult {
  const warnings: string[] = [];
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error(`${filename}: 无工作表`);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const rawDimensions: Partial<Record<DimensionKey, string>> = {};

  for (const row of rows) {
    const rowName = String(row?.[0] ?? '').trim();
    if (!rowName) continue;
    const key = matchDimensionKey(rowName);
    if (!key) continue;
    const value = String(row?.[1] ?? '').trim();
    if (!value) {
      warnings.push(`${filename}: 维度「${key}」内容为空`);
      continue;
    }
    if (rawDimensions[key] !== undefined) {
      warnings.push(`${filename}: 维度「${key}」重复，取首条`);
      continue;
    }
    rawDimensions[key] = value;
  }

  const missing = DIMENSION_KEYS.filter((k) => rawDimensions[k] === undefined);
  if (missing.length) warnings.push(`${filename}: 缺失维度 ${missing.join('、')}`);

  const nameAddressRow = rawDimensions['项目名称与地址'] ?? '';
  const { name, address } = extractNameAddress(nameAddressRow, filename);
  if (!name) throw new Error(`${filename}: 无法解析商圈名称`);

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

export function parseXlsxFile(path: string, filename: string): ParseResult {
  const wb = XLSX.readFile(path);
  return parseWorkbook(wb, filename);
}
