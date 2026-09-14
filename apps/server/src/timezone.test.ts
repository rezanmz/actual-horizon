import { describe, expect, it } from 'vitest';

import {
  endOfDay,
  isoDay,
  lastNDates,
  resolveTimeZone,
  todayInZone,
  zonedDayStartUtc,
} from './timezone.js';

describe('resolveTimeZone (#53)', () => {
  it('prefers ACTUAL_TIMEZONE when set', () => {
    expect(resolveTimeZone({ ACTUAL_TIMEZONE: 'America/Toronto' })).toBe('America/Toronto');
  });

  it('rejects a non-IANA ACTUAL_TIMEZONE instead of silently shifting days', () => {
    expect(() => resolveTimeZone({ ACTUAL_TIMEZONE: 'Toronto/Time' })).toThrow(/IANA/);
    expect(() => resolveTimeZone({ ACTUAL_TIMEZONE: 'Mars/Olympus_Mons' })).toThrow(/IANA/);
  });

  it('falls back to the process zone when unset or blank', () => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(resolveTimeZone({})).toBe(local);
    expect(resolveTimeZone({ ACTUAL_TIMEZONE: '  ' })).toBe(local);
  });
});

describe('zone-aware day axis (#53)', () => {
  const TOR = 'America/Toronto';

  it('ends on local today at 9pm Toronto — the incident case', () => {
    const ninePm = new Date('2026-09-14T01:00:00Z'); // 21:00 EDT, Sep 13 local
    expect(ninePm.toISOString().slice(0, 10)).toBe('2026-09-14'); // the old UTC label
    expect(lastNDates(3, TOR, ninePm)).toEqual(['2026-09-11', '2026-09-12', '2026-09-13']);
  });

  it('does not flip early at UTC noon', () => {
    expect(lastNDates(3, TOR, new Date('2026-09-13T12:00:00Z')).at(-1)).toBe('2026-09-13');
  });

  it('labels an instant with its zone calendar day at the boundary', () => {
    expect(isoDay(new Date('2026-09-14T03:59:59.999Z'), TOR)).toBe('2026-09-13');
    expect(isoDay(new Date('2026-09-14T04:00:00.000Z'), TOR)).toBe('2026-09-14');
    expect(todayInZone(new Date('2026-09-14T01:00:00Z'), TOR)).toBe('2026-09-13');
  });

  it('steps over the spring-forward day without repeats or gaps', () => {
    // 03:30Z Mar 9 = 23:30 EDT Mar 8 (spring-forward happened 02:00 local Mar 8).
    expect(lastNDates(10, TOR, new Date('2026-03-09T03:30:00Z'))).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ]);
  });
});

describe('zone-aware day close (#53)', () => {
  const TOR = 'America/Toronto';

  it('closes each day at 23:59:59.999 local time', () => {
    expect(zonedDayStartUtc('2026-09-13', TOR)).toBe(Date.parse('2026-09-13T04:00:00Z'));
    expect(endOfDay('2026-09-13', TOR).toISOString()).toBe('2026-09-14T03:59:59.999Z'); // EDT
    expect(endOfDay('2026-01-15', TOR).toISOString()).toBe('2026-01-16T04:59:59.999Z'); // EST
  });

  it('closes the 23-hour spring-forward day at the next local midnight', () => {
    expect(endOfDay('2026-03-08', TOR).toISOString()).toBe('2026-03-09T03:59:59.999Z');
  });

  it('handles half-hour and ahead-of-UTC zones', () => {
    expect(endOfDay('2026-09-13', 'Asia/Kolkata').toISOString()).toBe('2026-09-13T18:29:59.999Z');
    expect(endOfDay('2026-09-13', 'Asia/Tokyo').toISOString()).toBe('2026-09-13T14:59:59.999Z');
    expect(lastNDates(2, 'Asia/Tokyo', new Date('2026-09-13T20:00:00Z')).at(-1)).toBe('2026-09-14');
  });

  it('keeps a 9pm-local transaction inside its local day', () => {
    const posted = new Date('2026-09-14T01:00:00Z'); // 21:00 EDT Sep 13
    expect(endOfDay('2026-09-13', TOR).getTime()).toBeGreaterThanOrEqual(posted.getTime());
    expect(endOfDay('2026-09-12', TOR).getTime()).toBeLessThan(posted.getTime());
    expect(lastNDates(2, TOR, posted)).toContain(isoDay(posted, TOR));
  });
});
