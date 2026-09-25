/** ETL golden 测试：用样本商圈（湖州爱山广场）断言解析正确性 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { parseXlsxFile, stripMarkers } from '../../scripts/parse-xlsx';
import { extractMetrics } from '../../scripts/extract-metrics';
import { deriveMetrics, computePercentiles } from '../../scripts/normalize';
import { computeScore, computeFactors } from '../../src/scoring/model';
import { parseRegion } from '../../scripts/regions';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SAMPLE = path.join(ROOT, 'tests', 'fixtures', '003_湖州爱山广场.xlsx');

function parseSample() {
  return parseXlsxFile(SAMPLE, '003_湖州爱山广场.xlsx');
}

describe('parse-xlsx：湖州爱山广场样本', () => {
  it('解析出 13 个维度', () => {
    const { district } = parseSample();
    expect(Object.keys(district.dimensions)).toHaveLength(13);
  });

  it('名称/地址/省市区/评级', () => {
    const { district } = parseSample();
    expect(district.name).toBe('湖州爱山广场');
    expect(district.address).toContain('浙江省湖州市吴兴区');
    expect(district.province).toBe('浙江省');
    expect(district.city).toBe('湖州市');
    expect(district.rating).toBe('B');
  });

  it('数值指标抽取（含区间中值）', () => {
    const { district } = parseSample();
    const m = district.metrics;
    expect(m.buildingArea).toBeCloseTo(14.5);
    expect(m.parking).toBe(500);
    expect(m.merchants).toBe(6500);
    expect(m.pop3km).toBeCloseTo(11.5);
    expect(m.trafficWeekday).toBeCloseTo(17.5); // 15万-20万 取中值
    expect(m.trafficWeekend).toBe(30);
    expect(m.trafficPeak).toBe(46);
    expect(m.rent).toBeCloseTo(1.11);
    expect(m.openedYear).toBe(2010);
    expect(m.crowdA).toBe(30);
    expect(m.crowdB).toBe(50);
    expect(m.crowdC).toBe(20);
    expect(m.competitors).toBe(6);
  });

  it('标记提取：来源与可信度', () => {
    const { district } = parseSample();
    const nature = district.dimensions['项目性质']!;
    expect(nature.sources.length).toBeGreaterThan(0);
    expect(nature.sources).toContain('湖州市政府门户/浙江省商务厅公示');
    expect(nature.confidence).toBe('A');
    expect(nature.text).not.toContain('[检索');
    expect(nature.text).not.toContain('[A]');
  });

  it('修正数据不回退：+11.3% 与高铁新站', () => {
    const { district } = parseSample();
    expect(district.dimensions['业绩参考']!.text).toContain('+11.3%');
    expect(district.dimensions['所在区位']!.text).toContain('11.7km');
    expect(district.dimensions['交通条件']!.text).toContain('3km');
  });
});

describe('stripMarkers', () => {
  it('空文本安全', () => {
    const r = stripMarkers('');
    expect(r.text).toBe('');
    expect(r.sources).toEqual([]);
    expect(r.confidence).toBeNull();
  });
});

describe('normalize + scoring（单商圈）', () => {
  it('派生指标', () => {
    const { district } = parseSample();
    const derived = deriveMetrics(district);
    expect(derived.crowdAB).toBe(80); // A30 + B50
    expect(derived.parkingPer10k).toBeCloseTo(500 / 30, 1); // 500车位/30万周末客流
  });

  it('单商圈百分位为 50，评分为 50', () => {
    const { district } = parseSample();
    const derived = [deriveMetrics(district)];
    const [p] = computePercentiles([district], derived);
    district.percentiles = p;
    const { score, factors } = computeScore(district.metrics, p);
    // 单样本：所有百分位均为 50 → 综合分 50，四因子齐全（租金/竞品已停用）
    expect(score).toBe(50);
    expect(factors).toHaveLength(4);
  });
});

describe('评分严格模式：任一因子缺失不评分', () => {
  it('缺停车便利 → score 为 null（不再权重分摊）', () => {
    // 只有客流与人口数据
    const p = { trafficWeekday: 80, trafficWeekend: 60, pop3km: 40 };
    const { score, factors } = computeScore(
      { trafficWeekday: 17.5, trafficWeekend: 30, pop3km: 11.5 },
      p,
    );
    expect(score).toBeNull();
    expect(factors.map((f) => f.key)).toEqual(['traffic', 'pop']);
  });

  it('权重调为 0 的因子视为刻意排除，不影响完整性', () => {
    const p = { trafficWeekday: 80, trafficWeekend: 60, pop3km: 40 };
    const { score, factors } = computeScore(
      { trafficWeekday: 17.5, trafficWeekend: 30, pop3km: 11.5 },
      p,
      { traffic: 30, pop: 20, crowd: 0, parking: 0 },
    );
    expect(score).not.toBeNull();
    expect(factors.map((f) => f.key)).toEqual(['traffic', 'pop']);
  });

  it('全部缺失返回 null', () => {
    const { score } = computeScore({}, {});
    expect(score).toBeNull();
  });
});

describe('客流措辞变体（抽取健壮性）', () => {
  const cases: Array<[string, number | undefined]> = [
    ['周末客流量：约12万人次 ｜ 最高单日25万人次 ｜ 工作日客流量：约8万人次/日', 12],
    ['周末客流12万人次', 12],
    ['周末日均客流12万人次', 12],
    ['周末日均约30万人次', 30],
    ['工作日客流量：约8万人次/日', 8],
    ['工作日客流量：约15万-20万人次/日', 17.5],
    ['最高单日25万人次', 25],
    ['节假日峰值客流量：最高单日25万人次。', 25],
  ];
  for (const [text, expected] of cases) {
    it(`「${text.slice(0, 18)}…」→ ${expected}`, () => {
      const m = extractMetrics({ 日均客流: text });
      const got = m.trafficWeekend ?? m.trafficWeekday ?? m.trafficPeak;
      expect(got).toBe(expected);
    });
  }
});

describe('体量类指标（建面/车位/商户/首店/开业年）', () => {
  it('建筑面积多口径', () => {
    expect(extractMetrics({ 商业级别与体量: '商业面积7万㎡（招商手册6.7万㎡）' }).buildingArea).toBe(7);
    expect(extractMetrics({ 商业级别与体量: '总建面约10.36-10.73万㎡' }).buildingArea).toBeCloseTo(10.55);
    expect(extractMetrics({ 商业级别与体量: '建筑面积约 405,000㎡' }).buildingArea).toBe(40.5);
    expect(extractMetrics({ 商业级别与体量: '体量推断约4–6万㎡' }).buildingArea).toBe(5);
  });
  it('车位：近/区间/数字前置/推断标记', () => {
    expect(extractMetrics({ 商业级别与体量: '停车位近1700个' }).parking).toBe(1700);
    expect(extractMetrics({ 商业级别与体量: '地上地下共5层，2181个停车位' }).parking).toBe(2181);
    const inf: Record<string, boolean> = {};
    const m = extractMetrics({ 商业级别与体量: '折合车位推断约200-260个' }, inf);
    expect(m.parking).toBe(230);
    expect(inf.parking).toBe(true);
  });
  it('车位防误抓：停车费/小时/配建指标不是车位数', () => {
    expect(extractMetrics({ 交通条件: '停车6元/小时、24小时封顶60元' }).parking).toBeUndefined();
    expect(extractMetrics({ 商业级别与体量: '车位近千个，1小时免费、超出8元/h' }).parking).toBeUndefined();
    expect(extractMetrics({ 最大优势: '停车配建指标、2024-2025年单店客流官方' }).parking).toBeUndefined();
    // 坏句在前不连坐：迭代到真正的车位句
    const m = extractMetrics({ 商业级别与体量: '1200个停车位' , 交通条件: '停车1小时免费' });
    expect(m.parking).toBe(1200);
  });
  it('商户与首店', () => {
    expect(extractMetrics({ 商业级别与体量: '870家商户、22个业态' }).merchants).toBe(870);
    expect(extractMetrics({ 商业级别与体量: '入驻商户超350家' }).merchants).toBe(350);
    expect(extractMetrics({ 商业级别与体量: '开业品牌163个（含定州首店100个）' }).firstStores).toBe(100);
    expect(extractMetrics({ 商业级别与体量: '规划品牌220+家（含 80 家首进永州）' }).firstStores).toBe(80);
    expect(extractMetrics({ 商业级别与体量: '首店比例超50%' }).firstStores).toBeUndefined();
  });
  it('开业年份放宽到「正式开业」紧邻年份', () => {
    expect(extractMetrics({ 开业时间: '2016 年 5 月 29 日正式开业（招…' }).openedYear).toBe(2016);
    expect(extractMetrics({ 开业时间: '曾计划2017年开业，延期；2019-12-12正式开业' }).openedYear).toBe(2019);
  });
  it('注册年不算开业年，正式开业优先', () => {
    const m = extractMetrics({
      开业时间: '2002年6月3日项目公司注册成立；2004年5月28日正式开业；2010年引入主力店',
      商业级别与体量: '停车近500个（与双安商场共享地库，[推断·中]）',
    });
    expect(m.openedYear).toBe(2004);
    expect(m.parking).toBe(500);
  });
  it('品牌数：加号/总数/数字前置', () => {
    expect(extractMetrics({ 商业级别与体量: '入驻品牌400+，90%天津销售前三' }).brands).toBe(400);
    expect(extractMetrics({ 商业级别与体量: '品牌总数约180个' }).brands).toBe(180);
    expect(extractMetrics({ 商业级别与体量: '近1000个品牌' }).brands).toBe(1000);
    expect(extractMetrics({ 商业级别与体量: '宣传口径"10万方、400余品牌"' }).brands).toBe(400);
  });
});

describe('评分模型：四因子（租金/竞品已停用）', () => {
  it('computeFactors 仅含现役因子', () => {
    const f = computeFactors({ rent: 70 });
    expect(Object.keys(f)).toEqual(['traffic', 'pop', 'crowd', 'parking']);
  });
});

describe('客流防污染（销售额/年口径/括号措辞）', () => {
  it('「万元」结尾是销售额不是客流', () => {
    const m = extractMetrics({
      业绩参考: '年销售 8–15 亿元；节假日单日峰值 3,000–5,000 万元；坪效 0.8–1.5 万/㎡/年',
    });
    expect(m.trafficPeak).toBeUndefined();
  });
  it('「年峰值」是年客流不取，改取「单日最高」', () => {
    const m = extractMetrics({
      日均客流:
        '工作日（周一至周四）5–7 万/日、普通周末（周五至周日）8–9 万/日；历史年峰值 2,400 万人次、历史单日最高 12–13 万',
    });
    expect(m.trafficWeekday).toBe(6);
    expect(m.trafficWeekend).toBe(8.5);
    expect(m.trafficPeak).toBe(12.5);
  });
  it('「周年庆单日客流」计入峰值', () => {
    expect(
      extractMetrics({ 业绩参考: '2025-11-29 11 周年庆单日客流 13 万+' }).trafficPeak,
    ).toBe(13);
  });
  it('销售额措辞不取（「首周末销售」「日销峰值」）', () => {
    expect(extractMetrics({ 业绩参考: '2022双11首周末销售1200万（同比+177%）' }).trafficWeekend).toBeUndefined();
    expect(extractMetrics({ 日均客流: '2024春节日均约3.6万、日销峰值450万+' }).trafficPeak).toBeUndefined();
  });
  it('[推断] 句取值并标记推断（全域口径 ≥100 万仍不取）', () => {
    const inf: Record<string, boolean> = {};
    const m = extractMetrics(
      {
        日均客流:
          '解放碑商圈日均30万+；推断工作日20-30万、周末40-50万、节假日峰值150-170万',
      },
      inf,
    );
    expect(m.trafficWeekday).toBe(25);
    expect(m.trafficWeekend).toBe(45);
    expect(m.trafficPeak).toBeUndefined(); // ≥100 万为步行街/全域口径，推断也不取
    expect(inf.trafficWeekday).toBe(true);
    expect(inf.trafficWeekend).toBe(true);
  });
  it('≥100 万/日 的全域口径不取，回退取后文单店值', () => {
    const m = extractMetrics({ 日均客流: '步行街节假日峰值150–200万；单店节假峰值8–15万' });
    expect(m.trafficPeak).toBe(11.5);
  });
  it('斜杠连接的措辞（周末/节假日）', () => {
    const inf: Record<string, boolean> = {};
    const m = extractMetrics(
      { 日均客流: '稳态客流推断：工作日 18-25 万人次/日，周末/节假日 35-50 万人次/日' },
      inf,
    );
    expect(m.trafficWeekday).toBe(21.5);
    expect(m.trafficWeekend).toBe(42.5);
    expect(inf.trafficWeekday).toBe(true);
    expect(inf.trafficWeekend).toBe(true);
  });
  it('裸「节假日/节庆」锚词', () => {
    expect(extractMetrics({ 日均客流: '节假日 30,000-50,000 人次/日（春节、五一）' }).trafficPeak).toBe(4);
    expect(extractMetrics({ 日均客流: '推断工作日 15–25 万、周末 25–60 万、节庆 40–60 万' }).trafficPeak).toBe(50);
  });
  it('共享单位的三档裸区间（单位继承）', () => {
    const inf: Record<string, boolean> = {};
    const m = extractMetrics(
      {
        日均客流:
          '项目自身无公开客流披露；基于4.6万㎡体量推断：日均客流约5,000-8,000人次，其中工作日3,000-5,000、周末8,000-15,000、节假日峰值20,000-35,000；年客流推算约200-280万人次。[推断·置信度：中]',
      },
      inf,
    );
    expect(m.trafficWeekday).toBeCloseTo(0.4);
    expect(m.trafficWeekend).toBeCloseTo(1.15);
    expect(m.trafficPeak).toBeCloseTo(2.75);
    expect(inf.trafficWeekday).toBe(true);
    expect(inf.trafficWeekend).toBe(true);
    expect(inf.trafficPeak).toBe(true);
  });
  it('约号/加粗/比较符/日期措辞', () => {
    const m = extractMetrics({
      日均客流: '工作日~3.5-4.5万/日、周末~7-9万/日；节假日峰值(春节/国庆)~12-15万/日',
    });
    expect(m.trafficWeekday).toBe(4);
    expect(m.trafficWeekend).toBe(8);
    expect(m.trafficPeak).toBe(13.5);
    const m2 = extractMetrics({ 日均客流: '**周末**日均约 3.0-4.0 万人次' });
    expect(m2.trafficWeekend).toBe(3.5);
    const m3 = extractMetrics({ 日均客流: '周末单日>8万人次/日；节假日单日>10万人次/日' });
    expect(m3.trafficWeekend).toBe(8);
    expect(m3.trafficPeak).toBe(10);
    expect(extractMetrics({ 日均客流: '节假日峰值 2024 春节（8 天）日均 3.7 万' }).trafficPeak).toBe(3.7);
  });
  it('峰值累计超域时取括注日均（峰值指日峰值）', () => {
    expect(
      extractMetrics({ 日均客流: '峰值2024国庆7天370.6万（日均52.9万）、春节8天324.8万（日均40.6万）' })
        .trafficPeak,
    ).toBe(52.9);
  });
});

describe('3公里人口措辞变体（约后空格/万省人/插字/密度守卫）', () => {
  const pop = (text: string) => extractMetrics({ 周边3公里人口: text }).pop3km;
  const cases: Array<[string, number | undefined]> = [
    ['3km 半径覆盖长延堡街道+电子城街道，合计约 75-85 万人', 80],
    ['3公里半径覆盖多街道合计常住约50-55万', 52.5],
    ['3 km 圈层合计常住人口约 70–100 万人', 85],
    ['合计推断约 35 万', 35],
    ['推断 3km 圈常住约 45–55 万人', 50],
    ['3 km 圈覆盖韦曲/郭杜，估算 30–60 万（含大学生 10–18 万）', 45],
    ['核心圈人口密度约 2.5–5.0 万人/km²', undefined],
  ];
  for (const [text, expected] of cases) {
    it(`「${text.slice(0, 20)}…」→ ${expected ?? '—'}`, () => {
      expect(pop(text)).toBe(expected);
    });
  }
  it('推断句标记 inferred', () => {
    const inf: Record<string, boolean> = {};
    extractMetrics({ 周边3公里人口: '合计推断约 35 万' }, inf);
    expect(inf.pop3km).toBe(true);
  });
});

describe('租金窄通道（街铺日租直取 + 月租÷30，混口径不取）', () => {
  const rent = (text: string) => extractMetrics({ 业绩参考: text }).rent;
  const cases: Array<[string, number | undefined]> = [
    ['周边街铺挂牌租金约1.11元/㎡/天', 1.11],
    ['临街商铺租金 2.5-3.5 元/㎡/天', 3],
    ['社区底商租金约 180–280 元/㎡/月', 7.67], // (180+280)/2/30
    ['首层商铺日租金约3元/㎡/天；商铺租金约300元/㎡/月', 3], // 日租优先于月租换算
    ['商铺日均坪效约25-45元/㎡/天', undefined], // 坪效≠租金
    ['写字楼租金0.85-1.3元/㎡/天', undefined], // 非街铺语境
    ['临街商铺租金（60-85元/㎡/月）及物业费另计', 2.42], // 租金值有效；物业费在下一分句不连坐
    ['商铺租金1.88万元/㎡/年', undefined], // 年口径不取
    ['商铺日租金2026Q2约3.03元/㎡/天', undefined], // 锚词与数字间夹年份
  ];
  for (const [text, expected] of cases) {
    it(`「${text.slice(0, 22)}…」→ ${expected ?? '—'}`, () => {
      expect(rent(text)).toBe(expected);
    });
  }
  it('[推断] 句取值并标记推断', () => {
    const inf: Record<string, boolean> = {};
    const m = extractMetrics({ 业绩参考: '周边底商租金约2-3元/㎡/天[推断·中]' }, inf);
    expect(m.rent).toBe(2.5);
    expect(inf.rent).toBe(true);
  });
  it('直述铺租（无租金词）与值域上限 100', () => {
    expect(extractMetrics({ 业绩参考: '临街铺138元/㎡/月、内铺80-150' }).rent).toBe(4.6);
    expect(
      extractMetrics({ 业绩参考: '南京东路核心商圈历史峰值约 30–60 元/㎡/天' }).rent,
    ).toBe(45);
    expect(extractMetrics({ 业绩参考: '首层租金 2,000–3,000 元/㎡/月' }).rent).toBe(83.33);
  });
  it('裸租金句兜底与密度守卫不误杀', () => {
    expect(extractMetrics({ 业绩参考: '租金通常40-80元/㎡/月，高化主力柜位远超' }).rent).toBe(2);
    expect(
      extractMetrics({
        周边3公里人口:
          '3 km 半径覆盖老城核心（草市街、少城等），常住人口推断 25–35 万人、密度 2.5–3.5 万人/km²',
      }).pop3km,
    ).toBe(30);
  });
});

describe('竞品紧口径（2/3km 圈层 + 商业体量词）', () => {
  const comp = (text: string) => extractMetrics({ 最大短板: text }).competitors;
  const cases: Array<[string, number | undefined]> = [
    ['1.同质化竞争：2-3公里内6大商业体贴身肉搏（银泰百货、浙北大厦）', 6],
    ['同质化分流压力：3km 内 ≥10 个商业体（鸿福门广场）', 10],
    ['周边3公里内集中万象天地、京基百纳广场等约21个商场', 21],
    ['3km内12个购物中心，全国在管80座', undefined], // 企业总口径混入句
    ['周边5公里内8个购物中心分流', undefined], // 非 2/3km 圈层
    ['1km内9大商业体环绕', undefined],
  ];
  for (const [text, expected] of cases) {
    it(`「${text.slice(0, 22)}…」→ ${expected ?? '—'}`, () => {
      expect(comp(text)).toBe(expected);
    });
  }
});

describe('品牌数（与商户数分离）', () => {
  it('动词锚定 + 区间取中值', () => {
    expect(extractMetrics({ 商业级别与体量: '入驻 258 个品牌、33 家首店' }).brands).toBe(258);
    expect(extractMetrics({ 商业级别与体量: '汇聚 150-200 家品牌' }).brands).toBe(175);
    expect(extractMetrics({ 业绩参考: '品牌数120-160家及主力店品牌' }).brands).toBe(140);
  });
  it('商户数与品牌数互不污染', () => {
    const m = extractMetrics({ 商业级别与体量: '开业引进超300家品牌（金街在营商户267家）' });
    expect(m.brands).toBe(300);
    expect(m.merchants).toBe(267);
  });
  it('[推断] 句取值并标记推断', () => {
    const inf: Record<string, boolean> = {};
    const m = extractMetrics({ 商业级别与体量: '开业入驻236家品牌[推断·x]' }, inf);
    expect(m.brands).toBe(236);
    expect(inf.brands).toBe(true);
  });
});

describe('森马三大人群措辞变体', () => {
  const crowd = (text: string) => {
    const m = extractMetrics({ 核心客群: text });
    return [m.crowdA, m.crowdB, m.crowdC];
  };
  it('标准竖线形式', () => {
    expect(crowd('A类｜质感流行派约30%±4pp，B类｜都市体面家约50%±5pp，C类｜百搭优选客约20%±4pp')).toEqual([30, 50, 20]);
  });
  it('无类字/无竖线/无约字变体', () => {
    expect(crowd('A 质感流行派 23%±5pp、B 都市体面家 52%±5pp（核心）、C 百搭优选客 25%±5pp')).toEqual([23, 52, 25]);
    expect(crowd('A类质感流行派约18%±5pp，B类都市体面家约40%±5pp，C类百搭优选客约42%±4pp')).toEqual([18, 40, 42]);
    expect(crowd('A 类｜质感流行派约17%±5pp，B 类｜都市体面家约50%±5pp，C 类｜百搭优选客约33%±4pp')).toEqual([17, 50, 33]);
    expect(crowd('A｜质感流行派 29%±5pp（快时尚）、B｜都市体面家 34%±4pp、C｜百搭优选客 37%±4pp')).toEqual([29, 34, 37]);
  });
  it('区间值与「百达」错别字', () => {
    expect(crowd('A类｜质感流行派约10-15%（±5pp），B类｜都市体面家约50-60%（±5pp），C类｜百搭优选客约30-35%')).toEqual([12.5, 55, 32.5]);
    expect(crowd('A类｜质感流行派约25%±5pp，B类｜都市体面家约45%±5pp，C类｜百达优选客约30%±5pp')).toEqual([25, 45, 30]);
    expect(crowd('A 类（质感流行派）25-30%±5pp，B 类（都市体面家）45-50%±5pp，C 类（百搭优选客）20-25%±4pp')).toEqual([27.5, 47.5, 22.5]);
  });
  it('三项合计偏离 100% 过远整组弃用', () => {
    expect(crowd('A类｜质感流行派约60%±5pp，B类｜都市体面家约60%±5pp，C类｜百搭优选客约60%±5pp')).toEqual([undefined, undefined, undefined]);
  });
});

describe('regions', () => {
  it('直辖市与自治区', () => {
    expect(parseRegion('北京市朝阳区三里屯路')).toEqual({ province: '北京市', city: '北京市' });
    expect(parseRegion('广西壮族自治区南宁市青秀区')).toEqual({
      province: '广西壮族自治区',
      city: '南宁市',
    });
    expect(parseRegion('浙江省杭州市拱墅区')).toEqual({ province: '浙江省', city: '杭州市' });
  });
});

describe('百分位（小样本与并列值）', () => {
  const mk = (pop3km?: number) =>
    ({ metrics: { pop3km }, percentiles: {} }) as Parameters<typeof computePercentiles>[0][number];

  it('两个不同值 → 0 与 100，不越界', () => {
    const ds = [mk(10), mk(20)];
    const ps = computePercentiles(ds, [{}, {}]);
    expect(ps[0].pop3km).toBe(0);
    expect(ps[1].pop3km).toBe(100);
  });

  it('两个相同值 → 各 50', () => {
    const ds = [mk(10), mk(10)];
    const ps = computePercentiles(ds, [{}, {}]);
    expect(ps[0].pop3km).toBe(50);
    expect(ps[1].pop3km).toBe(50);
  });

  it('三值含并列（10,10,20）→ 25 / 25 / 100', () => {
    const ds = [mk(10), mk(10), mk(20)];
    const ps = computePercentiles(ds, [{}, {}, {}]);
    expect(ps[0].pop3km).toBe(25);
    expect(ps[1].pop3km).toBe(25);
    expect(ps[2].pop3km).toBe(100);
  });
});
