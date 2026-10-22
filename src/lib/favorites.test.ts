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
import {
  atomFeedUrl,
  expandFavoritesSpec,
  FAVORITES_DOMAIN,
  favoritesToRefs,
  normalizeFavorites,
  parseFavorite,
} from "./favorites";
import type { SearchSpec } from "./search";

describe("parseFavorite", () => {
  it("splits a well-formed address", () => {
    expect(parseFavorite("dev@tomcat.apache.org")).toEqual({
      list: "dev",
      domain: "tomcat.apache.org",
    });
  });

  it("rejects malformed values", () => {
    for (const bad of [
      "",
      "dev",
      "@example.org",
      "dev@",
      "dev@ex@ample.org",
      "de v@example.org",
      "*@example.org",
      "<dev.example.org>",
      "a,b@example.org",
    ]) {
      expect(parseFavorite(bad)).toBeNull();
    }
  });
});

describe("normalizeFavorites", () => {
  it("keeps valid addresses, deduped and sorted", () => {
    expect(
      normalizeFavorites([
        "users@b.org",
        "dev@a.org",
        "junk",
        42,
        "dev@a.org",
        null,
      ]),
    ).toEqual(["dev@a.org", "users@b.org"]);
  });

  it("returns [] for non-arrays (corrupt storage)", () => {
    expect(normalizeFavorites("dev@a.org")).toEqual([]);
    expect(normalizeFavorites(null)).toEqual([]);
    expect(normalizeFavorites({ 0: "dev@a.org" })).toEqual([]);
  });
});

describe("expandFavoritesSpec", () => {
  const favs = ["dev@a.org", "users@b.org"];
  const marker = (over: Partial<SearchSpec> = {}): SearchSpec => ({
    lists: [{ list: "*", domain: FAVORITES_DOMAIN }],
    headers: {},
    ...over,
  });

  it("keeps the bare landing marker untouched", () => {
    const spec = marker();
    expect(expandFavoritesSpec(spec, favs)).toBe(spec);
  });

  it("expands dated and searching variants into the real lists", () => {
    expect(expandFavoritesSpec(marker({ date: "2025-9" }), favs)?.lists).toEqual(
      favoritesToRefs(favs),
    );
    expect(
      expandFavoritesSpec(marker({ query: "ponies" }), favs)?.lists,
    ).toEqual(favoritesToRefs(favs));
    const dated = expandFavoritesSpec(marker({ date: "lte=30d" }), favs);
    expect(dated?.date).toBe("lte=30d");
    expect(dated?.lists).toHaveLength(2);
  });

  it("passes through other domains and empty favorites", () => {
    const other: SearchSpec = {
      lists: [{ list: "dev", domain: "a.org" }],
      headers: {},
      date: "2025-9",
    };
    expect(expandFavoritesSpec(other, favs)).toBe(other);
    const dated = marker({ date: "2025-9" });
    expect(expandFavoritesSpec(dated, [])).toBe(dated);
    expect(expandFavoritesSpec(null, favs)).toBeNull();
  });
});

describe("atomFeedUrl", () => {
  const favs = ["dev@a.org", "users@b.org"];

  it("uses the classic feed for single list selections", () => {
    const url = atomFeedUrl(
      { lists: [{ list: "dev", domain: "a.org" }], headers: {}, date: "2025-9" },
      favs,
    );
    expect(url).toContain("list=dev");
    expect(url).toContain("domain=a.org");
    expect(url).toContain("d=2025-9");
  });

  it("collates the favorites marker through the lists parameter", () => {
    const url = atomFeedUrl(
      { lists: [{ list: "*", domain: FAVORITES_DOMAIN }], headers: {} },
      favs,
    );
    expect(url).toContain("lists=dev%40a.org%2Cusers%40b.org");
    expect(url).not.toContain("domain=");
  });

  it("feeds multi-list virtual inboxes and keeps search params", () => {
    const url = atomFeedUrl(
      {
        lists: [
          { list: "dev", domain: "a.org" },
          { list: "users", domain: "b.org" },
        ],
        headers: { from: "humbedooh" },
        query: "ponies",
        date: "lte=30d",
      },
      [],
    );
    expect(url).toContain("lists=dev%40a.org%2Cusers%40b.org");
    expect(url).toContain("q=ponies");
    expect(url).toContain("d=lte%3D30d");
    expect(url).toContain("header_from=humbedooh");
  });

  it("returns null when nothing concrete can be fed", () => {
    expect(
      atomFeedUrl(
        { lists: [{ list: "*", domain: FAVORITES_DOMAIN }], headers: {} },
        [],
      ),
    ).toBeNull();
    expect(
      atomFeedUrl(
        {
          lists: [
            { list: "*", domain: "a.org" },
            { list: "dev", domain: "*" },
          ],
          headers: {},
        },
        favs,
      ),
    ).toBeNull();
  });
});
