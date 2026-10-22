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
 * Parser/builder for the Pony Mail list search string, the part after `?`
 * on /list URLs. This is a *positional* format, not key=value pairs:
 *
 *   ?<list>@<domain>[,<list2>@<domain2>...][:<datespec>[:<query>]]
 *       [&header_from=..][&header_subject=..][&header_to=..]
 *       [&header_body=..][&header_messageid=..]
 *
 * Ported from webui/js/source/primer.js (parseURL) and search.js. Legacy
 * quirks preserved deliberately:
 *  - a bare domain (no @) selects all lists on that domain;
 *  - a comma in the list token makes a multi-list "virtual inbox";
 *  - a second token that is not YYYY-M is a search date spec (lte=1M, ...);
 *  - header_* values in old links may be unencoded (including '&'), so the
 *    string is split on the literal '&header_' rather than on '&'
 *    (see https://github.com/apache/incubator-ponymail-foal/issues/266).
 */

import type { StatsRequest } from "./api/types";
import { config } from "./config";

export interface ListRef {
  list: string;
  domain: string;
}

export type HeaderField = "from" | "subject" | "to" | "body" | "messageid";
export const HEADER_FIELDS: readonly HeaderField[] = [
  "from",
  "subject",
  "to",
  "body",
  "messageid",
];

export interface SearchSpec {
  /** One entry normally; several = virtual inbox. */
  lists: ListRef[];
  /** "YYYY-M" month browse, or a search date spec (lte=1M, dfr=..|dto=..). */
  date?: string;
  /** Free-text query (+required -excluded "phrases"). */
  query?: string;
  headers: Partial<Record<HeaderField, string>>;
}

/** True if the date token means "browse a single month" (not a search). */
export function isMonthBrowse(date: string | undefined): boolean {
  return !!date && /^\d\d\d\d-\d+$/.test(date);
}

/** True if this spec triggers search behavior (vs plain month browsing). */
export function isSearch(spec: SearchSpec): boolean {
  return (
    !!spec.query ||
    (!!spec.date && !isMonthBrowse(spec.date)) ||
    Object.values(spec.headers).some((v) => !!v)
  );
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // malformed escapes: keep raw (legacy links may be unencoded)
  }
}

/**
 * Parse the raw search string (with or without leading '?').
 * Returns null if no list/domain selection is present.
 */
export function parseListSearch(rawSearch: string): SearchSpec | null {
  let raw = rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch;
  if (!raw) return null;

  // The layout-switch parameter (?ui=forum|standard, see uistyle.ts) may
  // ride along on any URL; strip it before header/positional parsing so
  // links that carry it parse exactly like links that don't.
  raw = raw.replace(/&ui=[^&]*/g, "").replace(/^ui=[^&]*&?/, "");
  if (!raw) return null;

  // Header filters first: split on literal '&header_' so unencoded values
  // (which may contain bare '&') survive. Everything before the first
  // '&header_' is the positional part.
  const headers: SearchSpec["headers"] = {};
  const hparts = raw.split("&header_");
  raw = hparts.shift() ?? "";
  for (const part of hparts) {
    const sep = part.indexOf("=");
    if (sep < 0) continue;
    const key = part.substring(0, sep) as HeaderField;
    const value = safeDecode(part.substring(sep + 1).replace(/\+/g, " "));
    if ((HEADER_FIELDS as readonly string[]).includes(key) && value) {
      headers[key] = value;
    }
  }

  // Positional split on ':', first two separators only; any further ':'
  // belongs to the query itself (improvement over legacy split(":", 3),
  // which silently truncated such queries).
  const c1 = raw.indexOf(":");
  const listToken = c1 < 0 ? raw : raw.substring(0, c1);
  let dateToken = "";
  let queryToken = "";
  if (c1 >= 0) {
    const rest = raw.substring(c1 + 1);
    const c2 = rest.indexOf(":");
    dateToken = c2 < 0 ? rest : rest.substring(0, c2);
    queryToken = c2 < 0 ? "" : rest.substring(c2 + 1);
  }

  const listPart = safeDecode(listToken);
  if (!listPart) return null;

  const lists: ListRef[] = [];
  for (const entry of listPart.split(",")) {
    if (!entry) continue;
    const at = entry.indexOf("@");
    if (at >= 0) {
      lists.push({
        list: entry.substring(0, at) || "*",
        domain: entry.substring(at + 1) || "*",
      });
    } else {
      // Bare domain: all lists on that domain.
      lists.push({ list: "*", domain: entry });
    }
  }
  if (lists.length === 0) return null;

  const spec: SearchSpec = { lists, headers };
  const date = safeDecode(dateToken);
  if (date) spec.date = date;
  // Legacy parseURL decodes '+' only in permalink queries, but address bars
  // encode spaces as %20; handle both.
  const query = safeDecode(queryToken.replace(/\+/g, " "));
  if (query) spec.query = query;
  return spec;
}

