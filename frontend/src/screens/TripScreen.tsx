import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExpenseList } from '../components/ExpenseList';
import { ScreenHeader } from '../components/ScreenHeader';
import { SealResult } from '../components/SealResult';
import { StatsPanel } from '../components/StatsPanel';
import { TotalsPanel } from '../components/TotalsPanel';
import { fetchRateToTwd } from '../data/rates';
import {
  beginRevision,
  deleteExpense,
  deleteTrip,
  endRevision,
  getTrip,
  listExpenses,
  sealTrip,
  spanInDays,
  today,
  updateTrip,
} from '../data/repo';
import { prefersReducedMotion } from '../hooks/useCountUp';
import { NARROW, useMediaQuery } from '../hooks/useMediaQuery';
import { currencyLabel } from '../domain/currencies';
import { tripTotals } from '../domain/money';
import { isRevising, type Category, type Expense, type PaymentMethod, type Trip } from '../domain/types';
import s from './TripScreen.module.css';

export function TripScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [deleteArmed, setDeleteArmed] = useState(false);
  /* 封存也是兩段式確認。封存後沒有「變回進行中」的路（使用者 2026-11-11 拿掉了
     解除封存），所以誤觸要在這裡擋，不是事後救。 */
  const [sealArmed, setSealArmed] = useState(false);
  /* 結算演出只在「剛按下封存」那一次播。是畫面上的暫時狀態，不存進資料——
     之後再打開這個存檔就直接是結算畫面。 */
  const [showResult, setShowResult] = useState(false);
  /* 點圓餅切片選的分類、點長條選的付款方式。只影響下方明細，
     圖表本身永遠顯示完整占比——否則點一下圖就只剩一片，沒得比了。

     兩個篩選各自獨立、同時成立就是交集。刻意不做成「選一個就清掉另一個」：
     那會讓使用者點了付款方式、分類的高亮卻無聲消失。 */
  const [filter, setFilter] = useState<Category | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<PaymentMethod | null>(null);
  const [busy, setBusy] = useState<null | 'sealing' | 'retrying'>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  /* 手續費率的輸入框是獨立的字串狀態，不直接綁 trip.cardFeePct——
     清空輸入框時中間會經過空字串，直接寫進資料會變成 NaN。 */
  const [feePctText, setFeePctText] = useState('');
  /* 手機上封存／刪除要換到抬頭卡外面。這是少數 CSS 做不到的情況——
     元素得換父層，見 useMediaQuery 的說明。 */
  const narrow = useMediaQuery(NARROW);

  const load = useCallback(async () => {
    if (!id) return;
    const t = await getTrip(id);
    setTrip(t ?? null);
    setFeePctText(t ? String(t.cardFeePct) : '');
    setExpenses(t ? await listExpenses(t.id) : []);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (trip === undefined) {
    return (
      <>
        <ScreenHeader title="讀取中" sub="Loading" backTo="/saves" />
        <div className={s.body} />
      </>
    );
  }

  if (trip === null) {
    return (
      <>
        <ScreenHeader title="找不到存檔" sub="Not Found" backTo="/saves" />
        <div className={s.body}>
          <p className={s.todo}>這個存檔不存在，可能已經被刪除。</p>
        </div>
      </>
    );
  }

  const sealed = trip.status === 'archived';
  /* 修訂中：仍然是封存的（圖表、結束日、匯率照舊），只有明細可寫。
     所以底下「長什麼樣」看 sealed，「能不能改」看 writable，兩者不能混用。 */
  const revising = isRevising(trip);
  const writable = !sealed || revising;
  const dayCount = spanInDays(trip.startedOn, trip.endedOn ?? today());
  const totals = tripTotals(trip, expenses);
  const shown = expenses.filter(
    (e) =>
      (filter === null || e.category === filter) &&
      (paymentFilter === null || e.paymentMethod === paymentFilter),
  );

  /**
   * 封存：抓一次當日匯率凍結起來，把現金換算成台幣。
   *
   * 抓不到匯率**不會阻止封存**——標記待補，之後在結算畫面上按「現在抓匯率」補。
   * 這個 App 是離線優先的，不能因為沒網路就不准結束旅程。
   */
  async function onSeal() {
    if (!sealArmed) {
      setSealArmed(true);
      return;
    }
    setSealArmed(false);
    setBusy('sealing');
    setRateError(null);
    let rate = null;
    // 已經有凍結匯率就不重抓——那是當初的實際成本，重抓會蓋掉。
    if (trip!.sealRate === null) {
      try {
        rate = await fetchRateToTwd(trip!.currency);
      } catch (e) {
        setRateError(e instanceof Error ? e.message : '抓取匯率失敗');
      }
    }
    await sealTrip(trip!.id, rate);
    await load();
    setBusy(null);
    if (!prefersReducedMotion()) setShowResult(true);
  }

  async function onRetryRate() {
    setBusy('retrying');
    setRateError(null);
    try {
      const r = await fetchRateToTwd(trip!.currency);
      await updateTrip(trip!.id, { sealRate: r.rate, sealRateAt: r.at, sealRateSource: r.source });
      await load();
    } catch (e) {
      setRateError(e instanceof Error ? e.message : '抓取匯率失敗');
    }
    setBusy(null);
  }

  async function onBeginRevision() {
    await beginRevision(trip!.id);
    await load();
  }

  async function onEndRevision() {
    await endRevision(trip!.id);
    await load();
  }

  /**
   * 離開輸入框才寫入，不是邊打邊寫——打到一半的「1.」「」會變成 NaN。
   *
   * 認不得的值退回原本的，不寫 0：使用者多半是打錯或清空，
   * 默默當成 0 會讓整趟的手續費無聲消失。
   */
  async function onFeePctCommit() {
    const n = Number(feePctText);
    if (feePctText.trim() === '' || !Number.isFinite(n) || n < 0) {
      setFeePctText(String(trip!.cardFeePct));
      return;
    }
    if (n === trip!.cardFeePct) return;
    await updateTrip(trip!.id, { cardFeePct: n });
    await load();
  }

  async function onDeleteExpense(expenseId: string) {
    await deleteExpense(expenseId);
    await load();
  }

  async function onDeleteTrip() {
    // 兩段式確認：連同底下所有花費一起刪，沒有復原。
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    await deleteTrip(trip!.id);
    nav('/saves', { replace: true });
  }

  /* 存檔層級的動作。只建一份，兩個位置共用——複製一份用 CSS 藏起來的話，
     輔助技術會讀到兩組一樣的按鈕。 */
  const actionButtons = (
    <>
      {revising ? (
        <button type="button" className={`btnPri ${s.headBtn}`} onClick={onEndRevision}>
          完成修改
        </button>
      ) : sealed ? (
        <button type="button" className={`btnGhost ${s.headBtn}`} onClick={onBeginRevision}>
          修改紀錄
        </button>
      ) : (
        <button
          type="button"
          className={`btnGhost ${s.headBtn}`}
          onClick={onSeal}
          onBlur={() => setSealArmed(false)}
          disabled={busy !== null}
        >
          {busy !== 'sealing'
            ? sealArmed
              ? '再按一次確認封存'
              : '結束旅程並封存'
            : trip.sealRate === null
              ? '抓取匯率並封存中…'
              : '封存中…'}
        </button>
      )}
      <button
        type="button"
        className={`btnGhost ${s.headBtn} ${s.danger}`}
        onClick={onDeleteTrip}
        onBlur={() => setDeleteArmed(false)}
      >
        {deleteArmed ? '再按一次確認刪除' : '刪除存檔'}
      </button>
    </>
  );

  return (
    <>
      <ScreenHeader
        title={revising ? '修訂中' : sealed ? '結算畫面' : '存檔'}
        sub={revising ? 'Revising' : sealed ? 'Result' : 'In Progress'}
        backTo="/saves"
      />
      {showResult && sealed && (
        <SealResult
          trip={trip}
          totals={totals}
          dayCount={dayCount}
          onDone={() => setShowResult(false)}
        />
      )}
      <div className={s.body}>
        <div className={`${s.head} ${sealed ? s.sealedHead : ''}`}>
          <span className="hudLabel">
            {currencyLabel(trip.currency)} · {revising ? '已封存 · 修訂中' : sealed ? '已封存' : '進行中'}
          </span>
          {/* 寬畫面時動作跟名稱同一列；窄畫面時整組移到抬頭卡外面自成一列，
              見下方 narrow 的分支。 */}
          <div className={s.nameRow}>
            <h1 className={s.name}>{trip.name}</h1>
            {!narrow && <div className={s.headActions}>{actionButtons}</div>}
          </div>
          <div className={s.readouts}>
            <div className={s.readout}>
              <span className="hudLabel">出發</span>
              <span className={s.value}>{trip.startedOn}</span>
            </div>
            <div className={s.readout}>
              <span className="hudLabel">{sealed ? '結束' : '天數'}</span>
              <span className={s.value}>{sealed ? trip.endedOn : `${dayCount} 天`}</span>
            </div>
            <div className={s.readout}>
              <span className="hudLabel">紀錄</span>
              <span className={s.value}>{totals.entryCount} 筆</span>
            </div>
          </div>
        </div>

        {/* 窄畫面：動作移到抬頭卡與花費總計之間自成一列。
            擠在名稱旁邊時，名稱一長版面就塌，字也被迫縮到很小。 */}
        {narrow && <div className={s.standaloneActions}>{actionButtons}</div>}

        {writable && (
          <button
            type="button"
            className={`btnPri ${s.addBtn}`}
            onClick={() => nav(`/trip/${trip.id}/add`)}
          >
            {revising ? '＋ 補記一筆' : '＋ 記帳'}
          </button>
        )}

        <TotalsPanel
          trip={trip}
          totals={totals}
          onRetryRate={onRetryRate}
          retrying={busy === 'retrying'}
        />

        {rateError && (
          <p className="errorText">
            {rateError}。{sealed ? '存檔已封存，匯率標記為待補。' : ''}
          </p>
        )}

        {/* 海外刷卡手續費率。封存後唯讀——改它會動到已凍結的總額，
            跟封存匯率同一條理由。要改就先進修訂模式。 */}
        {writable && (
          <label className={s.feePct}>
            <span className="hudLabel">海外刷卡手續費</span>
            <span className={s.feePctInput}>
              <input
                type="number"
                className="input"
                inputMode="decimal"
                min={0}
                max={10}
                step={0.1}
                value={feePctText}
                onChange={(e) => setFeePctText(e.target.value)}
                onBlur={onFeePctCommit}
                aria-label="海外刷卡手續費率，百分比"
              />
              <span className={s.feePctUnit}>%</span>
            </span>
          </label>
        )}

        {/* 統計只在封存後出現：有凍結匯率才能把外幣現金與台幣放進同一個圓餅。 */}
        {sealed && (
          <StatsPanel
            trip={trip}
            expenses={expenses}
            selected={filter}
            onSelect={setFilter}
            selectedPayment={paymentFilter}
            onSelectPayment={setPaymentFilter}
          />
        )}

        <div className={s.listHead}>
          <span className="hudLabel">明細 · Entries</span>
          {/* 篩選提示放在這裡而不是圖表裡：解除封存後圖表會消失，
              篩選還留著，沒有這幾顆按鈕就沒辦法取消。
              兩個篩選各給一顆，筆數只報一次——那是交集後的結果，
              掛在任何一顆上都會讓人以為是那個條件單獨的筆數。 */}
          {filter && (
            <button type="button" className={s.filterChip} onClick={() => setFilter(null)}>
              種類：{filter}
              <span aria-hidden>✕</span>
            </button>
          )}
          {paymentFilter && (
            <button type="button" className={s.filterChip} onClick={() => setPaymentFilter(null)}>
              付款：{paymentFilter}
              <span aria-hidden>✕</span>
            </button>
          )}
          {(filter || paymentFilter) && <span className={s.filterCount}>{shown.length} 筆</span>}
        </div>
        <ExpenseList
          trip={trip}
          expenses={shown}
          readOnly={!writable}
          filtered={filter !== null || paymentFilter !== null}
          onDelete={onDeleteExpense}
          onEdit={(expenseId) => nav(`/trip/${trip.id}/edit/${expenseId}`)}
        />

      </div>
    </>
  );
}
