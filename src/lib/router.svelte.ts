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
 * Minimal History-API router.
 *
 * Encoding rule (critical): message IDs may contain %2F (encoded slash) and
 * '+' characters. The raw pathname is split on literal '/' *before* any
 * decoding, then each segment is decoded exactly once. Never
 * decodeURIComponent a whole path, and never decode twice.
 */

/** Change this when deploying under a sub-path (also vite.config base). */
export const BASE_PATH: string = "";

export interface RouteState {
  /** Raw (still-encoded) pathname, without BASE_PATH. */
  path: string;
  /** Raw search string without leading '?' (may be positional syntax). */
  search: string;
  /** Raw hash without leading '#'. */
  hash: string;
  /** Path segments, each decoded exactly once. */
  segments: string[];
}

function stripBase(pathname: string): string {
  return BASE_PATH && pathname.startsWith(BASE_PATH)
    ? pathname.slice(BASE_PATH.length) || "/"
    : pathname;
}

function decodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg; // malformed escape in a legacy link: keep raw
  }
}

function readLocation(): RouteState {
  const path = stripBase(location.pathname);
  return {
    path,
    search: location.search.replace(/^\?/, ""),
    hash: location.hash.replace(/^#/, ""),
    segments: path.split("/").filter((s) => s !== "").map(decodeSegment),
  };
}

export const route: RouteState = $state(readLocation());

function sync(): void {
  const next = readLocation();
  route.path = next.path;
  route.search = next.search;
  route.hash = next.hash;
  route.segments = next.segments;
}

/** Navigate to an app-internal URL (path + optional search/hash). */
export function navigate(url: string, opts?: { replace?: boolean }): void {
  const target = BASE_PATH + url;
  if (opts?.replace) {
    history.replaceState({}, "", target);
  } else {
    history.pushState({}, "", target);
  }
  sync();
  // New page context: scroll to top (search-only changes keep position).
  if (!opts?.replace) window.scrollTo(0, 0);
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", sync);
  history.scrollRestoration = "manual";
}

/**
 * Svelte action: intercept clicks on same-origin links inside `node` and
 * route them client-side. Modified clicks (new tab etc.) pass through.
 *
 * The listener sits on `document`, not `node`: Svelte 5 delegates component
 * onclick handlers to the app mount root, so a listener on any element
 * inside it would run before a component's preventDefault could stop the
 * navigation (document is above the delegation root, so it runs last).
 */
export function link(node: HTMLElement): { destroy(): void } {
  function onClick(event: MouseEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const anchor = (event.target as Element | null)?.closest("a");
    if (!anchor || !node.contains(anchor)) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    if (anchor.target && anchor.target !== "_self") return;
    if (anchor.hasAttribute("download") || anchor.rel === "external") return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname.startsWith("/api/")) return; // API links (downloads)
    event.preventDefault();
    // Preserve raw encoding: use the anchor's raw href pieces.
    navigate(url.pathname + url.search + url.hash);
  }
  document.addEventListener("click", onClick);
  return {
    destroy() {
      document.removeEventListener("click", onClick);
    },
  };
}
