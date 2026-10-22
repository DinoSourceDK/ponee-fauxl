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

import { describe, expect, it } from "vitest";
import type {
  StreamChild,
  StreamResponse,
  StreamRow,
  StreamStarter,
} from "./api/stream";
import type { SearchSpec } from "./search";
import {
  addressToRaw,
  buildListsStreamRequest,
  buildStreamRequest,
  domainListIds,
  emailRows,
  statsFromStream,
  streamBounds,
  streamEmail,
  prefetchCandidates,
  streamQuant,
  threadRows,
} from "./stream";

function starter(id: string): StreamStarter {
  return {
    id,
    mid: `m-${id}`,
    from: `Sender <${id}@example.org>`,
    gravatar: "0".repeat(32),
    epoch: 1000,
    subject: `s-${id}`,
    list: "dev@example.org",
    private: false,
    body: "teaser",
  };
}

function response(over: Partial<StreamResponse>): StreamResponse {
  return {
    mode: "threads",
    page: 0,
    quant: 25,
    total: 0,
    hits: 0,
    no_threads: 0,
    numparts: 0,
    firstYear: 2024,
    firstMonth: 1,
    lastYear: 2025,
    lastMonth: 9,
    active_months: { "2025-09": 3 },
    participants: [],
    searchlist: "<dev.example.org>",
    name: "dev",
    domain: "example.org",
    list: "dev@example.org",
    searchParams: { list: "dev", domain: "example.org" },
    unixtime: 1234,
    cached: false,
    rows: [],
    ...over,
  };
}

describe("streamQuant", () => {
  it("clamps into the endpoint's 1..100 range", () => {
    expect(streamQuant(25)).toBe(25);
    expect(streamQuant(0)).toBe(1);
    expect(streamQuant(-3)).toBe(1);
    expect(streamQuant(250)).toBe(100);
    expect(streamQuant(30.9)).toBe(30);
    expect(streamQuant(Number.NaN)).toBe(25);
  });
});

describe("buildStreamRequest", () => {
  it("maps the spec's list, date, query and headers", () => {
    const spec: SearchSpec = {
      lists: [{ list: "dev", domain: "example.org" }],
      date: "2025-9",
      query: "ponies",
      headers: { from: "humbedooh", subject: "release" },
    };
    expect(buildStreamRequest(spec, "threads", 2, 30)).toEqual({
      list: "dev",
      domain: "example.org",
      mode: "threads",
      page: 2,
      quant: 30,
      d: "2025-9",
      q: "ponies",
      header_from: "humbedooh",
      header_subject: "release",
    });
  });

  it("wildcards empty parts and omits unset filters", () => {
    const spec: SearchSpec = {
      lists: [{ list: "", domain: "example.org" }],
      headers: {},
    };
    expect(buildStreamRequest(spec, "emails", -1, 500)).toEqual({
      list: "*",
      domain: "example.org",
      mode: "emails",
      page: 0,
      quant: 100,
    });
  });

  it("sends sort only when it departs from the activity default", () => {
    const spec: SearchSpec = {
      lists: [{ list: "dev", domain: "example.org" }],
      headers: {},
    };
    expect(buildStreamRequest(spec, "threads", 0, 25, "activity").sort).toBe(
      undefined,
    );
    expect(buildStreamRequest(spec, "threads", 0, 25, "upvotes").sort).toBe(
      "upvotes",
    );
    expect(buildStreamRequest(spec, "threads", 0, 25, "replies").sort).toBe(
      "replies",
    );
  });
});

describe("buildListsStreamRequest", () => {
  it("joins the List-IDs and clamps paging", () => {
    const ids = ["<dev.example.org>", "<users.example.org>"];
    expect(buildListsStreamRequest(ids, "threads", -2, 500)).toEqual({
      lists: "<dev.example.org>,<users.example.org>",
      mode: "threads",
      page: 0,
      quant: 100,
    });
  });

  it("carries sort and date options, omitting the defaults", () => {
    const ids = ["<dev.example.org>"];
    expect(
      buildListsStreamRequest(ids, "threads", 0, 6, {
        sort: "upvotes",
        d: "2025-9",
      }),
    ).toEqual({
      lists: "<dev.example.org>",
      mode: "threads",
      page: 0,
      quant: 6,
      sort: "upvotes",
      d: "2025-9",
    });
    expect(
      buildListsStreamRequest(ids, "threads", 0, 6, { sort: "activity" }).sort,
    ).toBe(undefined);
  });
});

describe("domainListIds", () => {
  const all = {
    "example.org": { users: 5, dev: 10, commits: 900, announce: 0 },
    "other.org": { dev: 3 },
  };

  it("builds sorted List-IDs for one domain, excluding boring lists", () => {
    expect(domainListIds("example.org", all, ["commits"])).toEqual([
      "<announce.example.org>",
      "<dev.example.org>",
      "<users.example.org>",
    ]);
  });

  it("keeps inactive lists and tolerates unknown domains", () => {
    expect(domainListIds("example.org", all)).toContain(
      "<announce.example.org>",
    );
    expect(domainListIds("nope.org", all)).toEqual([]);
  });

  it("caps list-heavy domains at the server limit, keeping the busiest", () => {
    expect(domainListIds("example.org", all, [], 2)).toEqual([
      "<commits.example.org>",
      "<dev.example.org>",
    ]);
  });
});

