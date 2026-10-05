/**
 * 联网核验抽样器：按分层配额抽 60 个商圈，生成 tasks.json 任务单。
 * 分层：S 12 / A+∪A 18 / B∪C 18（其中 10 个强制选数据最弱层）/ 连锁品牌 12。
 * 用法：node reports/_audit/web-verify/sample.mjs（种子固定，可复现）
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/index.json'), 'utf8'));
const detailsDir = path.join(ROOT, 'public/data/details');

// 合并 details 拿 basis/inferred 明细
const byId = new Map();
for (const f of fs.readdirSync(detailsDir)) {
  for (const d of JSON.parse(fs.readFileSync(path.join(detailsDir, f), 'utf8'))) {
    byId.set(d.id, d);
  }
}

// 固定种子随机（mulberry32）
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261005);
const pick = (arr, n) => {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
};

const ds = index.districts;
const CHECK_METRICS = ['openedYear', 'buildingArea', 'parking', 'trafficPeak'];
const CHAINS = ['万达广场', '吾悦广场', '龙湖', '万象', '大悦城', '印象城', '银泰', '恒隆', '太古', 'SKP', '宝龙', '爱琴海'];

// 弱数据层：benchmark 基准值最多 或 推断指标最多
const weakScore = (d) => (d.basis ? Object.keys(d.basis).length : 0) * 10 + (d.inferred ? Object.keys(d.inferred).length : 0);
const byRating = (r) => ds.filter((d) => d.rating === r);
const selected = new Map();
const take = (list, n, tag) => {
  for (const d of pick(list, n)) {
    if (!selected.has(d.id)) selected.set(d.id, { d, tag });
  }
};

take(byRating('S'), 12, 'S');
take(ds.filter((d) => d.rating === 'A+' || d.rating === 'A'), 18, 'A');
const bc = ds.filter((d) => d.rating === 'B' || d.rating === 'C');
take([...bc].sort((a, b) => weakScore(b) - weakScore(a)), 10, 'BC-weak');
take(bc.filter((d) => !selected.has(d.id)), 8, 'BC');
take(
  ds.filter((d) => CHAINS.some((c) => d.name.includes(c)) && !selected.has(d.id)),
  12,
  'chain',
);

const tasks = [...selected.values()].map(({ d: s, tag }) => {
  const det = byId.get(s.id);
  const checks = [
    { metric: 'address', value: `${s.province}/${s.city} ${s.address || ''}`.trim() },
    ...CHECK_METRICS.filter((k) => s.metrics[k] !== undefined).map((k) => ({
      metric: k,
      value: s.metrics[k],
      ...(s.inferred?.[k] ? { inferred: true } : {}),
      ...(det?.basis?.[k] ? { basis: det.basis[k] } : {}),
    })),
  ];
  return {
    id: s.id, name: s.name, rating: s.rating, layer: tag,
    city: s.city, province: s.province, checks,
  };
});

const outDir = path.join(ROOT, 'reports/_audit/web-verify');
fs.mkdirSync(path.join(outDir, 'results'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'tasks.json'), JSON.stringify(tasks, null, 1));
const stat = {};
tasks.forEach((t) => (stat[t.layer] = (stat[t.layer] || 0) + 1));
console.log(`任务单：${tasks.length} 商圈，${tasks.reduce((n, t) => n + t.checks.length, 0)} 项检查`);
console.log('分层:', JSON.stringify(stat));
