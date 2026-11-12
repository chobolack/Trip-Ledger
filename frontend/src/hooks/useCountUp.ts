import { useEffect, useRef, useState } from 'react';

/** 系統有沒有開「減少動態效果」。所有演出類的動畫都要先問這個。 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Options {
  /** 滾完全程的毫秒數。 */
  duration?: number;
  /** 等多久才開始滾（毫秒）。結算演出裡各行要錯開進場時用。 */
  delay?: number;
}

/**
 * 數字滾動：回傳一個會從舊值滾到 `target` 的數字（使用者 2026-11-12 指定）。
 *
 * - 第一次出現時從 0 滾上來；之後 `target` 變了（例如補記一筆）就從
 *   **目前顯示的值**滾到新值，不會先跳回 0。
 * - 先快後慢（ease-out）：最後幾位數慢下來，像遊戲結算時分數停住的手感。
 * - 純演出，不影響任何計算——呼叫端傳進來的 `target` 才是真正的數字，
 *   這裡回傳的只拿去顯示。
 * - 系統開了「減少動態效果」就直接回傳 `target`，不滾。
 */
export function useCountUp(target: number, { duration = 650, delay = 0 }: Options = {}): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? target : 0));
  /* 目前顯示到哪。用 ref 而不是讀 state：effect 裡要拿「此刻」的值當起點，
     但不該因為它每一格都在變而重跑 effect。 */
  const current = useRef(shown);

  useEffect(() => {
    if (prefersReducedMotion()) {
      current.current = target;
      setShown(target);
      return;
    }
    const from = current.current;
    if (from === target) return;

    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t + delay;
      const p = Math.min(1, Math.max(0, (t - start) / duration));
      const eased = 1 - (1 - p) ** 3;
      const v = p === 1 ? target : from + (target - from) * eased;
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);

  return shown;
}
