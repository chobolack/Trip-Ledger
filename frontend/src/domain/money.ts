/**
 * 金額彙總。**整個程式唯一的加總出口。**
 *
 * 規格明說呈現方式大概率會改（見 docs/規格.md〈最終呈現〉），
 * 所以加總邏輯集中在這裡，改的時候只動這個檔案，不用去翻每個畫面。
 *
 * 目前的規則（原使用者的決定）：
 *   確定台幣花費（刷卡、轉帳）與外幣現金花費是**兩個不相加的數字**。
 *   要合成一個總額，得有匯率——而匯率只在封存那一刻抓一次並凍結。
 */
import {
  CATEGORIES,
  PAYMENT_METHODS,
  type Category,
  type Expense,
  type PaymentMethod,
  type Trip,
} from './types';

export interface TripTotals {
  /** 確定的台幣花費。以台幣計價的紀錄，不需要換算。 */
  twdConfirmed: number;
  /** 外幣花費，原幣金額，不換算。 */
  foreignSpent: number;
  /**
   * 外幣部分換算成台幣。
   * 沒有封存匯率（還沒封存，或封存時離線沒抓到）時為 null。
   */
  foreignAsTwd: number | null;
  /** 完整總額。要有封存匯率才算得出來，否則為 null。 */
  grandTotalTwd: number | null;
  entryCount: number;
}

/**
 * 整趟都是台幣的存檔（幣別選台幣，例如國內旅遊）。
 * 這種存檔沒有外幣，不需要兩個總額，也不需要封存換匯。
 */
export function isDomestic(trip: Trip): boolean {
  return trip.currency === 'TWD';
}

export function tripTotals(trip: Trip, expenses: Expense[]): TripTotals {
  let twdConfirmed = 0;
  let foreignSpent = 0;

  for (const e of expenses) {
    // 整趟台幣的存檔不分幣別，全部算台幣，免得使用者切錯時金額掉進外幣桶。
    if (e.amountKind === 'twd' || isDomestic(trip)) twdConfirmed += e.amount;
    else foreignSpent += e.amount;
  }

  const rate = trip.sealRate;
  const foreignAsTwd = rate !== null && rate > 0 ? foreignSpent * rate : null;

  return {
    twdConfirmed,
    foreignSpent,
    foreignAsTwd,
    grandTotalTwd: foreignAsTwd === null ? null : twdConfirmed + foreignAsTwd,
    entryCount: expenses.length,
  };
}

// ─── 分類占比 ───────────────────────────────────────────────────────

export interface CategorySlice {
  category: Category;
  /** 換算成台幣後的金額。 */
  twd: number;
  /** 占總額的比例，0～1。 */
  share: number;
}

/**
 * 依分類算占比，全部換算成台幣。
 *
 * 回傳 null 代表**算不出來**：有外幣花費但還沒有凍結匯率。
 * 這正是圓餅圖只在封存後出現的原因——沒有共同單位，
 * 把台幣與外幣畫進同一個圓餅只會得到一個看起來合理但毫無意義的圖。
 *
 * 回傳**依金額由大到小排序**（使用者 2026-11-09 指定）。排序在這裡做，
 * 不在畫面做，因為圓餅切片與圖例必須用同一份順序——分開排遲早會不一致。
 *
 * 注意這跟「顏色綁分類身份」是兩回事，兩者同時成立：
 * 順序跟著金額變，但每個分類的顏色永遠不變。絕對不能改成按排名配色。
 */
/** 任意分組方式的占比結果。 */
interface Bucket<K> {
  key: K;
  twd: number;
  share: number;
}

/**
 * 把花費換算成台幣後依 `keyOf` 分組，由大到小排序。
 *
 * 分類占比與付款方式占比只差在分組依據，換算與匯率判斷共用這一份，
 * 免得兩邊對「沒有匯率怎麼辦」給出不一樣的答案。
 *
 * `order` 是金額相同時的次要排序依據，讓結果穩定、不會每次重算跳動。
 */
