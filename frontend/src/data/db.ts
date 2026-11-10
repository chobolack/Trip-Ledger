/**
 * 本機 IndexedDB。
 *
 * 離線優先：這裡是真實來源，後端只是同步目標。所有讀寫都走這一層，
 * 畫面永遠不等網路。
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DEFAULT_CARD_FEE_PCT,
  DEFAULT_CARD_REGION,
  modernizePaymentMethod,
  type CashEvent,
  type Expense,
  type Trip,
} from '../domain/types';

const DB_NAME = 'trip-ledger';

/**
 * 改結構就 +1，並在 `upgrade` 裡補上對應的遷移。
 *
 * 1 → 初版
 * 2 → Trip 加入封存匯率欄位（sealRate / sealRateAt / sealRateSource）
 * 3 → 付款方式「交通卡」拆成「西瓜卡」與「悠遊卡」
 * 4 → 付款方式移除「其他」，既有紀錄換成「悠遊卡」
 * 5 → 刪除改成真的移除，清掉既有的墓碑紀錄
 * 6 → 付款方式「刷卡」拆成「國內刷卡」與「海外刷卡」；Trip 加入 cardFeePct
 * 7 → （已無動作，由 v9 取代）補正 v6 的刷卡轉換
 * 8 → 補正 v6：已封存存檔的 cardFeePct 從 0 改為預設值
 * 9 → 國內外改記在 Expense.cardRegion，付款方式收回成一個「刷卡」
 */
const DB_VERSION = 9;

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

        /* v3、v4、v6 都是把已淘汰的付款方式換成現行值，規則同一份
           （見 domain/types.ts 的 modernizePaymentMethod），所以合併成一段。
           不轉的話那些紀錄會變成非法值，在統計裡被當成未知值處理。
           v6 轉的是「刷卡」→ 國內刷卡／海外刷卡。 */
        if (oldVersion < 6) {
          const store = tx.objectStore('expenses');
          for (const e of await store.getAll()) {
            const next = modernizePaymentMethod(e.paymentMethod, e.amountKind);
            if (next !== e.paymentMethod) {
              await store.put({ ...e, paymentMethod: next as typeof e.paymentMethod });
            }
          }
        }

        /* 刪除從「寫墓碑」改成真的移除（使用者 2026-11-09 指定），
           所以既有的墓碑要一次清乾淨。不清的話它們會繼續擋住備份匯入——
           墓碑的 updatedAt 永遠比備份檔新，合併模式會把那些紀錄略過，
           而使用者只會看到「略過 N 筆」然後不知道為什麼東西進不來。
           這一步不可逆：墓碑裡還留著被刪紀錄的內容，清掉就真的沒了。 */
        if (oldVersion < 5) {
          const trips = tx.objectStore('trips');
          for (const t of await trips.getAll()) {
            if (t.deletedAt !== null) await trips.delete(t.id);
          }
          const expenses = tx.objectStore('expenses');
          for (const e of await expenses.getAll()) {
            if (e.deletedAt !== null) await expenses.delete(e.id);
          }
          const cashEvents = tx.objectStore('cashEvents');
          for (const c of await cashEvents.getAll()) {
            if (c.deletedAt !== null) await cashEvents.delete(c.id);
          }
        }

        /* 既有存檔一律補上 DEFAULT_CARD_FEE_PCT，**封存的也一樣**
           （使用者 2026-11-09 指定：預設直接是 1.5，不要匯入後還得解封去改）。

           代價是已封存旅程的總額會變動——那些錢本來就付了，只是以前沒算進去。
           使用者知情並選了這個。要讓某趟不算手續費，解除封存後把費率改成 0。 */
        if (oldVersion < 6) {
          const store = tx.objectStore('trips');
          for (const t of await store.getAll()) {
            if (t.cardFeePct === undefined || t.cardFeePct === null) {
              await store.put({ ...t, cardFeePct: DEFAULT_CARD_FEE_PCT });
            }
          }
        }

        /* v7 原本把殘留的「國內刷卡」翻成「海外刷卡」——那是為了補正 v6：
           v6 的轉換規則在同一天內改過，而遷移只跑一次，先載入過舊版的裝置
           會停在第一版的結果（北海道那趟就被拆成國內 11 筆、海外 14 筆）。

           那兩個付款方式在 v9 已經不存在，而 v9 會把所有舊的刷卡紀錄一律
           設成海外，效果一樣，所以這一版不再需要任何動作。版號不回收：
           已經跑到 v7／v8 的裝置不會因此重跑，跳過它是安全的。 */

        /* 補正 v6：它的第一版給已封存的存檔 0，而遷移只跑一次，
           改 v6 對已經轉完的裝置沒有作用。使用者指定預設一律 1.5。

           只動 0 的，不動使用者自己填過的值——但 0 也可能是他刻意填的。
           這在今天成立是因為這個欄位與 v6 同一天出現，能被翻到的只有遷移
           自己寫進去的 0。日後不要再加這種無條件翻值的遷移。 */
        if (oldVersion < 8) {
          const store = tx.objectStore('trips');
          for (const t of await store.getAll()) {
            if (t.cardFeePct === 0) {
              await store.put({ ...t, cardFeePct: DEFAULT_CARD_FEE_PCT });
            }
          }
        }

        /* 國內外從「付款方式」搬到獨立的 cardRegion（使用者 2026-11-09 指定：
           刷卡還是一個類別，國內／海外在記帳時像幣種那樣另外選）。

           v6～v8 期間短暫存在過「國內刷卡」「海外刷卡」兩個付款方式，
           這裡把它們還原成「刷卡」。

           地區**一律設成預設的海外，不去還原那個短暫的國內／海外之分**
           （使用者 2026-11-09 指定：舊的刷卡全部當海外）。這樣做還有一個
           好處：裝置停在 v6、v7 或 v8 都會得到同一個結果。照舊值還原的話，
           跑過 v7 的裝置（它把國內翻成了海外）跟沒跑過的會分岔。

           非刷卡的紀錄也填上這個值，不會被讀，但填好才不會有 undefined
           跑進判斷式。 */
        if (oldVersion < 9) {
          const store = tx.objectStore('expenses');
          for (const e of await store.getAll()) {
            const next = modernizePaymentMethod(e.paymentMethod, e.amountKind);
            await store.put({
              ...e,
              paymentMethod: next as typeof e.paymentMethod,
              cardRegion: e.cardRegion ?? DEFAULT_CARD_REGION,
            });
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
