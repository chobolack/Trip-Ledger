/**
 * 該不該提醒使用者備份。
 *
 * 資料只存在這台裝置的瀏覽器裡（見 docs/規格.md），清瀏覽資料、換手機就沒了，
 * 而使用者不會自己記得要匯出。所以由程式判斷時機，在主畫面與存檔頁提一句。
 *
 * 只提醒，不擋任何操作，也不會自動匯出。
 */

/** 距離上次備份（或從沒備份過時，距離第一個存檔建立）超過這麼久就提醒。 */
export const BACKUP_STALE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 判斷需要的最少資訊。刻意不直接吃 TripSummary，這樣測試不用湊一整個存檔出來。 */
export interface BackupTripFacts {
  status: 'active' | 'archived';
  /** 存檔建立時間（ISO 8601）。 */
  createdAt: string;
  /** 存檔本身最後變動時間。封存、改手續費率、刪帳會動到它；進出修訂模式不會。 */
  updatedAt: string;
  /** 存檔與底下所有花費的 `updatedAt` 取最晚。記一筆帳動的是這個。 */
  lastSavedAt: string;
  /** 這個存檔上次單獨匯出（JSON）的時間。只算它自己；沒單獨匯出過是 null 或不給。 */
  exportedAt?: string | null;
}

/**
 * - `none`：不用提醒。
 * - `sealed`：有旅程在上次備份之後封存（或封存後又改過）。一趟結束是最該備份的時候，
 *   不等七天，馬上提。
 * - `stale`：有還沒備份的變動，而且已經超過 `BACKUP_STALE_DAYS` 天沒備份。
 */
export type BackupDue = 'none' | 'sealed' | 'stale';

export function backupDue(
  trips: readonly BackupTripFacts[],
  /** 上次下載完整備份的時間（ISO 8601），沒備份過是 null。 */
  lastBackupAt: string | null,
  /** 現在時間（毫秒）。由呼叫端傳入，這個函式才測得了。 */
  now: number,
): BackupDue {
  if (trips.length === 0) return 'none';

  const backedUp = lastBackupAt === null ? null : Date.parse(lastBackupAt);
  /* 每個存檔各看自己：完整備份與它自己的單獨匯出，取較晚的那次。 */
  const coveredAt = (t: BackupTripFacts): number | null => {
    const own = t.exportedAt ? Date.parse(t.exportedAt) : null;
    if (backedUp === null) return own;
    return own === null ? backedUp : Math.max(backedUp, own);
  };
  const unbacked = (t: BackupTripFacts) => {
    const c = coveredAt(t);
    return c === null || Date.parse(t.lastSavedAt) > c;
  };

  // 上次備份之後什麼都沒動，就沒有東西需要備份。
  if (!trips.some(unbacked)) return 'none';

  /* 看 lastSavedAt 不是 updatedAt：封存後進修訂模式改某一筆帳，動的是那筆花費，
     存檔本身的 updatedAt 不會變。 */
  if (trips.some((t) => t.status === 'archived' && unbacked(t))) {
    return 'sealed';
  }

  /* 從沒備份過的話，從最早那個存檔建立的時間起算——
     剛裝好、記下第一筆帳的人不該馬上被催。 */
  const since = backedUp ?? Math.min(...trips.map((t) => Date.parse(t.createdAt)));
  /* 七天是從上次**完整**備份起算，單獨匯出不重置它：
     匯出其中一趟不代表其他存檔也顧到了。 */
  return now - since >= BACKUP_STALE_DAYS * DAY_MS ? 'stale' : 'none';
}
