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

/**
 * 付款方式。
 *
 * 刻意沒有「其他」：使用者 2026-11-09 確認原始記帳裡的「其他」其實都是悠遊卡，
 * 只是當時試算表沒分這一類。日後真的出現放不進這五項的付款方式
 *（電子支付、禮券、他人代墊）再加回來。
 */
export const PAYMENT_METHODS = ['現金', '刷卡', '轉帳', '西瓜卡', '悠遊卡'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * 已淘汰但仍可能出現在舊資料與舊備份檔裡的付款方式。
 *
 * 匯入驗證會放行這些值，寫入時由 `modernizePaymentMethod` 換掉——
 * 已經發出去的備份檔不該因為清單改版就匯不進來。
 */
export const RETIRED_PAYMENT_METHODS = ['交通卡', '其他'] as const;

/**
 * 把舊的付款方式換成現行值；不是舊值就原樣回傳。
 *
 * - **交通卡** 靠計價幣別判斷：外幣是日本的西瓜卡，台幣是悠遊卡。
 *   實證：既有的 7 筆交通卡全是外幣，`note` 欄都記著「原記錄付款方式：西瓜卡」。
 * - **其他** 一律換成悠遊卡。這**不是**語意上的等價，是針對既有資料的一次性修正——
 *   使用者向原記帳者確認過，那些「其他」都是悠遊卡，只是當時沒分這一類。
 *   實證：既有的 2 筆都是台灣的機場接駁，台幣計價。
 */
export function modernizePaymentMethod(value: string, amountKind: AmountKind): string {
  if (value === '交通卡') return amountKind === 'twd' ? '悠遊卡' : '西瓜卡';
  if (value === '其他') return '悠遊卡';
  return value;
}

/** 這筆金額是用外幣還是台幣計價。 */
export type AmountKind = 'foreign' | 'twd';

/**
 * 每種付款方式的預設計價幣別。
 *
 * 刷卡與轉帳的帳單本來就是台幣——銀行在刷的當下就換好匯了，
 * 所以那些金額不需要再換算。只有現金是使用者自己換的外幣。
 *
 * 兩張交通卡的預設剛好相反：西瓜卡（Suica）在日本用外幣儲值，
 * 悠遊卡是台灣的卡，儲的是台幣。
 *
 * 這只是預設值，使用者可以覆蓋：出國前在台灣買機票、網卡也算這趟旅費，
 * 那些是台幣現金或台幣刷卡。
 */
export const DEFAULT_AMOUNT_KIND: Record<PaymentMethod, AmountKind> = {
  現金: 'foreign',
  刷卡: 'twd',
  轉帳: 'twd',
  西瓜卡: 'foreign',
  悠遊卡: 'twd',
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
