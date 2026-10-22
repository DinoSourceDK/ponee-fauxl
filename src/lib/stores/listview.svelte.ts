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
 * Shared list-view state: the merged stats.json result for the current
 * search spec, plus loading/error flags. Lives outside ListPage so the
 * (future) stats sidebar can reuse the same fetch.
 */

import { ApiError, stats } from "../api/client";
import type { StatsResponse } from "../api/types";
import { emptyStats, mergeStats } from "../listview";
import type { SearchSpec } from "../search";
import { specKey, specToRequests } from "../search";

// The stats payload can be tens of thousands of objects (emails +
// thread nodes). It is only ever replaced wholesale, never mutated in
// place, so it lives in $state.raw: consumers get plain objects instead
// of deep reactive proxies, whose per-property interception made large
// lists take seconds to render.
let _loading = $state(false);
let _error = $state("");
let _stats = $state.raw<StatsResponse | null>(null);
let _key = $state("");

export const listview = {
  get loading(): boolean {
    return _loading;
  },
  get error(): string {
    return _error;
  },
  /** Merged stats of the last completed fetch (kept during refetches). */
  get stats(): StatsResponse | null {
    return _stats;
  },
  /** specKey() of the spec the current stats/error belong to. */
  get key(): string {
    return _key;
  },
};

// Monotonic fetch generation: a slow response for an old spec must never
// clobber the state of a newer one.
let generation = 0;

/**
 * Fetch (or refetch with `force`) the stats for a spec. No-ops when the
 * spec's key matches the already-loaded data, so route-change effects can
 * call this unconditionally. Previous rows stay visible while loading.
 */
export async function loadListView(
  spec: SearchSpec,
  opts?: { force?: boolean },
): Promise<void> {
  const key = specKey(spec);
  if (!opts?.force && key === _key && _stats && !_error) {
    return;
  }
  const gen = ++generation;
  _loading = true;
  try {
    const responses = await Promise.all(
      specToRequests(spec).map(async (req) => {
        try {
          return await stats(req);
        } catch (e) {
          // Unknown lists 404; render them empty rather than failing the
          // whole (possibly multi-list) view.
          if (e instanceof ApiError && e.status === 404) return emptyStats(req);
          throw e;
        }
      }),
    );
    if (gen !== generation) return; // superseded by a newer fetch
    _stats = mergeStats(responses);
    _key = key;
    _error = "";
  } catch (e) {
    if (gen !== generation) return;
    _error = e instanceof Error ? e.message : String(e);
    _key = key;
  } finally {
    if (gen === generation) _loading = false;
  }
}
