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
import type {
  EmailSummary,
  StatsResponse,
  ThreadStructNode,
} from "./api/types";
import { buildEmailIndex } from "./threads";
import {
  VIRTUAL_INBOX,
  authorName,
  emptyStats,
  originalEmail,
  emailListAddress,
  listRawToAddress,
  mboxFilename,
  mergeStats,
  pageSlice,
  perPage,
  pickDomainList,
  showsListBadge,
  teaser,
} from "./listview";

function email(id: string, epoch: number): EmailSummary {
  return {
    id,
    mid: id,
    from: `Sender <${id}@example.org>`,
    subject: `s-${id}`,
    epoch,
    list: "<dev.example.org>",
    private: false,
    gravatar: "0".repeat(32),
  };
}

function node(
  tid: string,
  epoch: number,
  children: ThreadStructNode[] = [],
): ThreadStructNode {
  return { tid, mid: tid, subject: "s", epoch, nest: 1, children };
}

function response(over: Partial<StatsResponse>): StatsResponse {
  return {
    hits: 0,
    numparts: 0,
    no_threads: 0,
    firstYear: 2024,
    firstMonth: 1,
    lastYear: 2025,
    lastMonth: 9,
    active_months: {},
    emails: [],
    thread_struct: [],
    participants: [],
    searchlist: "<dev.example.org>",
    name: "dev",
    domain: "example.org",
    list: "dev@example.org",
    searchParams: { list: "dev", domain: "example.org" },
    unixtime: 1000,
    ...over,
  };
}

describe("mergeStats", () => {
  it("sorts a single response's emails newest-first and keeps searchlist", () => {
    const merged = mergeStats([
      response({ hits: 2, emails: [email("a", 100), email("b", 200)] }),
    ]);
    expect(merged.emails.map((e) => e.id)).toEqual(["b", "a"]);
    expect(merged.searchlist).toBe("<dev.example.org>");
    expect(merged.hits).toBe(2);
  });

  it("merges several responses into a virtual inbox", () => {
    const a = response({
      hits: 1,
      numparts: 2,
      no_threads: 1,
      emails: [email("a", 100)],
      thread_struct: [node("a", 100)],
      active_months: { "2025-01": 3 },
      participants: [
        { email: "x@e.org", name: "X", count: 2, gravatar: "0" },
      ],
      unixtime: 1000,
    });
    const b = response({
      hits: 3,
      numparts: 1,
      no_threads: 2,
      emails: [email("b", 300), email("c", 200)],
      thread_struct: [node("b", 300, [node("c", 400)])],
      active_months: { "2025-01": 1, "2025-02": 5 },
      participants: [
        { email: "x@e.org", name: "X", count: 1, gravatar: "0" },
        { email: "y@e.org", name: "Y", count: 5, gravatar: "0" },
      ],
      unixtime: 2000,
    });
    const merged = mergeStats([a, b]);
    expect(merged.hits).toBe(4);
    expect(merged.numparts).toBe(3);
    expect(merged.no_threads).toBe(3);
    expect(merged.searchlist).toBe(VIRTUAL_INBOX);
    expect(merged.emails.map((e) => e.id)).toEqual(["b", "c", "a"]);
    // Thread "b" has newest activity (400 via its child), so it leads.
    expect(merged.thread_struct.map((t) => t.tid)).toEqual(["b", "a"]);
    expect(merged.active_months).toEqual({ "2025-01": 4, "2025-02": 5 });
    expect(merged.participants.map((p) => [p.email, p.count])).toEqual([
      ["y@e.org", 5],
      ["x@e.org", 3],
    ]);
    expect(merged.unixtime).toBe(2000);
  });

  it("ignores empty placeholders when computing the archive span", () => {
    const merged = mergeStats([
      response({ firstYear: 2023, firstMonth: 9 }),
      emptyStats({ list: "gone", domain: "example.org" }),
    ]);
    expect(merged.firstYear).toBe(2023);
    expect(merged.firstMonth).toBe(9);
    expect(merged.lastYear).toBe(2025);
    expect(merged.lastMonth).toBe(9);
  });

  it("tolerates {} where the backend should return [] (zero-hit lists)", () => {
    // stats.json returns participants: {} (not []) when there are no hits.
    const zeroHits = response({
      participants: {} as unknown as StatsResponse["participants"],
      emails: {} as unknown as StatsResponse["emails"],
      thread_struct: {} as unknown as StatsResponse["thread_struct"],
    });
    const merged = mergeStats([zeroHits]);
    expect(merged.participants).toEqual([]);
    expect(merged.emails).toEqual([]);
    expect(merged.thread_struct).toEqual([]);
  });

  it("throws on an empty input", () => {
    expect(() => mergeStats([])).toThrow();
  });
});

describe("pickDomainList", () => {
  const lists = { commits: 900, dev: 120, users: 400 };

  it("prefers the favorite list when the domain has it", () => {
    expect(pickDomainList(lists, "dev", ["commits"])).toBe("dev");
  });

  it("falls back to the most active non-boring list", () => {
    expect(pickDomainList(lists, "announce", ["commits"])).toBe("users");
  });

  it("uses boring lists when nothing else exists", () => {
    expect(pickDomainList({ commits: 5 }, "dev", ["commits"])).toBe("commits");
  });

  it("returns undefined for an empty domain", () => {
    expect(pickDomainList({}, "dev", [])).toBeUndefined();
  });
});

