import { describe, expect, it } from 'vitest';
import { backupDue, type BackupTripFacts } from '../src/domain/backupReminder';
import { paymentMethodsFor } from '../src/domain/types';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-11-01T00:00:00.000Z');
const at = (days: number) => new Date(T0 + days * DAY).toISOString();

function facts(over: Partial<BackupTripFacts> = {}): BackupTripFacts {
  return { status: 'active', createdAt: at(0), updatedAt: at(0), lastSavedAt: at(0), ...over };
}

describe('備份提醒', () => {
  it('沒有任何存檔：不提醒', () => {
    expect(backupDue([], null, T0)).toBe('none');
  });

  it('剛開始用、從沒備份過：七天內不催', () => {
    expect(backupDue([facts({ lastSavedAt: at(3) })], null, T0 + 6 * DAY)).toBe('none');
  });

  it('從沒備份過，第一個存檔建立滿七天：提醒', () => {
    expect(backupDue([facts({ lastSavedAt: at(3) })], null, T0 + 7 * DAY)).toBe('stale');
  });

  it('備份之後什麼都沒動：過再久也不提醒', () => {
    expect(backupDue([facts({ lastSavedAt: at(2) })], at(3), T0 + 90 * DAY)).toBe('none');
  });

  it('備份之後又記了帳，但還沒滿七天：不提醒', () => {
    expect(backupDue([facts({ lastSavedAt: at(5) })], at(3), T0 + 9 * DAY)).toBe('none');
  });

  it('備份之後又記了帳，而且滿七天沒備份：提醒', () => {
    expect(backupDue([facts({ lastSavedAt: at(5) })], at(3), T0 + 10 * DAY)).toBe('stale');
  });

  it('旅程封存了還沒備份：不等七天，馬上提醒', () => {
    const sealed = facts({ status: 'archived', updatedAt: at(5), lastSavedAt: at(5) });
    expect(backupDue([sealed], at(4), T0 + 5 * DAY)).toBe('sealed');
    expect(backupDue([sealed], null, T0 + 5 * DAY)).toBe('sealed');
  });

  it('封存之後備份過了：不提醒', () => {
    const sealed = facts({ status: 'archived', updatedAt: at(5), lastSavedAt: at(5) });
    expect(backupDue([sealed], at(6), T0 + 60 * DAY)).toBe('none');
  });

  it('舊的封存存檔已備份、另一趟進行中剛記帳：照七天規則，不算封存那種', () => {
    const old = facts({ status: 'archived', updatedAt: at(1), lastSavedAt: at(1) });
    const now = facts({ createdAt: at(8), updatedAt: at(8), lastSavedAt: at(9) });
    expect(backupDue([old, now], at(2), T0 + 8.5 * DAY)).toBe('none');
    expect(backupDue([old, now], at(2), T0 + 9 * DAY)).toBe('stale');
  });
});

describe('付款方式清單', () => {
  it('西瓜卡只在日圓存檔出現', () => {
    expect(paymentMethodsFor('JPY')).toContain('西瓜卡');
    expect(paymentMethodsFor('USD')).not.toContain('西瓜卡');
    expect(paymentMethodsFor('TWD')).not.toContain('西瓜卡');
  });

  it('修改舊紀錄時，那筆原本用的西瓜卡要留在清單裡', () => {
    expect(paymentMethodsFor('USD', '西瓜卡')).toContain('西瓜卡');
  });
});
