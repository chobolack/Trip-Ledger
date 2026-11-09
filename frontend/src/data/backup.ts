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
import {
  CATEGORIES,
  PAYMENT_METHODS,
  RETIRED_PAYMENT_METHODS,
  modernizePaymentMethod,
  type CashEvent,
  type Expense,
  type Trip,
} from '../domain/types';

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

  const problems = findProblems(raw as Backup);
  if (problems.length > 0) {
    const shown = problems.slice(0, MAX_PROBLEMS);
    const more = problems.length - shown.length;
    return fail(
      `備份檔有 ${problems.length} 個問題，修正後再匯入：\n` +
        shown.map((p) => `• ${p}`).join('\n') +
        (more > 0 ? `\n…另外還有 ${more} 個同類問題` : ''),
    );
  }
  return raw as Backup;
}

const MAX_PROBLEMS = 8;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * 檢查欄位的值合不合法。
 *
 * 非做不可的理由：備份檔是手工或由別的工具產生的（這個格式正在靠範例檔
 * 口耳相傳），而**寫錯值不會讓程式當掉，只會讓統計默默少算**——
 * 分類寫成「飲食」而不是「餐飲」，那筆錢就從圓餅圖裡消失，不留痕跡。
 * 寧可在門口擋下來並講清楚哪裡錯，也不要讓人看著一個缺角的圓餅猜。
 *
 * 一次回報所有問題而不是遇到第一個就停，這樣修一輪就好。
 */
function findProblems(b: Backup): string[] {
  const out: string[] = [];
  const legal = (list: readonly string[]) => list.join('、');

  b.trips.forEach((t, i) => {
    const at = `trips[${i}]（${t.name ?? t.id}）`;
    if (typeof t.name !== 'string' || !t.name.trim()) out.push(`${at} 缺少名稱`);
    if (!CURRENCY_CODE.test(String(t.currency)))
      out.push(`${at} 幣別「${t.currency}」格式不對，要三個大寫英文字母，例如 JPY`);
    if (t.status !== 'active' && t.status !== 'archived')
      out.push(`${at} 狀態「${t.status}」不是合法值。合法值：active、archived`);
    if (!DATE.test(String(t.startedOn)))
      out.push(`${at} 出發日「${t.startedOn}」格式不對，要 YYYY-MM-DD`);
    if (t.endedOn !== null && t.endedOn !== undefined && !DATE.test(String(t.endedOn)))
      out.push(`${at} 結束日「${t.endedOn}」格式不對，要 YYYY-MM-DD 或 null`);
    if (t.sealRate !== null && t.sealRate !== undefined && !(t.sealRate > 0))
      out.push(`${at} 封存匯率「${t.sealRate}」要大於 0 或 null`);
  });

  b.expenses.forEach((e, i) => {
    const at = `expenses[${i}]（${e.id}${e.title ? `「${e.title}」` : ''}）`;
    if (!(CATEGORIES as readonly string[]).includes(e.category))
      out.push(`${at} 分類「${e.category}」不是合法值。合法值：${legal(CATEGORIES)}`);
    // 舊的「交通卡」照收，寫入時會自動換成西瓜卡或悠遊卡——
    // 已經發出去的備份檔不該因為清單改版就匯不進來。
    if (
      !(PAYMENT_METHODS as readonly string[]).includes(e.paymentMethod) &&
      !(RETIRED_PAYMENT_METHODS as readonly string[]).includes(e.paymentMethod)
    )
      out.push(`${at} 付款方式「${e.paymentMethod}」不是合法值。合法值：${legal(PAYMENT_METHODS)}`);
    if (e.amountKind !== 'twd' && e.amountKind !== 'foreign')
      out.push(`${at} 計價幣別「${e.amountKind}」不是合法值。合法值：twd、foreign`);
    if (typeof e.amount !== 'number' || !Number.isFinite(e.amount) || e.amount <= 0)
      out.push(`${at} 金額「${e.amount}」要是大於 0 的數字`);
    if (!DATE.test(String(e.spentOn)))
      out.push(`${at} 日期「${e.spentOn}」格式不對，要 YYYY-MM-DD`);
    if (typeof e.tripId !== 'string' || !e.tripId)
      out.push(`${at} 缺少所屬存檔 tripId`);
  });

  b.cashEvents.forEach((c, i) => {
    const at = `cashEvents[${i}]（${c.id}）`;
    if (!DATE.test(String(c.happenedOn)))
      out.push(`${at} 日期「${c.happenedOn}」格式不對，要 YYYY-MM-DD`);
  });

  /* 刻意不檢查「花費的 tripId 不在這個檔案裡」：
     只匯某趟的明細、而那個存檔已經在裝置上，是合法情境。
     parseBackup 是純函式，看不到裝置上有什麼，在這裡擋會誤殺。 */
  return out;
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
  if (store === 'trips') {
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
  if (store === 'expenses') {
    const e = row as Expense;
    // 舊備份裡的「交通卡」在這裡換成西瓜卡或悠遊卡。
    return {
      ...e,
      paymentMethod: modernizePaymentMethod(e.paymentMethod, e.amountKind) as Expense['paymentMethod'],
      note: e.note ?? '',
      payerId: e.payerId ?? null,
    } as T;
  }
  return row;
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
