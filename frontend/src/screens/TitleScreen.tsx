import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MenuButton } from '../components/MenuButton';
import { useOnline } from '../hooks/useOnline';
import { useTripSummaries } from '../hooks/useTripSummaries';
import s from './TitleScreen.module.css';

/**
 * 這次開啟 App 是不是直接落在標題畫面，而且還沒處理過自動跳轉。
 *
 * 模組載入時（＝App 啟動那一刻）算一次。之後不管成不成功跳轉都會被關掉，
 * 所以同一次開啟期間使用者自己按返回走到標題畫面時，不會又被彈回存檔頁——
 * 否則標題畫面就永遠到不了，備份入口也跟著消失。
 *
 * 啟動時網址若已經指向別的畫面（重新整理、書籤），就尊重那個網址，不跳。
 */
let launchRedirectPending = ['', '#', '#/'].includes(window.location.hash);

/**
 * 標題畫面。使用者指定只有兩個按鈕。
 *
 * 有進行中的旅程時，第一顆從「新存檔」變成「繼續旅程」（使用者 2026-11-11 指定）
 * ——還是兩顆，不是多開第三顆。而且剛開啟 App 時會直接跳進那個存檔：
 * 旅途中打開它九成九是要記帳，不該每次都先過一次標題畫面。
 *
 * 代價：有進行中的旅程時，從這裡建不了新存檔，要先把那趟封存。
 */
export function TitleScreen() {
  const nav = useNavigate();
  const online = useOnline();
  const { summaries, loading } = useTripSummaries();

  /* 列表已經排成進行中置頂、出發日新到舊，所以同時有好幾個進行中時
     這裡拿到的是最近出發的那一趟。其餘的從「過往存檔」進去。 */
  const active = summaries.find((x) => x.status === 'active');
  const activeId = active?.trip.id;

  useEffect(() => {
    if (loading || !launchRedirectPending) return;
    launchRedirectPending = false;
    /* 不用 replace：留著標題畫面這筆歷史，手機的返回手勢才回得來。 */
    if (activeId) nav(`/trip/${activeId}`);
  }, [loading, activeId, nav]);

  /* 等著跳轉的那一瞬間先不畫，免得標題畫面閃一下又被換掉。 */
  if (launchRedirectPending && (loading || activeId)) return null;

  return (
    <div className={s.wrap}>
      <div className={s.topBar}>
        <span className="hudLabel">
          <span className={`${s.dot} ${online ? '' : s.dotOffline}`} />
          {online ? '連線中' : '離線模式'}
        </span>
        {/* 備份入口放在狀態列，不放主選單——使用者指定主畫面只有兩個按鈕。
            但它必須在標題畫面構得到：新裝置一筆資料都沒有，
            「過往存檔」是停用的，匯入的入口不能藏在它後面。 */}
        <button type="button" className={s.dataBtn} onClick={() => nav('/data')}>
          <span className="hudLabel">備份 · BACKUP</span>
        </button>
      </div>

      <div className={s.center}>
        <div className={s.titleBlock}>
          <p className={s.zhTitle}>旅費記帳</p>
          <h1 className={s.enTitle}>TRIP LEDGER</h1>
          <div className={s.rule}>
            <span className={s.ruleLine} />
            <span className={s.ruleTick} />
            <span className={s.ruleLine} />
          </div>
        </div>

        <nav className={s.menu}>
          {active ? (
            <MenuButton
              label="繼續旅程"
              sub="Continue"
              onClick={() => nav(`/trip/${active.trip.id}`)}
            />
          ) : (
            <MenuButton
              label="新存檔"
              sub="New Save"
              /* 還不知道有沒有進行中的旅程時先停用，免得讀完之後按鈕在手指底下換掉。 */
              disabled={loading}
              onClick={() => nav('/new')}
            />
          )}
          <MenuButton
            label="過往存檔"
            sub="Load Save"
            note={loading ? '' : String(summaries.length)}
            disabled={!loading && summaries.length === 0}
            onClick={() => nav('/saves')}
          />
        </nav>
      </div>

      <div className={s.bottom}>
        <span className="hudLabel">
          {loading
            ? '讀取本機資料…'
            : active
              ? `進行中：${active.trip.name} · 第 ${active.dayCount} 天`
              : summaries.length > 0
                ? '沒有進行中的旅程'
                : '尚無存檔'}
        </span>
      </div>
    </div>
  );
}
