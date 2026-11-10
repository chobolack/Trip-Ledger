import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';
import { addExpense, getTrip, today } from '../data/repo';
import { currencyName } from '../domain/currencies';
import { fmt, isDomestic } from '../domain/money';
import {
  CARD_REGIONS,
  CARD_REGION_LABEL,
  CATEGORIES,
  DEFAULT_AMOUNT_KIND,
  DEFAULT_CARD_REGION,
  PAYMENT_METHODS,
  type AmountKind,
  type CardRegion,
  type Category,
  type PaymentMethod,
  type Trip,
} from '../domain/types';
import s from './AddExpenseScreen.module.css';

/** 把全形數字、千分位逗號、全形句點都正規化掉再解析。 */
function parseAmount(raw: string): number {
  const normalized = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248))
    .replace(/[,，\s]/g, '')
    .replace('．', '.');
  return Number(normalized);
}

export function AddExpenseScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>('餐飲');
  const [method, setMethod] = useState<PaymentMethod>('現金');
  const [kind, setKind] = useState<AmountKind>(DEFAULT_AMOUNT_KIND['現金']);
  /* 刷卡地區。只有刷卡用得到，但狀態一直留著——使用者在刷卡／現金之間
     來回切時不該被重設，不然選過的海外／國內會莫名其妙跳回預設。 */
  const [region, setRegion] = useState<CardRegion>(DEFAULT_CARD_REGION);
  const [spentOn, setSpentOn] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void getTrip(id).then((t) => setTrip(t ?? null));
  }, [id]);

  /**
   * 換付款方式就把幣別重設成該方式的預設值。
   * 刷卡與轉帳的帳單本來就是台幣，現金才是外幣——
   * 這樣多數情況下使用者不必再碰幣別，但仍可手動覆蓋。
   */
  function pickMethod(m: PaymentMethod) {
    setMethod(m);
    setKind(DEFAULT_AMOUNT_KIND[m]);
  }

  if (trip === undefined) {
    return (
      <>
        <ScreenHeader title="讀取中" sub="Loading" />
        <div className={s.body} />
      </>
    );
  }

  if (trip === null) {
    return (
      <>
        <ScreenHeader title="找不到存檔" sub="Not Found" backTo="/saves" />
        <div className={s.body}>
          <p className="errorText">這個存檔不存在，可能已經被刪除。</p>
        </div>
      </>
    );
  }

  if (trip.status === 'archived') {
    return (
      <>
        <ScreenHeader title="唯讀存檔" sub="Sealed" backTo={`/trip/${trip.id}`} />
        <div className={s.body}>
          <p className="errorText">
            這個存檔已經封存，是唯讀的成績單。要繼續記帳請先回上一頁解除封存。
          </p>
        </div>
      </>
    );
  }

  // 整趟台幣的存檔沒有外幣可選，幣別切換直接不出現。
  const domestic = isDomestic(trip);
  const effectiveKind: AmountKind = domestic ? 'twd' : kind;
  const unit = effectiveKind === 'twd' ? 'TWD 台幣' : `${trip.currency} ${currencyName(trip.currency)}`;

  async function submit() {
    const value = parseAmount(amount);
    if (!(Number.isFinite(value) && value > 0)) {
      setAdded(null);
      setError('請輸入大於 0 的金額。');
      return;
    }

    setError(null);
    try {
      await addExpense({
        tripId: trip!.id,
        spentOn: spentOn || today(),
        category,
        title: title.trim(),
        paymentMethod: method,
        amountKind: effectiveKind,
        cardRegion: region,
        amount: value,
      });
      // 停在表單上以便連續記帳，只清掉金額與項目，分類、付款方式、日期留著。
      setAdded(
        `已記下 ${effectiveKind === 'twd' ? 'NT$' : trip!.currency} ${fmt(value)}${
          title.trim() ? ` · ${title.trim()}` : ''
        }`,
      );
      setAmount('');
      setTitle('');
    } catch (e) {
      setError(e instanceof Error ? `寫入失敗：${e.message}` : '寫入失敗。');
    }
  }

  return (
    <>
      <ScreenHeader title="記帳" sub="New Entry" backTo={`/trip/${trip.id}`} />
      <div className={s.body}>
        <div className={s.amountBox}>
          <span className="hudLabel">金額</span>
          <div className={s.switches}>
            {!domestic && (
              <div className={s.kindSwitch}>
                <button
                  type="button"
                  className={`${s.kindBtn} ${kind === 'foreign' ? s.kindBtnOn : ''}`}
                  onClick={() => setKind('foreign')}
                >
                  {trip.currency}
                </button>
                <button
                  type="button"
                  className={`${s.kindBtn} ${kind === 'twd' ? s.kindBtnOn : ''}`}
                  onClick={() => setKind('twd')}
                >
                  TWD
                </button>
              </div>
            )}
            {/* 只有刷卡看得到：決定這筆要不要算國外交易手續費。
                其他付款方式沒有這個問題，顯示出來只會讓人以為要選。 */}
            {method === '刷卡' && (
              <div className={s.kindSwitch}>
                {CARD_REGIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`${s.kindBtn} ${region === r ? s.kindBtnOn : ''}`}
                    onClick={() => setRegion(r)}
                  >
                    {CARD_REGION_LABEL[r]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={s.amountRow}>
            <span className={s.unit}>{effectiveKind === 'twd' ? 'NT$' : trip.currency}</span>
            <input
              className={s.amountInput}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
              inputMode="decimal"
              placeholder="0"
              autoFocus
            />
          </div>
          <p className="fieldHint">{unit}</p>
        </div>

        <div className={s.group}>
          <div className={s.groupHead}>
            <span className="hudLabel">付款方式</span>
            {!domestic && <span className="fieldHint">刷卡與轉帳預設台幣，現金預設外幣</span>}
          </div>
          <div className="chips">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${method === m ? 'chipOn' : ''}`}
                onClick={() => pickMethod(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className={s.group}>
          <div className={s.groupHead}>
            <span className="hudLabel">分類</span>
          </div>
          <div className="chips">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip ${category === c ? 'chipOn' : ''}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className={`${s.group} ${s.pair}`}>
          <div className="field">
            <span className="fieldLabel">
              <span className="hudLabel">項目</span>
            </span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
              placeholder="例如：拉麵（可留空）"
            />
          </div>
          <div className="field">
            <span className="fieldLabel">
              <span className="hudLabel">日期</span>
            </span>
            <input
              type="date"
              className="input mono"
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="errorText">{error}</p>}
        {added && <p className={s.added}>{added}　可以直接接著記下一筆</p>}

        <div className={s.actions}>
          <button type="button" className="btnPri" onClick={submit}>
            記下這筆
          </button>
          <button type="button" className="btnGhost" onClick={() => nav(`/trip/${trip.id}`)}>
            完成
          </button>
        </div>
      </div>
    </>
  );
}
