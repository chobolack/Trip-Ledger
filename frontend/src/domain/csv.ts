/**
 * 單一存檔匯出成 CSV，給試算表看的。
 *
 * 欄位刻意跟使用者原本那份記帳的欄位一致，貼回舊試算表不用重排。
 * 完整備份請用 JSON（data/backup.ts）——CSV 會丟掉 id 與時間戳，匯不回來。
 */
import { isDomestic } from './money';
import type { Expense, Trip } from './types';

const HEADER = ['日期', '旅程', '類型', '項目', '付款方式', '幣別', '金額', '折合台幣'] as const;

/** 逗號、引號、換行都要包起來，引號本身用兩個表示。 */
function cell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(trip: Trip, expenses: Expense[]): string {
  const domestic = isDomestic(trip);
  const rate = trip.sealRate;

  const rows = expenses
    .slice()
    .sort((a, b) => a.spentOn.localeCompare(b.spentOn) || a.createdAt.localeCompare(b.createdAt))
    .map((e) => {
      const asTwd = e.amountKind === 'twd' || domestic;
      // 沒有凍結匯率就算不出外幣的台幣金額，留空白而不是寫 0。
      const twd = asTwd
        ? String(Math.round(e.amount))
        : rate !== null && rate > 0
          ? String(Math.round(e.amount * rate))
          : '';
      return [
        e.spentOn,
        trip.name,
        e.category,
        e.title,
        e.paymentMethod,
        asTwd ? 'TWD' : trip.currency,
        e.amount,
        twd,
      ];
    });

  return [HEADER, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export function csvFilename(trip: Trip): string {
  // 檔名裡的斜線與冒號在 Windows 上不合法，換掉。
  const safe = trip.name.replace(/[\\/:*?"<>|]/g, '_').trim() || '旅費';
  return `${safe}.csv`;
}
