/**
 * 第二轮核验任务单：S/A+ 全量（剔除第一轮已验）+ 非 S/A+ 高严重度可疑值（超域/年份形/小值/口径混用）。
 * 用法：node reports/_audit/web-verify/round2.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/index.json'), 'utf8'));
const suspects = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports/_audit/web-verify/suspects.json'), 'utf8'));
const round1 = new Set(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'reports/_audit/web-verify/tasks.json'), 'utf8')).map((t) => t.id),
);
const detailsDir = path.join(ROOT, 'public/data/details');
const byId = new Map();
for (const f of fs.readdirSync(detailsDir)) {
  for (const d of JSON.parse(fs.readFileSync(path.join(detailsDir, f), 'utf8'))) byId.set(d.id, d);
}

const CHECK_METRICS = ['openedYear', 'buildingArea', 'parking', 'trafficPeak'];
const SEVERE = /超域|年份误抓|小值|口径|全域/;
const selected = new Map();
const take = (d, tag) => {
  if (!selected.has(d.id) && !round1.has(d.id)) selected.set(d.id, { d, tag });
};

// S/A+ 全量
for (const s of index.districts) {
  if (s.rating === 'S') take(s, 'S2');
  else if (s.rating === 'A+') take(s, 'A+2');
}
// 高严重度可疑（非 S/A+）
const severeOthers = suspects.filter(
  (s) => s.rating !== 'S' && s.rating !== 'A+' && s.flags.some((f) => SEVERE.test(f)),
);
for (const s of severeOthers) take(index.districts.find((d) => d.id === s.id), 'suspect');

const tasks = [...selected.values()].map(({ d: s, tag }) => {
  const det = byId.get(s.id);
  const flags = suspects.find((x) => x.id === s.id)?.flags ?? [];
  return {
    id: s.id, name: s.name, rating: s.rating, layer: tag,
    city: s.city, province: s.province,
    ...(flags.length ? { auditFlags: flags } : {}),
    checks: [
      { metric: 'openedYear', ...(s.metrics.openedYear !== undefined ? { value: s.metrics.openedYear } : { value: null }) },
      { metric: 'buildingArea', ...(s.metrics.buildingArea !== undefined ? { value: s.metrics.buildingArea } : { value: null }) },
      ...(s.metrics.parking !== undefined ? [{ metric: 'parking', value: s.metrics.parking }] : []),
      ...(s.metrics.trafficPeak !== undefined ? [{ metric: 'trafficPeak', value: s.metrics.trafficPeak }] : []),
    ].filter((c) => c.metric === 'openedYear' || c.metric === 'buildingArea' || c.value !== null),
    _det: det ? { inferred: det.inferred ?? {}, basis: det.basis ?? {} } : {},
  };
});

fs.writeFileSync(path.join(ROOT, 'reports/_audit/web-verify/round2-tasks.json'), JSON.stringify(tasks, null, 1));
const stat = {};
tasks.forEach((t) => (stat[t.layer] = (stat[t.layer] || 0) + 1));
console.log(`第二轮任务单：${tasks.length} 商圈，${tasks.reduce((n, t) => n + t.checks.length, 0)} 项检查`);
console.log('分层:', JSON.stringify(stat));
