import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';
import { createTrip, today } from '../data/repo';
import { CURRENCIES, DEFAULT_CURRENCY } from '../domain/currencies';
import s from './NewSaveScreen.module.css';

/**
 * 建立新存檔。
 *
 * 沒有匯率欄位，使用者 2026-11-09 指定「匯率不用加」。
 */
export function NewSaveScreen() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [startedOn, setStartedOn] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmedName = name.trim();

    if (!trimmedName) return setError('請給這趟旅程一個名稱。');
    if (!CURRENCIES.some((c) => c.code === currency)) return setError('請選擇外幣種類。');
    if (!startedOn) return setError('請選擇出發日期。');

    setError(null);
    setSaving(true);
    try {
      const trip = await createTrip({ name: trimmedName, currency, startedOn });
      nav(`/trip/${trip.id}`, { replace: true });
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? `建立失敗：${e.message}` : '建立失敗。');
    }
  }

  return (
    <>
      <ScreenHeader title="新存檔" sub="New Save" backTo="/" />
      <div className={s.body}>
        <div className={s.panel}>
          <span className={`hudLabel ${s.panelTitle}`}>旅程設定 · Setup</span>

          <div className="field">
            <span className="fieldLabel">
              <span className="hudLabel">存檔名稱</span>
            </span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：2027 東京"
              autoFocus
            />
          </div>

          <div className={s.pair}>
            <div className="field">
              <span className="fieldLabel">
                <span className="hudLabel">外幣種類</span>
              </span>
              <select
                className="input mono"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}　{c.code}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <span className="fieldLabel">
                <span className="hudLabel">出發日期</span>
              </span>
              <input
                type="date"
                className="input mono"
                value={startedOn}
                onChange={(e) => setStartedOn(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="errorText">{error}</p>}

          <div className={s.actions}>
            <button type="button" className="btnPri" onClick={submit} disabled={saving}>
              {saving ? '建立中…' : '建立存檔'}
            </button>
            <button type="button" className="btnGhost" onClick={() => nav('/')} disabled={saving}>
              取消
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
