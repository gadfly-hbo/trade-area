/**
 * UI 冒烟测试：真实渲染整个 App（happy-dom），抓运行时崩溃导致的白屏。
 * fetch 用本地 public/data 产物兜底。
 */
// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import App from '@/App';

const DATA_DIR = path.resolve(process.cwd(), 'public/data');

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.includes('index.json')) {
      return new Response(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'), {
        status: 200,
      });
    }
    const m = u.match(/details\/(s\d+)\.json/);
    if (m) {
      return new Response(
        fs.readFileSync(path.join(DATA_DIR, 'details', `${m[1]}.json`), 'utf8'),
        { status: 200 },
      );
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
});

async function renderApp(): Promise<{ root: Root; el: HTMLElement }> {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(<App />);
  });
  return { root, el };
}

/** 轮询等待异步数据渲染完成 */
async function waitForText(el: HTMLElement, text: string, ms = 3000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    if (el.textContent?.includes(text)) return;
  }
  throw new Error(`等待文本「${text}」超时；当前内容：${el.textContent?.slice(0, 300)}`);
}

describe('UI 冒烟（JuanerAI 风格改版后）', () => {
  it('列表页完整渲染：侧边栏 + 指标卡 + 数据行', async () => {
    const { root, el } = await renderApp();
    await waitForText(el, '湖州爱山广场');
    expect(el.textContent).toContain('商圈列表');
    expect(el.textContent).toContain('商圈对比分析');
    expect(el.textContent).toContain('选址排名');
    expect(el.textContent).toContain('商圈总数');
    await act(async () => {
      root.unmount();
    });
  });

  it('页面挂载了 Prism 设计规范元素', async () => {
    const { root, el } = await renderApp();
    await waitForText(el, '湖州爱山广场');
    expect(el.querySelector('.app-sidebar')).toBeTruthy();
    expect(el.querySelector('.metrics-grid')).toBeTruthy();
    expect(el.querySelectorAll('.metric').length).toBeGreaterThanOrEqual(4);
    await act(async () => {
      root.unmount();
    });
  });
});
