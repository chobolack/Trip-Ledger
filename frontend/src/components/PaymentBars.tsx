import { fmtTwd, paymentBreakdown } from '../domain/money';
import type { Expense, Trip } from '../domain/types';
import s from './PaymentBars.module.css';

interface Props {
  trip: Trip;
  expenses: Expense[];
}

/**
 * 依付款方式的橫向長條圖。
 *
 * 跟圓餅圖一樣只在封存後有意義：台幣與外幣要能相加才比得出占比，
 * 而那需要封存當下凍結的匯率。
 *
 * 長條全部同色——付款方式之間沒有大小順序，用深淺上色只會把長度
 * 已經表達的資訊再編碼一次。
 */
export function PaymentBars({ trip, expenses }: Props) {
  const rows = paymentBreakdown(trip, expenses);

  // 卡片外框與「算不算得出來」的提示都由 StatsPanel 統一處理，
  // 這兩個分支只是防手滑單獨使用時爆掉。
  if (rows === null) return <p className={s.note}>匯率待補，算不出付款方式占比。</p>;
  if (rows.length === 0) return <p className={s.note}>沒有花費紀錄。</p>;

  return (
    <div className={s.rows}>
      {rows.map((r) => (
        <div key={r.method}>
          <div className={s.head}>
            <span className={s.name}>{r.method}</span>
            <span className={s.value}>
              {fmtTwd(r.twd)} <span className={s.pct}>（{pct(r.share)}）</span>
            </span>
          </div>
          <div className={s.track}>
            <div className={s.fill} style={{ width: `${(r.share * 100).toFixed(2)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 百分比。小於 1% 的也不顯示成 0%，免得看起來像沒花錢。 */
function pct(share: number): string {
  const v = share * 100;
  if (v > 0 && v < 1) return '<1%';
  return `${Math.round(v)}%`;
}
