/**
 * 可選的幣別。
 *
 * 台幣固定排第一，其後照全球外匯交易量的排名排到澳幣
 *（使用者 2026-11-12 指定；原本是 2026-11-09 定的五種）。
 * 之後要加就往 `CURRENCIES` 補一筆，畫面會自動跟著長出選項——
 * 不要在各畫面各自寫死幣別清單。
 *
 * 這個陣列的順序就是下拉選單的順序。預設選中的是 `DEFAULT_CURRENCY`，跟排第幾無關。
 */
export interface Currency {
  /** ISO 4217 代碼，資料庫存這個。 */
  code: string;
  /** 中文名稱，給人看。 */
  name: string;
}

export const CURRENCIES: readonly Currency[] = [
  { code: 'TWD', name: '台幣' },
  { code: 'USD', name: '美元' },
  { code: 'EUR', name: '歐元' },
  { code: 'JPY', name: '日圓' },
  { code: 'GBP', name: '英鎊' },
  { code: 'CNY', name: '人民幣' },
  { code: 'AUD', name: '澳幣' },
] as const;

/** 新存檔的預設幣別。旅費記帳以出國為主，預設日圓。 */
export const DEFAULT_CURRENCY = 'JPY';

/** 查中文名。查不到就回代碼本身，不要讓畫面變空白。 */
export function currencyName(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.name ?? code;
}

/** 「日圓 JPY」這種同時給人看與給對帳用的寫法。 */
export function currencyLabel(code: string): string {
  const name = currencyName(code);
  return name === code ? code : `${name} ${code}`;
}
