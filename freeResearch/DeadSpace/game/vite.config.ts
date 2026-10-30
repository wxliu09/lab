import { defineConfig, type Plugin } from 'vite'

// @fontsource 的 CSS 同時列出 woff2 與 woff；只保留 woff2（所有現代瀏覽器都支援），build 體積減半
function woff2Only(): Plugin {
  return {
    name: 'woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/@fontsource[\\/].*\.css$/.test(id)) return null
      return code.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, '')
    },
  }
}

// build 輸出到 ../play/（GitHub Pages 直接提供），base 用相對路徑
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [woff2Only()],
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
    __DEV__: JSON.stringify(mode === 'development'),
    __TEST_HOOKS__: JSON.stringify(mode !== 'production'),
  },
}))
