/** 前端唯一数据出口：index 全量摘要 + 详情分片按需加载 */
import type { DataIndex, DistrictDetail } from '@/types';

const BASE = import.meta.env.BASE_URL ?? '/';

let indexPromise: Promise<DataIndex> | null = null;
const shardCache = new Map<number, Promise<DistrictDetail[]>>();

export function loadIndex(): Promise<DataIndex> {
  if (!indexPromise) {
    indexPromise = fetch(`${BASE}data/index.json`).then((r) => {
      if (!r.ok) throw new Error(`加载 data/index.json 失败（HTTP ${r.status}）`);
      return r.json() as Promise<DataIndex>;
    });
  }
  return indexPromise;
}

export async function loadDetail(id: string): Promise<DistrictDetail> {
  const index = await loadIndex();
  const summary = index.districts.find((d) => d.id === id);
  if (!summary) throw new Error(`商圈 ${id} 不存在`);

  let shardPromise = shardCache.get(summary.shard);
  if (!shardPromise) {
    shardPromise = fetch(`${BASE}data/details/s${summary.shard}.json`).then((r) => {
      if (!r.ok) throw new Error(`加载详情分片 s${summary.shard} 失败（HTTP ${r.status}）`);
      return r.json() as Promise<DistrictDetail[]>;
    });
    shardCache.set(summary.shard, shardPromise);
  }
  const list = await shardPromise;
  const detail = list.find((d) => d.id === id);
  if (!detail) throw new Error(`分片 s${summary.shard} 中未找到商圈 ${id}`);
  return detail;
}

export function loadDetails(ids: string[]): Promise<DistrictDetail[]> {
  return Promise.all(ids.map(loadDetail));
}
