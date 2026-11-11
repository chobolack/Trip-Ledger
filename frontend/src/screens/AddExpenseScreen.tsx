import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';
import { addExpense, getExpense, getTrip, today, updateExpense } from '../data/repo';
import { currencyName } from '../domain/currencies';
import { fmt, isDomestic } from '../domain/money';
import {
  CARD_REGIONS,
  CARD_REGION_LABEL,
  CATEGORIES,
  DEFAULT_AMOUNT_KIND,
  DEFAULT_CARD_REGION,
  PAYMENT_METHODS,
  isRevising,
  isWritable,
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

/**
 * 記帳表單。新增與修改共用：網址帶 `expenseId` 就是修改那一筆。
 *
 * 兩種模式只差三件事——進來時要不要預填、送出是新增還是覆寫、
 * 送出後留在表單（連續記帳）還是回明細（改完就走）。
 */
export function AddExpenseScreen() {
  const { id, expenseId } = useParams<{ id: string; expenseId?: string }>();
  const nav = useNavigate();
  const editing = expenseId !== undefined;

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

  /* 修改模式：要改的那筆找不到（被刪了、或網址的存檔對不上）。 */
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let stale = false;
    void (async () => {
      const t = await getTrip(id);
      /* 修改模式要先把原值填好才顯示表單，否則會先閃一下空白表單。
         所以存檔跟那筆帳一起讀完，才一次 set。 */
      const e = t && expenseId ? await getExpense(expenseId) : undefined;
      if (stale) return;
      if (expenseId && t) {
        // tripId 對不上＝網址是拼湊的，當成找不到，不要跨存檔改帳。
        if (!e || e.tripId !== t.id) {
          setMissing(true);
        } else {
          setAmount(String(e.amount));
          setTitle(e.title);
          setCategory(e.category);
          setMethod(e.paymentMethod);
          setKind(e.amountKind);
          setRegion(e.cardRegion);
          setSpentOn(e.spentOn);
        }
      } else if (t && isRevising(t) && t.endedOn) {
        /* 修訂舊存檔時補記的帳，日期預設旅程最後一天而不是今天——
           今天多半是旅程結束幾個月後，照今天記會把結束日一路拉到現在。 */
        setSpentOn(t.endedOn);
      }
      setTrip(t ?? null);
    })();
    return () => {
      stale = true;
    };
  }, [id, expenseId]);

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

  if (!isWritable(trip)) {
    return (
      <>
        <ScreenHeader title="唯讀存檔" sub="Sealed" backTo={`/trip/${trip.id}`} />
        <div className={s.body}>
          <p className="errorText">
            這個存檔已經封存，是唯讀的成績單。要{editing ? '修改紀錄' : '補記帳'}
            請先回上一頁按「修改紀錄」。
          </p>
        </div>
      </>
    );
  }

  if (missing) {
    return (
      <>
        <ScreenHeader title="找不到紀錄" sub="Not Found" backTo={`/trip/${trip.id}`} />
        <div className={s.body}>
          <p className="errorText">這筆紀錄不存在，可能已經被刪除。</p>
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
      if (expenseId !== undefined) {
        await updateExpense(expenseId, {
          spentOn: spentOn || today(),
          category,
          title: title.trim(),
          paymentMethod: method,
          amountKind: effectiveKind,
          cardRegion: region,
          amount: value,
        });
        // 改完就回明細，不像新增那樣留在表單——沒有「接著改下一筆」這回事。
        nav(`/trip/${trip!.id}`);
        return;
      }
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
      <ScreenHeader
        title={editing ? '修改紀錄' : '記帳'}
        sub={editing ? 'Edit Entry' : 'New Entry'}
        backTo={`/trip/${trip.id}`}
      />
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
            {editing ? '儲存修改' : '記下這筆'}
          </button>
          <button type="button" className="btnGhost" onClick={() => nav(`/trip/${trip.id}`)}>
            {editing ? '取消' : '完成'}
          </button>
        </div>
      </div>
    </>
  );
}
