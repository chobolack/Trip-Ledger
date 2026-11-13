import { useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';
import { useTripSummaries } from '../hooks/useTripSummaries';
import { currencyLabel } from '../domain/currencies';
import { fmt, fmtTwd, isDomestic } from '../domain/money';
import type { TripSummary } from '../data/repo';
import { isRevising } from '../domain/types';
import s from './SaveSlotsScreen.module.css';

/**
 * 存檔列表。進行中可讀寫並置頂；已封存是唯讀結算畫面。
 *
 * 每一格做成遊戲的存檔欄（使用者 2026-11-12 指定試做）：左邊是檔案編號，
 * 右邊是名稱、期間、每天一格的記帳足跡、金額與最後存檔時間。
 *
 * 金額照存檔內頁的規矩：封存且有匯率的顯示單一總額；
 * 其餘（進行中、匯率待補）台幣與外幣是兩個不相加的數字
 * （見 docs/規格.md〈最終呈現〉），所以分開列，不硬湊成一個。
 */
export function SaveSlotsScreen() {
  const { summaries, loading, error } = useTripSummaries();

  const activeOnes = summaries.filter((x) => x.status === 'active');
  const sealedOnes = summaries.filter((x) => x.status === 'archived');

  return (
    <>
      <ScreenHeader title="過往存檔" sub="Load Save" backTo="/" />
      <div className={s.body}>
        {loading && <p className={s.empty}>讀取本機資料…</p>}
        {error && <p className={s.empty}>讀取失敗：{error}</p>}

        {!loading && !error && summaries.length === 0 && (
          <p className={s.empty}>還沒有任何存檔。回標題畫面按「新存檔」開始。</p>
        )}

        {activeOnes.length > 0 && (
          <>
            <div className={s.groupLabel}>
              <span className="hudLabel">進行中 · In Progress</span>
            </div>
            <div className={s.slots}>
              {activeOnes.map((x, i) => (
                <Slot key={x.trip.id} summary={x} index={i} />
              ))}
            </div>
          </>
        )}

        {sealedOnes.length > 0 && (
          <>
            <div className={s.groupLabel}>
              <span className="hudLabel">已封存 · Sealed</span>
            </div>
            <div className={s.slots}>
              {sealedOnes.map((x, i) => (
                <Slot key={x.trip.id} summary={x} index={activeOnes.length + i} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** `2026-05-01` → `2026/05/01`。 */
const slash = (date: string) => date.replace(/-/g, '/');

/** 期間。同一年的結束日省略年份，不然一行塞不下。 */
function rangeLabel(startedOn: string, endedOn: string | null): string {
  if (!endedOn) return `${slash(startedOn)} → 進行中`;
  const end = endedOn.slice(0, 4) === startedOn.slice(0, 4) ? endedOn.slice(5) : endedOn;
  return `${slash(startedOn)} → ${slash(end)}`;
}

/** 最後存檔時間，本地時間 `YYYY/MM/DD HH:mm`。 */
function savedAtLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Slot({ summary, index }: { summary: TripSummary; index: number }) {
  const nav = useNavigate();
  const { trip, entryCount, dayCount, totals, days, lastSavedAt, budget } = summary;
  const sealed = summary.status === 'archived';
  const domestic = isDomestic(trip);

  /* 能不能用一個數字講完。整趟台幣的一定可以；有外幣的要封存且抓到匯率才行。
     進行中的存檔即使帶著舊匯率也分開列——那個匯率還不是最終的。 */
  const single = domestic
    ? totals.twdConfirmed + totals.cardFeeTwd
    : sealed
      ? totals.grandTotalTwd
      : null;

  return (
    <button
      type="button"
      className={`${s.slot} ${sealed ? s.sealed : ''}`}
      onClick={() => nav(`/trip/${trip.id}`)}
    >
      <span className={s.frame} aria-hidden />

      {/* 左側的檔案編號，存檔畫面的招牌。純裝飾，名稱才是真正的識別。 */}
      <span className={s.fileNo} aria-hidden>
        <span className={s.fileNoLabel}>FILE</span>
        <span className={s.fileNoNum}>{String(index + 1).padStart(2, '0')}</span>
      </span>

      <span className={s.slotBody}>
        <span className={s.slotTop}>
          <span className={s.name}>{trip.name}</span>
          <span className={`${s.badge} ${sealed ? s.badgeSealed : s.badgeActive}`}>
            {isRevising(trip) ? '修訂中' : sealed ? '已封存' : '進行中'}
          </span>
        </span>

        <span className={s.meta}>
          <span>{currencyLabel(trip.currency)}</span>
          <span>{rangeLabel(trip.startedOn, trip.endedOn)}</span>
        </span>

        {/* 記帳足跡：旅程每天一格，有記帳的亮、沒記的暗。
            進行中的最後一格是今天，會閃——游標停在這裡的意思。 */}
        {days && (
          <span
            className={s.pips}
            role="img"
            aria-label={`${dayCount} 天中有 ${days.filter(Boolean).length} 天有記帳`}
          >
            {days.map((on, i) => (
              <span
                key={i}
                className={[
                  s.pip,
                  on ? s.pipOn : '',
                  !sealed && i === days.length - 1 ? s.pipNow : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            ))}
          </span>
        )}

        <span className={s.stats}>
          <span className={s.counts}>
            {sealed ? '共 ' : '第 '}
            <b>{dayCount}</b> 天 · <b>{entryCount}</b> 筆
          </span>
          <span className={s.money}>
            {single !== null ? (
              fmtTwd(single)
            ) : (
              <>
                {fmtTwd(totals.twdConfirmed)}
                <span className={s.moneyForeign}>
                  ＋{trip.currency} {fmt(totals.foreignSpent)}
                </span>
              </>
            )}
          </span>
        </span>

        <span className={s.foot}>
          <span className={s.lastSave}>Last Save {savedAtLabel(lastSavedAt)}</span>
          {/* 封存後才給預算的結論（使用者 2026-11-13 指定），放在總額正下方。
              進行中的不顯示——那時是估算值而且還在變，內頁的進度條才是看那個的地方。
              封存時沒抓到匯率的話結論還是估算的，前面標「約」。 */}
          {sealed && budget && budget.remainingTwd !== null && (
            <span className={`${s.budget} ${budget.remainingTwd < 0 ? s.budgetOver : ''}`}>
              {budget.remainingTwd < 0 ? '超出 ' : '剩餘 '}
              {budget.estimated ? '約 ' : ''}
              {fmtTwd(Math.abs(budget.remainingTwd))}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
