import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { ThemeProvider, useTheme, antdThemeFor } from './theme';
import './index.css';

function ThemedRoot() {
  const { mode } = useTheme();
  return (
    <ConfigProvider locale={zhCN} theme={antdThemeFor(mode)}>
      <App />
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  </React.StrictMode>,
);
