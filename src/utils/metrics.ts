/** 指标展示元数据 + 格式化工具（列表/详情/对比/排名共用） */
import type { DistrictMetrics } from '@/types';

export interface MetricDef {
  key: keyof DistrictMetrics;
  label: string;
  unit: string;
  /** high = 越大越好（现役指标均为正向） */
  better: 'high' | 'low';
  /** 对比页条形图是否展示 */
  chart?: boolean;
}

/** 现役展示指标（租金/竞品/商户/首店已于 2026-09 停用，数据仍在 JSON 中） */
export const METRIC_DEFS: MetricDef[] = [
  { key: 'trafficWeekday', label: '工作日客流', unit: '万人次/日', better: 'high', chart: true },
  { key: 'trafficWeekend', label: '周末客流', unit: '万人次/日', better: 'high', chart: true },
  { key: 'trafficPeak', label: '节假日峰值客流', unit: '万人次/日', better: 'high', chart: true },
  { key: 'pop3km', label: '3公里人口', unit: '万人', better: 'high', chart: true },
  { key: 'brands', label: '品牌数', unit: '个', better: 'high' },
  { key: 'buildingArea', label: '建筑面积', unit: '万㎡', better: 'high' },
  { key: 'parking', label: '车位数', unit: '个', better: 'high' },
  { key: 'openedYear', label: '开业年份', unit: '', better: 'high' },
];

/** 数值显示：缺失 → '—'，其余去多余小数 */
export function fmt(v: number | undefined | null): string {
  if (v === undefined || v === null) return '—';
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

export function metricText(def: MetricDef, v: number | undefined): string {
  if (v === undefined) return '—';
  return def.unit ? `${fmt(v)} ${def.unit}` : fmt(v);
}

/** 排序比较器：缺失值排最后 */
export function numSorter(
  a: number | undefined | null,
  b: number | undefined | null,
): number {
  const va = a ?? undefined;
  const vb = b ?? undefined;
  if (va === undefined && vb === undefined) return 0;
  if (va === undefined) return -1;
  if (vb === undefined) return 1;
  return va - vb;
}
