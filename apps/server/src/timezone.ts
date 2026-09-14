/**
 * Zone-aware calendar-day utilities (#53).
 *
 * "Today" and every chart day's boundary must be evaluated in the user's
 * timezone, not UTC: east-of-UTC users saw the dashboard flip to tomorrow's
 * label in the evening, and transactions posted after ~8pm Toronto counted
 * toward the next chart day.
 *
 * Zone resolution order:
 *  1. `ACTUAL_TIMEZONE` (IANA name, e.g. "America/Toronto") — an invalid
 *     value throws rather than silently shifting days.
 *  2. The process-local zone (`TZ` env / OS locale via Intl), so TZ-set
 *     deployments work out of the box.
 *  3. `UTC` when unset/unresolvable — keeps pre-#53 behavior headless.
 */

const MAX_DAYS = 365;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function validateDays(days: number): number {
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw new Error(`Invalid days ${JSON.stringify(days)}: integer 1..${MAX_DAYS}`);
  }
  return days;
}

export function validateIsoDate(value: string, name: string): string {
  if (!ISO_DATE.test(value)) {
    throw new Error(`Invalid ${name} ${JSON.stringify(value)}: expected YYYY-MM-DD`);
  }
  return value;
}

/** Formatter cache: one Intl instance per zone (constructed in hot loops). */
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = formatters.get(timeZone);
  if (dtf == null) {
    try {
      dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      throw new Error(`Invalid timeZone ${JSON.stringify(timeZone)}: expected an IANA zone name`);
    }
    formatters.set(timeZone, dtf);
  }
  return dtf;
}

interface ClockParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function partsAt(dtf: Intl.DateTimeFormat, t: number): ClockParts {
  const num: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(t))) {
    if (p.type !== 'literal') num[p.type] = Number.parseInt(p.value, 10);
  }
  return { y: num.year!, mo: num.month!, d: num.day!, h: num.hour!, mi: num.minute!, s: num.second! };
}

/**
 * Offset (ms) between the local wall clock and UTC at instant `t` —
 * i.e. local time rendered as a UTC timestamp minus the instant itself.
 */
function offsetAtMs(t: number, dtf: Intl.DateTimeFormat): number {
  const p = partsAt(dtf, t);
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return wall - Math.floor(t / 1000) * 1000;
}

export function resolveTimeZone(
  env: { ACTUAL_TIMEZONE?: string | undefined } = process.env,
): string {
  const explicit = (env.ACTUAL_TIMEZONE ?? '').trim();
  if (explicit !== '') {
    formatter(explicit); // validates; throws on a non-IANA value
    return explicit;
  }
  try {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof local === 'string' && local !== '') {
      formatter(local);
      return local;
    }
  } catch {
    /* fall through to UTC */
  }
  return 'UTC';
}

/** YYYY-MM-DD calendar label of an instant in `timeZone`. */
export function isoDay(date: Date, timeZone: string): string {
  const p = partsAt(formatter(timeZone), date.getTime());
  const mo = String(p.mo).padStart(2, '0');
  const d = String(p.d).padStart(2, '0');
  return `${p.y}-${mo}-${d}`;
}

/** Calendar label of `now` in `timeZone` (default: the resolved zone). */
export function todayInZone(now: Date = new Date(), timeZone: string = resolveTimeZone()): string {
  return isoDay(now, timeZone);
}

/**
 * UTC instant at which local midnight beginning `iso` occurs in `timeZone`.
 * Fixed-point on the offset (two passes); for zones whose DST jump replaces
 * local midnight itself this returns the first instant of that day (01:00),
 * which keeps every label on the correct side of the boundary.
 */
export function zonedDayStartUtc(iso: string, timeZone: string): number {
  validateIsoDate(iso, 'date');
  const dtf = formatter(timeZone);
  const target = Date.parse(`${iso}T00:00:00Z`);
  const first = target - offsetAtMs(target, dtf);
  return target - offsetAtMs(first, dtf);
}

/**
 * Last instant (inclusive) of local day `iso` in `timeZone` — the cutoff
 * that makes "the whole of today (local)" readable from Actual.
 */
export function endOfDay(iso: string, timeZone: string): Date {
  const start = zonedDayStartUtc(iso, timeZone);
  // Local noon + 24h always lands inside the next local day for every real
  // zone (offsets ≤ ±14h, DST steps ≤ 1h), so the label is exactly iso+1.
  const next = isoDay(new Date(start + HOUR_MS * 12 + DAY_MS), timeZone);
  return new Date(zonedDayStartUtc(next, timeZone) - 1);
}

/**
 * Oldest-first list of the last `days` local calendar day labels, ending
 * today *in `timeZone`*. Stepping via "one ms before local midnight" keeps
 * the walk exact across DST transitions.
 */
export function lastNDates(days: number, timeZone: string, now: Date = new Date()): string[] {
  validateDays(days);
  const out: string[] = [];
  let cur = isoDay(now, timeZone);
  for (let i = 0; i < days; i += 1) {
    out.push(cur);
    cur = isoDay(new Date(zonedDayStartUtc(cur, timeZone) - 1), timeZone);
  }
  return out.reverse();
}
