/**
 * Pure calculation helpers for the Garagem (My Garage) module:
 * fuel economy (km/l), cost per km and the oil-change alert.
 *
 * Single source of truth: every garage statistic is DERIVED from the raw
 * records on read, so creating/editing/deleting a record needs no stored
 * aggregate to invalidate — just recompute. Kept dependency-free so it can be
 * imported by both the Express server and the React client and unit-tested in
 * isolation (no Firestore / React / date-fns).
 */

export type FuelType =
  | 'gasolina_comum'
  | 'gasolina_aditivada'
  | 'gasolina_premium'
  | 'etanol'
  | 'outro';

export const FUEL_TYPES: FuelType[] = [
  'gasolina_comum',
  'gasolina_aditivada',
  'gasolina_premium',
  'etanol',
  'outro',
];

/** A refueling record (only the fields the math needs). */
export interface RefuelingRecord {
  id: number;
  km: number;
  liters: number;
  full_tank: boolean;
  price_per_liter?: number | null;
  total_value?: number | null;
  record_date: string; // ISO-8601
}

/** An oil-change record (only the fields the math needs). */
export interface OilChangeRecord {
  id: number;
  km: number;
  record_date: string; // ISO-8601
}

/** Per-moto oil-change alert configuration (stored on the motorcycle doc). */
export interface AlertConfig {
  active: boolean;
  interval_km?: number | null;
  interval_months?: number | null;
}

export type OilAlertState =
  | 'inactive' // alert turned off
  | 'no_record' // active but nothing to base it on yet
  | 'normal'
  | 'attention'
  | 'overdue';

export interface OilAlertResult {
  state: OilAlertState;
  km_remaining: number | null;
  months_elapsed: number | null;
  reason: 'km' | 'time' | null; // which threshold drove attention/overdue
}

/** A closed fuel segment between two consecutive full-tank refuelings. */
export interface Segment {
  fromId: number;
  toId: number;
  km: number; // odometer delta across the segment
  liters: number; // total liters burned to cross it (includes partials + closing fill)
  kmPerLiter: number;
  hasAllPrices: boolean; // every refuel in the segment has a usable price
  spent: number; // total R$ spent (only meaningful when hasAllPrices)
}

export interface GarageStats {
  last_known_odometer: number | null;
  last_segment_kmpl: number | null;
  general_kmpl: number | null;
  cost_per_km_last: number | null; // premium
  cost_per_km_general: number | null; // premium
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

function round(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

/** Does this refueling carry a usable price (either form)? */
function hasPrice(r: RefuelingRecord): boolean {
  return (r.price_per_liter != null && r.price_per_liter > 0) ||
    (r.total_value != null && r.total_value > 0);
}

/** R$ spent on a single refueling, deriving from whichever field is present. */
function spentOf(r: RefuelingRecord): number {
  if (r.total_value != null && r.total_value > 0) return r.total_value;
  if (r.price_per_liter != null && r.price_per_liter > 0) return r.price_per_liter * r.liters;
  return 0;
}

// ---------------------------------------------------------------------------
// Sorting / last known odometer
// ---------------------------------------------------------------------------

/** Stable ascending sort by record_date (ISO strings sort chronologically). */
export function sortByDate<T extends { record_date: string }>(records: T[]): T[] {
  return records
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      if (a.r.record_date < b.r.record_date) return -1;
      if (a.r.record_date > b.r.record_date) return 1;
      return a.i - b.i; // stable
    })
    .map((x) => x.r);
}

/**
 * The last known odometer for a moto: the km of the record with the most
 * recent record_date across BOTH oil changes and refuelings. Ties break toward
 * the higher km (the later physical reading). null when there are no records.
 */
export function lastKnownOdometer(
  oilChanges: Array<{ km: number; record_date: string }>,
  refuelings: Array<{ km: number; record_date: string }>,
): number | null {
  const all = [...oilChanges, ...refuelings];
  if (all.length === 0) return null;
  let best = all[0];
  for (const rec of all) {
    if (
      rec.record_date > best.record_date ||
      (rec.record_date === best.record_date && rec.km > best.km)
    ) {
      best = rec;
    }
  }
  return best.km;
}

