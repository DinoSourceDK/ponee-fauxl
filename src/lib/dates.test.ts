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

import { describe, it, expect } from "vitest";
import {
  MONTHS,
  formatDate,
  utcIso,
  relativeTime,
  monthSpec,
  parseMonthSpec,
  dateSpecLabel,
  parseDateSpec,
  buildDateSpec,
  type DateSpec,
} from "./dates";

const EPOCH = 1700000000; // 2023-11-14T22:13:20Z

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

describe("formatDate", () => {
  it("renders local wall-clock time as YYYY-MM-DD HH:mm", () => {
    const d = new Date(EPOCH * 1000);
    const expected =
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
      `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    expect(formatDate(EPOCH)).toBe(expected);
    expect(formatDate(EPOCH)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("renders UTC with a suffix when asked (classic prefs.UTC)", () => {
    const d = new Date(EPOCH * 1000);
    const expected =
      `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-` +
      `${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:` +
      `${pad2(d.getUTCMinutes())} UTC`;
    expect(formatDate(EPOCH, true)).toBe(expected);
  });
});

describe("utcIso", () => {
  it("returns second-precision ISO UTC", () => {
    expect(utcIso(EPOCH)).toBe("2023-11-14T22:13:20Z");
    expect(utcIso(0)).toBe("1970-01-01T00:00:00Z");
  });
});

describe("relativeTime", () => {
  const now = 1750000000;
  it("handles sub-minute ages", () => {
    expect(relativeTime(now - 30, now)).toBe("just now");
  });
  it("handles minutes", () => {
    expect(relativeTime(now - 60, now)).toBe("1 minute ago");
    expect(relativeTime(now - 3 * 60, now)).toBe("3 minutes ago");
  });
  it("handles hours", () => {
    expect(relativeTime(now - 3600, now)).toBe("1 hour ago");
    expect(relativeTime(now - 3 * 3600, now)).toBe("3 hours ago");
  });
  it("handles days up to 30", () => {
    expect(relativeTime(now - 86400, now)).toBe("1 day ago");
    expect(relativeTime(now - 3 * 86400, now)).toBe("3 days ago");
    expect(relativeTime(now - 30 * 86400, now)).toBe("30 days ago");
  });
  it("falls back to the date part beyond 30 days", () => {
    const old = now - 40 * 86400;
    expect(relativeTime(old, now)).toBe(formatDate(old).slice(0, 10));
    expect(relativeTime(old, now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("monthSpec / parseMonthSpec", () => {
  it("emits unpadded months like legacy links", () => {
    expect(monthSpec(2024, 3)).toBe("2024-3");
    expect(monthSpec(2024, 12)).toBe("2024-12");
  });
  it("round-trips", () => {
    for (let m = 1; m <= 12; m++) {
      expect(parseMonthSpec(monthSpec(2023, m))).toEqual({
        year: 2023,
        month: m,
      });
    }
  });
  it("accepts padded months too", () => {
    expect(parseMonthSpec("2024-03")).toEqual({ year: 2024, month: 3 });
  });
  it("rejects invalid specs", () => {
    expect(parseMonthSpec("2024-13")).toBeNull();
    expect(parseMonthSpec("2024-0")).toBeNull();
    expect(parseMonthSpec("24-3")).toBeNull();
    expect(parseMonthSpec("2024-3-1")).toBeNull();
    expect(parseMonthSpec("lte=1M")).toBeNull();
    expect(parseMonthSpec("")).toBeNull();
  });
});

describe("dateSpecLabel", () => {
  it("defaults to the backend 30-day window", () => {
    expect(dateSpecLabel(undefined)).toBe("last 30 days");
    expect(dateSpecLabel("")).toBe("last 30 days");
  });
  it("labels single months", () => {
    expect(dateSpecLabel("2024-3")).toBe("March 2024");
    expect(dateSpecLabel("2024-03")).toBe("March 2024");
    expect(dateSpecLabel("2023-12")).toBe("December 2023");
  });
  it("labels lte= relative specs", () => {
    expect(dateSpecLabel("lte=1M")).toBe("last month");
    expect(dateSpecLabel("lte=30d")).toBe("last 30 days");
    expect(dateSpecLabel("lte=2w")).toBe("last 2 weeks");
    expect(dateSpecLabel("lte=1y")).toBe("last year");
    expect(dateSpecLabel("gte=0d")).toBe("any time");
  });
  it("labels gte= relative specs", () => {
    expect(dateSpecLabel("gte=2y")).toBe("older than 2 years");
    expect(dateSpecLabel("gte=1M")).toBe("older than one month");
    expect(dateSpecLabel("gte=90d")).toBe("older than 90 days");
  });
  it("labels dfr/dto ranges", () => {
    expect(dateSpecLabel("dfr=2024-1-15|dto=2024-2-28")).toBe(
      "Jan 15, 2024 – Feb 28, 2024",
    );
    expect(dateSpecLabel("dfr=2023-11-01|dto=2023-12-31")).toBe(
      "Nov 1, 2023 – Dec 31, 2023",
    );
  });
  it("passes unrecognized specs through", () => {
    expect(dateSpecLabel("lte=1m")).toBe("lte=1m"); // lowercase m not in grammar
    expect(dateSpecLabel("2024-13")).toBe("2024-13");
    expect(dateSpecLabel("bogus")).toBe("bogus");
  });
});

describe("parseDateSpec", () => {
  it("returns the 30-day backend default for undefined/empty", () => {
    const def = { kind: "rel", dir: "lte", n: 30, unit: "d" };
    expect(parseDateSpec(undefined)).toEqual(def);
    expect(parseDateSpec("")).toEqual(def);
  });
  it("parses gte=0d as any time, and rejects other zero spans", () => {
    expect(parseDateSpec("gte=0d")).toEqual({ kind: "any" });
    const def = { kind: "rel", dir: "lte", n: 30, unit: "d" };
    expect(parseDateSpec("lte=0d")).toEqual(def);
    expect(parseDateSpec("gte=0M")).toEqual(def);
  });
  it("parses month specs via parseMonthSpec", () => {
    expect(parseDateSpec("2024-3")).toEqual({
      kind: "month",
      year: 2024,
      month: 3,
    });
    expect(parseDateSpec("2023-12")).toEqual({
      kind: "month",
      year: 2023,
      month: 12,
    });
  });
  it("parses relative specs", () => {
    expect(parseDateSpec("lte=2M")).toEqual({
      kind: "rel",
      dir: "lte",
      n: 2,
      unit: "M",
    });
    expect(parseDateSpec("gte=30d")).toEqual({
      kind: "rel",
      dir: "gte",
      n: 30,
      unit: "d",
    });
    expect(parseDateSpec("lte=6w")).toEqual({
      kind: "rel",
      dir: "lte",
      n: 6,
      unit: "w",
    });
    expect(parseDateSpec("gte=1y")).toEqual({
      kind: "rel",
      dir: "gte",
      n: 1,
      unit: "y",
    });
  });
  it("parses ranges, padding bounds to ISO for date inputs", () => {
    expect(parseDateSpec("dfr=2024-1-1|dto=2024-2-1")).toEqual({
      kind: "range",
      from: "2024-01-01",
      to: "2024-02-01",
    });
    expect(parseDateSpec("dfr=2023-11-01|dto=2023-12-31")).toEqual({
      kind: "range",
      from: "2023-11-01",
      to: "2023-12-31",
    });
  });
  it("treats junk as the backend default", () => {
    const junk = [
      "bogus",
      "2024-13",
      "2024-3-1",
      "lte=1m", // lowercase m not in the defuzzer grammar
      "lte=x",
      "gte=",
      "dfr=2024-1-1",
      "dfr=2024-1-1|dto=",
      "dfr=|dto=2024-2-1",
    ];
    for (const s of junk) {
      expect(parseDateSpec(s)).toEqual({
        kind: "rel",
        dir: "lte",
        n: 30,
        unit: "d",
      });
    }
  });
});

describe("buildDateSpec", () => {
  it("sends any time explicitly as gte=0d", () => {
    expect(buildDateSpec({ kind: "any" })).toBe("gte=0d");
  });
  it("builds month, relative and range strings", () => {
    expect(buildDateSpec({ kind: "month", year: 2024, month: 3 })).toBe(
      "2024-3",
    );
    expect(buildDateSpec({ kind: "rel", dir: "lte", n: 2, unit: "M" })).toBe(
      "lte=2M",
    );
    expect(buildDateSpec({ kind: "rel", dir: "gte", n: 1, unit: "y" })).toBe(
      "gte=1y",
    );
    expect(
      buildDateSpec({ kind: "range", from: "2024-01-01", to: "2024-02-01" }),
    ).toBe("dfr=2024-1-1|dto=2024-2-1");
  });
  it("degrades incomplete ranges to undefined", () => {
    expect(
      buildDateSpec({ kind: "range", from: "", to: "2024-02-01" }),
    ).toBeUndefined();
    expect(
      buildDateSpec({ kind: "range", from: "2024-01-01", to: "" }),
    ).toBeUndefined();
  });
  it("round-trips through parseDateSpec for all kinds", () => {
    const specs: DateSpec[] = [
      { kind: "any" },
      { kind: "month", year: 2024, month: 3 },
      { kind: "rel", dir: "lte", n: 2, unit: "M" },
      { kind: "rel", dir: "gte", n: 30, unit: "d" },
      { kind: "range", from: "2024-01-15", to: "2024-02-28" },
    ];
    for (const ds of specs) {
      expect(parseDateSpec(buildDateSpec(ds))).toEqual(ds);
    }
  });
});

describe("MONTHS", () => {
  it("has twelve names", () => {
    expect(MONTHS.length).toBe(12);
    expect(MONTHS[0]).toBe("January");
    expect(MONTHS[11]).toBe("December");
  });
});
