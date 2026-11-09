import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 會把站台掛在 /<repo 名稱>/ 底下，不是網域根目錄。
  // 這個值必須跟 repo 名稱一致，改名字的話這裡要一起改。
  base: '/Trip-Ledger/',
  plugins: [
    react(),
    VitePWA({
      // 部署新版後自動更新，不用使用者手動清快取。
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'TRIP LEDGER 旅費記帳',
        short_name: '旅費記帳',
        description: '旅費記帳。離線可用，資料存在這台裝置上。',
        lang: 'zh-Hant',
        // 用相對路徑，這樣換 repo 名稱時不會連這裡都要改。
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#05080d',
        theme_color: '#05080d',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // maskable 給 Android 裁形用，圖案已經收在安全區內。
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 全部預先快取，離線時整個 App 都開得起來——這是手機出國時的重點。
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  server: {
    // 開發時讓同一個 Wi-Fi 底下的手機連得進來。手機上沒有 localhost。
    host: true,
  },
})
