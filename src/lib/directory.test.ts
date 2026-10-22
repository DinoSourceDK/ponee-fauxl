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
import { organizeLists, topActiveLists } from "./directory";

const BORING = ["commits", "cvs"];
const FAVORED = ["dev", "users"];

function names(lists: { name: string }[]): string[] {
  return lists.map((l) => l.name);
}

describe("organizeLists", () => {
  it("sorts favored before normal before boring, regardless of counts", () => {
    const { active } = organizeLists(
      { commits: 900, issues: 500, dev: 10, users: 3, gitbox: 250 },
      BORING,
      FAVORED,
    );
    expect(names(active)).toEqual([
      "dev", // favored, higher count
      "users", // favored, lower count
      "issues", // normal, by count desc
      "gitbox",
      "commits", // boring last despite the top count
    ]);
  });

  it("orders within a tier by count descending, then name ascending", () => {
    const { active } = organizeLists(
      { zeta: 5, alpha: 5, beta: 9 },
      [],
      [],
    );
    expect(names(active)).toEqual(["beta", "alpha", "zeta"]);
  });

  it("splits active from inactive at count <= 0", () => {
    const { active, inactive } = organizeLists(
      { dev: 1, quiet: 0, dormant: -1 },
      [],
      [],
    );
    expect(names(active)).toEqual(["dev"]);
    expect(names(inactive).sort()).toEqual(["dormant", "quiet"]);
  });

  it("applies the same tier ordering to the inactive bucket", () => {
    const { inactive } = organizeLists(
      { commits: 0, dev: 0, announce: 0 },
      BORING,
      FAVORED,
    );
    expect(names(inactive)).toEqual(["dev", "announce", "commits"]);
  });

  it("sets rollup only when more than two lists are inactive", () => {
    const two = organizeLists({ a: 0, b: 0, c: 1 }, [], []);
    expect(two.rollup).toBe(false);
    const three = organizeLists({ a: 0, b: 0, c: 0 }, [], []);
    expect(three.rollup).toBe(true);
  });

  it("handles empty input", () => {
    expect(organizeLists({}, BORING, FAVORED)).toEqual({
      active: [],
      inactive: [],
      rollup: false,
    });
  });

  it("puts a favored list with count 0 in the inactive bucket", () => {
    const { active, inactive } = organizeLists(
      { users: 0, issues: 4 },
      BORING,
      FAVORED,
    );
    expect(names(active)).toEqual(["issues"]);
    expect(names(inactive)).toEqual(["users"]);
  });
});

describe("topActiveLists", () => {
  it("ranks lists across domains by activity, capped at n", () => {
    const top = topActiveLists(
      {
        "a.org": { dev: 5, commits: 90, dead: 0 },
        "b.org": { users: 40 },
      },
      2,
    );
    expect(top).toEqual([
      { list: "commits", domain: "a.org", count: 90 },
      { list: "users", domain: "b.org", count: 40 },
    ]);
  });

  it("is empty when nothing has recent activity", () => {
    expect(topActiveLists({ "a.org": { dev: 0 } }, 8)).toEqual([]);
    expect(topActiveLists({}, 8)).toEqual([]);
  });

  it("skips excluded noise lists (commits, issues, notifications)", () => {
    const top = topActiveLists(
      {
        "a.org": { commits: 900, issues: 800, notifications: 700, dev: 5 },
        "b.org": { users: 40 },
      },
      8,
      ["commits", "issues", "notifications"],
    );
    expect(top).toEqual([
      { list: "users", domain: "b.org", count: 40 },
      { list: "dev", domain: "a.org", count: 5 },
    ]);
  });
});
