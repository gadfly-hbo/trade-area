/** 设计令牌与主题系统：提取自 JuanerAI 开发状态控制台（index.html）的设计规范 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { theme as antdTheme } from 'antd';

export type ThemeMode = 'dark' | 'light';

export interface Palette {
  bg: string;
  surface: string;
  raised: string;
  line: string;
  soft: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  good: string;
  warn: string;
  bad: string;
}

/** 黑白灰中性色板（版式沿用 JuanerAI 控制台规范；珊瑚橙仅作强调/语义色） */
const DARK: Palette = {
  bg: '#0a0b0d',
  surface: '#101216',
  raised: '#171a1f',
  line: '#262b33',
  soft: 'rgba(160,170,185,.10)',
  text: '#f0f2f5',
  muted: '#9aa2ad',
  faint: '#666e79',
  accent: '#f0745c',
  good: '#51c694',
  warn: '#e9b85c',
  bad: '#ef765f',
};

const LIGHT: Palette = {
  bg: '#f3f4f6',
  surface: '#fbfcfd',
  raised: '#eef0f3',
  line: '#d4d9e0',
  soft: 'rgba(20,28,45,.06)',
  text: '#171a1f',
  muted: '#4f5763',
  faint: '#78808c',
  accent: '#d4573e',
  good: '#2f9e6f',
  warn: '#a97a1c',
  bad: '#c74431',
};

export const palettes: Record<ThemeMode, Palette> = { dark: DARK, light: LIGHT };

/** 多系列图表取色（对比页最多 4 个商圈，黑白灰基调 + 珊瑚橙主导） */
export const CHART_SERIES = ['#f0745c', '#8f9dff', '#e9b85c', '#a8b3c4'];

export const THEME_STORAGE_KEY = 'trade-area.theme';

/** ECharts 公共暗色/亮色基础片段 */
export function chartBase(p: Palette) {
  return {
    legend: { bottom: 0, textStyle: { color: p.muted }, itemWidth: 14, itemHeight: 8 },
    tooltip: {
      backgroundColor: p.raised,
      borderColor: p.line,
      textStyle: { color: p.text, fontSize: 12 },
    },
    axisLabel: { color: p.muted },
    axisLine: { lineStyle: { color: p.line } },
    splitLine: { lineStyle: { color: p.line, opacity: 0.45 } },
  };
}

/** AntD 主题（对齐设计规范的色板/圆角/字体） */
export function antdThemeFor(mode: ThemeMode) {
  const p = palettes[mode];
  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: p.accent,
      colorInfo: p.accent,
      colorSuccess: p.good,
      colorWarning: p.warn,
      colorError: p.bad,
      colorBgBase: p.bg,
      colorBgContainer: p.surface,
      colorBgElevated: p.raised,
      colorBorder: p.line,
      colorBorderSecondary: p.line,
      colorText: p.text,
      colorTextSecondary: p.muted,
      colorTextTertiary: p.faint,
      borderRadius: 10,
      fontFamily: '"Avenir Next","PingFang SC","Microsoft YaHei",sans-serif',
      fontSize: 13,
    },
    components: {
      Table: {
        headerBg: 'transparent',
        headerColor: p.faint,
        rowHoverBg: p.soft,
        borderColor: p.line,
      },
      Collapse: {
        headerBg: 'transparent',
        contentBg: 'transparent',
      },
    },
  };
}

interface ThemeContextValue {
  mode: ThemeMode;
  palette: Palette;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* 忽略 */
  }
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      /* 忽略 */
    }
  }, [mode]);

  const toggle = useCallback(
    () => setMode((m) => (m === 'dark' ? 'light' : 'dark')),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, palette: palettes[mode], toggle }),
    [mode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return ctx;
}
