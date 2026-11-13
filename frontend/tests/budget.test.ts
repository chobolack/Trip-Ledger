import { describe, expect, it } from 'vitest';
import { budgetStatus, tripTotals } from '../src/domain/money';
import { expense, trip } from './fixtures';

/** 預算的規則，見 docs/規格.md〈預算〉。 */
describe('預算', () => {
  it('沒設預算：沒有預算狀態（畫面不顯示預算面板）', () => {
    expect(budgetStatus(trip(), [expense()])).toBeNull();
    expect(budgetStatus(trip({ budgetTwd: null }), [expense()])).toBeNull();
    expect(budgetStatus(trip({ budgetTwd: 0 }), [expense()])).toBeNull();
  });

  it('旅途中：外幣用估算匯率換成台幣，結果標成估算', () => {
    const b = budgetStatus(trip({ budgetTwd: 50000, estRate: 0.2 }), [
      expense({ amountKind: 'foreign', amount: 10000 }), // 約 2,000
      expense({ amountKind: 'twd', paymentMethod: '轉帳', amount: 3000 }),
    ])!;
    expect(b.spentTwd).toBe(5000);
    expect(b.remainingTwd).toBe(45000);
    expect(b.estimated).toBe(true);
    expect(b.rate).toBe(0.2);
  });

  it('已花費含刷卡手續費', () => {
    const b = budgetStatus(trip({ budgetTwd: 10000, estRate: 0.2 }), [
      expense({ amountKind: 'twd', paymentMethod: '刷卡', amount: 2000 }), // 手續費 30
    ])!;
    expect(b.spentTwd).toBe(2030);
  });

  it('外幣計價的海外刷卡，手續費也用估算匯率算得出來', () => {
    const b = budgetStatus(trip({ budgetTwd: 10000, estRate: 0.2 }), [
      expense({ amountKind: 'foreign', paymentMethod: '刷卡', amount: 10000 }), // 2,000 ＋ 30
    ])!;
    expect(b.spentTwd).toBe(2030);
  });

  it('超支：剩餘是負數', () => {
    const b = budgetStatus(trip({ budgetTwd: 1000, estRate: 0.2 }), [
      expense({ amountKind: 'foreign', amount: 6000 }),
    ])!;
    expect(b.remainingTwd).toBe(-200);
  });

  it('有外幣花費但還沒抓到任何匯率：算不出來，不拿台幣那一半充數', () => {
    const b = budgetStatus(trip({ budgetTwd: 50000 }), [
      expense({ amountKind: 'foreign', amount: 10000 }),
      expense({ amountKind: 'twd', paymentMethod: '轉帳', amount: 3000 }),
    ])!;
    expect(b.spentTwd).toBeNull();
    expect(b.remainingTwd).toBeNull();
  });

  it('全部都記台幣：不需要匯率，而且不是估算', () => {
    const b = budgetStatus(trip({ budgetTwd: 5000 }), [
      expense({ amountKind: 'twd', paymentMethod: '轉帳', amount: 1200 }),
    ])!;
    expect(b.spentTwd).toBe(1200);
    expect(b.estimated).toBe(false);
    expect(b.rate).toBeNull();
  });

  it('還沒記任何帳：花了 0，預算全剩', () => {
    const b = budgetStatus(trip({ budgetTwd: 5000 }), [])!;
    expect(b.spentTwd).toBe(0);
    expect(b.remainingTwd).toBe(5000);
  });

  it('封存後改用封存匯率，不再是估算，而且跟完整總額一致', () => {
    const sealed = trip({
      status: 'archived',
      budgetTwd: 50000,
      estRate: 0.2,
      sealRate: 0.21,
    });
    const list = [
      expense({ amountKind: 'foreign', amount: 10000 }),
      expense({ amountKind: 'twd', paymentMethod: '刷卡', amount: 2000 }),
    ];
    const b = budgetStatus(sealed, list)!;
    expect(b.estimated).toBe(false);
    expect(b.rate).toBe(0.21);
    expect(b.spentTwd).toBe(tripTotals(sealed, list).grandTotalTwd);
    expect(b.spentTwd).toBe(2100 + 2000 + 30);
  });

  it('封存時沒抓到匯率：先沿用估算匯率，仍標成估算', () => {
    const b = budgetStatus(
      trip({ status: 'archived', budgetTwd: 50000, estRate: 0.2, sealRate: null }),
      [expense({ amountKind: 'foreign', amount: 10000 })],
    )!;
    expect(b.estimated).toBe(true);
    expect(b.spentTwd).toBe(2000);
  });

  it('國內旅行：不用匯率，沒有手續費', () => {
    const b = budgetStatus(trip({ currency: 'TWD', budgetTwd: 8000 }), [
      expense({ amountKind: 'twd', paymentMethod: '刷卡', amount: 3000 }),
    ])!;
    expect(b.spentTwd).toBe(3000);
    expect(b.estimated).toBe(false);
  });

  it('估算匯率不會影響結算：有估算匯率的進行中存檔，完整總額仍然算不出來', () => {
    const t = tripTotals(trip({ budgetTwd: 50000, estRate: 0.2 }), [
      expense({ amountKind: 'foreign', amount: 10000 }),
    ]);
    expect(t.foreignAsTwd).toBeNull();
    expect(t.grandTotalTwd).toBeNull();
  });
});
