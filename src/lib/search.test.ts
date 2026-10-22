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
 * Fixtures mirror legacy URLs handled by webui/js/source/primer.js
 * (parseURL) and search.js, the behavior contract for parseListSearch.
 */

import { describe, it, expect } from "vitest";
import {
  atomUrl,
  parseListSearch,
  buildListSearch,
  isMonthBrowse,
  isSearch,
  specToRequests,
  listUrl,
  type SearchSpec,
} from "./search";

describe("parseListSearch", () => {
  it("parses a plain single-list selection (no date, no query)", () => {
    const spec = parseListSearch("dev@ponymail.apache.org");
    expect(spec).toEqual({
      lists: [{ list: "dev", domain: "ponymail.apache.org" }],
      headers: {},
    });
    expect(spec!.date).toBeUndefined();
    expect(spec!.query).toBeUndefined();
    expect(isSearch(spec!)).toBe(false);
  });

  it("accepts a leading '?'", () => {
    expect(parseListSearch("?dev@ponymail.apache.org")).toEqual(
      parseListSearch("dev@ponymail.apache.org"),
    );
  });

  it("parses a YYYY-MM month browse (not a search)", () => {
    const spec = parseListSearch("dev@ponymail.apache.org:2024-03");
    expect(spec).toEqual({
      lists: [{ list: "dev", domain: "ponymail.apache.org" }],
      date: "2024-03",
      headers: {},
    });
    expect(isMonthBrowse(spec!.date)).toBe(true);
    expect(isSearch(spec!)).toBe(false);
  });

  it("parses a search date spec plus query as a search", () => {
    const spec = parseListSearch("dev@ponymail.apache.org:lte=1M:VOTE");
    expect(spec).toEqual({
      lists: [{ list: "dev", domain: "ponymail.apache.org" }],
      date: "lte=1M",
      query: "VOTE",
      headers: {},
    });
    expect(isMonthBrowse(spec!.date)).toBe(false);
    expect(isSearch(spec!)).toBe(true);
  });

  it("treats a bare domain as all lists on that domain", () => {
    const spec = parseListSearch("apache.org");
    expect(spec).toEqual({
      lists: [{ list: "*", domain: "apache.org" }],
      headers: {},
    });
  });

  it("parses a comma-separated virtual inbox as multiple lists", () => {
    const spec = parseListSearch("a@x.org,b@y.org");
    expect(spec).toEqual({
      lists: [
        { list: "a", domain: "x.org" },
        { list: "b", domain: "y.org" },
      ],
      headers: {},
    });
  });

  it("returns null when no list/domain selection is present", () => {
    expect(parseListSearch("")).toBeNull();
    expect(parseListSearch("?")).toBeNull();
  });

  it("parses an empty date slot plus unencoded header_from (legacy link)", () => {
    const spec = parseListSearch(
      "*@httpd.apache.org::&header_from=Jim Jagielski",
    );
    expect(spec).toEqual({
      lists: [{ list: "*", domain: "httpd.apache.org" }],
      headers: { from: "Jim Jagielski" },
    });
    expect(spec!.date).toBeUndefined();
    expect(spec!.query).toBeUndefined();
    // Header-only filters still count as a search.
    expect(isSearch(spec!)).toBe(true);
  });

  it("keeps a bare '&' inside an unencoded header value (issue #266)", () => {
    const spec = parseListSearch(
      "*@httpd.apache.org::&header_from=A&B Corp&header_subject=[VOTE]",
    );
    expect(spec).toEqual({
      lists: [{ list: "*", domain: "httpd.apache.org" }],
      headers: { from: "A&B Corp", subject: "[VOTE]" },
    });
  });

  it("keeps an encoded colon (%3A) inside the query", () => {
    const spec = parseListSearch("dev@ponymail.apache.org:lte=1M:foo%3Abar");
    expect(spec!.date).toBe("lte=1M");
    expect(spec!.query).toBe("foo:bar");
  });

  it("decodes '+' in the query to a space (legacy permalink style)", () => {
    const spec = parseListSearch("dev@ponymail.apache.org:lte=1M:foo+bar");
    expect(spec!.query).toBe("foo bar");
  });

  it("ignores a ui= layout parameter before header params", () => {
    expect(
      parseListSearch("?users@x.org:2025-9:crash&ui=forum&header_from=bob"),
    ).toEqual(parseListSearch("?users@x.org:2025-9:crash&header_from=bob"));
  });

  it("ignores a ui= layout parameter after header params", () => {
    expect(
      parseListSearch("?users@x.org:2025-9&header_from=bob&ui=standard"),
    ).toEqual(parseListSearch("?users@x.org:2025-9&header_from=bob"));
  });

  it("ignores ui= when the query itself contains ':'", () => {
    const spec = parseListSearch("dev@x.org:lte=1M:foo%3Abar&ui=forum");
    expect(spec).toEqual(parseListSearch("dev@x.org:lte=1M:foo%3Abar"));
    expect(spec!.query).toBe("foo:bar");
  });

  it("returns null when only a ui= parameter is present", () => {
    expect(parseListSearch("?ui=forum")).toBeNull();
  });
});

