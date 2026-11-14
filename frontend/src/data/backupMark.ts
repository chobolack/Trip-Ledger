/**
 * 「這台裝置上次下載完整備份是什麼時候」。
 *
 * 放 localStorage 而不是 IndexedDB：它描述的是這台裝置做過的事，不是帳目資料，
 * 不該跟著備份檔搬到另一台裝置，也不值得為它升一次資料庫版本。
 * 兩者的壽命相同——清除網站資料時會一起消失，那時本來就該重新提醒。
 *
 * 讀寫都包 try/catch：無痕視窗或被擋掉儲存空間時 localStorage 會直接丟例外，
 * 那種情況就當成沒備份過，不能讓整個畫面壞掉。
 */
const KEY = 'trip-ledger:lastBackupAt';

export function getLastBackupAt(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && Number.isFinite(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
}

/** 下載完整備份成功後呼叫。單一存檔的匯出另外記，見 `markTripBackedUp`。 */
export function markBackedUp(at: string = new Date().toISOString()): void {
  try {
    localStorage.setItem(KEY, at);
  } catch {
    /* 記不下來就算了，頂多之後多提醒一次。 */
  }
}

/**
 * 單一存檔各自上次匯出 JSON 的時間：`{ 存檔 id: ISO 時間 }`。
 *
 * 試用者 2026-11-14 回報：只匯出剛封存的那一趟，提醒還是不消。
 * 那一趟確實已經備份了，所以分開記——**只算那一趟**，別的存檔照舊要完整備份
 * 或各自匯出才算數。CSV 不算，那個匯不回來。
 *
 * 存檔刪掉後它的紀錄會留在這裡，沒有清——只是一個 id 配一個時間，沒人會讀到它。
 */
const TRIP_KEY = 'trip-ledger:tripBackupAt';

export function getTripBackupMarks(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TRIP_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [id, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && Number.isFinite(Date.parse(v))) out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** 單一存檔匯出 JSON 成功後呼叫。 */
export function markTripBackedUp(tripId: string, at: string = new Date().toISOString()): void {
  try {
    localStorage.setItem(TRIP_KEY, JSON.stringify({ ...getTripBackupMarks(), [tripId]: at }));
  } catch {
    /* 同上：記不下來就算了。 */
  }
}

/**
 * 某個存檔「最近一次被備份到」的時間：完整備份與它自己的單獨匯出取較晚的。
 * 兩種都沒有是 null。
 */
export function getTripBackedUpAt(tripId: string): string | null {
  const full = getLastBackupAt();
  const own = getTripBackupMarks()[tripId] ?? null;
  if (full === null) return own;
  if (own === null) return full;
  return Date.parse(own) > Date.parse(full) ? own : full;
}
