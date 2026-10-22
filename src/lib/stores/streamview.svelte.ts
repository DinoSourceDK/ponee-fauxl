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
 * Shared paged list-view state: one stream.json page for the current
 * search spec, plus loading/error/availability flags. The counterpart
 * of listview.svelte.ts for servers that have the paged endpoint;
 * ListPage falls back to loadListView when `available` turns false.
 */

import { ApiError } from "../api/client";
import type { StreamMode, StreamResponse, StreamSort } from "../api/stream";
import { stream } from "../api/stream";
import type { SearchSpec } from "../search";
import { specKey } from "../search";
import { buildStreamRequest, prefetchCandidates, streamQuant } from "../stream";

// A page is a few dozen row objects at most, but mirror listview's
// $state.raw discipline anyway: responses are replaced wholesale, never
// mutated, so nothing needs deep reactive proxies.
let _loading = $state(false);
let _error = $state("");
let _resp = $state.raw<StreamResponse | null>(null);
let _key = $state("");
let _available = $state(true);

export const streamview = {
  get loading(): boolean {
    return _loading;
  },
  get error(): string {
    return _error;
  },
  /** Last completed page (kept visible while the next one loads). */
  get resp(): StreamResponse | null {
    return _resp;
  },
  /** Page key (spec/mode/quant/page) the current resp/error belongs to. */
  get key(): string {
    return _key;
  },
  /**
   * False once stream.json has 404ed (an older server without the
   * endpoint): sticky for the session, so ListPage permanently falls
   * back to the legacy full-stats path.
   */
  get available(): boolean {
    return _available;
  },
};

// Monotonic fetch generation: a slow response for an old page must never
// clobber the state of a newer one.
let generation = 0;

/**
 * Client page cache for instant back/forward paging: up to CACHE_MAX
 * responses keyed by spec/mode/quant/page, refreshed on hit and pruned
 * oldest-first (LRU-ish). Cleared whenever the spec changes or a load
 * is forced, so refreshes always hit the server.
 */
const CACHE_MAX = 10;
const cache = new Map<string, StreamResponse>();
let cacheSpec = "";

function pageKey(
  spec: string,
  mode: StreamMode,
  quant: number,
  sort: StreamSort,
  page: number,
): string {
  return `${spec}|${mode}|${quant}|${sort}|${page}`;
}

function cachePut(key: string, resp: StreamResponse): void {
  cache.set(key, resp);
  while (cache.size > CACHE_MAX) {
    const oldest: string = cache.keys().next().value as string;
    cache.delete(oldest);
  }
}

/* --- predictive prefetch ---------------------------------------------- */

// After a page renders, opportunistically warm the pages the user is
// most likely to ask for next, forward reading order first, then one
// page back. The work runs during browser idle time, so paging serves
// instantly from the cache with no network round-trip.
const PREFETCH_AHEAD = 2;
const PREFETCH_BEHIND = 1;

/** Prefetches already in flight, so schedules never duplicate work. */
const inflight = new Set<string>();

const idle: (cb: () => void) => void =
  typeof requestIdleCallback === "function"
    ? (cb) => requestIdleCallback(() => cb(), { timeout: 1500 })
    : (cb) => setTimeout(cb, 150);

async function prefetchPage(
  spec: SearchSpec,
  mode: StreamMode,
  page: number,
  quant: number,
  sort: StreamSort,
): Promise<void> {
  const sk = specKey(spec);
  const key = pageKey(sk, mode, quant, sort, page);
  if (!_available || cache.has(key) || inflight.has(key)) return;
  inflight.add(key);
  try {
    const resp = await stream(
      buildStreamRequest(spec, mode, page, quant, sort),
    );
    // The user may have navigated away mid-flight; only cache while the
    // spec is still current (the cache was cleared otherwise).
    if (cacheSpec === sk) cachePut(key, resp);
  } catch {
    // Purely opportunistic: a failed prefetch costs nothing. The real
    // request will surface any error if the user actually goes there.
  } finally {
    inflight.delete(key);
  }
}

function schedulePrefetch(
  spec: SearchSpec,
  mode: StreamMode,
  page: number,
  quant: number,
  sort: StreamSort,
  total: number,
): void {
  const candidates = prefetchCandidates(
    page,
    quant,
    total,
    PREFETCH_AHEAD,
    PREFETCH_BEHIND,
  );
  if (candidates.length === 0) return;
  idle(() => {
    for (const p of candidates) void prefetchPage(spec, mode, p, quant, sort);
  });
}

/**
 * Fetch (or refetch with `force`) one page of stream.json rows for a
 * spec. No-ops when the page key matches the already-loaded data, so
 * effects can call this unconditionally; cached pages render without a
 * network round-trip. The caller guarantees spec has one ListRef.
 */
export async function loadStreamPage(
  spec: SearchSpec,
  mode: StreamMode,
  page: number,
  quant: number,
  opts?: { force?: boolean; sort?: StreamSort },
): Promise<void> {
  if (!_available || spec.lists.length !== 1) return;
  const sk = specKey(spec);
  const q = streamQuant(quant);
  const p = Math.max(0, Math.floor(page));
  const sort = opts?.sort ?? "activity";
  const key = pageKey(sk, mode, q, sort, p);
  if (!opts?.force && key === _key && _resp && !_error) {
    // Already showing this page, but an in-flight fetch for a DIFFERENT
    // key (e.g. a sort toggled away and back before it landed) must not
    // clobber it when it resolves. Cancelling it here also means nobody
    // else will clear the loading flag.
    ++generation;
    _loading = false;
    return;
  }
  if (sk !== cacheSpec || opts?.force) {
    cache.clear();
    cacheSpec = sk;
  }
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key); // re-insert: hits count as freshly used
    cache.set(key, hit);
    ++generation; // cancel any in-flight fetch for an older page
    _resp = hit;
    _key = key;
    _error = "";
    _loading = false;
    schedulePrefetch(spec, mode, p, q, sort, hit.total);
    return;
  }
  const gen = ++generation;
  _loading = true;
  try {
    const resp = await stream(buildStreamRequest(spec, mode, p, q, sort));
    if (gen !== generation) return; // superseded by a newer fetch
    cachePut(key, resp);
    _resp = resp;
    _key = key;
    _error = "";
    schedulePrefetch(spec, mode, p, q, sort, resp.total);
  } catch (e) {
    if (gen !== generation) return;
    if (e instanceof ApiError && e.status === 404) {
      // Older server without stream.py: disable streaming for the rest
      // of the session; the caller's effect reruns onto the legacy path.
      _available = false;
      _error = "";
    } else {
      _error = e instanceof Error ? e.message : String(e);
    }
    _key = key;
  } finally {
    if (gen === generation) _loading = false;
  }
}
