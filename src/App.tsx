import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, Outlet, NavLink, useLocation } from 'react-router-dom';
import { loadIndex } from '@/data/loader';
import { BasketProvider } from '@/compare/BasketContext';
import CompareBasket from '@/components/CompareBasket';
import ListPage from '@/pages/ListPage';
import DetailPage from '@/pages/DetailPage';
import ComparePage from '@/pages/ComparePage';
import RankingPage from '@/pages/RankingPage';

const PAGES: Array<{
  match: (p: string) => boolean;
  title: string;
  desc: string;
  nav: string;
}> = [
  { match: (p) => p.startsWith('/district'), title: '商圈详情', desc: '查看单个商圈的 12 维度明细、关键指标与数据来源。', nav: '/' },
  { match: (p) => p.startsWith('/compare'), title: '商圈对比', desc: '并排查看所选商圈的指标差异与 12 维度对照。', nav: '/' },
  { match: (p) => p.startsWith('/ranking'), title: '选址排名', desc: '按可调权重计算全量商圈的服饰选址评分排名。', nav: '/ranking' },
  { match: () => true, title: '商圈列表', desc: '浏览全部商圈的关键指标，勾选 2-4 个加入对比篮。', nav: '/' },
];

function Layout() {
  const location = useLocation();
  const current = PAGES.find((p) => p.match(location.pathname))!;
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    loadIndex()
      .then((idx) => setTotal(idx.total))
      .catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="主导航">
        <div className="brand">
          <div className="mark">商</div>
          <div>
            <strong>商圈对比分析</strong>
            <small>服饰选址工作台</small>
          </div>
        </div>
        <div className="nav-group">
          <div className="nav-group-label">工作台</div>
          <nav className="app-nav">
            <NavLink
              to="/"
              className={({ isActive }) =>
                isActive || current.nav === '/' && location.pathname !== '/' ? 'active' : undefined
              }
            >
              <span className="num">01</span>商圈列表
              {total !== null && <span className="nav-count">{total}</span>}
            </NavLink>
            <NavLink to="/ranking" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <span className="num">02</span>选址排名
            </NavLink>
          </nav>
        </div>
        <div className="side-note">
          <strong>只读分析视图</strong>
          对比与评分仅用于选址参考，不改变源数据。
        </div>
      </aside>
      <main className="app-main">
        <header className="app-top">
          <h1>{current.title}</h1>
          <p className="page-desc">{current.desc}</p>
        </header>
        <Outlet />
        <footer className="page-footer">
          数据来源为本地 ETL 产物；缺失指标一律显示「—」，不做推断。评分权重可在排名页调整。
        </footer>
      </main>
      <CompareBasket />
    </div>
  );
}

export default function App() {
  return (
    <BasketProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<ListPage />} />
            <Route path="/district/:id" element={<DetailPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/ranking" element={<RankingPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </BasketProvider>
  );
}
