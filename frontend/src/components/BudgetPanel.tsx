import { CountUp } from './CountUp';
import { budgetStatus, fmtTwd } from '../domain/money';
import type { Expense, Trip } from '../domain/types';
import s from './BudgetPanel.module.css';

interface Props {
  trip: Trip;
  expenses: Expense[];
}

/**
 * 預算（使用者 2026-11-13 指定）。**有設預算才出現**——沒設的存檔畫面跟以前一樣。
 *
 * 不是獨立的面板，是花費總計（TotalsPanel）最底下的一區
 * （使用者 2026-11-13 指定跟花費總計放同一格）。
 *
 * 旅途中還沒有真實匯率，外幣花費先用建檔時抓的估算匯率換成台幣，
 * 所以數字前面有「約」。封存後改用封存匯率，「約」字拿掉——那時數字會小跳一下，
 * 這是預期中的事，不是算錯。已花費含刷卡手續費。
 *
 * 原本底下有一行說明（含手續費、用哪天的匯率估算），使用者 2026-11-13 指定拿掉。
 *
 * 只顯示，不擋記帳：超支就是把數字變紅，記帳的人只是在記事實。
 */
export function BudgetPanel({ trip, expenses }: Props) {
  const b = budgetStatus(trip, expenses);
  if (!b) return null;

  const { budgetTwd, spentTwd, remainingTwd, estimated } = b;
  const over = remainingTwd !== null && remainingTwd < 0;
  /**
   * 血條（使用者 2026-11-14 指定）：條的長度是**剩下的預算**，花錢就是扣血，
   * 不是原本那種「花了多少就長多少」的進度條。顏色看剩餘比例：
   *
   *   剩超過 50%　綠
   *   剩 30～50%　橘
   *   剩 0～30%　 紅
   *   超出預算　　整條深紅（條畫滿，不是空的——空條看起來像還沒開始）
   */
  const left = remainingTwd === null ? 0 : Math.min(1, Math.max(0, remainingTwd / budgetTwd));
  const ratio = over ? 1 : left;
  const level = over ? s.fillOver : left > 0.5 ? s.fillGood : left >= 0.3 ? s.fillLow : s.fillCritical;
  const approx = estimated ? '約 ' : '';

  return (
    <div className={s.block}>
      {spentTwd === null || remainingTwd === null ? (
        <>
          <div className={s.row}>
            <span className="hudLabel">預算</span>
            <span className={s.value}>{fmtTwd(budgetTwd)}</span>
          </div>
          <p className={s.note}>
            還沒抓到估算匯率，{trip.currency} 的花費暫時換算不了台幣。連上網路後開啟這個存檔會自動補抓。
          </p>
        </>
      ) : (
        <>
          <div className={s.row}>
            {/* 標籤順序跟右邊的數字一致（花費在前、預算在後）。原本寫「預算 · 已花費」，
                使用者 2026-11-14 指出會讓人以為右邊是「預算／花費」。 */}
            <span className="hudLabel">已花費 ／ 預算</span>
            <span className={s.value}>
              <span className={over ? s.over : s.spent}>
                {approx}
                <CountUp value={spentTwd} format={fmtTwd} />
              </span>
              <span className={s.of}> ／ {fmtTwd(budgetTwd)}</span>
            </span>
          </div>

          <div
            className={s.bar}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(left * 100)}
            aria-label="預算剩餘比例"
          >
            <span
              className={`${s.fill} ${level}`}
              style={{ transform: `scaleX(${ratio})` }}
            />
          </div>

          <div className={s.row}>
            <span className="hudLabel">{over ? '超出預算' : '剩餘'}</span>
            <span className={`${s.remain} ${over ? s.over : ''}`}>
              {approx}
              <CountUp value={Math.abs(remainingTwd)} format={fmtTwd} />
            </span>
          </div>
        </>
      )}
    </div>
  );
}
