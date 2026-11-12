import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * 元素有沒有「捲進畫面過」。一旦進來過就一直是 true，不會再變回去。
 *
 * 給進場動畫用：圖表在頁面下方，一進頁面就播的話，使用者捲到的時候
 * 早就播完了（2026-11-12 實際發生——手機上圓餅與長條的動畫都看不到）。
 * 改成捲到才播，而且只播一次——來回捲動不會一直重播。
 *
 * `threshold` 是元素露出多少比例才算（0～1）。設太低的話才冒出一條邊就開始播，
 * 還是看不到；設太高的話，比螢幕還高的元素永遠達不到。
 */
export function useInView<T extends Element>(threshold = 0.35): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    // 很舊的瀏覽器沒有這個 API：當成已經看到，直接播，總比永遠不出現好。
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);

  return [ref, seen];
}
