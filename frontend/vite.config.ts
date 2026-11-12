import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 會把站台掛在 /<repo 名稱>/ 底下，不是網域根目錄。
// 這個值必須跟 repo 名稱一致，改名字的話這裡要一起改。
const BASE = '/Trip-Ledger/'

/**
 * 惡搞版「野獸記帳」（使用者 2026-11-12 指定）。
 *
 * 同一份程式碼用 `--mode inmuking` 再打包一次，放在正常版底下的子資料夾，
 * 所以它有自己的網址、自己的 manifest（加到桌面後還是惡搞版）、自己的
 * service worker。畫面上的字怎麼換見 src/variant/copy.ts。
 *
 * 兩版在同一個網域下，所以**同一台裝置上兩版共用同一份 IndexedDB**。
 */
const VARIANT = {
  mode: 'inmuking',
  dir: 'inmuking',
  title: '野獸記帳',
}

/** 把 index.html 裡寫死的站名換掉。分頁標題與搜尋摘要不經過 React，t() 管不到。 */
function renameHtml(title: string): Plugin {
  return {
    name: 'variant-rename-html',
    transformIndexHtml: (html) =>
      html
        .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
        .replace(
          /<meta name="description" content="[^"]*" \/>/,
          `<meta name="description" content="${title}" />`,
        ),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const variant = mode === VARIANT.mode

  return {
    base: variant ? `${BASE}${VARIANT.dir}/` : BASE,
    build: {
      // 惡搞版蓋在正常版的產物裡面，所以一定要**先打包正常版**——
      // 正常版打包時會清空整個 dist，順序反了惡搞版就被清掉。
      outDir: variant ? `dist/${VARIANT.dir}` : 'dist',
    },
    plugins: [
      react(),
      ...(variant ? [renameHtml(VARIANT.title)] : []),
      VitePWA({
        // 部署新版後自動更新，不用使用者手動清快取。
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png', 'icon.svg'],
        manifest: {
          name: variant ? VARIANT.title : 'TRIP LEDGER 旅費記帳',
          short_name: variant ? VARIANT.title : '旅費記帳',
          description: variant
            ? `${VARIANT.title}。離線可用，資料存在這台裝置上。`
            : '旅費記帳。離線可用，資料存在這台裝置上。',
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
          /* 正常版的 service worker 管的範圍是 /Trip-Ledger/ 底下全部，
             惡搞版的網址也在裡面。裝過正常版的裝置第一次開惡搞版時，
             惡搞版自己的 service worker 還沒裝好，這次導覽會落到正常版手上，
             而它對任何導覽都回自己快取的首頁——結果開到的是正常版。
             所以明講：那個資料夾底下的導覽不歸正常版管，放它去走網路。 */
          ...(variant
            ? {}
            : { navigateFallbackDenylist: [new RegExp(`^${BASE}${VARIANT.dir}/`)] }),
        },
      }),
    ],
    server: {
      // 開發時讓同一個 Wi-Fi 底下的手機連得進來。手機上沒有 localhost。
      host: true,
    },
  }
})
