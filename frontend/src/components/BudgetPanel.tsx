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
  // 進度條最多畫到滿格；超支靠顏色與文字講，不讓條衝出框。
  const ratio = spentTwd === null ? 0 : Math.min(1, Math.max(0, spentTwd / budgetTwd));
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
            aria-valuenow={Math.round((spentTwd / budgetTwd) * 100)}
            aria-label="預算使用比例"
          >
            <span
              className={`${s.fill} ${over ? s.fillOver : ''}`}
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
