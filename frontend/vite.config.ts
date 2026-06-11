import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = (globalThis as any).process ?? {}
  const procEnv: Record<string, string> = proc.env ?? {}
  const cwd: string = proc.cwd?.() ?? '.'
  const fileEnv = loadEnv(mode, cwd, '')
  const merged = { ...fileEnv, ...procEnv }
  const backendHost = merged.VITE_BACKEND_HOST || 'localhost:3000'
  const extraHost: string | undefined = merged.VITE_ALLOWED_HOST

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      host: true,
      allowedHosts: extraHost ? [extraHost] : [],
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
  }
})