/** Non-blocking warning helper: is a new reading below the last known odometer? */
export function isOdometerDecreasing(newKm: number, lastKnownOdo: number | null): boolean {
  return lastKnownOdo != null && newKm < lastKnownOdo;
}

// ---------------------------------------------------------------------------
// Price derivation
// ---------------------------------------------------------------------------

/**
 * Fill in whichever of price_per_liter / total_value is missing. If both are
 * given, they're trusted as-is; if neither, both stay null.
 */
export function derivePrice(input: {
  liters: number;
  price_per_liter?: number | null;
  total_value?: number | null;
}): { price_per_liter: number | null; total_value: number | null } {
  const liters = input.liters;
  const ppl = input.price_per_liter ?? null;
  const tv = input.total_value ?? null;

  if (ppl != null && tv != null) return { price_per_liter: ppl, total_value: tv };
  if (ppl != null && liters > 0) return { price_per_liter: ppl, total_value: round(ppl * liters, 2) };
  if (tv != null && liters > 0) return { price_per_liter: round(tv / liters, 4), total_value: tv };
  return { price_per_liter: ppl, total_value: tv };
}

// ---------------------------------------------------------------------------
// Segment detection (the core of km/l)
// ---------------------------------------------------------------------------

/**
 * A reliable km/l can only be measured between two CONSECUTIVE full-tank fills.
 * For each adjacent pair of full-tank boundaries (prev, cur), the segment burns
 * every liter logged strictly AFTER prev up to and INCLUDING cur (so partial
 * fills in between are folded into the segment but never produce their own
 * average). Trailing partials after the last full tank form no closed segment.
 */
export function detectSegments(refuelings: RefuelingRecord[]): Segment[] {
  const sorted = sortByDate(refuelings);
  const boundaries: number[] = [];
  sorted.forEach((r, idx) => {
    if (r.full_tank) boundaries.push(idx);
  });

  const segments: Segment[] = [];
  for (let b = 1; b < boundaries.length; b++) {
    const prevIdx = boundaries[b - 1];
    const curIdx = boundaries[b];
    const prev = sorted[prevIdx];
    const cur = sorted[curIdx];

    const km = cur.km - prev.km;
    let liters = 0;
    let spent = 0;
    let hasAllPrices = true;
    for (let i = prevIdx + 1; i <= curIdx; i++) {
      const r = sorted[i];
      liters += r.liters;
      if (hasPrice(r)) spent += spentOf(r);
      else hasAllPrices = false;
    }

    segments.push({
      fromId: prev.id,
      toId: cur.id,
      km,
      liters,
      kmPerLiter: liters > 0 ? km / liters : 0,
      hasAllPrices,
      spent,
    });
  }
  return segments;
}

/** Only segments with a positive km delta and positive liters are calculable. */
function validSegments(segments: Segment[]): Segment[] {
  return segments.filter((s) => s.km > 0 && s.liters > 0);
}

// ---------------------------------------------------------------------------
// Averages and cost per km
// ---------------------------------------------------------------------------

/** km/l of the most recent calculable segment (freemium + premium). */
export function lastSegmentAverage(
  refuelings: RefuelingRecord[],
): { kmPerLiter: number; segment: Segment } | null {
  const valid = validSegments(detectSegments(refuelings));
  if (valid.length === 0) return null;
  const segment = valid[valid.length - 1];
  return { kmPerLiter: round(segment.kmPerLiter, 2), segment };
}

/** General average weighted by km: Σkm / Σliters over all calculable segments. */
export function generalWeightedAverage(refuelings: RefuelingRecord[]): number | null {
  const valid = validSegments(detectSegments(refuelings));
  if (valid.length === 0) return null;
  const totalKm = valid.reduce((s, seg) => s + seg.km, 0);
  const totalLiters = valid.reduce((s, seg) => s + seg.liters, 0);
  if (totalLiters <= 0) return null;
  return round(totalKm / totalLiters, 2);
}

/**
 * Cost per km of the LAST calculable segment. If that segment is missing any
 * price, its cost is omitted (null) — we never estimate, and never silently
 * fall back to an older segment.
 */
