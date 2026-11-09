/**
 * 可選的幣別。
 *
 * 使用者 2026-11-09 指定先放這五種，之後要加就往 `CURRENCIES` 補一筆，
 * 畫面會自動跟著長出選項——不要在各畫面各自寫死幣別清單。
 */
export interface Currency {
  /** ISO 4217 代碼，資料庫存這個。 */
  code: string;
  /** 中文名稱，給人看。 */
  name: string;
}

export const CURRENCIES: readonly Currency[] = [
  { code: 'TWD', name: '台幣' },
  { code: 'JPY', name: '日圓' },
  { code: 'USD', name: '美金' },
  { code: 'EUR', name: '歐元' },
  { code: 'CNY', name: '人民幣' },
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
