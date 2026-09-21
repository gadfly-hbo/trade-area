/**
 * 从维度长文本中抽取数值指标。
 * 全部基于样本表验证过的正则；抽不到一律返回 undefined，不猜数。
 */
import type { DistrictMetrics } from '../src/types';

/** 解析 "6,500" / "6500" / "约500" 这类数字文本 */
function num(raw: string): number | undefined {
  const cleaned = raw.replace(/[,,，\s约余+]/g, '');
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : undefined;
}

/** 区间取中值：捕获组为 (下限, 上限?) */
function rangeNum(lo: string, hi?: string): number | undefined {
  const l = num(lo);
  if (l === undefined) return undefined;
  const h = hi !== undefined ? num(hi) : undefined;
  return h === undefined ? l : (l + h) / 2;
}

function match(text: string, re: RegExp): RegExpMatchArray | null {
  re.lastIndex = 0;
  return text.match(re);
}

/** 各维度抽取入口：key 为维度行名 */
export function extractMetrics(
  dimensions: Record<string, string>,
): DistrictMetrics {
  const m: DistrictMetrics = {};
  const get = (k: string) => dimensions[k] ?? '';

  // —— 商业级别与体量 ——
  const scale = get('商业级别与体量') + get('项目性质');
  // 兼容「建筑面积X万㎡」「总建面X万㎡」「建筑面积X㎡（非万单位）」
  const area = match(scale, /建(?:筑面|面)(?:积)?约?\s*([\d,.，]+)\s*(万)?㎡/);
  if (area) {
    const v = num(area[1]);
    if (v !== undefined) m.buildingArea = area[2] ? v : v / 10000;
  }
  const parking = match(scale, /(?:机动车位|停车位|车位)(?:约)?([\d,，]+)个/);
  if (parking) m.parking = num(parking[1]);
  // 兼容「商户X家」「品牌约X家」「经营户X户」「X家品牌」
  const merchants = match(
    scale,
    /(?:商户|品牌|经营户)约?([\d,，]+)\s*余?[家户]|([\d,，]+)\s*余?家(?:品牌|商户|经营户)/,
  );
  if (merchants) m.merchants = num(merchants[1] ?? merchants[2]);
  const firstStores = match(
    scale + get('核心客群'),
    /(\d+)\s*家\s*首店|首店\s*(\d+)\s*家/,
  );
  if (firstStores) m.firstStores = num(firstStores[1] ?? firstStores[2]);

  // —— 开业时间 ——
  const opened = get('开业时间');
  const openedMatch = match(opened, /(\d{4})年\d{1,2}月\d{1,2}日/);
  if (openedMatch) m.openedYear = num(openedMatch[1]);

  // —— 周边3公里人口 ——
  const pop = get('周边3公里人口');
  // 优先取「N公里/Nkm 内或覆盖」就近的数值，避免误抓同句在前的区县总人口；
  // 「万人/km²」为人口密度，用负向前瞻排除；「合计」须锚定万，排除「合计约4400+套住宅」
  const popNotDensity = '(?![/／\\s]*(?:km|KM|平方|千米))';
  const popMatch =
    match(pop, new RegExp(`(?:2|3|三|两)?\\s*(?:公里|km|KM)\\s*[内覆][^。；]{0,40}?约?([\\d.]+)\\s*(?:[-—~到至]\\s*([\\d.]+))?\\s*万${popNotDensity}`)) ??
    match(pop, new RegExp(`合计(?:常住)?约?([\\d.]+)(?:[-—~到至]([\\d.]+))?\\s*万${popNotDensity}`)) ??
    match(pop, new RegExp(`约?([\\d.]+)(?:[-—~到至]([\\d.]+))?万人${popNotDensity}`));
  if (popMatch) m.pop3km = rangeNum(popMatch[1], popMatch[2]);

  // —— 日均客流 ——
  // 中段用「中文字符+冒号」的懒匹配兼容多种措辞（客流量：/客流/日均/约），
  // 但不跨句（不含 ；。），避免把别句的数字错误归到本指标；
  // 三档均支持「X-Y万」区间（取中值）；单位尾缀限定人次/日/天等，
  // 排除「首周末销售1200万（同比…）」这类销售额误抓；单日>300万视为误抓丢弃
  const CN_CONN = '[\\u4e00-\\u9fa5：:，,\\s]';
  const traffic = get('日均客流') + get('业绩参考');
  const trafficNumOf = (kw: string) =>
    new RegExp(
      `${kw}${CN_CONN}*?([\\d.]+)\\s*万?\\s*(?:[-—~到至]\\s*([\\d.]+)\\s*万?)?\\s*万(?:人次|[/／](?:[日天]|(?=\\d))|(?=$|[、，。；\\s）)]))`,
    );
  const capTraffic = (v: number | undefined, cap: number) =>
    v !== undefined && v <= cap ? v : undefined;
  const weekday = match(traffic, trafficNumOf('工作日'));
  if (weekday) m.trafficWeekday = capTraffic(rangeNum(weekday[1], weekday[2]), 300);
  const weekend = match(traffic, trafficNumOf('周末'));
  if (weekend) m.trafficWeekend = capTraffic(rangeNum(weekend[1], weekend[2]), 300);
  const peak = match(traffic, trafficNumOf('(?:最高单日|单日峰值|节假日峰值|节假日|峰值)'));
  if (peak) m.trafficPeak = capTraffic(rangeNum(peak[1], peak[2]), 500);

  // —— 租金（元/㎡/天，口径：项目周边街铺/档口挂牌） ——
  // 与坪效共用 元/㎡/天 单位（坪效常见 5000-8000），按合理上界 300 过滤坪效量级
  const rentText = get('业绩参考') + get('最大短板');
  for (const r of rentText.matchAll(
    /([\d.]+)\s*(?:[-—~到至]\s*([\d.]+))?\s*元\s*\/\s*㎡\s*\/\s*天/g,
  )) {
    const v = rangeNum(r[1]!, r[2]);
    if (v !== undefined && v <= 300) {
      m.rent = v;
      break;
    }
  }

  // —— 核心客群：森马三大人群（兼容「A 类｜…约 25%」带空格/无约写法，取标签后首个百分比） ——
  const crowd = get('核心客群');
  const a = match(crowd, /A\s*类[｜|][^%]*?(\d+(?:\.\d+)?)%/);
  if (a) m.crowdA = num(a[1]);
  const b = match(crowd, /B\s*类[｜|][^%]*?(\d+(?:\.\d+)?)%/);
  if (b) m.crowdB = num(b[1]);
  const c = match(crowd, /C\s*类[｜|][^%]*?(\d+(?:\.\d+)?)%/);
  if (c) m.crowdC = num(c[1]);

  // —— 最大短板：竞品密度 ——
  const weakness = get('最大短板');
  const comp = match(weakness, /([\d]+)大商业体/);
  if (comp) m.competitors = num(comp[1]);

  return m;
}

