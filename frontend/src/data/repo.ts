/**
 * 資料存取。畫面只透過這裡碰資料，不直接開 IndexedDB。
 *
 * 刪除一律寫墓碑（`deletedAt`），不真的移除紀錄，否則離線時的刪除無法同步出去。
 * 所有讀取函式都會自動濾掉墓碑。
 */
import { getDb } from './db';
import type {
  AmountKind,
  CashEvent,
  Category,
  Expense,
  PaymentMethod,
  Trip,
  TripStatus,
} from '../domain/types';

export function newId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

/** 本地日期 YYYY-MM-DD。不能用 toISOString()，那是 UTC，會在台灣早上八點前算成前一天。 */
export function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const alive = <T extends { deletedAt: string | null }>(rows: T[]): T[] =>
  rows.filter((r) => r.deletedAt === null);

// ─── 存檔 ───────────────────────────────────────────────────────────

export interface NewTripInput {
  name: string;
  currency: string;
  startedOn: string;
}

export async function createTrip(input: NewTripInput): Promise<Trip> {
  const ts = now();
  const trip: Trip = {
    id: newId(),
    name: input.name,
    currency: input.currency,
    status: 'active',
    startedOn: input.startedOn,
    endedOn: null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    sealRate: null,
    sealRateAt: null,
    sealRateSource: null,
    ownerId: null, // 預留：多人共用，見 docs/規格.md〈預留但不做〉
  };
  const db = await getDb();
  await db.put('trips', trip);
  return trip;
}

export async function getTrip(id: string): Promise<Trip | undefined> {
  const db = await getDb();
  const trip = await db.get('trips', id);
  return trip && trip.deletedAt === null ? trip : undefined;
}

export async function listTrips(): Promise<Trip[]> {
  const db = await getDb();
  return alive(await db.getAll('trips'));
}

export async function updateTrip(
  id: string,
  patch: Partial<Omit<Trip, 'id' | 'createdAt'>>,
): Promise<Trip> {
  const db = await getDb();
  const current = await db.get('trips', id);
  if (!current) throw new Error(`存檔不存在：${id}`);
  const next: Trip = { ...current, ...patch, updatedAt: now() };
  await db.put('trips', next);
  return next;
}

/**
 * 結束旅程：封存成唯讀成績單。
 *
 * **結束日取「最後一筆花費的日期」，不是按下封存的日期。**
 * 按封存鍵的時間跟旅程何時結束沒有關係——補記帳、匯入舊資料、
 * 解除封存後再封存，都會讓這兩個日期差很遠。
 * 規則算在這裡而不是呼叫端，這樣就沒有傳錯的餘地。
 *
 * `rate` 是封存當下抓到的匯率，凍結在存檔上不再變動。
 * 傳 null 代表沒抓到（離線或服務掛掉），存檔照樣封存、標記匯率待補——
 * 不能因為沒網路就不准封存。
 *
 * **已經有匯率的存檔不會被覆蓋。** 解除封存不清匯率（見 `unsealTrip`），
 * 所以重新封存時沿用原本那個——那是這趟旅程當時的實際成本，
 * 用今天的匯率蓋掉會讓金額跟使用者的紀錄對不上。
 */
export async function sealTrip(
  id: string,
  rate: { rate: number; at: string; source: string } | null,
): Promise<Trip> {
  const trip = await getTrip(id);
  if (!trip) throw new Error(`存檔不存在：${id}`);

  const frozen = trip.sealRate !== null;
  return updateTrip(id, {
    status: 'archived',
    endedOn: await lastSpentOn(trip),
    ...(frozen
      ? {}
      : {
          sealRate: rate?.rate ?? null,
          sealRateAt: rate?.at ?? null,
          sealRateSource: rate?.source ?? null,
        }),
  });
}

/**
 * 這趟旅程的結束日＝最後一筆花費的日期。
 *
 * 沒有任何花費時退回今天；最後一筆早於出發日時（整趟只有行前預訂）
 * 退回出發日，免得結束日比出發日還早。
 */
