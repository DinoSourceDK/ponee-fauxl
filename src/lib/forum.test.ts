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
  ThreadNode,
  ThreadStructNode,
} from "./api/types";
import {
  categoryDescription,
  flattenPosts,
  perListStats,
  threadUpvotes,
  topicsFromStats,
  topicsFromStream,
} from "./forum";
import { buildEmailIndex } from "./threads";

function node(
  tid: string,
  epoch: number,
  children: ThreadStructNode[] = [],
  subject = "s",
): ThreadStructNode {
  return { tid, mid: tid, subject, epoch, nest: 1, children };
}

function email(
  id: string,
  from: string,
  epoch = 1,
  upvotes?: number,
): EmailSummary {
  const eml: EmailSummary = {
    id,
    mid: id,
    from,
    subject: "s",
    epoch,
    list: "<dev.example.org>",
    private: false,
    gravatar: "0".repeat(32),
  };
  if (upvotes !== undefined) eml.social_upvotes = upvotes;
  return eml;
}

function statsWith(
  threads: ThreadStructNode[],
  emails: EmailSummary[],
): StatsResponse {
  return {
    hits: emails.length,
    numparts: 0,
    no_threads: threads.length,
    firstYear: 2024,
    firstMonth: 1,
    lastYear: 2024,
    lastMonth: 12,
    active_months: {},
    emails,
    thread_struct: threads,
    participants: [],
    cloud: null,
    searchlist: "<dev.example.org>",
    name: "dev",
    domain: "example.org",
    list: "dev@example.org",
    searchParams: {},
    unixtime: 0,
  };
}

function post(
  id: string,
  epoch: number,
  children?: ThreadNode[],
): ThreadNode {
  const p: ThreadNode = {
    id,
    mid: id,
    "message-id": `<${id}@example.org>`,
    from: "Alice <alice@example.org>",
    subject: "s",
    epoch,
    list_raw: "<dev.example.org>",
    body: "hello",
    private: false,
    gravatar: "0".repeat(32),
  };
  if (children) p.children = children;
  return p;
}

// a(100) -> [ b(200) -> [ c(500) ], d(300) ]
function fixture(): ThreadStructNode {
  return node("a", 100, [node("b", 200, [node("c", 500)]), node("d", 300)]);
}

