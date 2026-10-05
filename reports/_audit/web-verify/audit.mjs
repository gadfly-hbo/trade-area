/**
 * 全量自洽审计：不联网，对 2835 个商圈的抽取值做合理性交叉检查，输出可疑清单。
 * 检查维度：开业年（区间/动词邻近性）、建面（综合体宣称口径混用/超域）、车位（年份形/小值形/邻词污染）、峰值客流（全域口径）。
 * 用法：node reports/_audit/web-verify/audit.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const detailsDir = path.join(ROOT, 'public/data/details');
const outPath = path.join(ROOT, 'reports/_audit/web-verify/suspects.json');

const suspects = [];
let total = 0;

for (const f of fs.readdirSync(detailsDir).sort()) {
  for (const d of JSON.parse(fs.readFileSync(path.join(detailsDir, f), 'utf8'))) {
    total++;
    const flags = [];
    const opened = d.dimensions['开业时间']?.text ?? '';
    const scale = (d.dimensions['商业级别与体量']?.text ?? '') + '；' + (d.dimensions['项目性质']?.text ?? '');
    const traffic = d.dimensions['交通条件']?.text ?? '';
    const m = d.metrics;

    // —— 开业年 ——
    if (m.openedYear !== undefined) {
      const y = m.openedYear;
      if (y < 1985 || y > 2027) flags.push(`openedYear 超域: ${y}`);
      else {
        // 年份前后 30 字窗内须有开业动词（动词可在年前：「正式开业2021」）
        const idx = opened.indexOf(String(y));
        const seg = idx >= 0 ? opened.slice(Math.max(0, idx - 14), idx + 30) : '';
        if (!seg || !/开业|开幕|试?营业|开街|迎客|重张|运营|揭幕/.test(seg)) {
          flags.push(`openedYear ${y} 无邻近开业动词: …${(opened.match(new RegExp(`.{0,12}${y}`))?.[0] ?? '')}…`);
        }
      }
      // 分期/馆别错配：条目名含「二期/三期/二期/B馆…」时，开业行须提及该期，否则疑取了另一期年份
      const phase = d.name.match(/(一期|二期|三期|四期|[A-E]馆)$/);
      if (phase && !opened.includes(phase[1].replace(/([A-E])馆/, '$1馆'))) {
        flags.push(`openedYear 疑分期错配: 条目名「${phase[1]}」未出现于开业时间行`);
      }
    }

    // —— 建面：综合体宣称口径混用（取到总建面但同行另有商业面积）——
    if (m.buildingArea !== undefined) {
      if (m.buildingArea < 1 || m.buildingArea > 100) flags.push(`buildingArea 超域: ${m.buildingArea}万㎡`);
      // 同行既有「总建面/综合体宣称」又有「商业面积」值且差异 >3 倍 → 疑口径混用
      const commArea = scale.match(/(?:商业面积|商业建筑面积|经营面积)[^。；;|｜]{0,10}?([\d.]+)\s*万/);
      const grossArea = scale.match(/(?:总建筑面积|总建面|综合体)[^。；;|｜]{0,10}?([\d.]+)\s*万/);
      if (commArea && grossArea && Math.abs(commArea[1] - grossArea[1]) / Math.min(commArea[1], grossArea[1]) > 2) {
        if (Math.abs(m.buildingArea - Number(grossArea[1])) < Math.abs(m.buildingArea - Number(commArea[1]))) {
          flags.push(`buildingArea ${m.buildingArea} 疑取综合体口径 ${grossArea[1]}（商业面积 ${commArea[1]}）`);
        }
      }
    }

    // —— 车位：年份形（数字后紧跟「年」）/ 小值形 / 超域 / 邻词污染 ——
    if (m.parking !== undefined) {
      const p = m.parking;
      const text = scale + traffic;
      // 仅当数字在文本中以「N年」形态出现才疑年份误抓（「2000个车位」是正常计数）
      if (p >= 1900 && p <= 2030 && Number.isInteger(p) && new RegExp(`${p}\\s*年`).test(text)) {
        flags.push(`parking ${p} 疑年份误抓`);
      }
      if (p < 50) flags.push(`parking ${p} 疑扶梯/分钟等小值误抓`);
      if (p > 10000) flags.push(`parking ${p} 超域`);
      const re = new RegExp(`(?:车位|停车)[^。；;|｜]{0,8}?${p}(?:[^。；;|｜]{0,6}(?:品牌|商户|商铺|扶梯|电梯))`);
      if (re.test(text)) flags.push(`parking ${p} 邻接品牌/扶梯等词`);
    }

    // —— 峰值客流：全域口径 ——
    if (m.trafficPeak !== undefined && m.trafficPeak >= 50) {
      flags.push(`trafficPeak ${m.trafficPeak} 万人次/日 疑全域/累计口径`);
    }

    if (flags.length) {
      suspects.push({ id: d.id, name: d.name, rating: d.rating, shard: d.shard, flags });
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify(suspects, null, 1));
const byFlag = {};
for (const s of suspects) for (const fl of s.flags) byFlag[fl.split(':')[0].split(' ')[0]] = (byFlag[fl.split(':')[0].split(' ')[0]] || 0) + 1;
console.log(`扫描 ${total} 个商圈，可疑 ${suspects.length} 个，共 ${suspects.reduce((n, s) => n + s.flags.length, 0)} 条标记`);
console.log('按类型:', JSON.stringify(byFlag));
const rated = suspects.filter((s) => s.rating === 'S' || s.rating === 'A+');
console.log(`其中 S/A+ 级: ${rated.length} 个（第二轮已并入，剩余供定向补漏）`);
