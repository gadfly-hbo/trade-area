/**
 * 设计令牌：JuanerAI Prism 棱镜规范（浅色 SaaS 工作台）。
 * 规范文件：~/.zcode/design/DESIGN.md（version alpha）。
 * Prism 未定义暗色主题 → 本项目固定浅色。
 */
import { theme as antdThemeApi } from 'antd';

export const palette = {
  bg: '#f5f7fa',
  surface: '#ffffff',
  surface2: '#f9fafb',
  surface3: '#eef2f6',
  text: '#17202a',
  muted: '#5d6b7d',
  soft: '#8a96a6',
  border: '#dce3ea',
  borderStrong: '#c2ccd8',
  primary: '#155e75',
  primarySoft: '#e2eff3',
  primaryInk: '#0c3b4a',
  primaryHover: '#104c60',
  teal: '#0f766e',
  tealSoft: '#dff3f0',
  green: '#156f43',
  greenSoft: '#e5f6ed',
  amber: '#8f6100',
  amberSoft: '#fff3cf',
  red: '#ba3030',
  redSoft: '#ffe6e6',
  violet: '#6d4fc2',
  violetSoft: '#efebfb',
} as const;

export type Palette = typeof palette;

/** 多系列图表取色：Prism 语义色（墨青/青绿/紫罗兰/琥珀） */
export const CHART_SERIES = [palette.primary, palette.teal, palette.violet, palette.amber];

/** ECharts 公共基础片段（Prism 浅色） */
export function chartBase(p: Palette = palette) {
  return {
    legend: { bottom: 0, textStyle: { color: p.muted }, itemWidth: 14, itemHeight: 8 },
    tooltip: {
      backgroundColor: p.surface,
      borderColor: p.border,
      textStyle: { color: p.text, fontSize: 12 },
    },
    axisLabel: { color: p.muted },
    axisLine: { lineStyle: { color: p.borderStrong } },
    splitLine: { lineStyle: { color: p.border } },
  };
}

/** AntD 主题（Prism 令牌对齐） */
export const antdTheme = {
  algorithm: antdThemeApi.defaultAlgorithm,
  token: {
    colorPrimary: palette.primary,
    colorPrimaryHover: palette.primaryHover,
    colorInfo: palette.teal,
    colorSuccess: palette.green,
    colorWarning: palette.amber,
    colorError: palette.red,
    colorBgLayout: palette.bg,
    colorBgContainer: palette.surface,
    colorBgElevated: palette.surface,
    colorBorder: palette.border,
    colorBorderSecondary: palette.surface3,
    colorText: palette.text,
    colorTextSecondary: palette.muted,
    colorTextTertiary: palette.soft,
    borderRadius: 6,
    fontFamily:
      'Inter, PingFang SC, Hiragino Sans GB, Microsoft YaHei, ui-sans-serif, system-ui, sans-serif',
    fontSize: 14,
  },
  components: {
    Table: {
      headerBg: palette.surface2,
      headerColor: palette.muted,
      rowHoverBg: palette.surface2,
      borderColor: palette.border,
    },
    Collapse: {
      headerBg: 'transparent',
      contentBg: 'transparent',
    },
  },
};
