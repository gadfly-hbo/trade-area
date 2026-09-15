import { HashRouter, Navigate, Route, Routes, Outlet, NavLink, useLocation } from 'react-router-dom';
import { ThemeProvider, useTheme } from '@/theme';
import { BasketProvider } from '@/compare/BasketContext';
import CompareBasket from '@/components/CompareBasket';
import ListPage from '@/pages/ListPage';
import DetailPage from '@/pages/DetailPage';
import ComparePage from '@/pages/ComparePage';
import RankingPage from '@/pages/RankingPage';

const PAGE_TITLES: Array<{ match: (p: string) => boolean; title: string; nav: string }> = [
  { match: (p) => p.startsWith('/district'), title: '商圈详情', nav: '/' },
  { match: (p) => p.startsWith('/compare'), title: '商圈对比', nav: '/' },
  { match: (p) => p.startsWith('/ranking'), title: '选址排名', nav: '/ranking' },
  { match: () => true, title: '商圈列表', nav: '/' },
];

function Layout() {
  const location = useLocation();
  const { mode, toggle } = useTheme();
  const current = PAGE_TITLES.find((p) => p.match(location.pathname))!;

  return (
    <div>
      <aside className="app-sidebar" aria-label="主导航">
        <div className="brand">
          <div className="mark">商</div>
          <div>
            <strong>商圈对比分析</strong>
            <small>APPAREL SITING VIEW</small>
          </div>
        </div>
        <nav className="app-nav">
          <NavLink to="/" className={({ isActive }) => (isActive && current.nav === '/' ? 'active' : isActive ? undefined : undefined)}>
            <span className="num">01</span>商圈列表
          </NavLink>
          <NavLink to="/ranking" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <span className="num">02</span>选址排名
          </NavLink>
        </nav>
        <div className="side-note">
          <strong>OFFLINE ANALYSIS SURFACE</strong>
          数据来自本地 xlsx 的 ETL 产物；对比与评分为只读分析，不改变源数据。
        </div>
      </aside>
      <main className="app-main">
        <header className="app-top">
          <div>
            <p className="eyebrow">TRADE AREA / 服饰门店选址</p>
            <h1>{current.title}</h1>
          </div>
          <button
            className="icon-btn"
            type="button"
            onClick={toggle}
            aria-label="切换亮暗主题"
            title={mode === 'dark' ? '切换到亮色' : '切换到暗色'}
          >
            ◐
          </button>
        </header>
        <Outlet />
      </main>
      <CompareBasket />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}
