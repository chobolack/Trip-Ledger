import { getLastBackupAt, getTripBackupMarks } from '../data/backupMark';
import type { TripSummary } from '../data/repo';
import { backupDue, type BackupDue } from '../domain/backupReminder';

/** 把存檔列表換算成「現在該不該提醒備份」。還在讀取時一律不提醒。 */
export function backupDueFor(summaries: readonly TripSummary[], loading: boolean): BackupDue {
  if (loading) return 'none';
  const marks = getTripBackupMarks();
  return backupDue(
    summaries.map((x) => ({
      status: x.status,
      createdAt: x.trip.createdAt,
      updatedAt: x.trip.updatedAt,
      lastSavedAt: x.lastSavedAt,
      exportedAt: marks[x.trip.id] ?? null,
    })),
    getLastBackupAt(),
    Date.now(),
  );
}