/** 从「项目名称与地址」行拆出名称与地址 */
export function extractNameAddress(
  row: string,
  filename: string,
): { name: string; address: string } {
  const nameM = match(row, /项目名称[：:]\s*([^｜|]+)/);
  const addrM = match(row, /项目地址[：:]\s*([^｜|]+)/);
  // 兜底：文件名 NNN_商圈名.xlsx / NNN_商圈名.md
  const fallbackName = filename.replace(/\.(xlsx?|md)$/i, '').replace(/^\d+[-_]?/, '');
  let name = (nameM?.[1] ?? '').trim();
  let address = (addrM?.[1] ?? '').trim();
  if (!name) {
    // md 报告形态：「商圈名，省市区…地址」，地址取首个逗号之后（名称可带中英文别名括号）
    const comma = row.match(/^([^，,]{2,60})[，,]\s*(.+)$/);
    if (comma) {
      name = comma[1].trim();
      address = comma[2].trim();
    } else {
      // 无逗号时「商圈名（含省市区的地址）」形态
      const paren = row.match(/^(.{2,60})（([^）]*(?:省|市|区|县|路|号|街|道)[^）]*)）\s*$/);
      if (paren) {
        name = paren[1].trim();
        address = paren[2].trim();
      } else {
        name = row.trim();
      }
    }
    // 名称内的别名括号只保留主名
    name = name.replace(/（又名[^）]*）/g, '').trim() || fallbackName;
  }
  return { name, address };
}

/** 从评级标记取项目评级 */
export function extractRating(text: string): 'A' | 'B' | 'C' | null {
  const m = match(text, /【项目评级】([A-Z])/);
  return m ? ((m[1] as 'A' | 'B' | 'C')) : null;
}
