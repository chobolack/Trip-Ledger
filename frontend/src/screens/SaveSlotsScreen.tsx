import { useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';
import { useTripSummaries } from '../hooks/useTripSummaries';
import { currencyLabel } from '../domain/currencies';
import type { TripSummary } from '../data/repo';
import { isRevising } from '../domain/types';
import s from './SaveSlotsScreen.module.css';

/**
 * 存檔列表。進行中可讀寫並置頂；已封存是唯讀成績單。
 *
 * 列表只顯示筆數與天數，金額留到存檔內頁。
 * 原因是花費有「確定台幣」與「外幣現金」兩個不相加的數字
 * （見 docs/規格.md〈最終呈現〉），擠進一行存檔格只會看不懂。
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

function Slot({ summary, index }: { summary: TripSummary; index: number }) {
  const nav = useNavigate();
  const { trip, entryCount, dayCount } = summary;
  const sealed = summary.status === 'archived';

  return (
    <button
      type="button"
      className={`${s.slot} ${sealed ? s.sealed : ''}`}
      onClick={() => nav(`/trip/${trip.id}`)}
    >
      <span className={s.slotTop}>
        <span className="hudLabel">SLOT {String(index + 1).padStart(2, '0')}</span>
        <span className={`${s.badge} ${sealed ? s.badgeSealed : s.badgeActive}`}>
          {isRevising(trip) ? '修訂中' : sealed ? '唯讀' : '進行中'}
        </span>
      </span>
      <span className={s.name}>{trip.name}</span>
      <span className={s.meta}>
        <span>{currencyLabel(trip.currency)}</span>
        <span>
          <span className={s.metaKey}>起 </span>
          {trip.startedOn}
        </span>
        <span>
          <span className={s.metaKey}>{sealed ? '共 ' : '第 '}</span>
          {dayCount}
          <span className={s.metaKey}> 天</span>
        </span>
        <span>
          {entryCount}
          <span className={s.metaKey}> 筆</span>
        </span>
      </span>
    </button>
  );
}
