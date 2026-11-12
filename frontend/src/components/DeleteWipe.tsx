import { useEffect, useRef } from 'react';
import { CountUp } from './CountUp';
import s from './DeleteWipe.module.css';

interface Props {
  /** 被刪掉的存檔名稱，演出時顯示在中間。 */
  name: string;
  /** 演出播完時呼叫。呼叫端在這裡離開頁面。 */
  onDone: () => void;
}

/** 一隻「蟲」咬掉的方塊邊長（CSS px）。越小越細碎，但格子數是平方成長。 */
const CELL = 8;
/** 染紅之後等多久才開始啃（毫秒）。 */
const EAT_DELAY = 350;
/** 從第一格被咬到最後一格被咬完（毫秒）。 */
const EAT_MS = 1500;
/** 每一格被吃掉前，先亮起來多久（毫秒）——那一瞬間就是蟲爬到這格上。 */
const GLOW_MS = 110;

/** 被吃掉之後露出來的顏色＝App 最深的底色。 */
const VOID = '#02050a';
/** 蟲本身的顏色：正在啃的那一格。像血的黑紅色（使用者 2026-11-12 指定再暗一點）。 */
const BUG = ['#3a0808', '#4a0b0b', '#5c0f0f'];

/**
 * 刪除存檔的演出（使用者 2026-11-12 指定）：畫面先染成深紅，
 * 然後像被一群奈米蟲由下而上啃掉——一格一格的像素先亮一下暗紅、再變成黑洞，
 * 前緣參差不齊，還有零星幾隻跑在前面。
 *
 * **資料在演出開始前就已經刪掉了**——這裡純粹是演出，中途關掉 App
 * 也不會留下刪到一半的存檔。底下看到的頁面只是還留在記憶體裡的畫面。
 *
 * 跟結算演出不同，這段不能跳過：它不到兩秒，而且蓋住整個畫面、
 * 擋掉所有點擊，免得使用者在演出中去按一個已經不存在的存檔上的按鈕。
 *
 * 用 canvas 畫而不是幾千個 DOM 元素：手機螢幕切成 8px 的格子也有四五千格，
 * 每格一個元素會直接卡住。canvas 上每一格只畫兩次（亮起、變黑），畫完就不再碰。
 */
export function DeleteWipe({ name, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /* onDone 每次渲染都是新的函式；放進 ref，動畫迴圈才不會因為它重跑。 */
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      doneRef.current();
      return;
    }

    const w = (canvas.width = window.innerWidth);
    const h = (canvas.height = window.innerHeight);
    const cols = Math.ceil(w / CELL);
    const rows = Math.ceil(h / CELL);

    /* 每一欄各自的快慢，而且相鄰的欄差不多——這樣前緣是起伏的波浪狀，
       像蟲群有的地方衝得快、有的地方落後，而不是一條水平線加雜訊。 */
    const colLead = new Float32Array(cols);
    let drift = 0;
    for (let c = 0; c < cols; c++) {
      drift = Math.max(-1, Math.min(1, drift + (Math.random() - 0.5) * 0.5));
      colLead[c] = drift;
    }

    /* 算出每一格「第幾毫秒被吃掉」，然後照時間排序。
       主要由高度決定（越下面越早），再加上所在欄的快慢與每格自己的隨機量。 */
    const cells: { x: number; y: number; at: number }[] = [];
    for (let r = 0; r < rows; r++) {
      const fromBottom = (rows - 1 - r) / Math.max(1, rows - 1);
      for (let c = 0; c < cols; c++) {
        let t = fromBottom * 0.72 + colLead[c] * 0.07 + Math.random() * 0.2;
        // 少數幾隻脫隊跑在前面，啃出零星的洞。
        if (Math.random() < 0.035) t -= Math.random() * 0.25;
        cells.push({ x: c * CELL, y: r * CELL, at: t });
      }
    }
    // 把時間攤平到 0～1，保證最後一格剛好在 EAT_MS 被吃掉。
    let min = Infinity;
    let max = -Infinity;
    for (const cell of cells) {
      if (cell.at < min) min = cell.at;
      if (cell.at > max) max = cell.at;
    }
    for (const cell of cells) cell.at = ((cell.at - min) / (max - min)) * EAT_MS;
    cells.sort((a, b) => a.at - b.at);

    /* 兩個游標走同一份排序好的陣列：glow 之前的都已經亮過，
       eaten 之前的都已經變黑。每一幀只處理新跨過門檻的那幾格。 */
    let glow = 0;
    let eaten = 0;
    let raf = 0;
    let start: number | null = null;

    const frame = (now: number) => {
      if (start === null) start = now + EAT_DELAY;
      const t = now - start;

      while (glow < cells.length && cells[glow].at - GLOW_MS <= t) {
        const cell = cells[glow++];
        ctx.fillStyle = BUG[(Math.random() * BUG.length) | 0];
        ctx.fillRect(cell.x, cell.y, CELL, CELL);
      }
      ctx.fillStyle = VOID;
      while (eaten < cells.length && cells[eaten].at <= t) {
        const cell = cells[eaten++];
        ctx.fillRect(cell.x, cell.y, CELL, CELL);
      }

      if (eaten < cells.length) raf = requestAnimationFrame(frame);
      // 全黑之後停一拍再走，不然最後一格剛消失畫面就切掉，看不到結尾。
      else window.setTimeout(() => doneRef.current(), 180);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={s.overlay} role="status" aria-label={`已刪除存檔 ${name}`}>
      {/* 第一層：把底下整個頁面染成深紅。 */}
      <div className={s.tint} />
      {/* 第二層：蟲群。 */}
      <canvas ref={canvasRef} className={s.canvas} />

      <div className={s.readout} aria-hidden>
        <span className={s.label}>Erasing Save Data</span>
        <span className={s.name}>{name}</span>
        <span className={s.pct}>
          <CountUp
            value={100}
            format={(n) => `${Math.round(n)}%`}
            duration={EAT_MS}
            delay={EAT_DELAY}
          />
        </span>
      </div>
    </div>
  );
}
