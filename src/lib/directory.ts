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
 * Pure helper for the home page's list directory: splits one domain's
 * lists into active/inactive buckets and orders both for display.
 *
 * The counts (session.lists) are the backend's precomputed activity for
 * the last 90 days (ACTIVITY_TIMESPAN in server/plugins/background.py),
 * NOT all-time totals, so "inactive" means no mail in that window, not
 * an empty archive.
 */

export interface DirectoryList {
  name: string;
  count: number;
}

export interface DirectoryGroup {
  active: DirectoryList[];
  inactive: DirectoryList[];
  /** Fold the inactive bucket behind a "show more" affordance. */
  rollup: boolean;
}

/** Favored names first, boring (commits, cvs, ...) last, rest between. */
function tier(name: string, boring: string[], favored: string[]): number {
  if (favored.includes(name)) return 0;
  if (boring.includes(name)) return 2;
  return 1;
}

/**
 * Split a domain's lists into active (count > 0 in the 90-day window)
 * and inactive (count <= 0). Both buckets are sorted by tier (favored,
 * normal, boring), then count descending, then name ascending; favored
 * and boring match on the exact list name. rollup is set when the
 * inactive bucket is big enough (> 2) to be worth collapsing.
 */
export function organizeLists(
  lists: Record<string, number>,
  boring: string[],
  favored: string[],
): DirectoryGroup {
  const active: DirectoryList[] = [];
  const inactive: DirectoryList[] = [];
  for (const [name, count] of Object.entries(lists)) {
    (count <= 0 ? inactive : active).push({ name, count });
  }
  const order = (a: DirectoryList, b: DirectoryList): number =>
    tier(a.name, boring, favored) - tier(b.name, boring, favored) ||
    b.count - a.count ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  active.sort(order);
  inactive.sort(order);
  return { active, inactive, rollup: inactive.length > 2 };
}

/** A concrete list with its domain, for cross-domain activity ranking. */
export interface ActiveList {
  list: string;
  domain: string;
  count: number;
}

/**
 * The busiest lists across the whole archive (90-day activity counts),
 * for the landing page's quick-start strip. Names in `exclude`
 * (typically config boringLists: commits, issues, notifications, ...)
 * are high-volume automation noise and are skipped. Empty when nothing
 * has recent activity.
 */
export function topActiveLists(
  all: Record<string, Record<string, number>>,
  n: number,
  exclude: string[] = [],
): ActiveList[] {
  const flat: ActiveList[] = [];
  for (const [domain, lists] of Object.entries(all ?? {})) {
    for (const [list, count] of Object.entries(lists ?? {})) {
      if (count > 0 && !exclude.includes(list)) {
        flat.push({ list, domain, count });
      }
    }
  }
  flat.sort(
    (a, b) =>
      b.count - a.count ||
      (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0) ||
      (a.list < b.list ? -1 : 1),
  );
  return flat.slice(0, Math.max(0, n));
}
