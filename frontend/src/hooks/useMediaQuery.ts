import { useSyncExternalStore } from 'react';

/**
 * 訂閱一個 CSS media query，回傳它現在成不成立。
 *
 * **只在 CSS 做不到的時候用。** 字級、間距、顏色這類純外觀的差異一律走
 * CSS（這個專案偏好 `clamp()`，見 `TitleScreen` 的大標），不要拿這個 hook
 * 去做 CSS 本來就能做的事——那會把版面規則拆散在兩個地方。
 *
 * 真正需要它的情況是**元素要換父層**：CSS 搬不動節點，而用絕對定位硬模擬
 * 會在內容變長時破版。存檔抬頭的封存／刪除按鈕就是這種情形。
 *
 * 用 `useSyncExternalStore` 而不是 `useEffect` ＋ `useState`：matchMedia 是
 * React 之外的狀態，這個 API 就是為它設計的，首次渲染就拿得到正確答案，
 * 不會先用錯的版面畫一次再跳掉。
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/**
 * 手機寬度。涵蓋所有主流手機（最寬的 iPhone Pro Max 是 430px），
 * 桌機把視窗縮到這麼窄也算——那時的版面需求跟手機一樣。
 */
export const NARROW = '(max-width: 480px)';
