/** ETL golden 测试：用样本商圈（湖州爱山广场）断言解析正确性 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { parseXlsxFile, stripMarkers } from '../../scripts/parse-xlsx';
import { extractMetrics } from '../../scripts/extract-metrics';
import { deriveMetrics, computePercentiles } from '../../scripts/normalize';
import { computeScore } from '../../src/scoring/model';
import { parseRegion } from '../../scripts/regions';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SAMPLE = path.join(ROOT, 'data', 'raw', '003_湖州爱山广场.xlsx');

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
    // 单样本：所有百分位均为 50 → 综合分 50，六因子齐全
    expect(score).toBe(50);
    expect(factors).toHaveLength(6);
  });
});

describe('评分容缺：权重分摊', () => {
  it('缺失因子权重按比例分摊，不惩罚缺数据', () => {
    // 只有客流与人口数据
    const p = { trafficWeekday: 80, trafficWeekend: 60, pop3km: 40 };
    const { score, factors } = computeScore(
      { trafficWeekday: 17.5, trafficWeekend: 30, pop3km: 11.5 },
      p,
    );
    // traffic = (80*0.4 + 60*0.4)/0.8 = 70；pop = 40
    // 权重 traffic 30 / pop 20 → (70*30 + 40*20)/50 = 58
    expect(factors.map((f) => f.key)).toEqual(['traffic', 'pop']);
    expect(score).toBe(58);
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