function bucketToTwd<K>(
  trip: Trip,
  expenses: Expense[],
  keyOf: (e: Expense) => K,
  order: readonly K[],
  fallback?: K,
): Bucket<K>[] | null {
  const domestic = isDomestic(trip);
  const rate = trip.sealRate;

  const totals = new Map<K, number>();
  for (const e of expenses) {
    const isTwd = e.amountKind === 'twd' || domestic;
    if (!isTwd && !(rate !== null && rate > 0)) return null;
    const twd = isTwd ? e.amount : e.amount * rate!;
    /* 認不得的值**絕對不能丟掉**。匯入驗證會擋下非法值，但萬一還是混進來
       （舊資料、手工改過的檔），丟掉會讓圓餅少一塊角而且毫無警告——
       占比加不到 100%，金額跟總計區對不上，使用者只能自己猜錢去哪了。

       有 fallback 就歸進去（分類用「其他」）；沒有的話保留原值自成一類，
       這樣至少看得到那筆錢被記成什麼。 */
    const raw = keyOf(e);
    const k = order.includes(raw) ? raw : (fallback ?? raw);
    totals.set(k, (totals.get(k) ?? 0) + twd);
  }

  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  if (grand <= 0) return [];

  /* 排序主鍵是金額由大到小；清單順序只在金額相同時用來打破平手，
     讓結果穩定、不會每次重算跳動。清單外的值排在平手的最後，
     但金額大就還是排前面——未知值如果佔很多錢，藏起來反而失真。 */
  const rank = (k: K) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length : i;
  };
  return [...totals.entries()]
    .filter(([, twd]) => twd > 0)
    .map(([key, twd]) => ({ key, twd, share: twd / grand }))
    .sort((a, b) => b.twd - a.twd || rank(a.key) - rank(b.key));
}

export function categoryBreakdown(trip: Trip, expenses: Expense[]): CategorySlice[] | null {
  const rows = bucketToTwd(trip, expenses, (e) => e.category, CATEGORIES, '其他');
  return rows && rows.map(({ key, twd, share }) => ({ category: key, twd, share }));
}

// ─── 付款方式占比 ───────────────────────────────────────────────────

export interface PaymentSlice {
  method: PaymentMethod;
  twd: number;
  share: number;
}

/**
 * 依付款方式算占比，全部換算成台幣。回傳 null 的條件與 `categoryBreakdown` 相同。
 *
 * 這是唯一能把「這趟錢從哪個口袋出去」講清楚的視角：
 * 總計區按幣別分桶（確定台幣 vs 外幣），但實際上刷卡同時有台幣與外幣兩種記法，
 * 按付款方式分組才對得起來。
 */
export function paymentBreakdown(trip: Trip, expenses: Expense[]): PaymentSlice[] | null {
  // 付款方式沒有「其他」這一項，所以不給 fallback——
  // 認不得的值會保留原值自成一類，不會被吃掉。
  const rows = bucketToTwd(trip, expenses, (e) => e.paymentMethod, PAYMENT_METHODS);
  return rows && rows.map(({ key, twd, share }) => ({ method: key, twd, share }));
}

/** 一天的花費。 */
export interface DayGroup {
  /** YYYY-MM-DD */
  date: string;
  expenses: Expense[];
  twdConfirmed: number;
  foreignSpent: number;
}

/** 把花費按日分組，新的日期在前；同一天內新建立的在前。 */
export function groupByDay(trip: Trip, expenses: Expense[]): DayGroup[] {
  const byDate = new Map<string, Expense[]>();
  for (const e of expenses) {
    const list = byDate.get(e.spentOn);
    if (list) list.push(e);
    else byDate.set(e.spentOn, [e]);
  }

  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, rows]) => {
      const sorted = rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const totals = tripTotals(trip, sorted);
      return {
        date,
        expenses: sorted,
        twdConfirmed: totals.twdConfirmed,
        foreignSpent: totals.foreignSpent,
      };
    });
}

// ─── 顯示格式 ───────────────────────────────────────────────────────

/** 整數千分位。金額一律不顯示小數——旅費記到元就夠，小數只是雜訊。 */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 台幣。 */
export function fmtTwd(n: number): string {
  return `NT$ ${fmt(n)}`;
}

/** 外幣，前面掛代碼而不是符號——代碼不會認錯，$ 跟 ¥ 太多國家共用。 */
export function fmtForeign(n: number, currency: string): string {
  return `${currency} ${fmt(n)}`;
}
