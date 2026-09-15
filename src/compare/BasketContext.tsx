/** 对比篮：全局状态，最多选 4 个商圈，localStorage 持久化 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export const MAX_COMPARE = 4;
const STORAGE_KEY = 'trade-area-compare-basket';

export interface BasketItem {
  id: string;
  name: string;
}

interface BasketContextValue {
  items: BasketItem[];
  isSelected: (id: string) => boolean;
  isFull: boolean;
  toggle: (item: BasketItem) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const BasketContext = createContext<BasketContextValue | null>(null);

function readStorage(): BasketItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as BasketItem[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_COMPARE) : [];
  } catch {
    return [];
  }
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BasketItem[]>(readStorage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* 隐私模式等场景忽略 */
    }
  }, [items]);

  const toggle = useCallback((item: BasketItem) => {
    setItems((prev) => {
      if (prev.some((x) => x.id === item.id)) return prev.filter((x) => x.id !== item.id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, item];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<BasketContextValue>(
    () => ({
      items,
      isSelected: (id: string) => items.some((x) => x.id === id),
      isFull: items.length >= MAX_COMPARE,
      toggle,
      remove,
      clear,
    }),
    [items, toggle, remove, clear],
  );

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket(): BasketContextValue {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error('useBasket 必须在 BasketProvider 内使用');
  return ctx;
}
