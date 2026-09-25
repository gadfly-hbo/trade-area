/** md 解析测试：覆盖 district-12dim 的三种表格排版变体与次要表格干扰 */
import { describe, it, expect } from 'vitest';
import { parseMdContent } from '../../scripts/parse-md';

const MAIN_TABLE = `
# 校验结论

发现 1 处格式问题已修正。

---

# 修正后的完整 13 行表格

| 对比维度 | 研究对象描述 |
|---|---|
| 项目名称及地址 | 测试广场，浙江省杭州市上城区某路1号 |
| 项目性质 | 综合体 [检索·来源甲 B] |
| 所在区位 | 上城区某路。 [检索·来源乙 B] |
| 商业级别与体量 | 城市级，建筑面积约8.5万㎡，停车位800个。 [检索·来源丙 A] |
| 开业时间 | 2015年5月1日开业。 [检索·来源丙 A] |
| 周边3公里人口 | 常住合计约20万人。 [检索·来源丁 B] |
| 核心客群 | 森马三大人群预测：A类｜质感流行派约30%±4pp，B类｜都市体面家约50%±5pp，C类｜百搭优选客约20%±4pp。 [推断·（置信度：中）] |
| 日均客流 | 工作日客流量：约8万人次，周末客流12万人次，节假日峰值25万人次。 [检索·来源戊 B] |
| 交通条件 | 地铁2号线某站步行300米。 [检索·来源戊 B] |
| 核心定位 | 区域家庭型购物中心。 [检索·来源己 C] |
| 最大优势 | 1. 交通便；2. 体量大。 [检索·来源甲 A] |
| 最大短板 | 同质化竞争：2-3公里内6大商业体贴身肉搏。 [检索·来源乙 B] |
| 业绩参考 | 年销售约10亿元，周边街铺挂牌租金约2.5元/㎡/天。 [检索·来源丙 A] |

---

# 修正点列表

1. 客流表述统一为万人次
`;

describe('parse-md：2 列标准表', () => {
  const { district, warnings } = parseMdContent(MAIN_TABLE, '0001_测试广场.md');

  it('解析出 13 个维度，无缺失警告', () => {
    expect(Object.keys(district.dimensions)).toHaveLength(13);
    expect(warnings.filter((w) => w.includes('缺失维度'))).toHaveLength(0);
  });

  it('名称取文件名，地址取行政区段', () => {
    expect(district.name).toBe('测试广场');
    expect(district.address).toBe('浙江省杭州市上城区某路1号');
    expect(district.province).toBe('浙江省');
    expect(district.city).toBe('杭州市');
  });

  it('数值指标与标记抽取', () => {
    expect(district.metrics.buildingArea).toBeCloseTo(8.5);
    expect(district.metrics.parking).toBe(800);
    expect(district.metrics.trafficWeekend).toBe(12);
    expect(district.metrics.crowdA).toBe(30);
    expect(district.metrics.rent).toBeCloseTo(2.5);
    const nature = district.dimensions['项目性质']!;
    expect(nature.sources).toContain('来源甲 B');
    expect(nature.text).not.toContain('[检索');
  });

  it('次要表格（修正点列表的编号行）不会被当作维度行', () => {
    // 修正点列表是有序列表而非表格，不会进入块；若有干扰表也应败给主表块
    expect(district.dimensions['业绩参考']!.text).toContain('租金约2.5元/㎡/天');
  });
});

describe('parse-md：3 列序号表与行名变体', () => {
  const TABLE = `
| 序号 | 对比维度 | 研究对象描述 |
|---|---|---|
| 1 | 项目名称及地址 | 武汉测试馆；湖北省武汉市江汉区某大道9号（[检索·官网] A级） |
| 2 | **项目性质** | 购物中心 |
| 3 | 所在区位 | 江汉区 |
| 4 | 商业级别与体量 | 市级 |
| 5 | 开业时间 | 2018年10月1日 |
| 6 | 周边 3 公里人口 | 约30万人 |
| 7 | 核心客群 | 家庭客为主 |
| 8 | 日均客流 | 工作日约5万人次，周末约9万人次 |
| 9 | 交通条件 | 地铁直达 |
| 10 | 核心定位 | 家庭体验 |
| 11 | 最大优势 | 位置好 |
| 12 | 最大短板 | 品牌老化 |
| 13 | 业绩参考 | 未披露 |
`;
  const { district } = parseMdContent(TABLE, '0002_武汉测试馆.md');

  it('3 列布局 + 加粗 + 带空格行名全部命中', () => {
    expect(Object.keys(district.dimensions)).toHaveLength(13);
    expect(district.name).toBe('武汉测试馆');
    expect(district.address).toBe('湖北省武汉市江汉区某大道9号');
    expect(district.metrics.pop3km).toBe(30);
    expect(district.metrics.openedYear).toBe(2018);
  });
});

describe('parse-md：主表取最大块', () => {
  const TABLE = `
| 维度 | 核查结果 |
|---|---|
| 最大短板 | 与主表第12行撞名，应被忽略 |

# 完整 13 行表格

| 对比维度 | 研究对象描述 |
|---|---|
| 项目名称及地址 | 甲广场，北京市朝阳区某路2号 |
| 项目性质 | 购物中心 |
| 所在区位 | 朝阳区 |
| 商业级别与体量 | 区域级 |
| 开业时间 | 2020年 |
| 周边3公里人口 | 15万人 |
| 核心客群 | 白领 |
| 日均客流 | 周末4万人次 |
| 交通条件 | 地铁 |
| 核心定位 | 白领 |
| 最大优势 | 交通 |
| 最大短板 | 业态同质 |
| 业绩参考 | 未披露 |
`;
  const { district } = parseMdContent(TABLE, '0003_甲广场.md');

  it('次要表格里撞名的行不污染主表', () => {
    expect(district.dimensions['最大短板']!.text).toBe('业态同质');
    expect(district.province).toBe('北京市');
    expect(district.city).toBe('北京市');
  });
});
