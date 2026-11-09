/**
 * 領域型別。
 *
 * 所有實體都帶 `updatedAt` / `deletedAt`，因為這個程式是離線優先：
 * 本機 IndexedDB 才是真實來源，後端只是同步目標，同步策略為「後寫者勝」。
 * 刪除一律寫墓碑（`deletedAt`）而非真的刪掉，否則離線刪除無法同步出去。
 */

/** 存檔（＝一趟旅程）的狀態。封存後轉為唯讀成績單。 */
export type TripStatus = 'active' | 'archived';

/** 花費分類。 */
export const CATEGORIES = ['餐飲', '交通', '景點門票', '購物', '住宿', '其他'] as const;
export type Category = (typeof CATEGORIES)[number];

/** 付款方式。 */
export const PAYMENT_METHODS = ['現金', '刷卡', '轉帳', '交通卡', '其他'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** 這筆金額是用外幣還是台幣計價。 */
export type AmountKind = 'foreign' | 'twd';

/**
 * 每種付款方式的預設計價幣別。
 *
 * 刷卡與轉帳的帳單本來就是台幣——銀行在刷的當下就換好匯了，
 * 所以那些金額不需要再換算。只有現金是使用者自己換的外幣。
 * 交通卡（Suica、ICOCA 這類）是用外幣儲值的，算外幣。
 *
 * 這只是預設值，使用者可以覆蓋：出國前在台灣買機票、網卡也算這趟旅費，
 * 那些是台幣現金或台幣刷卡。
 */
export const DEFAULT_AMOUNT_KIND: Record<PaymentMethod, AmountKind> = {
  現金: 'foreign',
  刷卡: 'twd',
  轉帳: 'twd',
  交通卡: 'foreign',
  其他: 'foreign',
};

/** 現金事件的種類。用來追蹤皮夾裡實際該剩多少錢。 */
export type CashEventKind =
  | 'pre_trip_exchange' // 出發前換匯
  | 'on_trip_exchange' // 途中加換
  | 'atm_withdrawal'; // ATM 提現

/** 同步用的共通欄位。 */
export interface Syncable {
  /** uuid，由本機產生，離線也能建立。 */
  id: string;
  /** ISO 8601。本機每次寫入都更新，同步比大小用。 */
  updatedAt: string;
  /** ISO 8601。有值代表已刪除（墓碑）。 */
  deletedAt: string | null;
}

/** 存檔。 */
export interface Trip extends Syncable {
  name: string;
  /** 外幣代碼，例如 JPY。一趟旅程只有一種外幣 ＋ 台幣。 */
  currency: string;
  status: TripStatus;
  /** 旅程起始日 YYYY-MM-DD。 */
  startedOn: string;
  /** 封存日 YYYY-MM-DD。未封存為 null。 */
  endedOn: string | null;
  createdAt: string;

  /**
   * 封存時凍結的匯率：1 外幣 ＝ 幾台幣。
   *
   * 只在按下封存的那一刻抓一次就固定，不是每次打開成績單都重算——
   * 「每天匯率不同」正是原使用者否決匯率欄位的理由，凍結才繞得過去。
   * null 代表還沒封存，或封存時離線抓不到（匯率待補）。
   */
  sealRate: number | null;
  /** 匯率抓取時間 ISO 8601。null 同上。 */
  sealRateAt: string | null;
  /** 匯率來源，例如 'open.er-api.com'。留著以後要換來源時分辨得出舊資料。 */
  sealRateSource: string | null;

  /**
   * 預留：多人共用時標記這個存檔屬於誰。
   * 現階段自用，固定為 null。見 docs/規格.md〈預留但不做〉。
   */
  ownerId: string | null;
}

/** 一筆花費。 */
export interface Expense extends Syncable {
  tripId: string;
  /** 花費日 YYYY-MM-DD。 */
  spentOn: string;
  category: Category;
  /** 項目名稱，可空（空的話顯示分類名）。 */
  title: string;
  paymentMethod: PaymentMethod;
  /**
   * 這筆是用外幣還是台幣計價。
   *
   * 由付款方式決定預設值（刷卡與轉帳的帳單本來就是台幣，現金才是外幣），
   * 但使用者可以覆蓋——出國前在台灣買機票、網卡也算旅費，那些是台幣。
   * 見 docs/規格.md〈付款方式決定幣別〉。
   */
  amountKind: AmountKind;
  /** 金額，單位由 amountKind 決定。 */
  amount: number;
  note: string;
  createdAt: string;

  /**
   * 預留：多人分帳時記錄誰付的。
   * 現階段自用，固定為 null。見 docs/規格.md〈預留但不做〉。
   */
  payerId: string | null;
}

/** 一次換匯或提現。 */
export interface CashEvent extends Syncable {
  tripId: string;
  /** 發生日 YYYY-MM-DD。 */
  happenedOn: string;
  kind: CashEventKind;
  /** 付出的台幣。ATM 提現時可能不知道，允許 null。 */
  paidTwd: number | null;
  /** 拿到的外幣。 */
  receivedForeign: number;
  /** 手續費（台幣），分開記以免混進匯率。 */
  feeTwd: number | null;
  note: string;
  createdAt: string;
}
