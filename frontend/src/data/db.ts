/**
 * 本機 IndexedDB。
 *
 * 離線優先：這裡是真實來源，後端只是同步目標。所有讀寫都走這一層，
 * 畫面永遠不等網路。
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { modernizePaymentMethod, type CashEvent, type Expense, type Trip } from '../domain/types';

const DB_NAME = 'trip-ledger';

/**
 * 改結構就 +1，並在 `upgrade` 裡補上對應的遷移。
 *
 * 1 → 初版
 * 2 → Trip 加入封存匯率欄位（sealRate / sealRateAt / sealRateSource）
 * 3 → 付款方式「交通卡」拆成「西瓜卡」與「悠遊卡」
 */
const DB_VERSION = 3;

interface TripLedgerDB extends DBSchema {
  trips: {
    key: string;
    value: Trip;
    indexes: { byUpdatedAt: string };
  };
  expenses: {
    key: string;
    value: Expense;
    indexes: { byTrip: string; byUpdatedAt: string };
  };
  cashEvents: {
    key: string;
    value: CashEvent;
    indexes: { byTrip: string; byUpdatedAt: string };
  };
  /** 雜項狀態：同步游標、使用者上次選的分類等。 */
  meta: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<TripLedgerDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<TripLedgerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TripLedgerDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const trips = db.createObjectStore('trips', { keyPath: 'id' });
          trips.createIndex('byUpdatedAt', 'updatedAt');

          const expenses = db.createObjectStore('expenses', { keyPath: 'id' });
          expenses.createIndex('byTrip', 'tripId');
          expenses.createIndex('byUpdatedAt', 'updatedAt');

          const cashEvents = db.createObjectStore('cashEvents', { keyPath: 'id' });
          cashEvents.createIndex('byTrip', 'tripId');
          cashEvents.createIndex('byUpdatedAt', 'updatedAt');

          db.createObjectStore('meta');
        }

        if (oldVersion < 2) {
          // 既有存檔補上封存匯率欄位，否則讀出來是 undefined 而不是 null。
          const store = tx.objectStore('trips');
          for (const trip of await store.getAll()) {
            await store.put({
              ...trip,
              sealRate: trip.sealRate ?? null,
              sealRateAt: trip.sealRateAt ?? null,
              sealRateSource: trip.sealRateSource ?? null,
            });
          }
        }

        if (oldVersion < 3) {
          // 既有的「交通卡」換成西瓜卡或悠遊卡，否則它會變成非法值，
          // 統計會把那些紀錄默默併進「其他」。
          const store = tx.objectStore('expenses');
          for (const e of await store.getAll()) {
            const next = modernizePaymentMethod(e.paymentMethod, e.amountKind);
            if (next !== e.paymentMethod) {
              await store.put({ ...e, paymentMethod: next as typeof e.paymentMethod });
            }
          }
        }
      },

      /**
       * 另一個分頁要升級資料庫，而這個分頁還握著舊版連線。
       * 不放手的話升級會一直卡住，所以主動關掉——這個分頁的後續讀寫會失敗，
       * 但那本來就該重新載入才對。
       */
      blocking() {
        const held = dbPromise;
        dbPromise = null;
        void held?.then((db) => db.close());
      },
    });
  }
  return dbPromise;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get('meta', key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('meta', value, key);
}
