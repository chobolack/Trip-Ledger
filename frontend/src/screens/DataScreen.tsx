import { useEffect, useRef, useState } from 'react';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  applyBackup,
  backupFilename,
  buildBackup,
  dataStats,
  parseBackup,
  type Backup,
  type ImportResult,
} from '../data/backup';
import { buildTripBackup } from '../data/backup';
import { getLastBackupAt, markBackedUp, markTripBackedUp } from '../data/backupMark';
import { downloadText } from '../data/download';
import { getTrip, listExpenses, listTrips } from '../data/repo';
import { csvFilename, toCsv } from '../domain/csv';
import type { Trip } from '../domain/types';
import s from './DataScreen.module.css';

/**
 * 備份與還原。
 *
 * 從標題畫面的頂部狀態列進來，不佔主選單——
 * 使用者指定主畫面只有「新存檔」與「過往存檔」兩個按鈕。
 *
 * 一定要從標題畫面進得來：全新的裝置上一筆資料都沒有，
 * 「過往存檔」是停用狀態，匯入的入口不能藏在它後面。
 */
/** 2026/11/13 20:07 這種寫法，用裝置當地時間。 */
/** 日期與時間分開回傳：畫面上排成兩行（見下面「上次完整備份」）。 */
function formatStamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

export function DataScreen() {
  const [stats, setStats] = useState<{ trips: number; expenses: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  /** 留著剛解析過的備份，這樣要改用覆蓋模式時不必重選一次檔案。 */
  const [pending, setPending] = useState<Backup | null>(null);
  /** 單一存檔匯出用的清單與目前選擇。 */
  const [trips, setTrips] = useState<Trip[]>([]);
  const [picked, setPicked] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  /** 這台裝置上次下載完整備份的時間。主畫面的備份提醒看的就是它。 */
  const [lastBackupAt, setLastBackupAt] = useState(getLastBackupAt);

  async function refresh() {
    setStats(await dataStats());
    const rows = (await listTrips()).sort((a, b) => b.startedOn.localeCompare(a.startedOn));
    setTrips(rows);
    // 選擇停留在原本那個；它被刪掉或還沒選過才退回第一個。
    setPicked((cur) => (rows.some((t) => t.id === cur) ? cur : (rows[0]?.id ?? '')));
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onExport() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const backup = await buildBackup();
      downloadText(backupFilename(), JSON.stringify(backup), 'application/json');
      /* 瀏覽器不會告訴網頁檔案到底有沒有存成功，所以這裡記的是「按下去而且沒出錯」。 */
      markBackedUp();
      setLastBackupAt(getLastBackupAt());
    } catch (e) {
      setError(e instanceof Error ? `匯出失敗：${e.message}` : '匯出失敗。');
    }
    setBusy(false);
  }

  /** 單一存檔匯出成 JSON。格式與完整備份相同，匯得回來。 */
  async function onExportTripJson() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const backup = await buildTripBackup(picked);
      downloadText(
        backupFilename(backup.trips[0].name),
        JSON.stringify(backup),
        'application/json',
      );
      // 這一趟算備份過了（只有這一趟）。見 backupMark.ts。
      markTripBackedUp(picked);
    } catch (e) {
      setError(e instanceof Error ? `匯出失敗：${e.message}` : '匯出失敗。');
    }
    setBusy(false);
  }

  /** 單一存檔匯出成 CSV。給試算表看的，**匯不回來**。 */
  async function onExportTripCsv() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const trip = await getTrip(picked);
      if (!trip) throw new Error('找不到這個存檔。');
      downloadText(csvFilename(trip), toCsv(trip, await listExpenses(trip.id)), 'text/csv');
    } catch (e) {
      setError(e instanceof Error ? `匯出失敗：${e.message}` : '匯出失敗。');
    }
    setBusy(false);
  }

  async function onPick(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setPending(null);
    try {
      const backup = parseBackup(await file.text());
      setPending(backup);
      setResult(await applyBackup(backup));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '匯入失敗。');
    }
    setBusy(false);
    // 清掉值，這樣連選同一個檔案兩次也會觸發 change。
    if (fileRef.current) fileRef.current.value = '';
  }

  /** 以備份檔為準覆蓋。用於「我要的是這個檔案的狀態」——合併模式會留著本機較新的版本。 */
  async function onForce() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await applyBackup(pending, { force: true }));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '還原失敗。');
    }
    setBusy(false);
  }

  return (
    <>
      <ScreenHeader title="備份與還原" sub="Backup" backTo="/" />
      <div className={s.body}>
        <div className={s.panel}>
          <span className={`hudLabel ${s.panelTitle}`}>這台裝置 · This Device</span>
          <div className={s.stats}>
            <div className={s.stat}>
              <span className="hudLabel">存檔</span>
              <span className={s.statValue}>{stats ? stats.trips : '—'}</span>
            </div>
            <div className={s.stat}>
              <span className="hudLabel">花費紀錄</span>
              <span className={s.statValue}>{stats ? stats.expenses : '—'}</span>
            </div>
            <div className={s.stat}>
              <span className="hudLabel">上次完整備份</span>
              <span className={`${s.statValue} ${s.statValueSmall}`}>
                {/* 日期一行、時間一行（使用者 2026-11-14 指定）：排成一行的話
                    手機上這一格不夠寬，時間會超出畫面。 */}
                {lastBackupAt ? (
                  <>
                    {formatStamp(lastBackupAt).date}
                    <br />
                    {formatStamp(lastBackupAt).time}
                  </>
                ) : (
                  '還沒備份過'
                )}
              </span>
            </div>
          </div>
        </div>

        <div className={s.panel}>
          <span className={`hudLabel ${s.panelTitle}`}>匯出 · Export</span>
          <p className={s.desc}>
            下載一個 .json 檔，裡面是所有存檔與明細。
            這個檔案可以匯回來，也可以傳到另一台裝置匯入。
          </p>
          <div className={s.actions}>
            <button type="button" className="btnPri" onClick={onExport} disabled={busy}>
              下載完整備份
            </button>
          </div>

          <div className={s.sub}>
            <span className="hudLabel">單一存檔</span>
          </div>
          {trips.length === 0 ? (
            <p className={s.desc}>還沒有任何存檔。</p>
          ) : (
            <>
              <select
                className="input"
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
                disabled={busy}
              >
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}（{t.startedOn}）
                  </option>
                ))}
              </select>
              <div className={`${s.actions} ${s.actionsSpaced}`}>
                <button type="button" className="btnGhost" onClick={onExportTripJson} disabled={busy}>
                  JSON
                </button>
                <button type="button" className="btnGhost" onClick={onExportTripCsv} disabled={busy}>
                  CSV
                </button>
              </div>
              <p className={s.fine}>
                JSON 跟完整備份同格式，<b>匯得回來</b>；CSV 是給試算表看的，
                會丟掉紀錄編號與時間戳，<b>匯不回來</b>。
              </p>
            </>
          )}
        </div>

        <div className={s.panel}>
          <span className={`hudLabel ${s.panelTitle}`}>匯入 · Import</span>
          <p className={s.desc}>
            以紀錄編號比對合併，<b>不是覆蓋</b>——本機如果已經有同一筆而且更新過，
            會保留本機的版本。所以同一個檔案匯入兩次不會變成兩份。
          </p>
          <div className={s.actions}>
            <button
              type="button"
              className="btnGhost"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              選擇備份檔
            </button>
          </div>
          <input
            ref={fileRef}
            className={s.hidden}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
            }}
          />
          {result && (
            <p className={s.ok}>
              匯入完成：新增 {result.added} 筆、更新 {result.updated} 筆
              {result.skipped > 0 && `、略過 ${result.skipped} 筆`}
              {result.ignoredTombstones > 0 &&
                `、忽略 ${result.ignoredTombstones} 筆舊版的已刪除紀錄`}
              。
            </p>
          )}

          {/* 「略過」是合併模式下唯一會讓人意外的結果：本機版本不比檔案舊就不覆蓋，
              而使用者可能正是想拿這個檔案蓋掉手上這份（跟別人對帳就是這樣）。
              把原因講白，並給出那條路——否則他只看到「略過 67 筆」然後一頭霧水。 */}
          {result && result.skipped > 0 && (
            <div className={s.blocked}>
              <p className={s.blockedText}>
                略過的 <b>{result.skipped} 筆</b>，是這台裝置上已經有同樣或更新的版本，
                合併模式會留著比較新的那份，所以沒有被覆蓋。
                <br />
                如果你要的是「以這個檔案為準」——例如拿別人的檔案來核對——改用覆蓋模式。
              </p>
              <button type="button" className="btnPri" onClick={onForce} disabled={busy}>
                以備份檔為準覆蓋
              </button>
            </div>
          )}
          {error && <p className="errorText">{error}</p>}
        </div>

        <p className={s.warn}>
          <b>為什麼需要備份</b>
          <br />
          資料存在這個瀏覽器裡，不在雲端。
          換網址、換瀏覽器、換手機都看不到原本的資料，
          清除網站資料或解除安裝也會一起消失。
          出國前後各匯出一次，檔案放到雲端硬碟，是目前最可靠的保險。
        </p>
      </div>
    </>
  );
}