export function costPerKmLastSegment(refuelings: RefuelingRecord[]): number | null {
  const valid = validSegments(detectSegments(refuelings));
  if (valid.length === 0) return null;
  const segment = valid[valid.length - 1];
  if (!segment.hasAllPrices) return null;
  return round(segment.spent / segment.km, 3);
}

/** General cost per km, weighted by km over price-complete segments only. */
export function costPerKmGeneral(refuelings: RefuelingRecord[]): number | null {
  const priced = validSegments(detectSegments(refuelings)).filter((s) => s.hasAllPrices);
  if (priced.length === 0) return null;
  const totalSpent = priced.reduce((s, seg) => s + seg.spent, 0);
  const totalKm = priced.reduce((s, seg) => s + seg.km, 0);
  if (totalKm <= 0) return null;
  return round(totalSpent / totalKm, 3);
}

// ---------------------------------------------------------------------------
// Oil-change alert
// ---------------------------------------------------------------------------

/** Whole months elapsed since an ISO date (a full month requires the day to pass). */
export function monthsElapsed(fromISO: string, now: Date = new Date()): number {
  const from = new Date(fromISO);
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Oil-change alert state. Fires by km OR by elapsed time, whichever comes first.
 * Returns a structured object (ready for a future notification job) even when
 * not firing.
 */
export function computeOilAlert(
  cfg: AlertConfig,
  lastOilChange: OilChangeRecord | null,
  lastKnownOdo: number | null,
  now: Date = new Date(),
): OilAlertResult {
  if (!cfg.active) {
    return { state: 'inactive', km_remaining: null, months_elapsed: null, reason: null };
  }
  if (!lastOilChange || lastKnownOdo == null) {
    return { state: 'no_record', km_remaining: null, months_elapsed: null, reason: null };
  }

  const intervalKm = cfg.interval_km != null && cfg.interval_km > 0 ? cfg.interval_km : null;
  const intervalMonths = cfg.interval_months != null && cfg.interval_months > 0 ? cfg.interval_months : null;

  const km_remaining = intervalKm != null ? lastOilChange.km + intervalKm - lastKnownOdo : null;
  const elapsed = monthsElapsed(lastOilChange.record_date, now);

  const overdueByKm = km_remaining != null && km_remaining <= 0;
  const overdueByTime = intervalMonths != null && elapsed >= intervalMonths;
  if (overdueByKm || overdueByTime) {
    return {
      state: 'overdue',
      km_remaining,
      months_elapsed: elapsed,
      reason: overdueByKm ? 'km' : 'time',
    };
  }

  const attentionByKm =
    km_remaining != null && intervalKm != null && km_remaining <= 0.1 * intervalKm;
  const attentionByTime = intervalMonths != null && elapsed >= intervalMonths - 1;
  if (attentionByKm || attentionByTime) {
    return {
      state: 'attention',
      km_remaining,
      months_elapsed: elapsed,
      reason: attentionByKm ? 'km' : 'time',
    };
  }

  return { state: 'normal', km_remaining, months_elapsed: elapsed, reason: null };
}

// ---------------------------------------------------------------------------
// Aggregate convenience for the backend read path
// ---------------------------------------------------------------------------

/** Compute every garage statistic in one call (used when assembling the API response). */
export function computeGarageStats(
  oilChanges: OilChangeRecord[],
  refuelings: RefuelingRecord[],
): GarageStats {
  const last = lastSegmentAverage(refuelings);
  return {
    last_known_odometer: lastKnownOdometer(oilChanges, refuelings),
    last_segment_kmpl: last ? last.kmPerLiter : null,
    general_kmpl: generalWeightedAverage(refuelings),
    cost_per_km_last: costPerKmLastSegment(refuelings),
    cost_per_km_general: costPerKmGeneral(refuelings),
  };
}

/** Most recent oil change by record_date, or null. */
export function latestOilChange(oilChanges: OilChangeRecord[]): OilChangeRecord | null {
  if (oilChanges.length === 0) return null;
  const sorted = sortByDate(oilChanges);
  return sorted[sorted.length - 1];
}
