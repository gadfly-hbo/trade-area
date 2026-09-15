/**
 * 全量归一：派生指标计算 + 百分位分。
 * 逆向指标（租金、竞品数）在百分位层翻转，保证「越高分越利于服饰选址」全局一致。
 */
import type {
  DistrictDetail,
  PercentileMap,
  DerivedMetrics,
} from '../src/types';

/** 派生指标：客群匹配 A+B、车位/万人客流 */
export function deriveMetrics(d: DistrictDetail): DerivedMetrics {
  const derived: DerivedMetrics = {};
  const { crowdA, crowdB, parking } = d.metrics;
  if (crowdA !== undefined || crowdB !== undefined) {
    derived.crowdAB = Math.round(((crowdA ?? 0) + (crowdB ?? 0)) * 10) / 10;
  }
  const trafficBase =
    d.metrics.trafficWeekend ?? d.metrics.trafficWeekday ?? d.metrics.trafficPeak;
  if (parking !== undefined && trafficBase) {
    derived.parkingPer10k = Math.round((parking / trafficBase) * 100) / 100;
  }
  return derived;
}

/** 参与百分位的指标；true = 逆向（值越高越不利） */
const PERCENTILE_KEYS: Array<{ key: keyof PercentileMap; inverse: boolean }> = [
  { key: 'buildingArea', inverse: false },
  { key: 'parking', inverse: false },
  { key: 'merchants', inverse: false },
  { key: 'pop3km', inverse: false },
  { key: 'trafficWeekday', inverse: false },
  { key: 'trafficWeekend', inverse: false },
  { key: 'trafficPeak', inverse: false },
  { key: 'rent', inverse: true },
  { key: 'crowdAB', inverse: false },
  { key: 'competitors', inverse: true },
  { key: 'parkingPer10k', inverse: false },
];

/** 取值：派生指标优先从 derived 读，其余从 metrics 读 */
function metricValue(
  d: DistrictDetail,
  derived: DerivedMetrics,
  key: keyof PercentileMap,
): number | undefined {
  if (key in derived) return derived[key as keyof DerivedMetrics];
  return d.metrics[key as keyof DistrictDetail['metrics']];
}

/**
 * 计算全体商圈各指标的百分位分（平均秩，0-100）。
 * 单商圈场景（N=1）百分位统一给 50，避免 NaN。
 */
export function computePercentiles(
  districts: DistrictDetail[],
  derivedList: DerivedMetrics[],
): PercentileMap[] {
  return districts.map((d, i) => {
    const derived = derivedList[i];
    const p: PercentileMap = {};
    for (const { key, inverse } of PERCENTILE_KEYS) {
      const values = districts.map((other, j) => metricValue(other, derivedList[j], key));
      const present = values.filter((v): v is number => v !== undefined);
      if (present.length <= 1) {
        if (present.length === 1 && metricValue(d, derived, key) !== undefined) p[key] = 50;
        continue;
      }
      const v = metricValue(d, derived, key);
      if (v === undefined) continue;
      // 平均秩百分位：并列值取平均名次，映射到 0-100（n=2 时低者 0、高者 100、相等各 50）
      const below = present.filter((x) => x < v).length;
      const equal = present.filter((x) => x === v).length;
      const pct = ((below + (equal - 1) / 2) / (present.length - 1)) * 100;
      const rounded = Math.round(pct * 10) / 10;
      p[key] = inverse ? Math.round((100 - rounded) * 10) / 10 : rounded;
    }
    return p;
  });
}
