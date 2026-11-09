import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExpenseList } from '../components/ExpenseList';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatsPanel } from '../components/StatsPanel';
import { TotalsPanel } from '../components/TotalsPanel';
import { fetchRateToTwd } from '../data/rates';
import {
  deleteExpense,
  deleteTrip,
  getTrip,
  listExpenses,
  sealTrip,
  spanInDays,
  today,
  unsealTrip,
  updateTrip,
} from '../data/repo';
import { downloadText } from '../data/download';
import { currencyLabel } from '../domain/currencies';
import { csvFilename, toCsv } from '../domain/csv';
import { tripTotals } from '../domain/money';
import type { Category, Expense, Trip } from '../domain/types';
import s from './TripScreen.module.css';

export function TripScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [deleteArmed, setDeleteArmed] = useState(false);
  /** 點圓餅切片選的分類，只影響下方明細；圓餅本身永遠顯示完整占比。 */
  const [filter, setFilter] = useState<Category | null>(null);
  const [busy, setBusy] = useState<null | 'sealing' | 'retrying'>(null);
  const [rateError, setRateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const t = await getTrip(id);
    setTrip(t ?? null);
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
  const dayCount = spanInDays(trip.startedOn, trip.endedOn ?? today());
  const totals = tripTotals(trip, expenses);
  const shown = filter ? expenses.filter((e) => e.category === filter) : expenses;

  /**
   * 封存：抓一次當日匯率凍結起來，把現金換算成台幣。
   *
   * 抓不到匯率**不會阻止封存**——標記待補，之後在成績單上按「現在抓匯率」補。
   * 這個 App 是離線優先的，不能因為沒網路就不准結束旅程。
   */
  async function onSeal() {
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

  async function onUnseal() {
    await unsealTrip(trip!.id);
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

  return (
    <>
      <ScreenHeader
        title={sealed ? '唯讀成績單' : '存檔'}
        sub={sealed ? 'Sealed' : 'In Progress'}
        backTo="/saves"
      />
      <div className={s.body}>
        <div className={`${s.head} ${sealed ? s.sealedHead : ''}`}>
          <span className="hudLabel">
            {currencyLabel(trip.currency)} · {sealed ? '已封存' : '進行中'}
          </span>
          <h1 className={s.name}>{trip.name}</h1>
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

        {!sealed && (
          <button
            type="button"
            className={`btnPri ${s.addBtn}`}
            onClick={() => nav(`/trip/${trip.id}/add`)}
          >
            ＋ 記帳
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

        {/* 統計只在封存後出現：有凍結匯率才能把外幣現金與台幣放進同一個圓餅。 */}
        {sealed && (
          <StatsPanel
            trip={trip}
            expenses={expenses}
            selected={filter}
            onSelect={setFilter}
          />
        )}

        <div className={s.listHead}>
          <span className="hudLabel">明細 · Entries</span>
          {/* 篩選提示放在這裡而不是圓餅圖裡：解除封存後圓餅圖會消失，
              篩選還留著，沒有這顆按鈕就沒辦法取消。 */}
          {filter && (
            <button type="button" className={s.filterChip} onClick={() => setFilter(null)}>
              只顯示「{filter}」{shown.length} 筆
              <span aria-hidden>✕</span>
            </button>
          )}
        </div>
        <ExpenseList
          trip={trip}
          expenses={shown}
          readOnly={sealed}
          filtered={filter !== null}
          onDelete={onDeleteExpense}
        />

        <div className={s.actions}>
          {/* 匯出的是整份明細，不受上面的分類篩選影響。 */}
          <button
            type="button"
            className="btnGhost"
            onClick={() => downloadText(csvFilename(trip), toCsv(trip, expenses), 'text/csv')}
            disabled={expenses.length === 0}
          >
            匯出 CSV
          </button>
          {sealed ? (
            <button type="button" className="btnGhost" onClick={onUnseal}>
              解除封存
            </button>
          ) : (
            <button type="button" className="btnGhost" onClick={onSeal} disabled={busy !== null}>
              {busy !== 'sealing'
                ? '結束旅程並封存'
                : trip.sealRate === null
                  ? '抓取匯率並封存中…'
                  : '封存中…'}
            </button>
          )}
          <button
            type="button"
            className={`btnGhost ${s.danger}`}
            onClick={onDeleteTrip}
            onBlur={() => setDeleteArmed(false)}
          >
            {deleteArmed ? '再按一次確認刪除' : '刪除存檔'}
          </button>
        </div>
      </div>
    </>
  );
}
