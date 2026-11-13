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

/** 下載完整備份成功後呼叫。單一存檔的匯出不算——那不是全部的資料。 */
export function markBackedUp(at: string = new Date().toISOString()): void {
  try {
    localStorage.setItem(KEY, at);
  } catch {
    /* 記不下來就算了，頂多之後多提醒一次。 */
  }
}
