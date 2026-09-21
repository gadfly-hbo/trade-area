/**
 * 解析 flow-center 商圈研究 md 报告 → DistrictDetail（与 xlsx 同构，不含 percentile/score/shard）。
 * 报告正文除主表外还有校验结论/字数修正等辅助表格（首列也含维度名），
 * 主表识别：连续管道行分块中，首行为「对比维度 | 研究对象描述」表头的块。
 */
import * as fs from 'node:fs';
import type { DimensionKey } from '../src/types';
import { matchDimensionKey, buildDistrictFromRows } from './parse-xlsx';
import type { ParseResult } from './parse-xlsx';

/** 按未转义管道切分单元格，并还原 \| 转义 */
function splitCells(line: string): string[] {
  return line
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

function isMainHeader(cells: string[]): boolean {
  return (
    (cells[1] ?? '').replace(/\s+/g, '').startsWith('对比维度') &&
    (cells[2] ?? '').replace(/\s+/g, '').startsWith('研究对象')
  );
}

/** 行值 = 首列之外的所有内容列以 | 连接（兼容描述内未转义管道） */
function rowValue(cells: string[]): string {
  return cells.slice(2, -1).join('|').trim();
}

function countDimensions(block: string[][]): number {
  const keys = new Set<DimensionKey>();
  for (const cells of block) {
    const key = matchDimensionKey(cells[1] ?? '');
    if (key) keys.add(key);
  }
  return keys.size;
}

/** 提取主表的「维度行名 → 原文」映射 */
export function extractMainTable(content: string): Partial<Record<DimensionKey, string>> {
  const blocks: string[][][] = [];
  let cur: string[][] = [];
  for (const line of content.split(/\r?\n/)) {
    if (line.trim().startsWith('|')) cur.push(splitCells(line));
    else if (cur.length) {
      blocks.push(cur);
      cur = [];
    }
  }
  if (cur.length) blocks.push(cur);

  // 标准表头块优先；个别报告表头与标题行粘连导致缺失，兜底取维度行最多的块
  const main =
    blocks.find((b) => b.length > 1 && isMainHeader(b[0]!)) ??
    blocks.slice().sort((a, b) => countDimensions(b) - countDimensions(a))[0] ?? [];

  const rawDimensions: Partial<Record<DimensionKey, string>> = {};
  for (const cells of main) {
    const key = matchDimensionKey(cells[1] ?? '');
    if (!key || rawDimensions[key] !== undefined) continue;
    const value = rowValue(cells);
    if (value) rawDimensions[key] = value;
  }
  return rawDimensions;
}

export function parseMarkdown(content: string, filename: string): ParseResult {
  return buildDistrictFromRows(extractMainTable(content), filename);
}

export function parseMarkdownFile(path: string, filename: string): ParseResult {
  return parseMarkdown(fs.readFileSync(path, 'utf8'), filename);
}
