import { describe, expect, it } from 'vitest';
import {
  cardFeeTwd,
  categoryBreakdown,
  fmt,
  fmtTwd,
  groupByDay,
  paymentBreakdown,
  tripTotals,
} from '../src/domain/money';
import type { Category, PaymentMethod } from '../src/domain/types';
import { expense, trip } from './fixtures';

/**
 * 算錢規則的驗算。每一條對應 docs/規格.md 裡使用者定過的一條規則——
 * 改 money.ts 之後跑 `npm test`，哪條規則被改壞了會直接指出來。
 */

describe('刷卡手續費（單筆）', () => {
  it('海外刷卡、台幣計價：金額 × 費率，四捨五入到元', () => {
    const e = expense({ paymentMethod: '刷卡', amountKind: 'twd', amount: 3600 });
    expect(cardFeeTwd(trip(), e)).toBe(54);
  });

  it('四捨五入：1,234 × 1.5% = 18.51 → 19', () => {
    const e = expense({ paymentMethod: '刷卡', amountKind: 'twd', amount: 1234 });
    expect(cardFeeTwd(trip(), e)).toBe(19);
  });

  it('國內刷卡不收', () => {
    const e = expense({ paymentMethod: '刷卡', amountKind: 'twd', cardRegion: 'domestic' });
    expect(cardFeeTwd(trip(), e)).toBe(0);
  });

  it('不是刷卡就不收，即使地區欄位寫著海外', () => {
    for (const m of ['現金', '轉帳', '西瓜卡', '悠遊卡'] as PaymentMethod[]) {
      expect(cardFeeTwd(trip(), expense({ paymentMethod: m, amountKind: 'twd' }))).toBe(0);
    }
  });

  it('這趟的費率設成 0 就不收', () => {
    const e = expense({ paymentMethod: '刷卡', amountKind: 'twd' });
    expect(cardFeeTwd(trip({ cardFeePct: 0 }), e)).toBe(0);
  });

  it('費率可以改：3% 就照 3% 算', () => {
    const e = expense({ paymentMethod: '刷卡', amountKind: 'twd', amount: 1000 });
    expect(cardFeeTwd(trip({ cardFeePct: 3 }), e)).toBe(30);
  });

  it('外幣計價的海外刷卡：有封存匯率就先換成台幣再算', () => {
    const e = expense({ paymentMethod: '刷卡', amountKind: 'foreign', amount: 10000 });
    // 10,000 日圓 × 0.2 = 2,000 台幣 × 1.5% = 30
    expect(cardFeeTwd(trip({ sealRate: 0.2 }), e)).toBe(30);
  });

  it('外幣計價的海外刷卡：沒有匯率時回報「算不出來」，不是 0', () => {
    const e = expense({ paymentMethod: '刷卡', amountKind: 'foreign', amount: 10000 });
    expect(cardFeeTwd(trip({ sealRate: null }), e)).toBeNull();
  });

  it('國內旅行（台幣存檔）一律不收，就算那筆記的是海外', () => {
    const e = expense({ paymentMethod: '刷卡', amountKind: 'twd', cardRegion: 'overseas' });
    expect(cardFeeTwd(trip({ currency: 'TWD' }), e)).toBe(0);
  });
});

