import { defineConfig } from 'vitest/config'

/**
 * 測試用的設定，刻意跟 vite.config.ts 分開：測試只驗算純計算邏輯
 * （src/domain/），不需要 React、PWA 那些外掛，也不會被打包進網站。
 * 測試檔放在 tests/，在 src/ 之外，所以 `npm run build` 完全碰不到它們。
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
