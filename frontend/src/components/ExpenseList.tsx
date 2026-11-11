import { useState } from 'react';
import { cardFeeTwd, fmt, fmtTwd, groupByDay, isDomestic } from '../domain/money';
import { CARD_REGION_LABEL, type Expense, type Trip } from '../domain/types';
import s from './ExpenseList.module.css';

interface Props {
  trip: Trip;
  expenses: Expense[];
  /** 封存的存檔是唯讀的，不給刪。 */
  readOnly: boolean;
  /** 傳進來的是篩選過的子集合，空的時候要說「這個條件沒有」而不是「都沒有」。 */
  filtered?: boolean;
  onDelete: (id: string) => void;
  /** 點一筆明細要修改它。唯讀時不會被呼叫。 */
  onEdit: (id: string) => void;
}

const WEEKDAYS = '日一二三四五六';

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const w = Number.isNaN(d.getTime()) ? '' : `　週${WEEKDAYS[d.getDay()]}`;
  return date.replace(/-/g, '/') + w;
}

export function ExpenseList({ trip, expenses, readOnly, filtered, onDelete, onEdit }: Props) {
  if (expenses.length === 0) {
    return (
      <p className={s.empty}>
        {filtered
          ? '這個篩選條件底下沒有紀錄。'
          : readOnly
            ? '這趟旅程沒有任何紀錄。'
            : '還沒有紀錄。按上面的「記帳」開始。'}
      </p>
    );
  }

  const days = groupByDay(trip, expenses);
  const domestic = isDomestic(trip);

  return (
    <div className={s.list}>
      {days.map((day) => (
        <section key={day.date} className={s.day}>
          <header className={s.dayHead}>
            <span className="hudLabel">{dayLabel(day.date)}</span>
            <span className={s.dayTotals}>
              {day.twdConfirmed > 0 && <span>{fmtTwd(day.twdConfirmed)}</span>}
              {!domestic && day.foreignSpent > 0 && (
                <span className={s.amountForeign}>
                  {trip.currency} {fmt(day.foreignSpent)}
                </span>
              )}
            </span>
          </header>
          {day.expenses.map((e) => (
            <Row
              key={e.id}
              trip={trip}
              expense={e}
              readOnly={readOnly}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function Row({
  trip,
  expense,
  readOnly,
  onDelete,
  onEdit,
}: {
  trip: Trip;
  expense: Expense;
  readOnly: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const [armed, setArmed] = useState(false);
  // 整趟台幣的存檔不分幣別，一律當台幣顯示。
  const asTwd = expense.amountKind === 'twd' || isDomestic(trip);
  /* 手續費是加在商品金額之外的獨立一行，所以上面那個金額不動。
     null 代表這筆是海外刷卡、用外幣記、又還沒有匯率，算不出來。 */
  const fee = cardFeeTwd(trip, expense);

  const main = (
    <>
      <span className={s.rowMain}>
        <span className={s.title}>{expense.title || expense.category}</span>
        {/* 刷卡才標國內／海外：同樣是刷卡，收不收手續費全看這個，
            不顯示的話使用者只會看到有的有子行有的沒有，猜不出為什麼。 */}
        <span className={s.tags}>
          {expense.category} · {expense.paymentMethod}
          {expense.paymentMethod === '刷卡' && `（${CARD_REGION_LABEL[expense.cardRegion]}）`}
        </span>
      </span>
      <span className={`${s.amount} ${asTwd ? '' : s.amountForeign}`}>
        {asTwd ? fmtTwd(expense.amount) : `${trip.currency} ${fmt(expense.amount)}`}
      </span>
    </>
  );

  return (
    <div className={s.entry}>
      <div className={s.row}>
        {/* 可寫時整列（刪除鈕除外）是一顆按鈕，點了去修改。
            刪除鈕不能包在裡面——按鈕裡不能再放按鈕，而且兩個動作要分得開。 */}
        {readOnly ? (
          main
        ) : (
          <button
            type="button"
            className={s.rowBtn}
            onClick={() => onEdit(expense.id)}
            aria-label={`修改：${expense.title || expense.category}`}
          >
            {main}
          </button>
        )}
        {!readOnly && (
          <button
            type="button"
            className={`${s.del} ${armed ? s.delArmed : ''}`}
            onClick={() => (armed ? onDelete(expense.id) : setArmed(true))}
            onBlur={() => setArmed(false)}
            aria-label={armed ? '確認刪除這筆' : '刪除這筆'}
          >
            {armed ? '確認刪除' : '✕'}
          </button>
        )}
      </div>
      {fee !== 0 && (
        <div className={`${s.feeRow} ${readOnly ? '' : s.feeRowEditable}`}>
          <span>刷卡手續費 {trip.cardFeePct}%</span>
          <span className={s.feeValue}>
            {fee === null ? '待匯率' : `＋${fmtTwd(fee)}`}
          </span>
        </div>
      )}
    </div>
  );
}
