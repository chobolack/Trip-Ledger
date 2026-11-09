import { useState } from 'react';
import { fmt, fmtTwd, groupByDay, isDomestic } from '../domain/money';
import type { Expense, Trip } from '../domain/types';
import s from './ExpenseList.module.css';

interface Props {
  trip: Trip;
  expenses: Expense[];
  /** 封存的存檔是唯讀的，不給刪。 */
  readOnly: boolean;
  /** 傳進來的是篩選過的子集合，空的時候要說「這個分類沒有」而不是「都沒有」。 */
  filtered?: boolean;
  onDelete: (id: string) => void;
}

const WEEKDAYS = '日一二三四五六';

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const w = Number.isNaN(d.getTime()) ? '' : `　週${WEEKDAYS[d.getDay()]}`;
  return date.replace(/-/g, '/') + w;
}

export function ExpenseList({ trip, expenses, readOnly, filtered, onDelete }: Props) {
  if (expenses.length === 0) {
    return (
      <p className={s.empty}>
        {filtered
          ? '這個分類底下沒有紀錄了。'
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
            <Row key={e.id} trip={trip} expense={e} readOnly={readOnly} onDelete={onDelete} />
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
}: {
  trip: Trip;
  expense: Expense;
  readOnly: boolean;
  onDelete: (id: string) => void;
}) {
  const [armed, setArmed] = useState(false);
  // 整趟台幣的存檔不分幣別，一律當台幣顯示。
  const asTwd = expense.amountKind === 'twd' || isDomestic(trip);

  return (
    <div className={s.row}>
      <span className={s.rowMain}>
        <span className={s.title}>{expense.title || expense.category}</span>
        <span className={s.tags}>
          {expense.category} · {expense.paymentMethod}
        </span>
      </span>
      <span className={`${s.amount} ${asTwd ? '' : s.amountForeign}`}>
        {asTwd ? fmtTwd(expense.amount) : `${trip.currency} ${fmt(expense.amount)}`}
      </span>
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
  );
}
