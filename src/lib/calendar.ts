/*
 Licensed to the Apache Software Foundation (ASF) under one or more
 contributor license agreements.  See the NOTICE file distributed with
 this work for additional information regarding copyright ownership.
 The ASF licenses this file to You under the Apache License, Version 2.0
 (the "License"); you may not use this file except in compliance with
 the License.  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
 * Pure helpers for the archive calendar sidebar: turning a stats.json
 * active_months map ("YYYY-MM" → count) into a per-year month grid.
 */

import { monthSpec, parseMonthSpec } from "./dates";

export interface CalendarMonth {
  /** 1-based month number. */
  month: number;
  /** Canonical date spec ("YYYY-M") for list URLs. */
  spec: string;
  /** Emails in that month; 0 = no activity. */
  count: number;
}

export interface CalendarYear {
  year: number;
  months: CalendarMonth[];
}

/**
 * Build the year grid from active_months, newest year first, every year
 * between the first and last active one included (all twelve months, so
 * inactive months render as gaps rather than shifting the grid).
 */
export function buildCalendar(
  activeMonths: Record<string, number>,
): CalendarYear[] {
  const counts = new Map<string, number>();
  let firstYear = 0;
  let lastYear = 0;
  for (const [key, count] of Object.entries(activeMonths ?? {})) {
    const parsed = parseMonthSpec(key);
    if (!parsed || count <= 0) continue;
    counts.set(monthSpec(parsed.year, parsed.month), count);
    if (firstYear === 0 || parsed.year < firstYear) firstYear = parsed.year;
    if (parsed.year > lastYear) lastYear = parsed.year;
  }
  if (firstYear === 0) return [];

  const years: CalendarYear[] = [];
  for (let year = lastYear; year >= firstYear; year--) {
    const months: CalendarMonth[] = [];
    for (let month = 1; month <= 12; month++) {
      const spec = monthSpec(year, month);
      months.push({ month, spec, count: counts.get(spec) ?? 0 });
    }
    years.push({ year, months });
  }
  return years;
}

/** Date spec of the most recent month with activity, if any. */
export function latestActiveMonth(
  activeMonths: Record<string, number>,
): string | undefined {
  let best: { year: number; month: number } | undefined;
  for (const [key, count] of Object.entries(activeMonths ?? {})) {
    const parsed = parseMonthSpec(key);
    if (!parsed || count <= 0) continue;
    if (
      !best ||
      parsed.year * 12 + parsed.month > best.year * 12 + best.month
    ) {
      best = parsed;
    }
  }
  return best ? monthSpec(best.year, best.month) : undefined;
}

/**
 * Clamp a pagination window of `fit` years starting at `offset` into a list
 * of `total` years, so `slice(start, end)` always yields as many years as
 * fit (or all of them). Returns { start: 0, end: 0 } when nothing to show.
 */
export function visibleYearWindow(
  offset: number,
  fit: number,
  total: number,
): { start: number; end: number } {
  if (total <= 0 || fit <= 0) return { start: 0, end: 0 };
  const size = Math.min(Math.floor(fit), total);
  const start = Math.min(Math.max(0, Math.floor(offset)), total - size);
  return { start, end: start + size };
}

/** Compact activity count: 999 → "999", 1234 → "1.2k", 12345 → "12k". */
export function formatCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) {
    const tenths = Math.round(count / 100);
    return tenths % 10 === 0
      ? `${tenths / 10}k`
      : `${Math.floor(tenths / 10)}.${tenths % 10}k`;
  }
  return `${Math.round(count / 1000)}k`;
}