describe("topicsFromStats", () => {
  it("builds one row per root, keeping the given order", () => {
    const emails = [
      email("a", "Alice <alice@example.org>", 100),
      email("b", "Bob <bob@example.org>", 200),
      email("c", "Carol <carol@example.org>", 500),
      email("d", "Alice <alice@example.org>", 300),
      email("x", "Xan <xan@example.org>", 600),
    ];
    const rows = topicsFromStats(statsWith([node("x", 600), fixture()], emails));
    expect(rows.map((r) => r.node.tid)).toEqual(["x", "a"]);

    const [x, a] = rows;
    expect(x.replies).toBe(0);
    expect(x.participants).toBe(1);
    expect(x.lastEpoch).toBe(600);
    expect(x.starter?.id).toBe("x");
    expect(x.last?.id).toBe("x");

    expect(a.replies).toBe(3);
    expect(a.participants).toBe(3); // Alice, Bob, Carol
    expect(a.lastEpoch).toBe(500);
    expect(a.starter?.id).toBe("a"); // the root itself
    expect(a.last?.id).toBe("c"); // newest node in the subtree
  });

  it("resolves starter to the oldest and last to the newest resolvable email", () => {
    // Root "a" is not indexed (outside the searched window).
    const emails = [
      email("b", "Bob <bob@example.org>", 200),
      email("d", "Dee <dee@example.org>", 300),
    ];
    const [row] = topicsFromStats(statsWith([fixture()], emails));
    expect(row.starter?.id).toBe("b"); // oldest resolvable, not the root
    // c(500) is newest but unresolvable, so last falls back to d(300).
    expect(row.last?.id).toBe("d");
    expect(row.lastEpoch).toBe(500); // still the true newest epoch
  });

  it("leaves starter and last undefined when nothing resolves", () => {
    const [row] = topicsFromStats(statsWith([fixture()], []));
    expect(row.starter).toBeUndefined();
    expect(row.last).toBeUndefined();
    expect(row.replies).toBe(3);
    expect(row.participants).toBe(0);
  });

  it("falls back to (No subject) for empty subjects", () => {
    const [row] = topicsFromStats(statsWith([node("a", 1, [], "")], []));
    expect(row.subject).toBe("(No subject)");
  });

  it("tolerates non-array emails/thread_struct (backend {} quirk)", () => {
    const stats = statsWith([], []);
    (stats as unknown as Record<string, unknown>).emails = {};
    (stats as unknown as Record<string, unknown>).thread_struct = {};
    expect(topicsFromStats(stats)).toEqual([]);
  });

  it("sums upvotes across root and nested children", () => {
    const emails = [
      email("a", "Alice <alice@example.org>", 100, 3),
      email("b", "Bob <bob@example.org>", 200, 1),
      email("c", "Carol <carol@example.org>", 500, 2),
      email("d", "Alice <alice@example.org>", 300, 4),
    ];
    const [row] = topicsFromStats(statsWith([fixture()], emails));
    expect(row.upvotes).toBe(10);
  });

  it("counts missing social_upvotes fields as 0", () => {
    const emails = [
      email("a", "Alice <alice@example.org>", 100, 5),
      email("b", "Bob <bob@example.org>", 200), // no social_upvotes
      email("c", "Carol <carol@example.org>", 500), // no social_upvotes
      email("d", "Alice <alice@example.org>", 300, 2),
    ];
    const [row] = topicsFromStats(statsWith([fixture()], emails));
    expect(row.upvotes).toBe(7);
  });

  it("skips unresolvable nodes when summing upvotes", () => {
    // Only b and d are indexed; a and c contribute nothing.
    const emails = [
      email("b", "Bob <bob@example.org>", 200, 1),
      email("d", "Dee <dee@example.org>", 300, 6),
    ];
    const [row] = topicsFromStats(statsWith([fixture()], emails));
    expect(row.upvotes).toBe(7);
  });

  it("reports 0 upvotes when nothing resolves", () => {
    const [row] = topicsFromStats(statsWith([fixture()], []));
    expect(row.upvotes).toBe(0);
  });
});

describe("threadUpvotes", () => {
  it("returns a single node's own upvotes", () => {
    const index = buildEmailIndex([
      email("solo", "Alice <alice@example.org>", 42, 9),
    ]);
    expect(threadUpvotes(node("solo", 42), index)).toBe(9);
  });

  it("returns 0 for a single unresolvable node", () => {
    expect(threadUpvotes(node("ghost", 1), new Map())).toBe(0);
  });

  it("sums the whole subtree, treating absent fields as 0", () => {
    const index = buildEmailIndex([
      email("a", "Alice <alice@example.org>", 100, 2),
      email("b", "Bob <bob@example.org>", 200), // absent -> 0
      email("c", "Carol <carol@example.org>", 500, 3),
      // d unresolvable -> skipped
    ]);
    expect(threadUpvotes(fixture(), index)).toBe(5);
  });
});

describe("flattenPosts", () => {
  it("flattens the whole tree sorted by epoch, regardless of nesting", () => {
    // root(100) -> [ b(300) -> [ d(150) ], c(200) ]
    const tree = post("root", 100, [
      post("b", 300, [post("d", 150)]),
      post("c", 200),
    ]);
    expect(flattenPosts(tree).map((p) => p.id)).toEqual([
      "root",
      "d",
      "c",
      "b",
    ]);
  });

  it("returns a single-node thread as-is", () => {
    const only = post("solo", 42);
    expect(flattenPosts(only)).toEqual([only]);
  });

  it("keeps document order for equal epochs (root first)", () => {
    const tree = post("root", 100, [
      post("b", 100, [post("c", 100)]),
      post("d", 100),
    ]);
    expect(flattenPosts(tree).map((p) => p.id)).toEqual([
      "root",
      "b",
      "c",
      "d",
    ]);
  });

  it("survives a 1000-deep chain", () => {
    let tip = post("n999", 999);
    for (let i = 998; i >= 0; i--) {
      tip = post(`n${i}`, i, [tip]);
    }
    const flat = flattenPosts(tip);
    expect(flat.length).toBe(1000);
    expect(flat[0].id).toBe("n0");
    expect(flat[999].id).toBe("n999");
  });
});

