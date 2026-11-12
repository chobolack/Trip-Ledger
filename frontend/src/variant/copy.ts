import { INMUKING, INMUKING_CURRENCY_CODES } from './inmuking';

/**
 * 新存檔時限定只能選哪些幣別。`null`＝不限制（正常版）。
 * 這是惡搞版唯一一處不只是換字的差異，見 inmuking.ts 的說明。
 */
export const CURRENCY_CODES_ONLY: readonly string[] | null =
  import.meta.env.MODE === 'inmuking' ? INMUKING_CURRENCY_CODES : null;

/**
 * 文案替換的唯一出口。
 *
 * 同一份程式碼會打包成兩個站：正常版，以及惡搞版「野獸記帳」
 * （`vite build --mode inmuking`，部署在 `/Trip-Ledger/inmuking/`）。
 * 兩版的功能、資料格式、計算完全一樣，**差別只有畫面上的字**。
 *
 * `import.meta.env.MODE` 在打包時就被換成固定字串，所以正常版裡
 * 這個三元式直接變成 `{}`，INMUKING 整包被當成沒用到的程式碼丟掉——
 * 惡搞文案不會出現在正常版的產物裡。
 */
const TABLE: Readonly<Record<string, string>> =
  import.meta.env.MODE === 'inmuking' ? INMUKING : {};

/**
 * 回傳這段字在目前這一版要顯示的樣子。
 *
 * 用**原文當索引**而不是另外取代號：呼叫端讀起來還是看得到正常版的字，
 * 而且表裡沒有的就原樣回傳，正常版的行為跟沒包這一層之前完全相同。
 */
export function t(original: string): string {
  return Object.hasOwn(TABLE, original) ? TABLE[original] : original;
}
