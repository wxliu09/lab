import { defineConfig } from '@playwright/test'

// PW_PORT：多人同時開發時各自用不同埠（預設 4173）
const port = Number(process.env.PW_PORT ?? 4173)
const outDir = port === 4173 ? '.e2e-dist' : `.e2e-dist-${port}`

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}/`,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `npx vite build --mode e2e --outDir ${outDir} && npx vite preview --outDir ${outDir} --port ${port} --strictPort`,
    port,
    reuseExistingServer: true,
    timeout: 180000,
  },
})
