import { currencyName } from '../domain/currencies';
import { fmt, fmtTwd, isDomestic, type TripTotals } from '../domain/money';
import type { Trip } from '../domain/types';
import s from './TotalsPanel.module.css';

interface Props {
  trip: Trip;
  totals: TripTotals;
  /** 匯率待補時重抓。只有封存且沒抓到匯率的存檔會用到。 */
  onRetryRate?: () => void;
  retrying?: boolean;
}

/**
 * 花費總計。
 *
 * 呈現規則來自原使用者：**確定台幣花費與外幣現金花費是兩個不相加的數字**。
 * 刷卡與轉帳的帳單本來就是台幣，不需換算；外幣現金維持原幣顯示。
 * 要合成一個總額，得有匯率——而匯率只在封存那一刻抓一次並凍結。
 *
 * 使用者已表示這個呈現方式大概率會改，所以這裡只負責顯示，
 * 加總邏輯全在 domain/money.ts，改的時候不用動這個檔案的計算。
 */
export function TotalsPanel({ trip, totals, onRetryRate, retrying }: Props) {
  const domestic = isDomestic(trip);
  const sealed = trip.status === 'archived';
  const { twdConfirmed, foreignSpent, foreignAsTwd, grandTotalTwd } = totals;

  // 整趟台幣的存檔沒有外幣，一個數字就說完了。
  if (domestic) {
    return (
      <div className={s.panel}>
        <span className={`hudLabel ${s.panelTitle}`}>花費總計 · Total</span>
        <div className={s.block}>
          <span className="hudLabel">總花費</span>
          <div className={s.figure}>
            <span className={`${s.big} ${s.twd}`}>{fmtTwd(twdConfirmed)}</span>
          </div>
          <p className={s.note}>整趟都是台幣，不需要換算</p>
        </div>
      </div>
    );
  }

  return (
    <div className={s.panel}>
      <span className={`hudLabel ${s.panelTitle}`}>花費總計 · Total</span>

      <div className={s.block}>
        <span className="hudLabel">確定台幣花費</span>
        <div className={s.figure}>
          <span className={`${s.big} ${s.twd}`}>{fmtTwd(twdConfirmed)}</span>
        </div>
        <p className={s.note}>刷卡與轉帳在付款當下就換好匯了，帳單直接是台幣</p>
      </div>

      <div className={s.block}>
        <span className="hudLabel">{currencyName(trip.currency)}現金花費</span>
        <div className={s.figure}>
          <span className={`${s.big} ${s.foreign}`}>
            {trip.currency} {fmt(foreignSpent)}
          </span>
          {foreignAsTwd !== null && (
            <span className={s.derived}>≈ {fmtTwd(foreignAsTwd)}</span>
          )}
        </div>
        <p className={s.note}>
          {/* 解除封存不清匯率，所以進行中的存檔也可能已經有匯率。 */}
          {trip.sealRate !== null && trip.sealRateAt
            ? `${sealed ? '封存匯率' : '沿用上次封存的匯率'} 1 ${trip.currency} = ${trip.sealRate} TWD · ${trip.sealRateAt.slice(0, 10)} 抓取`
            : sealed
              ? '封存時沒抓到匯率'
              : '封存時會自動抓當日匯率換算'}
        </p>
      </div>

      {grandTotalTwd !== null && (
        <div className={s.grand}>
          <div className={s.grandRow}>
            <span className="hudLabel">完整總額</span>
            <span className={s.grandValue}>{fmtTwd(grandTotalTwd)}</span>
          </div>
        </div>
      )}

      {sealed && trip.sealRate === null && (
        <div className={s.pending}>
          <p className={s.pendingText}>
            匯率待補——封存時連不上匯率服務，所以現金部分還沒換算成台幣。
          </p>
          <button type="button" className="btnGhost" onClick={onRetryRate} disabled={retrying}>
            {retrying ? '抓取中…' : '現在抓匯率'}
          </button>
        </div>
      )}
    </div>
  );
}
