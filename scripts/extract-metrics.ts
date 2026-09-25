/**
 * 从维度长文本中抽取数值指标。
 * 全部基于样本表验证过的正则；抽不到一律返回 undefined，不猜数。
 * 推断口径（报告标注[推断]/推测）取值并写入 inferred 标记（前端显示警示标），
 * 但销售额混入、全域口径（≥100 万/日客流）与超域值仍硬拒。
 */
import type { DistrictMetrics, ProjectRating } from '../src/types';

type InferredMap = Partial<Record<keyof DistrictMetrics, boolean>>;

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

/** 各维度抽取入口：key 为维度行名；inferred 为可选出参，收集推断值标记 */
export function extractMetrics(
  dimensions: Record<string, string>,
  inferred?: InferredMap,
): DistrictMetrics {
  const m: DistrictMetrics = {};
  const get = (k: string) => dimensions[k] ?? '';

  // —— 商业级别与体量 ——
  // 商用面积优先：商业面积/经营面积/可租面积/商业体量；无商用口径时退回总建面/建筑面积（口径偏大，标推断）；
  // 纯 ㎡ 大数（≥10000）折算为万
  const scale = get('商业级别与体量') + '；' + get('项目性质');
  const AREA_NUM = '\\s*([\\d,，.]+)(?:\\s*[-–—~]\\s*([\\d,，.]+))?\\s*万\\s*(?:㎡|方|平方米)';
  const areaPats: Array<[RegExp, number, boolean]> = [
    [/(?:商业经营面积|商业面积|经营面积|商业建筑面积|可租面积|租赁面积|商业体量)[^。；;|｜]{0,8}?约?/, 1, false],
    [/(?:总建筑面积|建筑总面积|总建面|建筑面积)[^。；;|｜]{0,8}?约?/, 1, true],
    [/体量[^。；;|｜]{0,10}?约?(?:推断约?)?/, 1, false],
    [/(?:总建筑面积|建筑总面积|总建面|建筑面积)[^。；;|｜]{0,8}?约?\s*([\d,，]{3,})\s*㎡/, 10000, true],
  ];
  for (const [ap, div, fallback] of areaPats) {
    const am = match(scale, new RegExp(ap.source + (div === 1 ? AREA_NUM : '')));
    if (!am) continue;
    const v = rangeNum(am[1], am[2]);
    if (v !== undefined && v > 0) {
      m.buildingArea = Math.round((v / div) * 100) / 100;
      if (fallback && inferred) inferred.buildingArea = true;
      break;
    }
  }
  // 车位：锚词在前（兼容近/超/区间/推断/裸「停车」）+ 数字在前（「2181个停车位」）；扫级别/交通/最大优势三行
  const PARK_NUM = '(?:约|超|近)?\\s*([\\d,，]+)(?:\\s*[-–—~]\\s*([\\d,，]+))?\\s*(?:余|多)?\\s*[个+]?';
  const parkingPats = [
    new RegExp(`(?:机动车位|停车位|车位数|车位|停车)[^。；;|｜]{0,6}?${PARK_NUM}`),
    new RegExp(`([\\d,，]+)\\s*(?:余|多)?\\s*个\\s*(?:机动车位|停车位|车位)`),
  ];
  const parkingText = scale + get('交通条件') + get('最大优势');
  for (const pp of parkingPats) {
    const pm = match(parkingText, pp);
    if (!pm) continue;
    const v = rangeNum(pm[1], pm[2]);
    if (v !== undefined && v > 0) {
      m.parking = v;
      const at = pm.index ?? 0;
      if (/推断/.test(parkingText.slice(Math.max(0, at - 30), at + pm[0].length + 30)) && inferred) {
        inferred.parking = true;
      }
      break;
    }
  }
  // 商户：兼容超/近前缀与「870家商户」数字前置
  const merchantsPats = [
    /商户[^。；;|｜]{0,6}?(?:约|超|近)?\s*([\d,，]+)\s*(?:余|多)?\s*家/,
    /([\d,，]+)\s*(?:余|多)?\s*家?\s*(?:商户|店铺)/,
  ];
  for (const mp of merchantsPats) {
    const mm2 = match(scale + get('业绩参考'), mp);
    if (!mm2) continue;
    const v = num(mm2[1]);
    if (v !== undefined) {
      m.merchants = v;
      break;
    }
  }
  // 首店：数字前置（「80 家首进」「含定州首店100个」）+ 首店后数字；「首店率/占比」不带量词自动跳过
  const fsText = scale + get('核心客群') + get('业绩参考') + get('最大优势');
  const fsPats = [
    /([\d,，]+)\s*(?:个|家)\s*(?:首店|首进)/,
    /首店[^。；;|｜]{0,6}?约?([\d,，]+)\s*(?:个|家)/,
  ];
  for (const fp of fsPats) {
    const fm = match(fsText, fp);
    if (!fm) continue;
    const v = num(fm[1]);
    if (v !== undefined) {
      m.firstStores = v;
      break;
    }
  }

  // —— 开业时间 ——
  // 「正式开业」紧邻年份最可靠（防把注册/改造年当开业年），其次完整年月日，再次任意「开业/试营业」年份
  const opened = get('开业时间');
  const openedMatch =
    match(opened, /(20\d{2}|19\d{2})[^\n；;|]{0,15}?正式开业/) ??
    match(opened, /(20\d{2}|19\d{2})年\d{1,2}月\d{1,2}日/) ??
    match(opened, /(20\d{2}|19\d{2})[^\n；;|]{0,12}?(?:试?营业|全面开街|开业)/);
  if (openedMatch) m.openedYear = num(openedMatch[1]);

  // —— 周边3公里人口 ——
  // 口径优先：合计/圈层锚定；兼容「约 75-85 万」（约后空格、万省「人」）、「合计常住人口约 70–100 万」
  // 「合计推断约 35 万」（合计与约间插字）、「3 km 圈覆盖…估算 30–60 万」；区间取中值。
  // 「人口密度 X 万人/km²」不是人口总数，命中含「密度」的段一律不取。
  const pop = get('周边3公里人口');
  // 万人? 后视排除 ㎡/年/月/元/户：防抓「万元」收入与「万户」
  const POP_NUM = '\\s*([\\d.]+)(?:\\s*[-–—~到至]\\s*([\\d.]+))?\\s*万人?(?!㎡|年|月|元|户)';
  // 3 公里圈人口物理上限 ~300 万；超域（多为全市/全区口径）跳过该匹配继续向后找
  const POP_MAX = 300;
  const popScan = (re: RegExp, wideGuard = false) => {
    for (let mm = re.exec(pop); mm; mm = re.exec(pop)) {
      // 「人口密度 X 万人/km²」不是人口总数：窄层查匹配段，裸句兜底层查前方 10 字
      const scope = wideGuard
        ? pop.slice(Math.max(0, (mm.index ?? 0) - 10), (mm.index ?? 0) + mm[0].length + 1)
        : mm[0];
      if (/密度/.test(scope)) continue;
      const v = rangeNum(mm[1], mm[2]);
      if (v === undefined || v > POP_MAX) continue;
      return { mm, v };
    }
    return null;
  };
  const picked =
    popScan(new RegExp(`合计[^。；;|]{0,6}?(?:常住|居住)?(?:人口)?约?${POP_NUM}`, 'g')) ??
    popScan(
      // 圈层锚（「商圈」不算——「商圈可辐射全市 770 万」是全市口径）；常住/居住/人口/估算关键词必选，
      // 防「注册企业超 1 万家」被当人口
      new RegExp(`(?:(?<!商)圈|半径|覆盖)[^。；;|｜]{0,20}?(?:常住|居住|人口|估算)[^。；;|｜]{0,6}?约?${POP_NUM}`, 'g'),
    ) ??
    popScan(new RegExp(`约?${POP_NUM}`, 'g'), true); // 兜底：无锚词的裸「(约)N万人」句
  if (picked) {
    m.pop3km = picked.v;
    const at = picked.mm.index ?? 0;
    if (/推断|推测/.test(pop.slice(Math.max(0, at - 30), at + picked.mm[0].length + 30)) && inferred) {
      inferred.pop3km = true;
    }
  }

  // —— 日均客流 ——
  // 兼容 xlsx「万人次」与 md「万/日」「万人」「5,500-9,000人次/日」「–」区间等变体。
  // 中段用「中文字符+冒号+括号」的懒匹配兼容措辞（客流量：/日均/约/工作日（周一至周四））；
  // 数字必须紧跟锚词且带「万/人次/人」单位，只写「人次」时除以万；无单位一律不取（防抓到倍数/年份）。
  // 防「单位后随元」的销售额（节假日单日峰值 3,000–5,000 万元）与「年峰值」的年客流口径。
  // 连接类含斜杠/顿号/括号、约号 ~≈、比较符 ><≥、加粗星号（「周末~7-9万」「**周末**日均」）
  const CN_CONN = '[\\u4e00-\u9fa5：:，,、·/~≈><≥*\\s（）()]';
  const NUM_T = '[\\d,，.]+';
  const DASH_T = '\\s*[-–—~到至]\\s*';
  const UNIT_T = '(万人次|人次|万人|万|人)';
  const traffic = get('日均客流') + ' ' + get('业绩参考');

  function trafficAt(anchor: string, key: keyof DistrictMetrics): number | undefined {
    const head = `${anchor}${CN_CONN}*?`;
    const badUnit = (unit: string, end: number) =>
      (unit === '万' || unit === '人') && traffic[end] === '元';
    // 销售措辞（「首周末销售1200万」）→ 硬拒；[推断] 标记 → 取值并标记
    const isSales = (m: RegExpExecArray) =>
      /销售|营收|营业额|销量/.test(traffic.slice(Math.max(0, (m.index ?? 0) - 2), (m.index ?? 0) + m[0].length));
    const isInferred = (m: RegExpExecArray) =>
      /推断/.test(traffic.slice(Math.max(0, (m.index ?? 0) - 30), (m.index ?? 0) + m[0].length + 30));
    const reRange = new RegExp(`${head}(${NUM_T})\\s*(万)?${DASH_T}(${NUM_T})\\s*${UNIT_T}?`, 'g');
    for (let r = reRange.exec(traffic); r; r = reRange.exec(traffic)) {
      const l = num(r[1]);
      const h = num(r[3]);
      const unit = r[4] || r[2];
      const end = (r.index ?? 0) + r[0].length;
      if (l === undefined || h === undefined || !unit || badUnit(unit, end) || isSales(r)) continue;
      const mid = unit.startsWith('万') ? (l + h) / 2 : (l + h) / 20000;
      if (mid <= 0 || mid >= 100) {
        // 峰值指日峰值：累计口径超域时，括注的「日均 X 万」才是真值（「峰值…370.6万（日均52.9万）」）
        if (key === 'trafficPeak') {
          const after = traffic.slice(end, end + 24);
          const dm = /（\s*日均\s*([\d,，.]+)\s*(万人次|万人|万)/.exec(after);
          if (dm) {
            const dv = num(dm[1]);
            if (dv !== undefined && dv > 0 && dv < 100) {
              if (/推断/.test(traffic.slice(Math.max(0, (r.index ?? 0) - 30), end + 30)) && inferred) {
                inferred[key] = true;
              }
              return dv;
            }
          }
        }
        continue;
      }
      if (isInferred(r) && inferred) inferred[key] = true;
      return mid;
    }
    const reOne = new RegExp(`${head}(${NUM_T})\\s*${UNIT_T}`, 'g');
    for (let o = reOne.exec(traffic); o; o = reOne.exec(traffic)) {
      const v = num(o[1]);
      const unit = o[2];
      if (v === undefined || badUnit(unit, (o.index ?? 0) + o[0].length) || isSales(o)) continue;
      const val = unit.startsWith('万') ? v : v / 10000;
      if (val <= 0 || val >= 100) continue;
      if (isInferred(o) && inferred) inferred[key] = true;
      return val;
    }
    // 共享单位兜底：三档裸区间共用总句单位（「日均客流约5,000–8,000人次，其中工作日3,000–5,000、周末8,000–15,000」）
    // 仅认「锚词+区间+顿号/句读」形态（必须有区间破折号）；单位取锚词前方最近的单位词（防「4.6万㎡」干扰）
    const reBare = new RegExp(`${head}(${NUM_T})${DASH_T}(${NUM_T})(?:\\s*[、，,；;）)]|$)`, 'g');
    for (let b = reBare.exec(traffic); b; b = reBare.exec(traffic)) {
      const at = b.index ?? 0;
      let um: RegExpExecArray | null = null;
      const reU = /万人次|人次|万人|万/g;
      for (let u = reU.exec(traffic.slice(0, at)); u; u = reU.exec(traffic.slice(0, at))) {
        um = u;
      }
      if (!um || at - (um.index ?? 0) > 90) continue;
      if (isSales(b)) continue;
      const l = num(b[1]);
      const h = num(b[2]);
      if (l === undefined || h === undefined) continue;
      const mid = (l + h) / 2;
      const val = um[0].includes('万') ? mid : mid / 10000;
      if (val <= 0 || val >= 100) continue;
      if (/推断/.test(traffic.slice(Math.max(0, at - 60), at + b[0].length + 60)) && inferred) {
        inferred[key] = true;
      }
      return val;
    }
    return undefined;
  }

  const weekday = trafficAt('工作日', 'trafficWeekday');
  if (weekday !== undefined) m.trafficWeekday = weekday;
  const weekend = trafficAt('(?:周末|双休日)', 'trafficWeekend');
  if (weekend !== undefined) m.trafficWeekend = weekend;
  const peak = trafficAt(
    '(?:节假日峰值|峰值单日|单日峰值|最高单日|单日最高|单日客流|节假日客流峰值|节庆|节假日|(?<![年销])峰值(?:\\s*20\\d{2})?年?[^。；;|｜]{0,14}?日均|(?<![年销])峰值)',
    'trafficPeak',
  );
  if (peak !== undefined) m.trafficPeak = peak;

  // —— 租金（街铺口径，元/㎡/天） ——
  // 窄通道：仅认「临街/街铺/商铺/底商/首层/商圈…」语境的租金句——日租直取，月租 ÷30 换算。
  // 坪效/物业费/写字楼/公寓与「未公开」句一律不取（元/㎡/年几乎全是坪效，混口径污染百分位）；
  // [推断]/推测句取值并标记 inferred。锚词与数字间不夹数字（防抓年份），值域限 0.1–100 元/㎡/天。
  const rentText = get('业绩参考') + '；' + get('最大短板');
  const RENT_SHOP = '(?:临街|沿街|街铺|商铺|底商|首层|商业|零售|旺铺|商街|金街|铺位|社区|商圈)';
  const RENT_GAP = '[^。；;|｜\\d]{0,10}';
  const RENT_NUM = '([\\d,，.]+)(?:\\s*[-–—~]\\s*([\\d,，.]+))?';
  const RENT_BAD = /坪效|坪销|物业费|写字楼|甲写|办公|公寓|未公开/;
  const RENT_SOFT = /推断|推测/; // 推断口径：取值并标记，不硬拒
  const rentDayVal = (v: number) => (v >= 0.1 && v <= 100 ? Math.round(v * 100) / 100 : undefined);
  const rentMonVal = (v: number) =>
    v >= 3 && v <= 3000 ? Math.round((v / 30) * 100) / 100 : undefined;

  function scanRentWin(re: RegExp, convert: (v: number) => number | undefined) {
    for (let mm = re.exec(rentText); mm; mm = re.exec(rentText)) {
      // 硬拒词只看匹配段及紧邻 4 字（后文下一分句的「坪效」不连坐）；推断标记用宽窗
      const tight = rentText.slice(Math.max(0, mm.index - 12), mm.index + mm[0].length + 4);
      if (RENT_BAD.test(tight)) continue;
      const lo = num(mm[1]);
      if (lo === undefined) continue;
      const hi = mm[2] !== undefined ? num(mm[2]) : undefined;
      const v = convert(hi === undefined ? lo : (lo + hi) / 2);
      if (v !== undefined) {
        const wide = rentText.slice(Math.max(0, mm.index - 15), mm.index + mm[0].length + 25);
        if (RENT_SOFT.test(wide) && inferred) inferred.rent = true;
        return v;
      }
    }
    return undefined;
  }

  const rentAnchor = (anchor: string, unit: RegExp) =>
    new RegExp(
      `${RENT_SHOP}[^。；;|｜]{0,16}?(?:挂牌)?${anchor}${RENT_GAP}约?\\s*${RENT_NUM}\\s*元\\s*\\/\\s*㎡\\s*[/·]\\s*${unit.source}`,
      'g',
    );
  // 兜底：无「租金」词的直述铺租（「临街铺138元/㎡/月」「核心商圈历史峰值约 30–60 元/㎡/天」）；间隔排数字防跳年
  const rentDirect = (unit: RegExp) =>
    new RegExp(
      `${RENT_SHOP}铺?位?[^。；;|｜\\d]{0,4}?约?\\s*${RENT_NUM}\\s*元\\s*\\/\\s*㎡\\s*[/·]\\s*${unit.source}`,
      'g',
    );
  // 末级兜底：裸「租金」句（「租金通常40-80元/㎡/月」），仍排除写字楼/物业费/坪效语境；间隔排数字防跳年
  const rentBare = (unit: RegExp) =>
    new RegExp(
      `租金[^。；;|｜\\d]{0,6}?约?\\s*${RENT_NUM}\\s*元\\s*\\/\\s*㎡\\s*[/·]\\s*${unit.source}`,
      'g',
    );

  const rent =
    scanRentWin(rentAnchor('(?:日?租金|日租)', /(?:天|日)/), rentDayVal) ??
    scanRentWin(rentAnchor('(?:月?租金|月租)', /月/), rentMonVal) ??
    scanRentWin(rentDirect(/(?:天|日)/), rentDayVal) ??
    scanRentWin(rentDirect(/月/), rentMonVal) ??
    scanRentWin(rentBare(/(?:天|日)/), rentDayVal) ??
    scanRentWin(rentBare(/月/), rentMonVal);
  if (rent !== undefined) m.rent = rent;

  // —— 核心客群：森马三大人群 ——
  // 锚定「字母(+类) + 竖线/括号? + 人群名」：兼容「A类｜质感流行派约30%」「A 质感流行派 23%」「A｜质感流行派 29%」
  // 「A类质感流行派35%」「A 类（质感流行派）25-30%」等变体（约字/空格/竖线可省，值支持区间取中值，
  // 「百达优选客」为语料高频错别字一并兼容）。三项合计偏离 100% 过远视为误读，整组弃用。
  const crowd = get('核心客群');
  const crowdVal = (letter: string, tag: string) => {
    const cm = match(
      crowd,
      new RegExp(
        `${letter}\\s*类?\\s*[｜|（(]?\\s*${tag}[）)]?[^%\\d]{0,10}?(?:约|≈|~)?\\s*([\\d.]+)(?:\\s*[-–—~]\\s*([\\d.]+))?\\s*%`,
      ),
    );
    return cm ? rangeNum(cm[1], cm[2]) : undefined;
  };
  const a = crowdVal('A', '质感流行派');
  const b = crowdVal('B', '都市体面家');
  const c = crowdVal('C', '百[搭达]优选客');
  if (a !== undefined && b !== undefined && c !== undefined) {
    const sum = a + b + c;
    if (sum >= 85 && sum <= 115) {
      m.crowdA = a;
      m.crowdB = b;
      m.crowdC = c;
    }
  }

  // —— 竞品密度（展示项；已移出评分模型——覆盖过低，小样本百分位有误导）——
  // 紧口径：必须有 2/3 公里圈层锚词（兼容 3-4km 与 ≥/约/至少前缀）+ 商业体量词；
  // 排除「全国/集团/旗下/在管/运营/累计」等企业总口径，1km/5km 圈层不取（圈层不可比）。
  const weakness = get('最大短板') + '；' + get('所在区位');
  const compRe =
    /(?<!\d)[23](?:\s*[-–—~]\s*4)?\s*(?:公里|km)[^。；;|｜]{0,20}?(?:约|近|超|至少|≥|>)?\s*(\d+)\s*(?:个|座|家|大)\s*(?:商业综合体|商业体|购物中心|商场)/g;
  for (let mm = compRe.exec(weakness); mm; mm = compRe.exec(weakness)) {
    const ctx = weakness.slice(Math.max(0, mm.index - 12), mm.index + mm[0].length + 8);
    if (/全国|集团|旗下|在管|运营|累计/.test(ctx)) continue;
    const v = num(mm[1]);
    if (v !== undefined) m.competitors = v;
    break;
  }

  // —— 品牌数（展示项；品牌≠商户，独立于 merchants，不参与评分）——
  // 两种语序：动词锚定「入驻/引进…N个品牌」与「品牌数N家」；排除[推断]与企业总口径，区间取中值。
  const brandText = [
    get('商业级别与体量'),
    get('项目性质'),
    get('业绩参考'),
    get('最大短板'),
    get('核心客群'),
  ].join('；');
  const BRAND_BAD = /全国|集团|旗下/;
  const BRAND_SOFT = /推断/; // 推断口径：取值并标记，不硬拒
  const brandNum = (lo: string, hi?: string) => {
    const l = num(lo);
    if (l === undefined) return undefined;
    const h = hi !== undefined ? num(hi) : undefined;
    return h === undefined ? l : (l + h) / 2;
  };
  const brandPatterns = [
    /(?:入驻|进驻|引进|汇聚|聚集|在营|开业)[^。；;|｜]{0,10}?约?([\d,，]+)(?:\s*[-–—~]\s*([\d,，]+))?\s*(?:余|多)?\s*(?:个|家)\s*品牌/,
    /品牌数[^。；;|｜]{0,4}?约?([\d,，]+)(?:\s*[-–—~]\s*([\d,，]+))?\s*(?:余|多)?\s*(?:个|家)/,
    // 无动词正向：「品牌总数约180个」「品牌 220+ 家」「入驻品牌400+」式的品牌在前；数字后必须有 +/余/多/个/家 之一
    /品牌[^。；;|｜]{0,4}?约?\s*([\d,，]+)\s*(?:\+|(?:余|多)|[个家])/,
    /([\d,，]+)\s*\+(?:\s*(?:余|多))?\s*(?:[个家]\s*)?品牌/,
    // 数字前置反向：「近1000个品牌」「400余品牌」「98家新品牌」
    /([\d,，]+)\s*(?:余|多)?\s*[个家]?\s*(?:新|主力|首进|合作)?品牌/,
  ];
  for (const bp of brandPatterns) {
    const bm = match(brandText, bp);
    if (!bm) continue;
    const at = bm.index ?? 0;
    const win = brandText.slice(Math.max(0, at - 12), at + bm[0].length + 12);
    if (BRAND_BAD.test(win)) continue;
    const v = brandNum(bm[1], bm[2]);
    if (v !== undefined) {
      if (BRAND_SOFT.test(win) && inferred) inferred.brands = true;
      m.brands = v;
    }
    break;
  }

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