async function lastSpentOn(trip: Trip): Promise<string> {
  const expenses = await listExpenses(trip.id);
  if (expenses.length === 0) return today();
  const last = expenses.reduce((max, e) => (e.spentOn > max ? e.spentOn : max), '');
  return last < trip.startedOn ? trip.startedOn : last;
}

/**
 * 解除封存，讓存檔重新可寫。刻意做成明確動作，不是隨手就能編輯。
 *
 * **凍結的匯率留著不清。** 那是這趟旅程當時的實際換匯成本，
 * 不會因為回頭補一筆帳就改變；清掉的話重新封存會抓到今天的匯率，
 * 整趟金額就跟使用者原本的紀錄對不上了。
 */
export async function unsealTrip(id: string): Promise<Trip> {
  return updateTrip(id, { status: 'active', endedOn: null });
}

/** 刪除存檔，連同底下的花費與現金事件一起寫墓碑。 */
export async function deleteTrip(id: string): Promise<void> {
  const db = await getDb();
  const ts = now();
  const tx = db.transaction(['trips', 'expenses', 'cashEvents'], 'readwrite');

  const trip = await tx.objectStore('trips').get(id);
  if (trip) await tx.objectStore('trips').put({ ...trip, deletedAt: ts, updatedAt: ts });

  for (const store of ['expenses', 'cashEvents'] as const) {
    const s = tx.objectStore(store);
    const rows = await s.index('byTrip').getAll(id);
    for (const row of rows) {
      if (row.deletedAt === null) await s.put({ ...row, deletedAt: ts, updatedAt: ts });
    }
  }
  await tx.done;
}

// ─── 花費 ───────────────────────────────────────────────────────────

export interface NewExpenseInput {
  tripId: string;
  spentOn: string;
  category: Category;
  title: string;
  paymentMethod: PaymentMethod;
  amountKind: AmountKind;
  amount: number;
  note?: string;
}

export async function addExpense(input: NewExpenseInput): Promise<Expense> {
  const ts = now();
  const expense: Expense = {
    id: newId(),
    tripId: input.tripId,
    spentOn: input.spentOn,
    category: input.category,
    title: input.title,
    paymentMethod: input.paymentMethod,
    amountKind: input.amountKind,
    amount: input.amount,
    note: input.note ?? '',
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    payerId: null, // 預留：多人分帳，見 docs/規格.md〈預留但不做〉
  };
  const db = await getDb();
  await db.put('expenses', expense);
  return expense;
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDb();
  const current = await db.get('expenses', id);
  if (!current || current.deletedAt !== null) return;
  const ts = now();
  await db.put('expenses', { ...current, deletedAt: ts, updatedAt: ts });
}

export async function listExpenses(tripId: string): Promise<Expense[]> {
  const db = await getDb();
  return alive(await db.getAllFromIndex('expenses', 'byTrip', tripId));
}

// ─── 現金事件 ───────────────────────────────────────────────────────

export async function listCashEvents(tripId: string): Promise<CashEvent[]> {
  const db = await getDb();
  return alive(await db.getAllFromIndex('cashEvents', 'byTrip', tripId));
}

// ─── 存檔列表用的摘要 ───────────────────────────────────────────────

export interface TripSummary {
  trip: Trip;
  /** 花費筆數。 */
  entryCount: number;
  /** 旅程天數（起始日到今天或封存日，含頭尾）。 */
  dayCount: number;
  status: TripStatus;
}

export async function listTripSummaries(): Promise<TripSummary[]> {
  const trips = await listTrips();
  const summaries = await Promise.all(
    trips.map(async (trip) => {
      const expenses = await listExpenses(trip.id);
      return {
        trip,
        entryCount: expenses.length,
        dayCount: spanInDays(trip.startedOn, trip.endedOn ?? today()),
        status: trip.status,
      };
    }),
  );
  // 進行中置頂，其次按起始日新到舊。
  return summaries.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return b.trip.startedOn.localeCompare(a.trip.startedOn);
  });
}

/** 含頭尾的天數。結束日早於起始日時回傳 1，不回傳負數。 */
export function spanInDays(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`);
  if (Number.isNaN(ms)) return 1;
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}
