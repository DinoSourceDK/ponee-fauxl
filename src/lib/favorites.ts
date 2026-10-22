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
 * Pure helpers for favorite mailing lists. Favorites are stored as
 * "list@domain" addresses (localStorage for now; a backend home may
 * come later) and surface as a pseudo-domain: list.html?*@$favorites
 * renders a landing page collating every favorited list, and dated or
 * searching variants of that URL expand into an ordinary multi-list
 * spec so the whole existing search machinery applies.
 */

import { config } from "./config";
import type { ListRef, SearchSpec } from "./search";
import { atomUrl, HEADER_FIELDS, isSearch } from "./search";

/** The hardcoded pseudo-hostname favorites live under. */
export const FAVORITES_DOMAIN = "$favorites";

/** "dev@example.org" -> a ListRef; null for anything malformed. */
export function parseFavorite(address: string): ListRef | null {
  if (typeof address !== "string") return null;
  const at = address.indexOf("@");
  if (at <= 0 || at !== address.lastIndexOf("@")) return null;
  const list = address.slice(0, at).trim();
  const domain = address.slice(at + 1).trim();
  if (!list || !domain || /[\s<>*,]/.test(list + domain)) return null;
  return { list, domain };
}

/**
 * Sanitize a favorites value of unknown provenance (localStorage can
 * hold anything): keep only well-formed addresses, deduped and sorted.
 */
export function normalizeFavorites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    const ref = parseFavorite(item as string);
    if (ref) seen.add(`${ref.list}@${ref.domain}`);
  }
  return [...seen].sort();
}

/** Favorites as ListRefs, malformed entries dropped. */
export function favoritesToRefs(favorites: readonly string[]): ListRef[] {
  const refs: ListRef[] = [];
  for (const address of favorites) {
    const ref = parseFavorite(address);
    if (ref) refs.push(ref);
  }
  return refs;
}

/**
 * Turn a $favorites spec into a real multi-list spec, except the bare
 * landing form (no date, no search), which keeps the marker so the
 * list page renders the favorites landing for it. Specs for other
 * domains, and $favorites specs when nothing is favorited, pass
 * through unchanged.
 */
export function expandFavoritesSpec(
  spec: SearchSpec | null,
  favorites: readonly string[],
): SearchSpec | null {
  if (!spec || spec.lists.length !== 1) return spec;
  if (spec.lists[0].domain !== FAVORITES_DOMAIN) return spec;
  if (!spec.date && !isSearch(spec)) return spec; // the landing page
  const refs = favoritesToRefs(favorites);
  if (refs.length === 0) return spec;
  return { ...spec, lists: refs };
}

/**
 * Atom feed URL for any spec: single list/domain selections use the
 * classic list/domain feed (atomUrl), while the $favorites marker and
 * multi-list virtual inboxes collate their concrete lists through the
 * feed's lists parameter. Null when nothing concrete can be fed
 * (wildcards cannot go into a List-ID set, and an empty favorites
 * landing has nothing to say).
 */
export function atomFeedUrl(
  spec: SearchSpec,
  favorites: readonly string[],
): string | null {
  const marker =
    spec.lists.length === 1 && spec.lists[0].domain === FAVORITES_DOMAIN;
  if (!marker) {
    const single = atomUrl(spec);
    if (single) return single;
  }
  const refs = marker ? favoritesToRefs(favorites) : spec.lists;
  const concrete = refs.filter(
    (r) =>
      r.list &&
      r.domain &&
      r.list !== "*" &&
      r.domain !== "*" &&
      r.domain !== FAVORITES_DOMAIN,
  );
  if (concrete.length === 0) return null;
  const params = new URLSearchParams();
  params.set("lists", concrete.map((r) => `${r.list}@${r.domain}`).join(","));
  if (spec.date) params.set("d", spec.date);
  if (spec.query) params.set("q", spec.query);
  for (const field of HEADER_FIELDS) {
    const v = spec.headers[field];
    if (v) params.set(`header_${field}`, v);
  }
  return `${config.apiUrl}/atom?${params.toString()}`;
}
