import { describe, expect, it } from 'vitest';
import {
  avg30,
  daysToGoal,
  impactOfWish,
  projectWaterfall,
  rateFromTransactions,
  savingsRate,
} from './math.js';
import type { Goal, Wish } from './types.js';

const TODAY = '2026-09-05';

function goal(id: string, target: number, priority: number): Goal {
  return { id, name: id, target, priority };
}

function wish(price: number, cadence: Wish['cadence'] = 'one-off'): Pick<Wish, 'price' | 'cadence'> {
  return { price, cadence };
}

describe('avg30', () => {
  it('spots the gap between current balance and trailing mean', () => {
    const spots = Array.from({ length: 30 }, (_, i) => 1000 + i * 10);
    // mean of 1000..1290 step 10 = 1145, latest spot 1290
    expect(avg30(spots)).toBeCloseTo(1145, 10);
    expect(spots.at(-1)).toBe(1290);
  });

  it('uses only the trailing 30 entries', () => {
    const spots = [...Array<number>(30).fill(0), ...Array<number>(30).fill(3000)];
    expect(avg30(spots)).toBe(3000);
  });
});

describe('savings rate', () => {
  it('nets inflows minus outflows per day', () => {
    expect(savingsRate(9000, 6000, 30)).toBe(100);
  });

  it('excludes transfers by default but can include them', () => {
    const txs = [
      { amount: 5000 },
      { amount: -2000 },
      { amount: 1000, isTransfer: true },
    ];
    expect(rateFromTransactions(txs, 30)).toBe(100);
    expect(rateFromTransactions(txs, 30, false)).toBeCloseTo(133.33, 1);
  });
});

describe('waterfall', () => {
  it('cascades goals in priority order against one shared balance', () => {
    const goals = [goal('b', 2000, 2), goal('a', 1000, 1)];
    const projected = projectWaterfall(goals, 0, 100, TODAY);
    // a funds first at day 10, b absorbs a's target: day 30
    expect(projected.map((p) => [p.goalId, p.days])).toEqual([
      ['a', 10],
      ['b', 30],
    ]);
    expect(projected[0]?.date).toBe('2026-09-15');
    expect(projected[1]?.date).toBe('2026-10-05');
  });

  it('marks already-covered goals funded', () => {
    const projected = projectWaterfall([goal('a', 500, 1)], 1000, 100, TODAY);
    expect(projected[0]).toMatchObject({ days: 0, date: TODAY, status: 'funded' });
  });

  it('marks every goal drifting when the rate is not positive', () => {
    for (const rate of [0, -50]) {
      const projected = projectWaterfall([goal('a', 500, 1)], 1000, rate, TODAY);
      expect(projected[0]).toMatchObject({ days: null, date: null, status: 'drifting' });
      expect(daysToGoal(500, 1000, rate)).toBeNull();
    }
  });
});

describe('impact', () => {
  it('delays each goal by price/rate for a one-off wish', () => {
    const goals = [goal('a', 1000, 1)];
    const result = impactOfWish(wish(300), goals, 0, 100, TODAY);
    expect(result.neverGoals).toEqual([]);
    expect(result.perGoal[0]).toMatchObject({
      goalId: 'a',
      oldDate: '2026-09-15',
      delayDays: 3,
    });
    // balance drops 300 → needs 13 days from today
    expect(result.perGoal[0]?.newDate).toBe('2026-09-18');
  });

  it('marks every goal never when a recurring wish erases the rate', () => {
    const goals = [goal('a', 1000, 1), goal('b', 2000, 2)];
    // $100/day against a $100/day rate → effective rate 0
    const result = impactOfWish(wish(100, 'daily'), goals, 0, 100, TODAY);
    expect(result.neverGoals).toEqual(['a', 'b']);
    for (const row of result.perGoal) {
      expect(row.newDate).toBeNull();
      expect(row.delayDays).toBeNull();
      expect(row.oldDate).not.toBeNull();
    }
  });

  it('slows (not kills) goals when the recurring cost fits inside the rate', () => {
    const goals = [goal('a', 1000, 1)];
    // $350/week ≈ $50/day against $100/day → effective $50/day, doubles the wait
    const result = impactOfWish(wish(350, 'weekly'), goals, 0, 100, TODAY);
    expect(result.neverGoals).toEqual([]);
    expect(result.perGoal[0]?.delayDays).toBeCloseTo(10, 10);
    expect(result.perGoal[0]?.newDate).toBe('2026-09-25');
  });

  it('returns null dates with no never-goals when drifting', () => {
    const result = impactOfWish(wish(300), [goal('a', 1000, 1)], 0, 0, TODAY);
    expect(result).toEqual({
      perGoal: [{ goalId: 'a', oldDate: null, newDate: null, delayDays: null }],
      neverGoals: [],
    });
  });
});
