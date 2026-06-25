import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 개발 시 /api 요청을 백오피스 API(:4000)로 프록시 → 동일 출처, CORS 불필요
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