describe("addressToRaw", () => {
  it("turns the address form into the stats raw form", () => {
    expect(addressToRaw("dev@lists.example.org")).toBe(
      "<dev.lists.example.org>",
    );
  });

  it("only converts the list/domain separator", () => {
    expect(addressToRaw("dev@example.org")).toBe("<dev.example.org>");
  });

  it("wraps @-less values untouched", () => {
    expect(addressToRaw("dev.example.org")).toBe("<dev.example.org>");
  });
});

describe("streamEmail", () => {
  it("adapts a starter, carrying the body teaser and both list forms", () => {
    const email = streamEmail(starter("a"));
    expect(email).toEqual({
      id: "a",
      mid: "m-a",
      from: "Sender <a@example.org>",
      subject: "s-a",
      epoch: 1000,
      list: "dev@example.org",
      list_raw: "<dev.example.org>",
      private: false,
      gravatar: "0".repeat(32),
      body: "teaser",
    });
  });

  it("adapts a child without inventing a body", () => {
    const child: StreamChild = { ...starter("c"), depth: 2 };
    delete (child as Partial<StreamStarter>).body;
    const email = streamEmail(child);
    expect(email.body).toBeUndefined();
    expect(email.id).toBe("c");
  });
});

describe("streamBounds", () => {
  it("computes 1-based bounds from page/quant/total", () => {
    expect(streamBounds(0, 25, 60, 25)).toEqual({
      page: 0,
      pages: 3,
      total: 60,
      first: 1,
      last: 25,
    });
    expect(streamBounds(2, 25, 60, 10)).toEqual({
      page: 2,
      pages: 3,
      total: 60,
      first: 51,
      last: 60,
    });
  });

  it("caps last at the total even when a page is oversupplied", () => {
    expect(streamBounds(2, 25, 55, 25).last).toBe(55);
  });

  it("returns 0/0 bounds for empty results", () => {
    expect(streamBounds(0, 25, 0, 0)).toEqual({
      page: 0,
      pages: 1,
      total: 0,
      first: 0,
      last: 0,
    });
  });

  it("clamps out-of-range pages", () => {
    expect(streamBounds(9, 25, 60, 0).page).toBe(2);
  });
});

describe("threadRows / emailRows", () => {
  const row: StreamRow = {
    tid: "t1",
    subject: "s",
    epoch: 1,
    last_epoch: 2,
    replies: 1,
    participants: 2,
    upvotes: 0,
    last_from: null,
    starter: starter("a"),
    children: [],
  };

  it("returns rows only for the matching mode", () => {
    expect(threadRows(response({ mode: "threads", rows: [row] }))).toEqual([
      row,
    ]);
    expect(emailRows(response({ mode: "threads", rows: [row] }))).toEqual([]);
    const emails = response({ mode: "emails", rows: [starter("a")] });
    expect(emailRows(emails)).toEqual([starter("a")]);
    expect(threadRows(emails)).toEqual([]);
  });

  it("tolerates the backend's {}-for-empty-array quirk", () => {
    const bad = response({ rows: {} as unknown as StreamRow[] });
    expect(threadRows(bad)).toEqual([]);
    expect(emailRows({ ...bad, mode: "emails" })).toEqual([]);
  });
});

describe("statsFromStream", () => {
  it("builds the minimal StatsResponse view components expect", () => {
    const stats = statsFromStream(
      response({
        hits: 42,
        numparts: 7,
        no_threads: 12,
        participants: [
          { email: "a@x", name: "A", count: 3, gravatar: "0".repeat(32) },
        ],
      }),
    );
    expect(stats.hits).toBe(42);
    expect(stats.numparts).toBe(7);
    expect(stats.no_threads).toBe(12);
    expect(stats.active_months).toEqual({ "2025-09": 3 });
    expect(stats.emails).toEqual([]);
    expect(stats.thread_struct).toEqual([]);
    expect(stats.participants).toHaveLength(1);
    expect(stats.searchParams).toEqual({ list: "dev", domain: "example.org" });
    expect(stats.unixtime).toBe(1234);
    expect(stats.list).toBe("dev@example.org");
  });

  it("normalizes {}-shaped participants and missing searchParams", () => {
    const resp = response({});
    resp.participants = {} as unknown as StreamResponse["participants"];
    (resp as Partial<StreamResponse>).searchParams = undefined;
    const stats = statsFromStream(resp);
    expect(stats.participants).toEqual([]);
    expect(stats.searchParams).toEqual({});
  });
});

describe("prefetchCandidates", () => {
  it("prefers the next pages, then the previous one", () => {
    expect(prefetchCandidates(3, 25, 250)).toEqual([4, 5, 2]);
  });

  it("clamps at both ends", () => {
    expect(prefetchCandidates(0, 25, 60)).toEqual([1, 2]);
    expect(prefetchCandidates(2, 25, 60)).toEqual([1]);
    expect(prefetchCandidates(0, 25, 20)).toEqual([]);
  });

  it("honors custom depths", () => {
    expect(prefetchCandidates(5, 10, 1000, 3, 2)).toEqual([6, 7, 8, 4, 3]);
  });
});
