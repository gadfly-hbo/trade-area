/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // 相对路径，产物可部署到任意子目录（数据为 fetch 按需加载）
  base: './',
  // 对外监听：工作区经 Remote-SSH 访问，用户浏览器需用远程主机 IP 打开开发服务器
  server: { host: true },
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
