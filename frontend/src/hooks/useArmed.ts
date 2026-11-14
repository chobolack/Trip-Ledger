import { useEffect, useRef, useState } from 'react';

/**
 * 「按兩次才執行」的按鈕共用的狀態：第一下上膛（armed），第二下才真的做。
 *
 * 上膛之後**按畫面上任何其他地方都會取消**（使用者 2026-11-14 指定），按 Esc 也會。
 *
 * 以前是靠按鈕的 onBlur 取消，那在手機上不可靠：iOS 的 Safari 點按鈕不會讓它
 * 取得焦點，點空白處也就不會觸發 blur，結果按鈕一直停在「再按一次確認」。
 * 所以改成上膛期間直接聽整份文件的 pointerdown。onBlur 仍然留著，
 * 給鍵盤操作（Tab 離開）用。
 *
 * 用法：把 `ref` 掛在那顆按鈕上，點它自己不算「其他地方」。
 */
export function useArmed<T extends HTMLElement = HTMLButtonElement>() {
  const [armed, setArmed] = useState(false);
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!armed) return;

    function onPointerDown(e: PointerEvent) {
      const el = ref.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      setArmed(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setArmed(false);
    }

    /* capture：就算被點的東西自己擋掉事件冒泡，這裡也收得到。 */
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [armed]);

  return { armed, setArmed, ref };
}