describe("topicsFromStream", () => {
  const starter = {
    id: "a",
    mid: "m-a",
    from: "Dev <dev@example.org>",
    gravatar: "0".repeat(32),
    epoch: 1000,
    subject: "Release vote",
    list: "dev@example.org",
    private: false,
    body: "+1 from me",
  };
  const resp = {
    mode: "threads",
    rows: [
      {
        tid: "m-a",
        subject: "Release vote",
        epoch: 1000,
        last_epoch: 2000,
        replies: 4,
        participants: 3,
        upvotes: 2,
        last_from: "Other <o@example.org>",
        starter,
        children: [],
      },
    ],
  } as unknown as import("./api/stream").StreamResponse;

  it("adapts server-computed thread stats into topic rows", () => {
    const rows = topicsFromStream(resp);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.node.tid).toBe("m-a");
    expect(row.subject).toBe("Release vote");
    expect(row.replies).toBe(4);
    expect(row.participants).toBe(3);
    expect(row.upvotes).toBe(2);
    expect(row.lastEpoch).toBe(2000);
    expect(row.lastFrom).toBe("Other <o@example.org>");
    expect(row.starter?.list_raw).toBe("<dev.example.org>");
    expect(row.starter?.body).toBe("+1 from me");
  });

  it("returns no rows for emails-mode responses", () => {
    expect(topicsFromStream({ ...resp, mode: "emails" })).toEqual([]);
  });
});

describe("categoryDescription", () => {
  it("matches exact list names", () => {
    expect(categoryDescription("commits", "tomcat.apache.org")).toContain(
      "read-only",
    );
    expect(categoryDescription("users-de", "httpd.apache.org")).toBe(
      "German users channel",
    );
  });

  it("substitutes the domain's project label", () => {
    expect(categoryDescription("users", "tomcat.apache.org")).toContain(
      "day-to-day use of tomcat",
    );
    expect(categoryDescription("announce", "airflow.apache.org")).toContain(
      "the airflow project",
    );
  });

  it("prefers a list@project override over the generic prefix", () => {
    expect(categoryDescription("dev", "httpd.apache.org")).toBe(
      "httpd development channel",
    );
    expect(categoryDescription("dev", "tomcat.apache.org")).toContain(
      "Main development discussion channel",
    );
  });

  it("falls back to the base prefix for suffixed lists", () => {
    expect(categoryDescription("users-fr", "httpd.apache.org")).toContain(
      "day-to-day use of httpd",
    );
  });

  it("always yields a non-empty generic filler", () => {
    expect(categoryDescription("modperl", "perl.apache.org")).toBe(
      "The modperl mailing list of the perl project",
    );
  });
});

describe("perListStats", () => {
  const eml = (id: string, list_raw: string, from: string) => ({
    id,
    mid: id,
    from,
    subject: "s",
    epoch: 1,
    list_raw,
    private: false,
    gravatar: "",
  });
  const node = (tid: string) => ({
    tid,
    subject: "s",
    epoch: 1,
    nest: 1,
    children: [],
  });

  it("counts posts, unique authors and threads per list", () => {
    const stats = {
      emails: [
        eml("a", "<dev.x.org>", "A <a@x>"),
        eml("b", "<dev.x.org>", "A <a@x>"),
        eml("c", "<dev.x.org>", "B <b@x>"),
        eml("d", "<users.x.org>", "C <c@x>"),
      ],
      thread_struct: [node("a"), node("c"), node("d")],
    } as unknown as import("./api/types").StatsResponse;
    expect(perListStats(stats)).toEqual({
      "dev@x.org": { hits: 3, participants: 2, threads: 2 },
      "users@x.org": { hits: 1, participants: 1, threads: 1 },
    });
  });

  it("tolerates {}-shaped fields and unresolvable starters", () => {
    const stats = {
      emails: {},
      thread_struct: [node("ghost")],
    } as unknown as import("./api/types").StatsResponse;
    expect(perListStats(stats)).toEqual({});
  });
});