describe("isMonthBrowse", () => {
  it("matches YYYY-M / YYYY-MM only", () => {
    expect(isMonthBrowse("2024-03")).toBe(true);
    expect(isMonthBrowse("2024-3")).toBe(true);
    expect(isMonthBrowse("lte=1M")).toBe(false);
    expect(isMonthBrowse("dfr=2024-01-01|dto=2024-02-01")).toBe(false);
    expect(isMonthBrowse("")).toBe(false);
    expect(isMonthBrowse(undefined)).toBe(false);
  });
});

describe("buildListSearch / listUrl / roundtrip", () => {
  it("builds the canonical month-browse URL", () => {
    const spec: SearchSpec = {
      lists: [{ list: "dev", domain: "example.org" }],
      date: "2024-03",
      headers: {},
    };
    expect(buildListSearch(spec)).toBe("dev@example.org:2024-03");
    // .html because the build ships a real list.html (reload-safe URLs).
    expect(listUrl(spec)).toBe("/list.html?dev@example.org:2024-03");
  });

  it("emits an empty date slot when only a query is present", () => {
    const spec: SearchSpec = {
      lists: [{ list: "dev", domain: "example.org" }],
      query: "VOTE",
      headers: {},
    };
    expect(buildListSearch(spec)).toBe("dev@example.org::VOTE");
  });

  const canonical: Array<[string, SearchSpec]> = [
    [
      "single list, no filters",
      { lists: [{ list: "dev", domain: "ponymail.apache.org" }], headers: {} },
    ],
    [
      "month browse",
      {
        lists: [{ list: "dev", domain: "ponymail.apache.org" }],
        date: "2024-03",
        headers: {},
      },
    ],
    [
      "date spec + query with reserved chars",
      {
        lists: [{ list: "dev", domain: "ponymail.apache.org" }],
        date: "lte=1M",
        query: "foo:bar +baz \"a phrase\"",
        headers: {},
      },
    ],
    [
      "virtual inbox",
      {
        lists: [
          { list: "a", domain: "x.org" },
          { list: "b", domain: "y.org" },
        ],
        headers: {},
      },
    ],
    [
      "wildcard list + headers with '&' and spaces",
      {
        lists: [{ list: "*", domain: "httpd.apache.org" }],
        headers: { from: "A&B Corp", subject: "[VOTE] release" },
      },
    ],
  ];

  for (const [name, spec] of canonical) {
    it(`roundtrips: ${name}`, () => {
      expect(parseListSearch(buildListSearch(spec))).toEqual(spec);
    });
  }
});

describe("specToRequests", () => {
  it("maps date->d, query->q and headers->header_*", () => {
    const spec: SearchSpec = {
      lists: [{ list: "dev", domain: "ponymail.apache.org" }],
      date: "lte=1M",
      query: "VOTE",
      headers: {
        from: "Jim",
        subject: "[VOTE]",
        to: "dev",
        body: "release",
        messageid: "abc@def",
      },
    };
    expect(specToRequests(spec)).toEqual([
      {
        list: "dev",
        domain: "ponymail.apache.org",
        social: "yes",
        streaming: "yes",
        d: "lte=1M",
        q: "VOTE",
        header_from: "Jim",
        header_subject: "[VOTE]",
        header_to: "dev",
        header_body: "release",
        header_messageid: "abc@def",
      },
    ]);
  });

  it("emits one request per list and omits absent filters", () => {
    const spec: SearchSpec = {
      lists: [
        { list: "a", domain: "x.org" },
        { list: "b", domain: "y.org" },
      ],
      headers: {},
    };
    expect(specToRequests(spec)).toEqual([
      { list: "a", domain: "x.org", social: "yes", streaming: "yes" },
      { list: "b", domain: "y.org", social: "yes", streaming: "yes" },
    ]);
  });

  it('asks for social data (social: "yes") on every request', () => {
    const spec: SearchSpec = {
      lists: [
        { list: "dev", domain: "x.org" },
        { list: "*", domain: "y.org" },
      ],
      date: "2024-03",
      headers: {},
    };
    for (const req of specToRequests(spec)) {
      expect(req.social).toBe("yes");
    }
  });
});

describe("atomUrl", () => {
  it("carries the full search parameters", () => {
    const spec: SearchSpec = {
      lists: [{ list: "users", domain: "httpd.apache.org" }],
      date: "2025-9",
      query: "tls certs",
      headers: { from: "Bret Stern" },
    };
    expect(atomUrl(spec)).toBe(
      "/api/atom?list=users&domain=httpd.apache.org&d=2025-9" +
        "&q=tls+certs&header_from=Bret+Stern",
    );
  });

  it("supports wildcard specs but not virtual inboxes", () => {
    expect(
      atomUrl({ lists: [{ list: "*", domain: "httpd.apache.org" }], headers: {} }),
    ).toBe("/api/atom?list=*&domain=httpd.apache.org");
    expect(
      atomUrl({
        lists: [
          { list: "a", domain: "x.org" },
          { list: "b", domain: "y.org" },
        ],
        headers: {},
      }),
    ).toBeNull();
  });
});