describe('花費總計', () => {
  it('台幣與外幣分開加，不相加', () => {
    const t = tripTotals(trip(), [
      expense({ amountKind: 'twd', paymentMethod: '轉帳', amount: 500 }),
      expense({ amountKind: 'twd', paymentMethod: '轉帳', amount: 300 }),
      expense({ amountKind: 'foreign', amount: 1200 }),
      expense({ amountKind: 'foreign', amount: 800 }),
    ]);
    expect(t.twdConfirmed).toBe(800);
    expect(t.foreignSpent).toBe(2000);
    expect(t.entryCount).toBe(4);
  });

  it('還沒封存（沒有匯率）：外幣換不成台幣，完整總額也算不出來', () => {
    const t = tripTotals(trip(), [expense({ amount: 1200 })]);
    expect(t.foreignAsTwd).toBeNull();
    expect(t.grandTotalTwd).toBeNull();
  });

  it('封存後：完整總額＝台幣 ＋ 外幣×匯率 ＋ 手續費', () => {
    const t = tripTotals(trip({ status: 'archived', sealRate: 0.2 }), [
      expense({ amountKind: 'twd', paymentMethod: '刷卡', amount: 2000 }), // 手續費 30
      expense({ amountKind: 'twd', paymentMethod: '轉帳', amount: 1000 }),
      expense({ amountKind: 'foreign', amount: 5000 }), // 1,000 台幣
    ]);
    expect(t.twdConfirmed).toBe(3000);
    expect(t.foreignAsTwd).toBe(1000);
    expect(t.cardFeeTwd).toBe(30);
    expect(t.grandTotalTwd).toBe(4030);
  });

  it('商品金額不含手續費：台幣合計裡沒有把手續費加進去', () => {
    const t = tripTotals(trip(), [
      expense({ amountKind: 'twd', paymentMethod: '刷卡', amount: 2000 }),
    ]);
    expect(t.twdConfirmed).toBe(2000);
    expect(t.cardFeeTwd).toBe(30);
  });

  it('手續費是逐筆四捨五入後再加總，不是總額乘費率', () => {
    // 三筆 33 元：每筆 0.495 → 0，合計 0。如果先加總再算會是 99 × 1.5% = 1.485 → 1。
    const rows = [1, 2, 3].map(() =>
      expense({ amountKind: 'twd', paymentMethod: '刷卡', amount: 33 }),
    );
    expect(tripTotals(trip(), rows).cardFeeTwd).toBe(0);
  });

  it('算不出手續費的筆數要回報，不能默默少算', () => {
    const t = tripTotals(trip({ sealRate: null }), [
      expense({ amountKind: 'foreign', paymentMethod: '刷卡', amount: 10000 }),
      expense({ amountKind: 'twd', paymentMethod: '刷卡', amount: 2000 }),
    ]);
    expect(t.cardFeeUnknown).toBe(1);
    expect(t.cardFeeTwd).toBe(30);
  });

  it('國內旅行：就算有紀錄被標成外幣，也全部算台幣，而且沒有手續費', () => {
    const t = tripTotals(trip({ currency: 'TWD' }), [
      expense({ amountKind: 'foreign', amount: 700 }),
      expense({ amountKind: 'twd', paymentMethod: '刷卡', amount: 2000 }),
    ]);
    expect(t.twdConfirmed).toBe(2700);
    expect(t.foreignSpent).toBe(0);
    expect(t.cardFeeTwd).toBe(0);
  });

  it('沒有任何花費', () => {
    const t = tripTotals(trip(), []);
    expect(t).toMatchObject({ twdConfirmed: 0, foreignSpent: 0, cardFeeTwd: 0, entryCount: 0 });
  });
});

