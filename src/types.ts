/** 商圈数据的共享类型：ETL 产物与前端约定由此定义 */

export const DIMENSION_KEYS = [
  '项目名称与地址',
  '项目性质',
  '所在区位',
  '商业级别与体量',
  '开业时间',
  '周边3公里人口',
  '核心客群',
  '日均客流',
  '交通条件',
  '核心定位',
  '最大优势',
  '最大短板',
  '业绩参考',
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export type Confidence = 'A' | 'B';

/** 从长文本中抽取的数值指标，全部可空（缺失即不参与对比/评分） */
export interface DistrictMetrics {
  /** 建筑面积（万㎡） */
  buildingArea?: number;
  /** 配建机动车位（个） */
  parking?: number;
  /** 商户数（家） */
  merchants?: number;
  /** 首店数量（家） */
  firstStores?: number;
  /** 周边3公里常住人口（万） */
  pop3km?: number;
  /** 工作日客流（万人次/日，区间取中值） */
  trafficWeekday?: number;
  /** 周末客流（万人次/日） */
  trafficWeekend?: number;
  /** 节假日峰值客流（万人次/日） */
  trafficPeak?: number;
  /** 街铺租金（元/㎡/天） */
  rent?: number;
  /** 开街/开业年份 */
  openedYear?: number;
  /** 森马人群 A类·质感流行派（%） */
  crowdA?: number;
  /** 森马人群 B类·都市体面家（%） */
  crowdB?: number;
  /** 森马人群 C类·百搭优选客（%） */
  crowdC?: number;
  /** 2-3公里内大型竞品商业体数（个） */
  competitors?: number;
}

/** 派生指标（ETL 期计算，参与评分） */
export interface DerivedMetrics {
  /** A+B 人群合计（%），服饰目标客群匹配度 */
  crowdAB?: number;
  /** 车位/万人客流（个/万人），越高越好 */
  parkingPer10k?: number;
}

/** 各指标在全体商圈中的百分位分（0-100，越高越好；逆向指标已翻转） */
export type PercentileMap = Partial<
  Record<keyof DistrictMetrics | keyof DerivedMetrics, number>
>;

export interface DistrictSummary {
  id: string;
  name: string;
  address: string;
  province: string;
  city: string;
  rating: 'A' | 'B' | 'C' | null;
  metrics: DistrictMetrics;
  percentiles: PercentileMap;
  /** 默认权重下的综合评分（0-100），无可用指标时为 null */
  score: number | null;
  /** 详情所在分片号 */
  shard: number;
}

export interface DimensionDetail {
  /** 清洗后正文（已移除 [检索·x] 与 [A]/[B] 标记，其余保留原文） */
  text: string;
  sources: string[];
  confidence: Confidence | null;
}

export interface DistrictDetail extends DistrictSummary {
  dimensions: Partial<Record<DimensionKey, DimensionDetail>>;
}

/** public/data/index.json 的结构 */
export interface DataIndex {
  generatedAt: string;
  total: number;
  districts: DistrictSummary[];
}
