/**
 * 从维度长文本中抽取数值指标。
 * 全部基于样本表验证过的正则；抽不到一律返回 undefined，不猜数。
 */
import type { DistrictMetrics, ProjectRating } from '../src/types';

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
  const area = match(scale, /建筑面积(?:约)?([\d.]+)万㎡/);
  if (area) m.buildingArea = num(area[1]);
  const parking = match(scale, /(?:机动车位|停车位|车位)(?:约)?([\d,，]+)个/);
  if (parking) m.parking = num(parking[1]);
  const merchants = match(scale, /商户([\d,，]+)\s*余?家/);
  if (merchants) m.merchants = num(merchants[1]);
  const firstStores = match(scale + get('核心客群'), /(\d+)家湖州?首店|首店(\d+)家/);
  if (firstStores) m.firstStores = num(firstStores[1] ?? firstStores[2]);

  // —— 开业时间 ——
  const opened = get('开业时间');
  const openedMatch = match(opened, /(\d{4})年\d{1,2}月\d{1,2}日/);
  if (openedMatch) m.openedYear = num(openedMatch[1]);

  // —— 周边3公里人口 ——
  const pop = get('周边3公里人口');
  const popMatch =
    match(pop, /(?:常住)?合计约?([\d.]+)/) ??
    match(pop, /约?([\d.]+)(?:[-—~到至]([\d.]+))?万人/);
  if (popMatch) m.pop3km = rangeNum(popMatch[1], popMatch[2]);

  // —— 日均客流 ——
  // 兼容 xlsx「万人次」与 md「万/日」「万人」「5,500-9,000人次/日」「–」区间等变体。
  // 中段用「中文字符+冒号」的懒匹配兼容措辞（客流量：/日均/约），但不跨句、不跨括号；
  // 数字必须紧跟锚词且带「万/人次/人」单位，只写「人次」时除以万；无单位一律不取（防抓到倍数/年份）。
  const CN_CONN = '[\\u4e00-\u9fa5：:，,\\s]';
  const NUM_T = '[\\d,，.]+';
  const DASH_T = '\\s*[-–—~到至]\\s*';
  const UNIT_T = '(万人次|人次|万人|万|人)';
  const traffic = get('日均客流') + ' ' + get('业绩参考');

  function trafficAt(anchor: string): number | undefined {
    const head = `${anchor}${CN_CONN}*?`;
    const range = match(
      traffic,
      new RegExp(`${head}(${NUM_T})\\s*(万)?${DASH_T}(${NUM_T})\\s*${UNIT_T}?`),
    );
    if (range) {
      const l = num(range[1]);
      const h = num(range[3]);
      const unit = range[4] || range[2];
      if (l !== undefined && h !== undefined && unit) {
        const mid = unit.startsWith('万') ? (l + h) / 2 : (l + h) / 20000;
        if (mid > 0) return mid;
      }
    }
    const one = match(traffic, new RegExp(`${head}(${NUM_T})\\s*${UNIT_T}`));
    if (one) {
      const v = num(one[1]);
      if (v !== undefined) return one[2].startsWith('万') ? v : v / 10000;
    }
    return undefined;
  }

  const weekday = trafficAt('工作日');
  if (weekday !== undefined) m.trafficWeekday = weekday;
  const weekend = trafficAt('(?:周末|双休日)');
  if (weekend !== undefined) m.trafficWeekend = weekend;
  const peak = trafficAt('(?:节假日峰值|峰值单日|单日峰值|最高单日|节假日客流峰值|峰值)');
  if (peak !== undefined) m.trafficPeak = peak;

  // —— 租金（元/㎡/天） ——
  const rentText = get('业绩参考') + get('最大短板');
  const rent = match(rentText, /租金约?([\d.]+)元\/㎡\/天/);
  if (rent) m.rent = num(rent[1]);

  // —— 核心客群：森马三大人群 ——
  const crowd = get('核心客群');
  const a = match(crowd, /A类[｜|][^】]*?约(\d+(?:\.\d+)?)%/);
  if (a) m.crowdA = num(a[1]);
  const b = match(crowd, /B类[｜|][^】]*?约(\d+(?:\.\d+)?)%/);
  if (b) m.crowdB = num(b[1]);
  const c = match(crowd, /C类[｜|][^】]*?约(\d+(?:\.\d+)?)%/);
  if (c) m.crowdC = num(c[1]);

  // —— 竞品密度（「N大商业体」多出现在短板/区位行）——
  const weakness = get('最大短板') + get('所在区位');
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
  // 兜底：文件名 NNN_商圈名.xlsx
  const fallbackName = filename.replace(/\.xlsx?$/i, '').replace(/^\d+[-_]?/, '');
  return {
    name: (nameM?.[1] ?? fallbackName).trim(),
    address: (addrM?.[1] ?? '').trim(),
  };
}

/** 从评级标记取项目评级（森马五级：S/A+/A/B/C） */
export function extractRating(text: string): ProjectRating | null {
  const m = match(text, /【项目评级】([A-Z]\+?)/);
  return m ? (m[1] as ProjectRating) : null;
}
