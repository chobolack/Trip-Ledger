import type { ReactNode } from 'react';
import { CategoryPie } from './CategoryPie';
import { PaymentBars } from './PaymentBars';
import { categoryBreakdown } from '../domain/money';
import type { Category, Expense, PaymentMethod, Trip } from '../domain/types';
import s from './StatsPanel.module.css';

interface Props {
  trip: Trip;
  expenses: Expense[];
  /** 點圓餅切片選的分類，用來篩選下方明細。 */
  selected: Category | null;
  onSelect: (category: Category | null) => void;
  /** 點長條選的付款方式。跟分類各自獨立，兩個都選就是交集。 */
  selectedPayment: PaymentMethod | null;
  onSelectPayment: (method: PaymentMethod | null) => void;
}

/**
 * 統計圖表。圓餅（依種類）與橫條（依付款方式）同屬一塊。
 *
 * 「算不算得出來」在這裡判斷一次就好——兩張圖都要把外幣換成台幣，
 * 條件完全相同，分開判斷只會讓使用者看到兩段一樣的提示。
 */
export function StatsPanel({
  trip,
  expenses,
  selected,
  onSelect,
  selectedPayment,
  onSelectPayment,
}: Props) {
  const slices = categoryBreakdown(trip, expenses);

  const shell = (children: ReactNode) => (
    <div className={s.card}>
      <span className={`hudLabel ${s.cardTitle}`}>統計圖表 · Statistics</span>
      {children}
    </div>
  );

  // 有外幣花費但沒有凍結匯率，就沒有共同單位可以比。
  if (slices === null) {
    return shell(
      <p className={s.note}>匯率待補——抓到匯率把現金換算成台幣之後，才算得出各項占比。</p>,
    );
  }

  if (slices.length === 0) {
    return shell(<p className={s.note}>這趟旅程沒有任何花費紀錄。</p>);
  }

  return shell(
    <>
      <section className={s.section}>
        <div className={s.sectionLabel}>
          <span className="hudLabel">依種類 · By Category</span>
        </div>
        <CategoryPie trip={trip} expenses={expenses} selected={selected} onSelect={onSelect} />
      </section>

      <section className={s.section}>
        <div className={s.sectionLabel}>
          <span className="hudLabel">依付款方式 · By Payment</span>
        </div>
        <PaymentBars
          trip={trip}
          expenses={expenses}
          selected={selectedPayment}
          onSelect={onSelectPayment}
        />
      </section>
    </>,
  );
}