describe("perPage", () => {
  it("fits rows and rounds down to a multiple of 5", () => {
    expect(perPage(1000, 40)).toBe(25);
    expect(perPage(999, 40)).toBe(20); // 24 rows fit -> 20
    expect(perPage(280, 40)).toBe(5); // 7 rows fit -> 5
  });
  it("never goes below 5", () => {
    expect(perPage(100, 40)).toBe(5);
    expect(perPage(0, 40)).toBe(5);
    expect(perPage(-50, 40)).toBe(5);
  });
  it("tolerates a nonsense row height", () => {
    expect(perPage(1000, 0)).toBe(5);
  });
});

describe("pageSlice", () => {
  const items = Array.from({ length: 12 }, (_, i) => i);

  it("slices with 1-based bounds", () => {
    const s = pageSlice(items, 0, 5);
    expect(s.items).toEqual([0, 1, 2, 3, 4]);
    expect(s).toMatchObject({ first: 1, last: 5, total: 12, pages: 3 });
  });

  it("handles a short final page", () => {
    const s = pageSlice(items, 2, 5);
    expect(s.items).toEqual([10, 11]);
    expect(s).toMatchObject({ first: 11, last: 12, page: 2 });
  });

  it("clamps out-of-range pages", () => {
    expect(pageSlice(items, 99, 5).page).toBe(2);
    expect(pageSlice(items, -3, 5).page).toBe(0);
  });

  it("handles empty input", () => {
    const s = pageSlice([], 0, 5);
    expect(s).toMatchObject({ first: 0, last: 0, total: 0, pages: 1 });
    expect(s.items).toEqual([]);
  });
});

describe("originalEmail", () => {
  it("returns the thread root, not the newest reply", () => {
    const tree = node("a", 100, [node("b", 300), node("c", 200)]);
    const index = buildEmailIndex([
      email("a", 100),
      email("b", 300),
      email("c", 200),
    ]);
    expect(originalEmail(tree, index)?.id).toBe("a");
  });

  it("falls back to the oldest resolvable reply when the root is missing", () => {
    const tree = node("missing", 100, [node("late", 300), node("early", 200)]);
    const index = buildEmailIndex([email("late", 300), email("early", 200)]);
    expect(originalEmail(tree, index)?.id).toBe("early");
  });

  it("returns undefined when nothing resolves", () => {
    expect(originalEmail(node("a", 100), buildEmailIndex([]))).toBeUndefined();
  });
});

describe("authorName", () => {
  it("strips the address part and quotes", () => {
    expect(authorName('"Jane Doe" <jane@example.org>')).toBe("Jane Doe");
    expect(authorName("Jane Doe <jane@example.org>")).toBe("Jane Doe");
  });
  it("falls back to the address when there is no display name", () => {
    expect(authorName("<jane@example.org>")).toBe("jane@example.org");
    expect(authorName("jane@example.org")).toBe("jane@example.org");
  });
  it("copes with empty input", () => {
    expect(authorName("")).toBe("(unknown)");
  });
});

describe("teaser", () => {
  it("returns the first non-empty line, trimmed", () => {
    expect(teaser("\n\n  Hello world  \nsecond line")).toBe("Hello world");
  });
  it("returns empty for missing or blank bodies", () => {
    expect(teaser(undefined)).toBe("");
    expect(teaser("  \n \n")).toBe("");
  });
});

describe("emailListAddress", () => {
  it("trusts list only when it is already an address", () => {
    // stats.json form
    expect(
      emailListAddress({ list: "dev@example.org", list_raw: "<x>" }),
    ).toBe("dev@example.org");
    // thread.json quirk: list carries the RAW form
    expect(
      emailListAddress({
        list: "<users.httpd.apache.org>",
        list_raw: "<users.httpd.apache.org>",
      }),
    ).toBe("users@httpd.apache.org");
    expect(emailListAddress({ list_raw: "<dev.example.org>" })).toBe(
      "dev@example.org",
    );
  });
});

describe("listRawToAddress", () => {
  it("converts the first dot only", () => {
    expect(listRawToAddress("<users.httpd.apache.org>")).toBe(
      "users@httpd.apache.org",
    );
  });
});

describe("showsListBadge", () => {
  it("is true for multi-list and wildcard specs", () => {
    expect(
      showsListBadge([
        { list: "a", domain: "x.org" },
        { list: "b", domain: "x.org" },
      ]),
    ).toBe(true);
    expect(showsListBadge([{ list: "*", domain: "x.org" }])).toBe(true);
    expect(showsListBadge([{ list: "a", domain: "*" }])).toBe(true);
  });
  it("is false for one concrete list", () => {
    expect(showsListBadge([{ list: "a", domain: "x.org" }])).toBe(false);
  });
});

describe("mboxFilename", () => {
  it("replaces unsafe characters", () => {
    expect(mboxFilename("users@httpd.apache.org-2025-09")).toBe(
      "users_httpd_apache_org_2025_09.mbox",
    );
  });
});
