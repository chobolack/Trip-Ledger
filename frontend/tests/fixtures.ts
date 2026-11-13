import type { Expense, Trip } from '../src/domain/types';

/** 一趟還沒封存的日本旅程。測試只覆寫跟該案例有關的欄位。 */
export function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    name: '測試旅程',
    currency: 'JPY',
    status: 'active',
    startedOn: '2026-03-18',
    endedOn: null,
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z',
    deletedAt: null,
    sealRate: null,
    sealRateAt: null,
    sealRateSource: null,
    cardFeePct: 1.5,
    ownerId: null,
    ...over,
  };
}

let seq = 0;

/** 一筆外幣現金的餐飲花費。同上，只覆寫要測的欄位。 */
export function expense(over: Partial<Expense> = {}): Expense {
  seq += 1;
  return {
    id: `e${seq}`,
    tripId: 't1',
    spentOn: '2026-03-18',
    category: '餐飲',
    title: '',
    paymentMethod: '現金',
    amountKind: 'foreign',
    cardRegion: 'overseas',
    amount: 1000,
    note: '',
    createdAt: `2026-03-18T00:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    updatedAt: '2026-03-18T00:00:00.000Z',
    deletedAt: null,
    payerId: null,
    ...over,
  };
}
