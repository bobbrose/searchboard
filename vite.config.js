import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // During local dev, run `vercel dev` instead for /api routes to work.
      // This proxy is a fallback placeholder if you use plain `vite`.
    }
  }
})
