import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const backendHost = (globalThis as any).process?.env?.VITE_BACKEND_HOST || 'localhost:3000'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true,
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/api': {
        target: `http://${backendHost}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://${backendHost}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
