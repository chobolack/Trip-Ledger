import { useEffect, useState } from 'react';
import s from './GridPulses.module.css';

/** 背景格線的間距，要跟 base.css 裡 `#root::before` 的 40px 一致，電流才會壓在線上。 */
const GRID = 40;

/** 兩道電流之間隔多久（毫秒）。在這個範圍內隨機，所以是「偶爾」而不是規律地跑。 */
const GAP_MIN = 2500;
const GAP_MAX = 7000;

/** 每次同時放出幾道。在這個範圍內隨機（含頭尾）。 */
const BURST_MIN = 1;
const BURST_MAX = 3;

type Dir = 'right' | 'left' | 'down' | 'up';
const DIRS: Dir[] = ['right', 'left', 'down', 'up'];

interface Pulse {
  id: number;
  dir: Dir;
  /** 走哪一條線：離左緣或上緣幾 px，一定是 GRID 的倍數。 */
  offset: number;
  /** 走完全程的秒數。每道不同，看起來才不像同一段動畫在重播。 */
  seconds: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * 背景裝飾：偶爾有一道青色電流沿著格線走過去（使用者 2026-11-11 指定）。
 *
 * 純裝飾，所以：
 * - `aria-hidden`、不吃點擊，疊在格線上、內容底下。
 * - 系統設了「減少動態效果」就完全不出現。
 * - 只動 `transform`，不會讓版面重排；同時最多也就兩三道，手機上沒有負擔。
 *
 * 用 JS 排程而不是純 CSS 無限循環：純 CSS 只能讓固定幾條線照固定節奏重播，
 * 看幾次就會發現規律；這裡每次隨機挑線、挑方向、挑速度。
 */
export function GridPulses() {
  const [pulses, setPulses] = useState<Pulse[]>([]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let timer: number;
    let nextId = 0;

    const spawn = () => {
      // 分頁在背景時不生，免得切回來時一口氣冒出一堆。
      if (!document.hidden) {
        const count = BURST_MIN + Math.floor(Math.random() * (BURST_MAX - BURST_MIN + 1));
        // 同一批的每一道各自挑線、方向、速度，不是同一道複製三份。
        const batch: Pulse[] = Array.from({ length: count }, () => {
          const dir = DIRS[Math.floor(Math.random() * DIRS.length)];
          const horizontal = dir === 'right' || dir === 'left';
          const span = horizontal ? window.innerHeight : window.innerWidth;
          const offset = Math.floor(rand(0, span / GRID)) * GRID;
          return { id: nextId++, dir, offset, seconds: rand(1.6, 3.2) };
        });
        setPulses((list) => [...list, ...batch]);
      }
      timer = window.setTimeout(spawn, rand(GAP_MIN, GAP_MAX));
    };

    timer = window.setTimeout(spawn, rand(800, 2500));
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={s.layer} aria-hidden>
      {pulses.map((p) => (
        <span
          key={p.id}
          className={`${s.pulse} ${s[p.dir]}`}
          style={{
            [p.dir === 'right' || p.dir === 'left' ? 'top' : 'left']: p.offset,
            animationDuration: `${p.seconds}s`,
          }}
          // 走完就從 DOM 拿掉，不然開一整天會越積越多。
          onAnimationEnd={() => setPulses((list) => list.filter((x) => x.id !== p.id))}
        />
      ))}
    </div>
  );
}
