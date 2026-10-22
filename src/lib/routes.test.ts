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
  OAUTH_URL,
  adminUrl,
  permalinkListId,
  resolveRoute,
  threadUrl,
} from "./routes";
import type { RouteState } from "./router.svelte";

// Hand-built state: resolveRoute only reads `segments` (already decoded).
function rs(segments: string[]): RouteState {
  return { path: "/" + segments.join("/"), search: "", hash: "", segments };
}

describe("resolveRoute", () => {
  it("resolves the root and its index.html alias to home", () => {
    expect(resolveRoute(rs([]))).toEqual({ page: "home" });
    expect(resolveRoute(rs(["index.html"]))).toEqual({ page: "home" });
  });

  it("resolves /list and /list.html to list", () => {
    expect(resolveRoute(rs(["list"]))).toEqual({ page: "list" });
    expect(resolveRoute(rs(["list.html"]))).toEqual({ page: "list" });
  });

  it("resolves /thread/<id> and /thread.html/<id>", () => {
    expect(resolveRoute(rs(["thread", "abc"]))).toEqual({
      page: "thread",
      id: "abc",
    });
    expect(resolveRoute(rs(["thread.html", "abc"]))).toEqual({
      page: "thread",
      id: "abc",
    });
  });

  it("resolves /apidocs and /apidocs.html", () => {
    expect(resolveRoute(rs(["apidocs"]))).toEqual({ page: "apidocs" });
    expect(resolveRoute(rs(["apidocs.html"]))).toEqual({ page: "apidocs" });
  });

  it("builds reload-safe .html permalinks that resolve back", () => {
    expect(threadUrl("abc")).toBe("/thread.html/abc");
    // Slashes stay segment separators; odd characters are encoded once.
    expect(threadUrl("a/b c")).toBe("/thread.html/a/b%20c");
    expect(adminUrl()).toBe("/admin.html");
    expect(adminUrl("m1")).toBe("/admin.html/m1");
    expect(OAUTH_URL).toBe("/oauth.html");
    expect(resolveRoute(rs(["thread.html", "a", "b c"]))).toEqual({
      page: "thread",
      id: "a/b c",
    });
  });

  it("rejoins multi-segment message ids with '/'", () => {
    // A segment may itself contain a decoded slash (%2F in the raw path).
    expect(resolveRoute(rs(["thread", "a/b", "c"]))).toEqual({
      page: "thread",
      id: "a/b/c",
    });
  });

  it("treats /thread without an id as notfound", () => {
    expect(resolveRoute(rs(["thread"]))).toEqual({ page: "notfound" });
  });

  it("resolves /admin with and without a message id", () => {
    const noMid = resolveRoute(rs(["admin"]));
    expect(noMid).toEqual({ page: "admin" });
    expect("mid" in noMid && noMid.mid).toBeFalsy();
    expect(resolveRoute(rs(["admin", "xyz"]))).toEqual({
      page: "admin",
      mid: "xyz",
    });
    expect(resolveRoute(rs(["admin.html", "xyz"]))).toEqual({
      page: "admin",
      mid: "xyz",
    });
  });

  it("resolves /oauth.html to oauth", () => {
    expect(resolveRoute(rs(["oauth.html"]))).toEqual({ page: "oauth" });
  });

  it("resolves unknown paths to notfound", () => {
    expect(resolveRoute(rs(["bogus"]))).toEqual({ page: "notfound" });
  });

  it("extracts a list-id from a positional permalink query", () => {
    expect(permalinkListId("<security.apache.org>")).toBe(
      "<security.apache.org>",
    );
    expect(permalinkListId("%3Csecurity.apache.org%3E")).toBe(
      "<security.apache.org>",
    );
    expect(permalinkListId("?<dev.example.org>")).toBe("<dev.example.org>");
    expect(permalinkListId("")).toBeNull();
    expect(permalinkListId("find_parent=true")).toBeNull();
    expect(permalinkListId("<>")).toBeNull();
  });
});
