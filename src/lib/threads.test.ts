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
import type { EmailSummary, ThreadStructNode } from "./api/types";
import {
  lastEpoch,
  countReplies,
  countParticipants,
  flatten,
  sortThreadsNewestFirst,
  buildEmailIndex,
  visibleTreeRows,
} from "./threads";

function node(
  tid: string,
  epoch: number,
  children: ThreadStructNode[] = [],
): ThreadStructNode {
  return { tid, mid: tid, subject: "s", epoch, nest: 1, children };
}

function email(id: string, mid: string, from: string): EmailSummary {
  return {
    id,
    mid,
    from,
    subject: "s",
    epoch: 1,
    list: "<dev.example.org>",
    private: false,
    gravatar: "0".repeat(32),
  };
}

// root(100) -> [ b(200) -> [ c(500) ], d(300) ]
function fixture(): ThreadStructNode {
  return node("a", 100, [node("b", 200, [node("c", 500)]), node("d", 300)]);
}

// A pathological single chain of `depth` nodes to prove no recursion.
function deepChain(depth: number): ThreadStructNode {
  let tip = node(`n${depth - 1}`, depth - 1);
  for (let i = depth - 2; i >= 0; i--) {
    tip = node(`n${i}`, i, [tip]);
  }
  return tip;
}

describe("lastEpoch", () => {
  it("finds the newest epoch in the subtree", () => {
    expect(lastEpoch(fixture())).toBe(500);
    expect(lastEpoch(node("x", 42))).toBe(42);
  });
  it("survives a 1000-deep chain", () => {
    expect(lastEpoch(deepChain(1000))).toBe(999);
  });
});

describe("countReplies", () => {
  it("counts descendants", () => {
    expect(countReplies(fixture())).toBe(3);
    expect(countReplies(node("x", 1))).toBe(0);
  });
  it("ignores a child duplicating its parent's tid (legacy quirk)", () => {
    const dup = node("a", 100, [node("a", 100, [node("b", 200)])]);
    expect(countReplies(dup)).toBe(1);
  });
  it("survives a 1000-deep chain", () => {
    expect(countReplies(deepChain(1000))).toBe(999);
  });
});

describe("countParticipants", () => {
  it("counts unique senders across the subtree", () => {
    const index = buildEmailIndex([
      email("a", "a", "Alice <alice@example.org>"),
      email("b", "b", "Bob <bob@example.org>"),
      email("c", "c", "Alice <alice@example.org>"),
      email("d", "d", "Carol <carol@example.org>"),
    ]);
    expect(countParticipants(fixture(), index)).toBe(3);
  });
  it("skips nodes without a matching email", () => {
    const index = buildEmailIndex([email("a", "a", "Alice <a@example.org>")]);
    expect(countParticipants(fixture(), index)).toBe(1);
  });
  it("falls back to mid when tid is not indexed", () => {
    const n = node("unknown-tid", 100);
    n.mid = "m1";
    const index = buildEmailIndex([email("x1", "m1", "Bob <b@example.org>")]);
    expect(countParticipants(n, index)).toBe(1);
  });
  it("survives a 1000-deep chain", () => {
    const chain = deepChain(1000);
    const emails: EmailSummary[] = [];
    for (let i = 0; i < 1000; i++) {
      emails.push(email(`n${i}`, `n${i}`, `Person ${i % 7} <p${i % 7}@x.org>`));
    }
    expect(countParticipants(chain, buildEmailIndex(emails))).toBe(7);
  });
});

describe("flatten", () => {
  it("yields pre-order nodes with depths", () => {
    const flat = flatten(fixture());
    expect(flat.map((f) => f.node.tid)).toEqual(["a", "b", "c", "d"]);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 2, 1]);
  });
  it("survives a 1000-deep chain", () => {
    const flat = flatten(deepChain(1000));
    expect(flat.length).toBe(1000);
    expect(flat[0].depth).toBe(0);
    expect(flat[999].depth).toBe(999);
    expect(flat[999].node.tid).toBe("n999");
  });
});

describe("sortThreadsNewestFirst", () => {
  it("orders by newest activity in each subtree", () => {
    const a = fixture(); // last activity 500
    const e = node("e", 600);
    const f = node("f", 400);
    expect(sortThreadsNewestFirst([f, a, e]).map((n) => n.tid)).toEqual([
      "e",
      "a",
      "f",
    ]);
  });
  it("is stable for equal timestamps and does not mutate input", () => {
    const x = node("x", 100);
    const y = node("y", 100);
    const z = node("z", 100);
    const input = [x, y, z];
    const sorted = sortThreadsNewestFirst(input);
    expect(sorted.map((n) => n.tid)).toEqual(["x", "y", "z"]);
    expect(input).toEqual([x, y, z]);
    expect(sorted).not.toBe(input);
  });
});

describe("buildEmailIndex", () => {
  it("keys by both id and mid", () => {
    const eml = email("docid1", "mid1", "Alice <a@example.org>");
    const index = buildEmailIndex([eml]);
    expect(index.get("docid1")).toBe(eml);
    expect(index.get("mid1")).toBe(eml);
    expect(index.get("nope")).toBeUndefined();
  });
});

describe("visibleTreeRows", () => {
  const row = (key: string, depth: number) => ({ key, depth });
  // root ─ a ─ a1, a2 ─ a2x; b
  const rows = [
    row("root", 0),
    row("a", 1),
    row("a1", 2),
    row("a2", 2),
    row("a2x", 3),
    row("b", 1),
  ];

  it("shows only the root when nothing is expanded", () => {
    const v = visibleTreeRows(rows, new Set());
    expect(v.map((x) => x.row.key)).toEqual(["root"]);
    expect(v[0].descendants).toBe(5);
    expect(v[0].expanded).toBe(false);
  });

  it("expands one level at a time", () => {
    const v = visibleTreeRows(rows, new Set(["root"]));
    expect(v.map((x) => x.row.key)).toEqual(["root", "a", "b"]);
    const a = v.find((x) => x.row.key === "a")!;
    expect(a.descendants).toBe(3);
    const b = v.find((x) => x.row.key === "b")!;
    expect(b.descendants).toBe(0);
  });

  it("shows deep nodes only when every ancestor is expanded", () => {
    expect(
      visibleTreeRows(rows, new Set(["root", "a"])).map((x) => x.row.key),
    ).toEqual(["root", "a", "a1", "a2", "b"]);
    expect(
      visibleTreeRows(rows, new Set(["root", "a", "a2"])).map(
        (x) => x.row.key,
      ),
    ).toEqual(["root", "a", "a1", "a2", "a2x", "b"]);
    // a2 expanded but its parent chain is not: stays hidden
    expect(
      visibleTreeRows(rows, new Set(["a2"])).map((x) => x.row.key),
    ).toEqual(["root"]);
  });

  it("keeps later siblings visible past a collapsed subtree", () => {
    const v = visibleTreeRows(rows, new Set(["root", "a2"]));
    expect(v.map((x) => x.row.key)).toEqual(["root", "a", "b"]);
  });

  it("handles empty and flat inputs", () => {
    expect(visibleTreeRows([], new Set())).toEqual([]);
    const flat = [row("x", 0), row("y", 0)];
    expect(visibleTreeRows(flat, new Set()).map((x) => x.row.key)).toEqual([
      "x",
      "y",
    ]);
  });
});
