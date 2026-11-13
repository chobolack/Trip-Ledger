/*
 * 惡搞版「野獸記帳」的收尾（2026-11-13 下架）。
 *
 * 那一版在這個資料夾註冊過自己的 service worker，把整個 App 快取在裝置上。
 * 光是把檔案刪掉沒有用——開過的裝置會一直從快取開出舊的那一版，永遠不更新。
 * 所以在同一個網址留這支：瀏覽器檢查更新時會抓到它，它一啟動就把自己註銷、
 * 清掉那一版的快取，再讓開著的頁面重新載入（然後被 index.html 帶回正常版）。
 *
 * 只清名稱裡帶著這個資料夾的快取。同一個網域下還有正常版的快取，不能碰。
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      await self.registration.unregister();
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.includes(scope)).map((k) => caches.delete(k)));
      const pages = await self.clients.matchAll({ type: 'window' });
      for (const page of pages) page.navigate(page.url);
    })(),
  );
});
