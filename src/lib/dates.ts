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
 * Date formatting helpers. All epochs are UNIX seconds (as returned by the
 * backend). Date-spec labelling follows the grammar accepted by
 * server/plugins/defuzzer.py: "YYYY-M" (single month), "lte=N<unit>" /
 * "gte=N<unit>" with units d/w/M/y, and "dfr=YYYY-M-D|dto=YYYY-M-D".
 */

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// formatToParts (rather than format) so the output layout is locale-proof.
const LOCAL_FMT = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Wall-clock time as "YYYY-MM-DD HH:mm", browser-local by default or
 * UTC (suffixed "UTC") when `utc` is set, the classic prefs.UTC option.
 */
export function formatDate(epoch: number, utc = false): string {
  const date = new Date(epoch * 1000);
  if (utc) {
    return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }
  const parts = LOCAL_FMT.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** ISO 8601 UTC timestamp (second precision), e.g. for title attributes. */
export function utcIso(epoch: number): string {
  return new Date(epoch * 1000).toISOString().slice(0, 19) + "Z";
}

/**
 * Short relative age: "just now", "3 minutes/hours/days ago". Beyond 30
 * days it falls back to the local date part ("YYYY-MM-DD").
 * `nowEpoch` is overridable for testing.
 */
export function relativeTime(
  epoch: number,
  nowEpoch: number = Date.now() / 1000,
): string {
  const delta = Math.floor(nowEpoch - epoch);
  if (delta < 60) return "just now";
  const minutes = Math.floor(delta / 60);
  if (minutes < 60) {
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }
  const hours = Math.floor(delta / 3600);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(delta / 86400);
  if (days <= 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  return formatDate(epoch).slice(0, 10);
}

/** Month browse spec "YYYY-M", month deliberately unpadded (legacy links). */
export function monthSpec(year: number, month: number): string {
  return `${year}-${month}`;
}

/** Parse "YYYY-M" or "YYYY-MM"; null if not a valid month spec. */
export function parseMonthSpec(
  spec: string,
): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{1,2})$/.exec(spec);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

const UNIT_NAMES: Record<string, string> = {
  d: "day",
  w: "week",
  M: "month",
  y: "year",
};

function shortDate(y: string, mo: string, d: string): string {
  const name = MONTHS[parseInt(mo, 10) - 1] ?? mo;
  return `${name.slice(0, 3)} ${parseInt(d, 10)}, ${parseInt(y, 10)}`;
}

/**
 * Human description of a backend date spec:
 *  - undefined      -> "last 30 days" (the backend default window)
 *  - "2024-3"       -> "March 2024"
 *  - "lte=1M"       -> "last month", "lte=30d" -> "last 30 days"
 *  - "gte=2y"       -> "older than 2 years", "gte=0d" -> "any time"
 *  - "dfr=..|dto=.." -> "Jan 15, 2024 – Feb 28, 2024"
 * Unrecognized specs are returned verbatim.
 */
export function dateSpecLabel(spec: string | undefined): string {
  if (!spec) return "last 30 days";
  if (spec === ANY_TIME) return "any time";

  const month = parseMonthSpec(spec);
  if (month) return `${MONTHS[month.month - 1]} ${month.year}`;

  const rel = /^(lte|gte)=([0-9]+)([dwMy])$/.exec(spec);
  if (rel) {
    const n = parseInt(rel[2], 10);
    const unit = UNIT_NAMES[rel[3]];
    if (rel[1] === "lte") {
      return n === 1 ? `last ${unit}` : `last ${n} ${unit}s`;
    }
    return n === 1 ? `older than one ${unit}` : `older than ${n} ${unit}s`;
  }

  const span =
    /^dfr=(\d{4})-(\d{1,2})-(\d{1,2})\|dto=(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(
      spec,
    );
  if (span) {
    return `${shortDate(span[1], span[2], span[3])} – ${shortDate(span[4], span[5], span[6])}`;
  }

  return spec;
}

/* --- structured date specs (advanced search) --------------------------- */

export type DateSpec =
  | { kind: "any" }
  | { kind: "month"; year: number; month: number }
  | { kind: "rel"; dir: "lte" | "gte"; n: number; unit: "d" | "w" | "M" | "y" }
  /** Bounds as ISO "YYYY-MM-DD", the native <input type=date> format. */
  | { kind: "range"; from: string; to: string };

function isoDay(y: string, mo: string, d: string): string {
  return `${y.padStart(4, "0")}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * "Any time" as a date spec: "more than 0 days ago". It must be sent
 * explicitly, since omitting the date gets the backend's 30-day default.
 * Zero is valid only here; relative specs otherwise need n >= 1.
 */
export const ANY_TIME = "gte=0d";

/** The window the backend applies when no date spec is sent. */
const BACKEND_DEFAULT: DateSpec = { kind: "rel", dir: "lte", n: 30, unit: "d" };

/**
 * Parse a backend date spec into structured form. No spec, or one the
 * backend would ignore, means its default window (last 30 days).
 */
export function parseDateSpec(spec?: string): DateSpec {
  if (!spec) return { ...BACKEND_DEFAULT };
  if (spec === ANY_TIME) return { kind: "any" };

  const month = parseMonthSpec(spec);
  if (month) return { kind: "month", ...month };

  const rel = /^(lte|gte)=(\d+)([dwMy])$/.exec(spec);
  if (rel && parseInt(rel[2], 10) > 0) {
    return {
      kind: "rel",
      dir: rel[1] as "lte" | "gte",
      n: parseInt(rel[2], 10),
      unit: rel[3] as "d" | "w" | "M" | "y",
    };
  }

  const span = /^dfr=(\d+)-(\d+)-(\d+)\|dto=(\d+)-(\d+)-(\d+)$/.exec(spec);
  if (span) {
    return {
      kind: "range",
      from: isoDay(span[1], span[2], span[3]),
      to: isoDay(span[4], span[5], span[6]),
    };
  }

  return { ...BACKEND_DEFAULT };
}

/** ISO "YYYY-MM-DD" → unpadded "Y-M-D" (defuzzer style); null if malformed. */
function unpadIso(iso: string): string | null {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(iso);
  if (!m) return null;
  return `${parseInt(m[1], 10)}-${parseInt(m[2], 10)}-${parseInt(m[3], 10)}`;
}

/**
 * Inverse of parseDateSpec: the backend/URL string form. A range needs
 * both bounds (the UI enforces this before
 * submitting); an incomplete range degrades to undefined.
 */
export function buildDateSpec(ds: DateSpec): string | undefined {
  switch (ds.kind) {
    case "any":
      return ANY_TIME;
    case "month":
      return monthSpec(ds.year, ds.month);
    case "rel":
      return `${ds.dir}=${ds.n}${ds.unit}`;
    case "range": {
      const from = unpadIso(ds.from);
      const to = unpadIso(ds.to);
      return from && to ? `dfr=${from}|dto=${to}` : undefined;
    }
  }
}
