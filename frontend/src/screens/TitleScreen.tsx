import { useNavigate } from 'react-router-dom';
import { MenuButton } from '../components/MenuButton';
import { useOnline } from '../hooks/useOnline';
import { useTripSummaries } from '../hooks/useTripSummaries';
import s from './TitleScreen.module.css';

/**
 * 標題畫面。使用者指定只有兩個按鈕：新存檔、過往存檔。
 *
 * 進行中的旅程不另開第三個「繼續」按鈕，而是在「過往存檔」列表裡置頂。
 */
export function TitleScreen() {
  const nav = useNavigate();
  const online = useOnline();
  const { summaries, loading } = useTripSummaries();

  const active = summaries.find((x) => x.status === 'active');

  return (
    <div className={s.wrap}>
      <div className={s.topBar}>
        <span className="hudLabel">
          <span className={`${s.dot} ${online ? '' : s.dotOffline}`} />
          {online ? '連線中' : '離線模式'}
        </span>
        <span className="hudLabel">LOCAL&nbsp;STORE&nbsp;·&nbsp;V0.1</span>
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
          <MenuButton label="新存檔" sub="New Save" onClick={() => nav('/new')} />
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
