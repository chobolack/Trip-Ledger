/**
 * 領域型別。
 *
 * 所有實體都帶 `updatedAt`，因為這個程式是離線優先：
 * 本機 IndexedDB 才是真實來源，後端只是同步目標，同步策略為「後寫者勝」。
 *
 * `deletedAt` 是墓碑欄位，但**刪除已經改成真的移除**（使用者 2026-11-09 指定），
 * 所以資料庫裡不會再有墓碑。欄位本身留著不要拆：舊版程式匯出的備份檔還帶著它，
 * 匯入時要讀得懂才能正確忽略。見 docs/規格.md〈刪除就是真的刪除〉。
 */

/** 存檔（＝一趟旅程）的狀態。封存後轉為唯讀結算畫面。 */
export type TripStatus = 'active' | 'archived';

/** 花費分類。 */
export const CATEGORIES = ['餐飲', '交通', '景點門票', '購物', '住宿', '其他'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * 付款方式。
 *
 * 刻意沒有「其他」：使用者 2026-11-09 確認原始記帳裡的「其他」其實都是悠遊卡，
 * 只是當時試算表沒分這一類。日後真的出現放不進這幾項的付款方式
 *（電子支付、禮券、他人代墊）再加回來。
 *
 * **刷卡是一項，不拆成國內／海外**（使用者 2026-11-09 指定）。
 * 國內外是另一個維度，記在 `Expense.cardRegion`，記帳時像幣種那樣獨立切換——
 * 把它塞進付款方式會讓這份清單變成兩個概念的乘積，而圖表上「刷卡」
 * 也會莫名其妙被拆成兩條。
 */
export const PAYMENT_METHODS = ['現金', '刷卡', '轉帳', '西瓜卡', '悠遊卡'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * 刷卡的地區。**只有付款方式是「刷卡」時有意義**，其他方式帶著也會被忽略。
 *
 * 為什麼要有這一格：海外刷卡會被收國外交易手續費（多數卡 1.5%），國內刷卡不會，
 * 而這件事無法從其他欄位推出來——出發前在台灣刷機票、訂房、旅平險，
 * 跟在國外刷卡，記下來的資料長得一模一樣（都是刷卡＋台幣）。
 * 只有使用者知道差別，所以讓他在記帳當下就選定，而不是事後靠日期猜。
 * 見 docs/規格.md〈刷卡手續費〉。
 */
/**
 * 這趟旅程記帳時可以選的付款方式。
 *
 * **西瓜卡只在日圓的旅程出現**（使用者 2026-11-12 指定）——那是日本的交通卡，
 * 去別的國家選單裡多這一顆只是雜訊。
 *
 * `keep` 是「就算不符合條件也要留著」的那一個，給修改既有紀錄用：
 * 舊資料或匯入的備份裡，可能有非日圓旅程卻記成西瓜卡的帳。
 * 修改那筆時選單裡要找得到它目前的值，否則畫面上會變成什麼都沒選，
 * 存檔時付款方式卻還是西瓜卡。
 *
 * 只影響記帳畫面的選單。統計圖表、明細、匯入驗證看的仍是完整的 `PAYMENT_METHODS`。
 */
export function paymentMethodsFor(currency: string, keep?: PaymentMethod): PaymentMethod[] {
  return PAYMENT_METHODS.filter((m) => m !== '西瓜卡' || currency === 'JPY' || m === keep);
}

/** 已封存、但暫時開放改明細。見 `Trip.revising`。 */
export function isRevising(trip: { status: TripStatus; revising?: boolean }): boolean {
  return trip.status === 'archived' && trip.revising === true;
}

/** 明細能不能動（新增、修改、刪除）：進行中，或封存後進了修訂模式。 */
export function isWritable(trip: { status: TripStatus; revising?: boolean }): boolean {
  return trip.status === 'active' || isRevising(trip);
}

export const CARD_REGIONS = ['overseas', 'domestic'] as const;
export type CardRegion = (typeof CARD_REGIONS)[number];

/** 記帳畫面與明細列顯示用。 */
export const CARD_REGION_LABEL: Record<CardRegion, string> = {
  overseas: '海外',
  domestic: '國內',
};

/** 預設海外（使用者 2026-11-09 指定）：這是旅費記帳，刷卡多半刷在國外。 */
export const DEFAULT_CARD_REGION: CardRegion = 'overseas';

/**
 * 已淘汰但仍可能出現在舊資料與舊備份檔裡的付款方式。
 *
 * 匯入驗證會放行這些值，寫入時由 `modernizePaymentMethod` 換掉——
 * 已經發出去的備份檔不該因為清單改版就匯不進來。
 */
export const RETIRED_PAYMENT_METHODS = ['交通卡', '其他', '國內刷卡', '海外刷卡'] as const;

/**
 * 把舊的付款方式換成現行值；不是舊值就原樣回傳。
 *
 * - **交通卡** 靠計價幣別判斷：外幣是日本的西瓜卡，台幣是悠遊卡。
 *   實證：既有的 7 筆交通卡全是外幣，`note` 欄都記著「原記錄付款方式：西瓜卡」。
 * - **其他** 一律換成悠遊卡。這**不是**語意上的等價，是針對既有資料的一次性修正——
 *   使用者向原記帳者確認過，那些「其他」都是悠遊卡，只是當時沒分這一類。
 *   實證：既有的 2 筆都是台灣的機場接駁，台幣計價。
 * - **國內刷卡／海外刷卡** 都換回「刷卡」。這兩個值只在 2026-11-09 當天短暫存在過
 *   （那時國內外是做在付款方式裡的），地區改記在 `cardRegion` 之後就淘汰了。
 *   舊值裡的國內／海外之分**刻意不還原**，一律當海外——使用者指定舊的刷卡
 *   全部當海外，而且這樣停在哪個 schema 版本的裝置都會得到同一個結果。
 *   見 `db.ts` 的 v9 遷移。
 */
export function modernizePaymentMethod(value: string, amountKind: AmountKind): string {
  if (value === '交通卡') return amountKind === 'twd' ? '悠遊卡' : '西瓜卡';
  if (value === '其他') return '悠遊卡';
  if (value === '國內刷卡' || value === '海外刷卡') return '刷卡';
  return value;
}

/** 這筆金額是用外幣還是台幣計價。 */
export type AmountKind = 'foreign' | 'twd';

/** 新存檔的海外刷卡手續費率（%）。多數信用卡的國外交易手續費就是 1.5%。 */
export const DEFAULT_CARD_FEE_PCT = 1.5;

/**
 * 每種付款方式的預設計價幣別。
 *
 * 刷卡與轉帳的帳單本來就是台幣——銀行在刷的當下就換好匯了，
 * 所以那些金額不需要再換算。**刷在國外也一樣是台幣**：國內外的差別在於
 * 會不會被收手續費（見 `CARD_REGIONS`），不在計價幣別。
 * 只有現金是使用者自己換的外幣。
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
  /**
   * ISO 8601。有值代表已刪除（墓碑）。
   *
   * 本機寫入時永遠是 `null`——刪除是真的移除。只有舊版備份檔裡才會有值，
   * 匯入時那些紀錄會被忽略。
   */
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
   * 只在按下封存的那一刻抓一次就固定，不是每次打開結算畫面都重算——
   * 「每天匯率不同」正是原使用者否決匯率欄位的理由，凍結才繞得過去。
   * null 代表還沒封存，或封存時離線抓不到（匯率待補）。
   */
  sealRate: number | null;
  /** 匯率抓取時間 ISO 8601。null 同上。 */
  sealRateAt: string | null;
  /** 匯率來源，例如 'open.er-api.com'。留著以後要換來源時分辨得出舊資料。 */
  sealRateSource: string | null;
  /**
   * 海外刷卡的國外交易手續費率（%）。多數卡是 1.5。
   *
   * 跟 `sealRate` 一樣是「這趟當時的成本」，所以存在存檔上而不是寫死在程式裡：
   * 換一張卡、換一家銀行費率就不同，而已經記完的旅程不該因此變動。
   *
   * **商品金額不含它**（使用者 2026-11-09 指定）——手續費在明細列與總計區
   * 都是獨立呈現的一筆，不會加進任何一筆花費的金額裡。
   *
   * 預設一律 `DEFAULT_CARD_FEE_PCT`，**已封存的存檔與匯入的舊備份也一樣**
   * （使用者 2026-11-09 指定：不要匯入後還得解封去改費率）。
   * 代價是已封存旅程的總額會比以前高——那些手續費本來就付了。
   * 要讓某趟不算，解除封存後把費率改成 0。見 docs/規格.md〈刷卡手續費〉。
   */
  cardFeePct: number;

  /**
   * 修訂中：已封存的存檔暫時開放改明細（使用者 2026-11-11 指定）。
   *
   * 跟「解除封存」是兩回事。解除封存會讓存檔變回進行中——結束日清掉、
   * 天數重算到今天、跑回存檔列表最上面；但回頭改舊帳的人只是要修幾筆細項，
   * 旅程早就結束了。修訂中的存檔 `status` 仍是 `archived`，結束日、匯率、
   * 圖表都照舊，只有明細可以新增、修改、刪除。
   *
   * **刻意做成選填**：沒有這欄＝不在修訂中，所以既有資料不需要遷移
   * （遷移只會跑一次，能不加就不加，見 db.ts）。判斷一律用 `isRevising()`，
   * 不要直接讀這欄。只對 `archived` 有意義。
   */
  revising?: boolean;

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
  /**
   * 刷卡刷在國內還是海外。**只有 `paymentMethod` 是「刷卡」時有意義**，
   * 其他付款方式也帶著這個值，但不會被讀。
   *
   * 海外刷卡會被收國外交易手續費，國內不會。記帳時在幣種旁邊切換，預設海外。
   * 見 `CARD_REGIONS` 與 docs/規格.md〈刷卡手續費〉。
   */
  cardRegion: CardRegion;
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
