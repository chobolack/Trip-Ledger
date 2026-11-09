import { useState } from 'react';
import { categoryBreakdown, fmtTwd, type CategorySlice } from '../domain/money';
import type { Category, Expense, Trip } from '../domain/types';
import s from './CategoryPie.module.css';

/**
 * 配色**依金額排名**：最大的一片用第一個顏色，依序往下。
 * 使用者 2026-11-09 指定照他提供的參考圖配色，並明確要求
 *「依照比例 不根據種類」。
 *
 * 這代表同一個分類在不同存檔、或金額變動後會換顏色——
 * 顏色表示的是「第幾大」，不是「哪一類」。看圖要認分類請看圖例。
 */
const RANK_COLOR = [
  '#4285f4', // 1st · blue
  '#f4b400', // 2nd · amber
  '#0f9d58', // 3rd · green
  '#db4437', // 4th · red
  '#ab47bc', // 5th · purple
  '#00acc1', // 6th · cyan
];

const SIZE = 180;
const R = 84;
const C = SIZE / 2;

/** 極座標轉 SVG 座標。0 弧度指向 12 點鐘方向。 */
function point(angle: number): [number, number] {
  const a = angle - Math.PI / 2;
  return [C + R * Math.cos(a), C + R * Math.sin(a)];
}

function slicePath(from: number, to: number): string {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  const largeArc = to - from > Math.PI ? 1 : 0;
  return `M ${C} ${C} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

interface Props {
  trip: Trip;
  expenses: Expense[];
  /** 目前被點選、用來篩選下方明細的分類。null 代表不篩選。 */
  selected: Category | null;
  /** 點切片或圖例時回報。再點同一個會收到 null（取消篩選）。 */
  onSelect: (category: Category | null) => void;
}

export function CategoryPie({ trip, expenses, selected, onSelect }: Props) {
  /**
   * 滑過與點選是兩回事，不能共用一個 state：
   * 滑過只是暫時把其他片變暗，滑鼠離開就還原；
   * 點選要持續，因為下方明細跟著它篩選。
   */
  const [hovered, setHovered] = useState<Category | null>(null);
  const slices = categoryBreakdown(trip, expenses);

  // 卡片外框與「算不算得出來」的提示都由 StatsPanel 統一處理，
  // 這兩個分支只是防手滑單獨使用時爆掉。
  if (slices === null) return <p className={s.note}>匯率待補，算不出分類占比。</p>;
  if (slices.length === 0) return <p className={s.note}>沒有花費紀錄。</p>;

  const total = slices.reduce((sum, x) => sum + x.twd, 0);
  // 滑過的優先於點選的：滑鼠在哪就看哪一片，移開後回到被點選的那片。
  const focus = hovered ?? selected;
  const current = slices.find((x) => x.category === focus) ?? null;

  // 只有一兩類時圓餅沒有比較的意義，直接給數字（兩片的圓餅是反模式）。
  const showPie = slices.length > 2;

  // 累加角度。slices 已經由 categoryBreakdown 依金額由大到小排好，
  // 圓餅與圖例共用同一份陣列，順序與配色保證一致。
  let angle = 0;
  const arcs = slices.map((x, i) => {
    const from = angle;
    angle += x.share * Math.PI * 2;
    return { ...x, from, to: angle, color: RANK_COLOR[i % RANK_COLOR.length] };
  });

  return (
    <>
      <div className={s.readout}>
        {current ? (
          <>
            <span className={s.readoutName}>{current.category}</span>
            <span className={s.readoutValue}>{fmtTwd(current.twd)}</span>
            <span className={s.readoutPct}>{pct(current.share)}</span>
          </>
        ) : (
          <>
            <span className={s.readoutValue}>{fmtTwd(total)}</span>
            <span className={s.readoutHint}>
              共 {slices.length} 類{showPie ? '，點切片可篩選下方明細' : ''}
            </span>
          </>
        )}
      </div>

      <div className={s.wrap}>
        {showPie && (
          <svg
            className={s.chart}
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label={`分類占比圓餅圖，總計 ${fmtTwd(total)}。${slices
              .map((x) => `${x.category} ${pct(x.share)}`)
              .join('，')}`}
          >
            {arcs.map((a) => (
              <path
                key={a.category}
                d={slicePath(a.from, a.to)}
                fill={a.color}
                className={[
                  s.slice,
                  focus !== null && focus !== a.category ? s.sliceDim : '',
                  selected === a.category ? s.sliceSelected : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                /* 只有滑鼠才進 hover 狀態。觸控點下去也會觸發 pointerenter，
                   但不會觸發 pointerleave，於是取消選取後其他片還黏在變暗狀態。 */
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setHovered(a.category);
                }}
                onPointerLeave={() => setHovered(null)}
                onClick={() => onSelect(selected === a.category ? null : a.category)}
              />
            ))}
          </svg>
        )}

        <div className={s.legend}>
          {slices.map((x, i) => (
            <LegendRow
              key={x.category}
              slice={x}
              color={RANK_COLOR[i % RANK_COLOR.length]}
              on={focus === x.category}
              selected={selected === x.category}
              onEnter={() => setHovered(x.category)}
              onLeave={() => setHovered(null)}
              onToggle={() => onSelect(selected === x.category ? null : x.category)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function LegendRow({
  slice,
  color,
  on,
  selected,
  onEnter,
  onLeave,
  onToggle,
}: {
  slice: CategorySlice;
  color: string;
  on: boolean;
  selected: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={[s.row, on ? s.rowOn : '', selected ? s.rowSelected : ''].filter(Boolean).join(' ')}
      /* 同切片：觸控不進 hover 狀態，否則點完會黏著。 */
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') onEnter();
      }}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onToggle}
      aria-pressed={selected}
    >
      <span className={s.swatch} style={{ background: color }} />
      <span className={s.name}>{slice.category}</span>
      <span className={s.val}>{fmtTwd(slice.twd)}</span>
      <span className={s.pct}>{pct(slice.share)}</span>
    </button>
  );
}

/** 百分比。小於 1% 的也不顯示成 0%，免得看起來像沒花錢。 */
function pct(share: number): string {
  const v = share * 100;
  if (v > 0 && v < 1) return '<1%';
  return `${Math.round(v)}%`;
}