describe('分類占比（圓餅圖）', () => {
  const sealed = trip({ status: 'archived', sealRate: 0.2 });

  it('有外幣花費但沒有匯率：算不出來', () => {
    expect(categoryBreakdown(trip(), [expense()])).toBeNull();
  });

  it('全部都是台幣的話，沒有匯率也算得出來', () => {
    const rows = categoryBreakdown(trip(), [expense({ amountKind: 'twd', amount: 100 })]);
    expect(rows).toEqual([{ category: '餐飲', twd: 100, share: 1 }]);
  });

  it('只有一個分類：一片 100%', () => {
    const rows = categoryBreakdown(sealed, [expense({ amount: 5000 }), expense({ amount: 5000 })]);
    expect(rows).toHaveLength(1);
    expect(rows![0].share).toBe(1);
  });

  it('換算成台幣後由大到小排序', () => {
    const rows = categoryBreakdown(sealed, [
      expense({ category: '餐飲', amountKind: 'foreign', amount: 1000 }), // 200
      expense({ category: '住宿', amountKind: 'twd', amount: 5000 }),
      expense({ category: '交通', amountKind: 'foreign', amount: 4000 }), // 800
    ]);
    expect(rows!.map((r) => r.category)).toEqual(['住宿', '交通', '餐飲']);
    expect(rows!.map((r) => r.twd)).toEqual([5000, 800, 200]);
  });

  it('占比加起來是 100%，金額加起來等於商品金額合計（不含手續費）', () => {
    const list = [
      expense({ category: '購物', amountKind: 'twd', paymentMethod: '刷卡', amount: 3333 }),
      expense({ category: '餐飲', amountKind: 'foreign', amount: 7777 }),
      expense({ category: '交通', amountKind: 'foreign', amount: 1234 }),
    ];
    const rows = categoryBreakdown(sealed, list)!;
    const totals = tripTotals(sealed, list);
    expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 10);
    expect(rows.reduce((a, r) => a + r.twd, 0)).toBeCloseTo(
      totals.twdConfirmed + totals.foreignAsTwd!,
      6,
    );
  });

  it('認不得的分類歸到「其他」，不會消失', () => {
    const rows = categoryBreakdown(sealed, [
      expense({ category: '不存在的分類' as Category, amountKind: 'twd', amount: 100 }),
    ]);
    expect(rows).toEqual([{ category: '其他', twd: 100, share: 1 }]);
  });

  it('沒有花費：空的，不是算不出來', () => {
    expect(categoryBreakdown(sealed, [])).toEqual([]);
  });
});

describe('付款方式占比（長條圖）', () => {
  const sealed = trip({ status: 'archived', sealRate: 0.2 });

  it('刷卡不分國內海外，是同一條', () => {
    const rows = paymentBreakdown(sealed, [
      expense({ paymentMethod: '刷卡', amountKind: 'twd', cardRegion: 'overseas', amount: 300 }),
      expense({ paymentMethod: '刷卡', amountKind: 'twd', cardRegion: 'domestic', amount: 700 }),
    ]);
    expect(rows).toEqual([{ method: '刷卡', twd: 1000, share: 1 }]);
  });

  it('認不得的付款方式保留原值自成一類，錢不會不見', () => {
    const rows = paymentBreakdown(sealed, [
      expense({ paymentMethod: '禮券' as PaymentMethod, amountKind: 'twd', amount: 400 }),
      expense({ paymentMethod: '現金', amountKind: 'twd', amount: 600 }),
    ])!;
    expect(rows.map((r) => r.method)).toEqual(['現金', '禮券']);
    expect(rows.reduce((a, r) => a + r.twd, 0)).toBe(1000);
  });
});

describe('明細按日分組', () => {
  it('日期新的在前；同一天內後記的在前', () => {
    const a = expense({ spentOn: '2026-03-18', createdAt: '2026-03-18T01:00:00.000Z' });
    const b = expense({ spentOn: '2026-03-18', createdAt: '2026-03-18T02:00:00.000Z' });
    const c = expense({ spentOn: '2026-03-19', createdAt: '2026-03-19T01:00:00.000Z' });
    const days = groupByDay(trip(), [a, b, c]);
    expect(days.map((d) => d.date)).toEqual(['2026-03-19', '2026-03-18']);
    expect(days[1].expenses.map((e) => e.id)).toEqual([b.id, a.id]);
  });

  it('每天的小計只算那一天', () => {
    const days = groupByDay(trip(), [
      expense({ spentOn: '2026-03-18', amountKind: 'foreign', amount: 1000 }),
      expense({ spentOn: '2026-03-18', amountKind: 'twd', paymentMethod: '轉帳', amount: 50 }),
      expense({ spentOn: '2026-03-19', amountKind: 'foreign', amount: 300 }),
    ]);
    expect(days[0]).toMatchObject({ date: '2026-03-19', foreignSpent: 300, twdConfirmed: 0 });
    expect(days[1]).toMatchObject({ date: '2026-03-18', foreignSpent: 1000, twdConfirmed: 50 });
  });
});

describe('金額顯示', () => {
  it('千分位、不顯示小數', () => {
    expect(fmt(1234567)).toBe('1,234,567');
    expect(fmt(1234.5)).toBe('1,235');
    expect(fmtTwd(203.079)).toBe('NT$ 203');
  });
});
