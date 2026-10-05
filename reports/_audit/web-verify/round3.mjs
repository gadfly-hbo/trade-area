/**
 * 第三轮定向补漏任务单：A 级全部可疑 + 非 S/A+ 的分期错配/严重标记/小值车位可疑。去重前两轮已验。
 * 用法：node reports/_audit/web-verify/round3.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/index.json'), 'utf8'));
const suspects = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports/_audit/web-verify/suspects.json'), 'utf8'));
const done = new Set();
for (const f of ['tasks.json', 'round2-tasks.json']) {
  for (const t of JSON.parse(fs.readFileSync(path.join(ROOT, 'reports/_audit/web-verify', f), 'utf8'))) done.add(t.id);
}
const detailsDir = path.join(ROOT, 'public/data/details');
const byId = new Map();
for (const f of fs.readdirSync(detailsDir)) {
  for (const d of JSON.parse(fs.readFileSync(path.join(detailsDir, f), 'utf8'))) byId.set(d.id, d);
}

const SEVERE = /超域|年份误抓|小值|口径|全域|分期错配/;
const picked = suspects.filter((s) => {
  if (done.has(s.id)) return false;
  if (s.rating === 'A') return true; // A 级可疑全量
  if (s.rating === 'S' || s.rating === 'A+') return false; // 二轮已全量覆盖
  return s.flags.some((f) => SEVERE.test(f));
});

const tasks = picked.map((s) => {
  const d = index.districts.find((x) => x.id === s.id);
  const det = byId.get(s.id);
  return {
    id: s.id, name: d.name, rating: d.rating, layer: 'r3',
    city: d.city, province: d.province, auditFlags: s.flags,
    checks: ['openedYear', 'buildingArea', 'parking', 'trafficPeak']
      .filter((k) => d.metrics[k] !== undefined)
      .map((k) => ({ metric: k, value: d.metrics[k] })),
    _det: det ? { inferred: det.inferred ?? {}, basis: det.basis ?? {} } : {},
  };
});

fs.writeFileSync(path.join(ROOT, 'reports/_audit/web-verify/round3-tasks.json'), JSON.stringify(tasks, null, 1));
console.log(`第三轮任务单：${tasks.length} 商圈，${tasks.reduce((n, t) => n + t.checks.length, 0)} 项检查`);
