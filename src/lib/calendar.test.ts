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
  buildCalendar,
  formatCount,
  latestActiveMonth,
  visibleYearWindow,
} from "./calendar";

describe("buildCalendar", () => {
  it("spans all years between first and last activity, newest first", () => {
    const years = buildCalendar({
      "2023-11": 3,
      "2025-02": 7,
    });
    expect(years.map((y) => y.year)).toEqual([2025, 2024, 2023]);
    expect(years[0].months).toHaveLength(12);
    expect(years[0].months[1]).toEqual({ month: 2, spec: "2025-2", count: 7 });
    expect(years[2].months[10].count).toBe(3);
    // A year with no activity still renders twelve empty months.
    expect(years[1].months.every((m) => m.count === 0)).toBe(true);
  });

  it("normalizes zero-padded keys to canonical specs", () => {
    const years = buildCalendar({ "2025-09": 26 });
    expect(years[0].months[8].spec).toBe("2025-9");
  });

  it("ignores junk keys and zero counts", () => {
    expect(buildCalendar({ junk: 5, "2025-13": 2, "2025-01": 0 })).toEqual([]);
  });

  it("handles an empty or missing map", () => {
    expect(buildCalendar({})).toEqual([]);
  });
});

describe("latestActiveMonth", () => {
  it("returns the newest month with activity", () => {
    expect(
      latestActiveMonth({ "2024-12": 5, "2025-09": 1, "2025-08": 9 }),
    ).toBe("2025-9");
  });

  it("returns undefined when nothing is active", () => {
    expect(latestActiveMonth({})).toBeUndefined();
    expect(latestActiveMonth({ "2025-01": 0 })).toBeUndefined();
  });
});

describe("visibleYearWindow", () => {
  it("slices a plain window inside bounds", () => {
    expect(visibleYearWindow(2, 3, 10)).toEqual({ start: 2, end: 5 });
  });

  it("clamps a too-large offset so the window stays full", () => {
    expect(visibleYearWindow(9, 3, 10)).toEqual({ start: 7, end: 10 });
    expect(visibleYearWindow(100, 3, 10)).toEqual({ start: 7, end: 10 });
  });

  it("clamps negative offsets to the newest years", () => {
    expect(visibleYearWindow(-4, 3, 10)).toEqual({ start: 0, end: 3 });
  });

  it("shows everything when more fits than exists", () => {
    expect(visibleYearWindow(0, 12, 5)).toEqual({ start: 0, end: 5 });
    expect(visibleYearWindow(3, 12, 5)).toEqual({ start: 0, end: 5 });
  });

  it("returns an empty window when nothing can show", () => {
    expect(visibleYearWindow(0, 3, 0)).toEqual({ start: 0, end: 0 });
    expect(visibleYearWindow(0, 0, 10)).toEqual({ start: 0, end: 0 });
    expect(visibleYearWindow(0, -1, 10)).toEqual({ start: 0, end: 0 });
  });

  it("floors fractional inputs", () => {
    expect(visibleYearWindow(1.9, 2.7, 10)).toEqual({ start: 1, end: 3 });
  });
});

describe("formatCount", () => {
  it("keeps small counts as-is", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
  });

  it("abbreviates thousands with one decimal when it matters", () => {
    expect(formatCount(1000)).toBe("1k");
    expect(formatCount(1234)).toBe("1.2k");
    expect(formatCount(9940)).toBe("9.9k");
    expect(formatCount(9960)).toBe("10k");
    expect(formatCount(12345)).toBe("12k");
  });
});