/**
 * Build the canonical search string (without '?') for a spec. Values are
 * URL-encoded (unlike legacy links, which the parser still accepts).
 */
export function buildListSearch(spec: SearchSpec): string {
  const listPart = spec.lists
    .map((l) => `${l.list}@${l.domain}`)
    .join(",");
  let out = listPart;
  const date = spec.date ?? "";
  const query = spec.query ?? "";
  if (date || query) out += `:${encodeURIComponent(date)}`;
  if (query) out += `:${encodeURIComponent(query)}`;
  for (const field of HEADER_FIELDS) {
    const v = spec.headers[field];
    if (v) out += `&header_${field}=${encodeURIComponent(v)}`;
  }
  return out;
}

/**
 * URL for a spec, e.g. "/list.html?dev@example.org:2024-03". The .html
 * form is canonical: it resolves as a real file in dist/, so reloads
 * work without server rewrite rules ("/list?…" stays routable too).
 */
export function listUrl(spec: SearchSpec): string {
  return `/list.html?${buildListSearch(spec)}`;
}

/**
 * Convert a spec into one stats.json request per selected list.
 * (Multiple entries = virtual inbox; results are merged client-side.)
 * Every request asks for social_upvotes (social: "yes"). Upvotes are
 * tracked in all view modes and displayed by the forum UI.
 */
export function specToRequests(spec: SearchSpec): StatsRequest[] {
  return spec.lists.map((l) => {
    const req: StatsRequest = {
      list: l.list || "*",
      domain: l.domain || "*",
      social: "yes",
      streaming: "yes"
    };
    if (spec.date) req.d = spec.date;
    if (spec.query) req.q = spec.query;
    if (spec.headers.from) req.header_from = spec.headers.from;
    if (spec.headers.subject) req.header_subject = spec.headers.subject;
    if (spec.headers.to) req.header_to = spec.headers.to;
    if (spec.headers.body) req.header_body = spec.headers.body;
    if (spec.headers.messageid) req.header_messageid = spec.headers.messageid;
    return req;
  });
}

/** Canonical string form used to detect real changes (refetch guard). */
export function specKey(spec: SearchSpec | null): string {
  return spec ? buildListSearch(spec) : "";
}

/**
 * URL of the Atom feed (/api/atom) carrying the same search parameters
 * as this spec. Wildcards are fine, but a multi-list virtual inbox has
 * no single feed, so this returns null in that case.
 */
export function atomUrl(spec: SearchSpec): string | null {
  if (spec.lists.length !== 1) return null;
  const l = spec.lists[0];
  const params = new URLSearchParams();
  params.set("list", l.list || "*");
  params.set("domain", l.domain || "*");
  if (spec.date) params.set("d", spec.date);
  if (spec.query) params.set("q", spec.query);
  for (const field of HEADER_FIELDS) {
    const v = spec.headers[field];
    if (v) params.set(`header_${field}`, v);
  }
  return `${config.apiUrl}/atom?${params.toString()}`;
}
