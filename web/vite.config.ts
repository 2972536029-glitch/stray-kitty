import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// 同机多份工作区并行开发时（如默认端口被占用），可用环境变量换代理目标：
//   GAME_API_TARGET=http://127.0.0.1:8019 npx vite --port 5019
const apiTarget = process.env.GAME_API_TARGET || 'http://127.0.0.1:8017';
export default defineConfig({
  plugins: [react()],
  server: {proxy: {'/api': apiTarget, '/healthz': apiTarget}},
  build: {chunkSizeWarningLimit: 500}
});
