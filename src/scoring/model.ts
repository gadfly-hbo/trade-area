/**
 * 服饰（成人装+童装）选址评分模型。
 * 输入为 ETL 期算好的百分位分（逆向指标已翻转，值越高越利于选址），
 * 前端调权重时基于同一模型实时重算。
 *
 * 四因子：客流 / 3公里人口 / 客群匹配 / 停车便利。
 * 租金、竞品、商户、首店已于 2026-09 停用（不再展示与评分），数据仍在 JSON 中保留。
 */
import type { DistrictMetrics, PercentileMap } from '../types';

export type FactorKey = 'traffic' | 'pop' | 'crowd' | 'parking';

export interface ScoreWeights {
  traffic: number;
  pop: number;
  crowd: number;
  parking: number;
}

/** 默认权重（百分比，无需加总为 100，内部归一） */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  traffic: 30,
  pop: 20,
  crowd: 15,
  parking: 10,
};

export const FACTOR_LABELS: Record<FactorKey, string> = {
  traffic: '客流',
  pop: '3公里人口',
  crowd: '客群匹配',
  parking: '停车便利',
};

export interface ScoreFactor {
  key: FactorKey;
  label: string;
  /** 0-100，null 表示数据缺失 */
  value: number | null;
  weight: number;
}

export interface ScoreResult {
  score: number | null;
  factors: ScoreFactor[];
}

/** 客流三档子权重：工作日 40% / 周末 40% / 节假日峰值 20%，缺档按比例分摊 */
function trafficScore(p: PercentileMap): number | null {
  const parts: Array<[number, number]> = [];
  if (p.trafficWeekday !== undefined) parts.push([p.trafficWeekday, 0.4]);
  if (p.trafficWeekend !== undefined) parts.push([p.trafficWeekend, 0.4]);
  if (p.trafficPeak !== undefined) parts.push([p.trafficPeak, 0.2]);
  if (!parts.length) return null;
  const tw = parts.reduce((s, [, w]) => s + w, 0);
  return parts.reduce((s, [v, w]) => s + (v * w) / tw, 0);
}

export function computeFactors(p: PercentileMap): Record<FactorKey, number | null> {
  return {
    traffic: trafficScore(p),
    pop: p.pop3km ?? null,
    crowd: p.crowdAB ?? null,
    parking: p.parkingPer10k ?? null,
  };
}

/**
 * 加权综合分；某因子缺失时其权重按比例分摊给其余因子（不因缺数据惩罚）。
 * 全部缺失返回 null。
 */
export function computeScore(
  _metrics: DistrictMetrics,
  percentiles: PercentileMap,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): ScoreResult {
  const values = computeFactors(percentiles);
  const entries = (Object.keys(weights) as FactorKey[])
    .map((key) => ({ key, label: FACTOR_LABELS[key], value: values[key], weight: weights[key] }))
    .filter((f) => f.value !== null && f.weight > 0);

  const totalWeight = entries.reduce((s, f) => s + f.weight, 0);
  if (!totalWeight) return { score: null, factors: [] };

  const score = entries.reduce((s, f) => s + (f.value as number) * f.weight, 0) / totalWeight;
  return { score: Math.round(score * 10) / 10, factors: entries };
}
