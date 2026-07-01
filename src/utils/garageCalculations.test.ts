import { describe, it, expect } from 'vitest';
import {
  RefuelingRecord,
  OilChangeRecord,
  detectSegments,
  lastSegmentAverage,
  generalWeightedAverage,
  costPerKmLastSegment,
  costPerKmGeneral,
  lastKnownOdometer,
  isOdometerDecreasing,
  derivePrice,
  computeOilAlert,
  monthsElapsed,
  computeGarageStats,
  latestOilChange,
} from './garageCalculations';

// Builder so tests stay focused on the fields under test.
let nextId = 1;
function refuel(partial: Partial<RefuelingRecord>): RefuelingRecord {
  return {
    id: partial.id ?? nextId++,
    km: partial.km ?? 0,
    liters: partial.liters ?? 0,
    full_tank: partial.full_tank ?? true,
    price_per_liter: partial.price_per_liter ?? null,
    total_value: partial.total_value ?? null,
    record_date: partial.record_date ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('detectSegments + km/l averages', () => {
  it('simple segment: two full tanks → exact km/l, last == general', () => {
    const r = [
      refuel({ id: 1, km: 1000, liters: 10, full_tank: true, record_date: '2026-01-01' }),
      refuel({ id: 2, km: 1400, liters: 20, full_tank: true, record_date: '2026-01-10' }),
    ];
    const segs = detectSegments(r);
    expect(segs).toHaveLength(1);
    expect(segs[0].km).toBe(400);
    expect(segs[0].liters).toBe(20); // only the closing fill counts, prev excluded
    expect(lastSegmentAverage(r)?.kmPerLiter).toBe(20);
    expect(generalWeightedAverage(r)).toBe(20);
  });

  it('partial fills between full tanks fold into the segment (no own average)', () => {
    const r = [
      refuel({ id: 1, km: 1000, liters: 10, full_tank: true, record_date: '2026-01-01' }),
      refuel({ id: 2, km: 1200, liters: 5, full_tank: false, record_date: '2026-01-05' }),
      refuel({ id: 3, km: 1400, liters: 15, full_tank: true, record_date: '2026-01-10' }),
    ];
    const segs = detectSegments(r);
    expect(segs).toHaveLength(1);
    expect(segs[0].km).toBe(400);
    expect(segs[0].liters).toBe(20); // 5 (partial) + 15 (closing fill)
    expect(lastSegmentAverage(r)?.kmPerLiter).toBe(20);
  });

  it('single record / single full tank → no segment, placeholder path', () => {
    const r = [refuel({ id: 1, km: 1000, liters: 10, full_tank: true })];
    expect(detectSegments(r)).toHaveLength(0);
    expect(lastSegmentAverage(r)).toBeNull();
    expect(generalWeightedAverage(r)).toBeNull();
  });

  it('trailing partials after the last full tank produce no segment', () => {
    const r = [
      refuel({ id: 1, km: 1000, liters: 10, full_tank: true, record_date: '2026-01-01' }),
      refuel({ id: 2, km: 1400, liters: 20, full_tank: true, record_date: '2026-01-10' }),
      refuel({ id: 3, km: 1450, liters: 3, full_tank: false, record_date: '2026-01-15' }),
    ];
    expect(detectSegments(r)).toHaveLength(1);
    expect(generalWeightedAverage(r)).toBe(20); // trailing partial does not corrupt it
  });

  it('deletion mid-history re-merges segments on recompute', () => {
    const full = [
      refuel({ id: 1, km: 1000, liters: 10, full_tank: true, record_date: '2026-01-01' }),
      refuel({ id: 2, km: 1400, liters: 20, full_tank: true, record_date: '2026-01-10' }),
      refuel({ id: 3, km: 1800, liters: 25, full_tank: true, record_date: '2026-01-20' }),
    ];
    expect(detectSegments(full)).toHaveLength(2);
    // general weighted = (400+400) / (20+25) = 800/45 ≈ 17.78
    expect(generalWeightedAverage(full)).toBeCloseTo(17.78, 2);

    // Delete the middle full tank → recompute from the remaining array.
    const afterDelete = full.filter((x) => x.id !== 2);
    const segs = detectSegments(afterDelete);
    expect(segs).toHaveLength(1);
    expect(segs[0].km).toBe(800);
    expect(segs[0].liters).toBe(25);
    expect(generalWeightedAverage(afterDelete)).toBe(32); // 800/25
  });

  it('odometer correction (decreasing km) yields no calculable segment', () => {
    const r = [
      refuel({ id: 1, km: 1400, liters: 10, full_tank: true, record_date: '2026-01-01' }),
      refuel({ id: 2, km: 1000, liters: 20, full_tank: true, record_date: '2026-01-10' }),
    ];
    // segment km would be negative → excluded from averages
    expect(generalWeightedAverage(r)).toBeNull();
    expect(lastSegmentAverage(r)).toBeNull();
  });
});

describe('cost per km', () => {
  it('omits a price-incomplete segment from cost but keeps it in km/l', () => {
    const r = [
      refuel({ id: 1, km: 1000, liters: 10, full_tank: true, price_per_liter: 5, record_date: '2026-01-01' }),
      refuel({ id: 2, km: 1400, liters: 20, full_tank: true, price_per_liter: 5, record_date: '2026-01-10' }),
      refuel({ id: 3, km: 1800, liters: 25, full_tank: true, record_date: '2026-01-20' }), // no price
    ];
    // last segment (seg2) lacks price → last-segment cost omitted
    expect(costPerKmLastSegment(r)).toBeNull();
    // general cost only uses the priced segment: 100 / 400 = 0.25
    expect(costPerKmGeneral(r)).toBe(0.25);
    // km/l averages still count both segments
    expect(generalWeightedAverage(r)).toBeCloseTo(17.78, 2);
  });

  it('computes last-segment cost when fully priced', () => {
    const r = [
      refuel({ id: 1, km: 1000, liters: 10, full_tank: true, price_per_liter: 6, record_date: '2026-01-01' }),
      refuel({ id: 2, km: 1400, liters: 20, full_tank: true, total_value: 120, record_date: '2026-01-10' }),
    ];
    expect(costPerKmLastSegment(r)).toBe(0.3); // 120 / 400
  });
});

describe('derivePrice', () => {
  it('derives total from price per liter', () => {
    expect(derivePrice({ liters: 20, price_per_liter: 5 })).toEqual({ price_per_liter: 5, total_value: 100 });
  });
  it('derives price per liter from total', () => {
    expect(derivePrice({ liters: 20, total_value: 100 })).toEqual({ price_per_liter: 5, total_value: 100 });
  });
  it('keeps both when both given; nulls when neither', () => {
    expect(derivePrice({ liters: 20, price_per_liter: 5, total_value: 99 })).toEqual({ price_per_liter: 5, total_value: 99 });
    expect(derivePrice({ liters: 20 })).toEqual({ price_per_liter: null, total_value: null });
  });
});

describe('lastKnownOdometer + decreasing warning', () => {
  it('picks the most recent record across both collections', () => {
    const oil: OilChangeRecord[] = [{ id: 1, km: 5000, record_date: '2026-03-01' }];
    const ref = [refuel({ id: 2, km: 4800, record_date: '2026-02-01' })];
    expect(lastKnownOdometer(oil, ref)).toBe(5000); // oil change is newer
  });
  it('refueling newer than oil change wins', () => {
    const oil: OilChangeRecord[] = [{ id: 1, km: 5000, record_date: '2026-01-01' }];
    const ref = [refuel({ id: 2, km: 5200, record_date: '2026-02-01' })];
    expect(lastKnownOdometer(oil, ref)).toBe(5200);
  });
  it('ties break toward the higher km', () => {
    const oil: OilChangeRecord[] = [{ id: 1, km: 5000, record_date: '2026-02-01' }];
    const ref = [refuel({ id: 2, km: 5100, record_date: '2026-02-01' })];
    expect(lastKnownOdometer(oil, ref)).toBe(5100);
  });
  it('returns null with no records', () => {
    expect(lastKnownOdometer([], [])).toBeNull();
  });
  it('flags decreasing odometer non-blockingly', () => {
    expect(isOdometerDecreasing(4000, 5000)).toBe(true);
    expect(isOdometerDecreasing(6000, 5000)).toBe(false);
    expect(isOdometerDecreasing(4000, null)).toBe(false);
  });
});

describe('computeOilAlert', () => {
  const oil = (km: number, date: string): OilChangeRecord => ({ id: 1, km, record_date: date });

  it('inactive when alert off', () => {
    expect(computeOilAlert({ active: false }, oil(5000, '2026-01-01'), 6000).state).toBe('inactive');
  });
  it('no_record when active but no oil change', () => {
    expect(computeOilAlert({ active: true, interval_km: 3000 }, null, 6000).state).toBe('no_record');
  });
  it('normal when comfortably within interval', () => {
    const r = computeOilAlert({ active: true, interval_km: 3000 }, oil(5000, '2026-06-01'), 6000, new Date('2026-06-20'));
    expect(r.state).toBe('normal');
    expect(r.km_remaining).toBe(2000); // 5000 + 3000 - 6000
  });
  it('attention by km within last 10%', () => {
    const r = computeOilAlert({ active: true, interval_km: 3000 }, oil(5000, '2026-06-01'), 7800, new Date('2026-06-20'));
    expect(r.state).toBe('attention');
    expect(r.reason).toBe('km');
    expect(r.km_remaining).toBe(200);
  });
  it('overdue by km', () => {
    const r = computeOilAlert({ active: true, interval_km: 3000 }, oil(5000, '2026-06-01'), 8100, new Date('2026-06-20'));
    expect(r.state).toBe('overdue');
    expect(r.reason).toBe('km');
    expect(r.km_remaining).toBe(-100);
  });
  it('overdue by time even when km is fine', () => {
    const r = computeOilAlert(
      { active: true, interval_km: 100000, interval_months: 6 },
      oil(5000, '2026-01-01'),
      5500,
      new Date('2026-08-01'),
    );
    expect(r.state).toBe('overdue');
    expect(r.reason).toBe('time');
    expect(r.months_elapsed).toBe(7);
  });
  it('attention by time within ~1 month of the threshold', () => {
    const r = computeOilAlert(
      { active: true, interval_km: 100000, interval_months: 6 },
      oil(5000, '2026-01-01'),
      5500,
      new Date('2026-06-01'),
    );
    expect(r.state).toBe('attention');
    expect(r.reason).toBe('time');
    expect(r.months_elapsed).toBe(5);
  });
});

describe('monthsElapsed', () => {
  it('counts whole months only after the day-of-month passes', () => {
    expect(monthsElapsed('2026-01-15', new Date('2026-03-14'))).toBe(1);
    expect(monthsElapsed('2026-01-15', new Date('2026-03-15'))).toBe(2);
  });
});

describe('computeGarageStats + latestOilChange', () => {
  it('assembles the full stats object', () => {
    const oil: OilChangeRecord[] = [{ id: 9, km: 4000, record_date: '2026-01-01' }];
    const r = [
      refuel({ id: 1, km: 1000, liters: 10, full_tank: true, price_per_liter: 5, record_date: '2026-02-01' }),
      refuel({ id: 2, km: 1400, liters: 20, full_tank: true, price_per_liter: 5, record_date: '2026-02-10' }),
    ];
    const stats = computeGarageStats(oil, r);
    expect(stats.last_known_odometer).toBe(1400); // refuel newer than the oil change
    expect(stats.last_segment_kmpl).toBe(20);
    expect(stats.general_kmpl).toBe(20);
    expect(stats.cost_per_km_last).toBe(0.25); // 100 / 400
    expect(stats.cost_per_km_general).toBe(0.25);
  });
  it('latestOilChange returns the most recent by date', () => {
    const oil: OilChangeRecord[] = [
      { id: 1, km: 4000, record_date: '2026-01-01' },
      { id: 2, km: 7000, record_date: '2026-05-01' },
    ];
    expect(latestOilChange(oil)?.id).toBe(2);
    expect(latestOilChange([])).toBeNull();
  });
});
