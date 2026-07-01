// Small formatting helpers shared across the Garagem UI. Brazilian locale,
// fixed units (km / liters / R$) — no unit conversion (out of scope).

export function toDateInput(iso?: string | null): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  return String(iso).slice(0, 10);
}

export function fromDateInput(d: string): string {
  // Anchor at noon to avoid a timezone day-shift when converting to ISO.
  return new Date(`${d}T12:00:00`).toISOString();
}

export function fmtKm(n?: number | null): string {
  return n == null ? '—' : `${Math.round(n).toLocaleString('pt-BR')} km`;
}

export function fmtNum(n?: number | null, digits = 2): string {
  return n == null
    ? '—'
    : n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtBRL(n?: number | null): string {
  return n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
