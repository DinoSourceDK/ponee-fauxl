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
 * Route resolution, including aliases for every legacy webui URL:
 *   /                      → home        (also /index.html)
 *   /list?<spec>           → list        (also /list.html?<spec>)
 *   /thread/<id>           → thread      (also /thread.html/<id>)
 *   /oauth                 → oauth       (also /oauth.html)
 *   /admin[/<mid>]         → admin       (also /admin.html[/<mid>])
 *
 * Message IDs may span several path segments if they contain literal
 * slashes; segments are re-joined here (each was decoded exactly once by
 * the router).
 */

import type { RouteState } from "./router.svelte";

export type Resolved =
  | { page: "home" }
  | { page: "list" }
  | { page: "thread"; id: string }
  | { page: "oauth" }
  | { page: "admin"; mid?: string }
  | { page: "apidocs" }
  | { page: "notfound" };

export function resolveRoute(r: RouteState): Resolved {
  const segs = r.segments;
  if (segs.length === 0 || (segs.length === 1 && segs[0] === "index.html")) {
    return { page: "home" };
  }
  const head = segs[0];
  const rest = segs.slice(1).join("/");
  switch (head) {
    case "list":
    case "list.html":
      return { page: "list" };
    case "thread":
    case "thread.html":
      return rest ? { page: "thread", id: rest } : { page: "notfound" };
    case "oauth":
    case "oauth.html":
      return { page: "oauth" };
    case "admin":
    case "admin.html":
      return rest ? { page: "admin", mid: rest } : { page: "admin" };
    case "apidocs":
    case "apidocs.html":
      return { page: "apidocs" };
    default:
      return { page: "notfound" };
  }
}

/*
 * Canonical URL builders. These emit the ".html" forms because those
 * resolve as real files in dist/ (the build copies index.html to
 * list.html, thread.html, oauth.html and admin.html), so a reload or a
 * shared link works on a plain static server with no rewrite rules.
 * The extensionless forms above stay supported for old links.
 */

/** Path segments of an ID, each encoded once (IDs may contain "/"). */
function encodeId(id: string): string {
  return id.split("/").map(encodeURIComponent).join("/");
}

/** Permalink path for a thread/email ID, e.g. "/thread.html/<id>". */
export function threadUrl(id: string): string {
  return `/thread.html/${encodeId(id)}`;
}

/**
 * List-ID from a legacy permalink's positional query, as in
 * /thread/<message-id>?<dev.example.org>; null when absent. Decoded like
 * the old UI did (form encoding, so '+' is a space).
 */
export function permalinkListId(search: string): string | null {
  let q = search.replace(/^\?/, "").replace(/\+/g, " ");
  try {
    q = decodeURIComponent(q);
  } catch {
    // malformed escape: match on the raw text
  }
  return /^<.+>$/.test(q) ? q : null;
}

/** Admin console path, optionally for one email's editor. */
export function adminUrl(mid?: string): string {
  return mid ? `/admin.html/${encodeId(mid)}` : "/admin.html";
}

/** Login page path. */
export const OAUTH_URL = "/oauth.html";
