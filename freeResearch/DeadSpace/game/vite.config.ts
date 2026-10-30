import { defineConfig } from 'vite'

// build 輸出到 ../play/（GitHub Pages 直接提供），base 用相對路徑
export default defineConfig({
  base: './',
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  worker: { format: 'es' },
  build: {
    outDir: '../play',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
  server: { port: 5173, strictPort: false },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
})
