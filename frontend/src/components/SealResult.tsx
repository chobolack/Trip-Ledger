import { useEffect } from 'react';
import { CountUp } from './CountUp';
import { fmt, fmtTwd, isDomestic, type TripTotals } from '../domain/money';
import type { Trip } from '../domain/types';
import s from './SealResult.module.css';

interface Props {
  trip: Trip;
  totals: TripTotals;
  dayCount: number;
  onDone: () => void;
}

/** 各行進場的時間點（毫秒）。數字的滾動跟著同一張表走，行出現時才開始滾。 */
const AT = { days: 350, entries: 550, money: 750, hint: 1500 };

/**
 * 封存當下的結算演出（使用者 2026-11-12 指定）。
 *
 * **只在剛按下封存的那一次播**，由 TripScreen 控制；之後再打開這個存檔
 * 直接就是結算畫面，不會每次都演一遍。
 *
 * 全程不到兩秒，而且隨時點一下（或按任意鍵）就跳過——演出是獎勵，不是關卡。
 *
 * 這裡顯示的數字跟底下的花費總計是同一份 `totals`，沒有另外算。
 * 沒抓到匯率時合不出單一總額，就照總計區的規矩把台幣與外幣分開列。
 */
export function SealResult({ trip, totals, dayCount, onDone }: Props) {
  useEffect(() => {
    const onKey = () => onDone();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const domestic = isDomestic(trip);
  const grand = domestic ? totals.twdConfirmed + totals.cardFeeTwd : totals.grandTotalTwd;
  const delay = (ms: number) => ({ animationDelay: `${ms}ms` });

  return (
    <div className={s.overlay} role="dialog" aria-label="旅程結算" onClick={onDone}>
      <div className={s.box}>
        <p className={s.kicker}>Journey Complete</p>
        <h2 className={s.title}>RESULT</h2>
        <p className={s.name}>{trip.name}</p>

        <dl className={s.rows}>
          <div className={s.row} style={delay(AT.days)}>
            <dt className="hudLabel">天數</dt>
            <dd className={s.value}>
              <CountUp value={dayCount} format={(n) => `${fmt(n)} 天`} delay={AT.days} />
            </dd>
          </div>
          <div className={s.row} style={delay(AT.entries)}>
            <dt className="hudLabel">紀錄</dt>
            <dd className={s.value}>
              <CountUp value={totals.entryCount} format={(n) => `${fmt(n)} 筆`} delay={AT.entries} />
            </dd>
          </div>

          {grand !== null ? (
            <div className={`${s.row} ${s.rowGrand}`} style={delay(AT.money)}>
              <dt className="hudLabel">完整總額</dt>
              <dd className={`${s.value} ${s.grand}`}>
                <CountUp value={grand} format={fmtTwd} duration={800} delay={AT.money} />
              </dd>
            </div>
          ) : (
            <>
              <div className={s.row} style={delay(AT.money)}>
                <dt className="hudLabel">台幣</dt>
                <dd className={s.value}>
                  <CountUp value={totals.twdConfirmed} format={fmtTwd} delay={AT.money} />
                </dd>
              </div>
              <div className={s.row} style={delay(AT.money + 150)}>
                <dt className="hudLabel">{trip.currency}</dt>
                <dd className={`${s.value} ${s.foreign}`}>
                  <CountUp
                    value={totals.foreignSpent}
                    format={(n) => `${trip.currency} ${fmt(n)}`}
                    delay={AT.money + 150}
                  />
                </dd>
              </div>
            </>
          )}
        </dl>

        <p className={s.hint} style={delay(AT.hint)}>
          ▶ 點任意處繼續
        </p>
      </div>
    </div>
  );
}
