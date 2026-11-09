/**
 * 備份與還原。
 *
 * 存在的理由：IndexedDB 是綁定「來源」的（scheme + host + port）。
 * 換網址、換瀏覽器、換手機，資料都不會跟著走，清掉網站資料也就沒了。
 * 在後端做好之前，匯出檔案是唯一能把資料搬出去、搬到別台裝置的方法。
 *
 * 合併規則跟日後的同步層一致：以 id 比對、`updatedAt` 新的勝出。
 * 所以同一個檔案重複匯入不會長出重複資料，匯入舊檔也不會蓋掉新的修改。
 */
import { getDb } from './db';
import type { CashEvent, Expense, Trip } from '../domain/types';

const FORMAT = 'trip-ledger-backup';
const VERSION = 1;

export interface Backup {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  trips: Trip[];
  expenses: Expense[];
  cashEvents: CashEvent[];
}

/**
 * 匯出全部資料，**包含已刪除的墓碑紀錄**。
 *
 * 墓碑要留著：少了它，把備份匯回去會讓先前刪掉的紀錄全部復活。
 */
export async function buildBackup(): Promise<Backup> {
  const db = await getDb();
  const [trips, expenses, cashEvents] = await Promise.all([
    db.getAll('trips'),
    db.getAll('expenses'),
    db.getAll('cashEvents'),
  ]);
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    trips,
    expenses,
    cashEvents,
  };
}

/**
 * 只匯出一個存檔。格式與完整備份相同，所以一樣匯得回來。
 *
 * 用途是把單趟旅程搬到別處或單獨留底，不是整台裝置的備份——
 * 要保險還是用完整備份。
 */
export async function buildTripBackup(tripId: string): Promise<Backup> {
  const db = await getDb();
  const [trip, expenses, cashEvents] = await Promise.all([
    db.get('trips', tripId),
    db.getAllFromIndex('expenses', 'byTrip', tripId),
    db.getAllFromIndex('cashEvents', 'byTrip', tripId),
  ]);
  if (!trip) throw new Error('找不到這個存檔。');
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    trips: [trip],
    expenses,
    cashEvents,
  };
}

export interface ImportResult {
  added: number;
  updated: number;
  /** 本機已有更新的版本，略過不動。 */
  skipped: number;
  /**
   * 略過的紀錄裡，有幾筆是「本機已刪除、備份裡還在」。
   *
   * 這是還原備份時最容易撞到的狀況：刪除是寫墓碑並更新時間戳，
   * 所以墓碑永遠比備份檔新，合併模式會把整份備份擋在門外。
   * 大於 0 時畫面要提示使用者改用覆蓋模式，否則他只會看到
   * 「略過 67 筆」然後完全不知道發生什麼事。
   */
  blockedByDeletion: number;
}

export interface ImportOptions {
  /**
   * 以備份檔為準，不比時間戳直接覆蓋。
   *
   * 用於「還原」——使用者要的是這個檔案的狀態，不是兩邊合併。
   * 只影響備份檔裡有的紀錄，本機其他資料不動。
   */
  force?: boolean;
}

/** 解析檔案內容，格式不對就丟錯，不讓壞資料進資料庫。 */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('這不是有效的 JSON 檔。');
  }
  if (typeof raw !== 'object' || raw === null) return fail('檔案內容不是物件。');

  const b = raw as Partial<Backup>;
  if (b.format !== FORMAT) {
    return fail('這不是 Trip Ledger 的備份檔（缺少格式標記）。');
  }
  if (typeof b.version !== 'number' || b.version > VERSION) {
    return fail(`備份檔版本是 ${String(b.version)}，這個版本的程式只讀得懂 ${VERSION} 以下。`);
  }
  for (const key of ['trips', 'expenses', 'cashEvents'] as const) {
    if (!Array.isArray(b[key])) return fail(`備份檔缺少 ${key} 這一段。`);
    for (const row of b[key] as unknown[]) {
      if (
        typeof row !== 'object' ||
        row === null ||
        typeof (row as { id?: unknown }).id !== 'string' ||
        typeof (row as { updatedAt?: unknown }).updatedAt !== 'string'
      ) {
        return fail(`${key} 裡有紀錄缺少 id 或 updatedAt，檔案可能損毀。`);
      }
    }
  }
  return raw as Backup;
}

function fail(message: string): never {
  throw new Error(message);
}

/**
 * 把備份寫進本機資料庫。
 *
 * 預設是**合併**：本機既有、且 `updatedAt` 比較新的紀錄會留著，
 * 這樣兩台裝置互相匯入對方的備份不會互相破壞。
 *
 * `force` 則是**還原**：以備份檔為準直接覆蓋。還原一定要有這條路，
 * 因為刪除是寫墓碑並更新時間戳，合併模式下墓碑永遠贏過備份檔，
 * 使用者會發現自己刪掉的東西再也救不回來。
 */
export async function applyBackup(
  backup: Backup,
  { force = false }: ImportOptions = {},
): Promise<ImportResult> {
  const db = await getDb();
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, blockedByDeletion: 0 };

  const tx = db.transaction(['trips', 'expenses', 'cashEvents'], 'readwrite');
  const sections = [
    ['trips', backup.trips],
    ['expenses', backup.expenses],
    ['cashEvents', backup.cashEvents],
  ] as const;

  for (const [name, rows] of sections) {
    const store = tx.objectStore(name);
    for (const row of rows) {
      const mine = await store.get(row.id);
      if (!mine) {
        await store.put(normalize(name, row));
        result.added++;
      } else if (force || row.updatedAt > mine.updatedAt) {
        await store.put(normalize(name, row));
        result.updated++;
      } else {
        result.skipped++;
        // 本機是墓碑、備份裡還活著——這筆是被刪除擋下來的。
        if (mine.deletedAt !== null && row.deletedAt === null) result.blockedByDeletion++;
      }
    }
  }
  await tx.done;
  return result;
}

/**
 * 補上較舊的備份可能沒有的欄位。
 *
 * 寫進去的物件若缺欄位，讀出來會是 undefined 而不是 null，
 * 後面每個判斷 `=== null` 的地方都會失準。
 */
function normalize<T>(store: 'trips' | 'expenses' | 'cashEvents', row: T): T {
  if (store !== 'trips') return row;
  const t = row as Trip;
  return {
    ...t,
    sealRate: t.sealRate ?? null,
    sealRateAt: t.sealRateAt ?? null,
    sealRateSource: t.sealRateSource ?? null,
    endedOn: t.endedOn ?? null,
    ownerId: t.ownerId ?? null,
  } as T;
}

/** 這台裝置上還活著的紀錄筆數（不算墓碑），給備份畫面顯示用。 */
export async function dataStats(): Promise<{ trips: number; expenses: number }> {
  const db = await getDb();
  const [trips, expenses] = await Promise.all([db.getAll('trips'), db.getAll('expenses')]);
  const alive = (rows: { deletedAt: string | null }[]) =>
    rows.filter((r) => r.deletedAt === null).length;
  return { trips: alive(trips), expenses: alive(expenses) };
}

/**
 * 建議的備份檔名，帶日期方便辨認是哪一次匯出的。
 * 傳入存檔名稱就會夾在中間，用來分辨單一存檔的匯出檔。
 */
export function backupFilename(label?: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  // 檔名裡的斜線冒號在 Windows 上不合法，換掉。
  const safe = label?.replace(/[\\/:*?"<>|]/g, '_').trim();
  return safe ? `trip-ledger-${safe}-${stamp}.json` : `trip-ledger-${stamp}.json`;
}
