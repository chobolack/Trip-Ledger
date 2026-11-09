/**
 * 匯率抓取。只在按下封存那一刻用一次。
 *
 * 來源 open.er-api.com：免費、不需金鑰、回應帶 `access-control-allow-origin: *`，
 * 所以前端可以直接打，不必等後端代理。
 *
 * 台灣銀行牌告匯率（rate.bot.com.tw）已排除——它擋機器人，回傳 Imperva 驗證頁。
 * 台銀的現金賣出價其實更貼近實際換鈔成本，若日後要用得另尋管道。
 * 見 docs/規格.md〈封存自動換匯〉。
 */

const ENDPOINT = 'https://open.er-api.com/v6/latest/';
const SOURCE = 'open.er-api.com';
const TIMEOUT_MS = 10_000;

export interface FetchedRate {
  /** 1 外幣 ＝ 幾台幣。 */
  rate: number;
  /** 抓取時間 ISO 8601。 */
  at: string;
  source: string;
}

interface ApiResponse {
  result?: string;
  rates?: Record<string, number>;
}

/**
 * 查 1 單位 `currency` 等於幾台幣。
 *
 * 失敗一律丟錯（含離線、逾時、來源沒這個幣別）。
 * 呼叫端的責任是**不要讓封存因此失敗**——抓不到就標記匯率待補，之後再補。
 */
export async function fetchRateToTwd(currency: string): Promise<FetchedRate> {
  if (currency === 'TWD') {
    return { rate: 1, at: new Date().toISOString(), source: 'none' };
  }

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}${encodeURIComponent(currency)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // 離線、DNS 失敗、逾時都走這裡。瀏覽器不會給更細的原因。
    throw new Error('連不上匯率服務');
  }

  if (!res.ok) throw new Error(`匯率服務回應 ${res.status}`);

  const data = (await res.json()) as ApiResponse;
  if (data.result !== 'success') throw new Error('匯率服務回報失敗');

  const rate = data.rates?.TWD;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`匯率服務沒有 ${currency} 對台幣的報價`);
  }

  return { rate, at: new Date().toISOString(), source: SOURCE };
}
