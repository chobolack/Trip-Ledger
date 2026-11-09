import { useEffect, useRef, useState } from 'react';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  applyBackup,
  backupFilename,
  buildBackup,
  dataStats,
  parseBackup,
  type ImportResult,
} from '../data/backup';
import { downloadText } from '../data/download';
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
export function DataScreen() {
  const [stats, setStats] = useState<{ trips: number; expenses: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setStats(await dataStats());
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
    } catch (e) {
      setError(e instanceof Error ? `匯出失敗：${e.message}` : '匯出失敗。');
    }
    setBusy(false);
  }

  async function onPick(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const backup = parseBackup(await file.text());
      setResult(await applyBackup(backup));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '匯入失敗。');
    }
    setBusy(false);
    // 清掉值，這樣連選同一個檔案兩次也會觸發 change。
    if (fileRef.current) fileRef.current.value = '';
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
              {result.skipped > 0 && `、略過 ${result.skipped} 筆（本機版本較新）`}。
            </p>
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
