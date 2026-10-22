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
 * Pure helpers for the paged stream.json list view: building a request
 * from a SearchSpec, adapting stream rows to the EmailSummary shape the
 * list-row components render, page-bounds math, and a minimal
 * StatsResponse view of a stream response for components that predate
 * paging (ListHeader, Calendar, empty-state hints).
 */

import type {
  StreamChild,
  StreamMode,
  StreamRequest,
  StreamResponse,
  StreamRow,
  StreamSort,
  StreamStarter,
} from "./api/stream";
import type { EmailSummary, StatsResponse } from "./api/types";
import type { SearchSpec } from "./search";

/** Clamp a rows-per-page figure into stream.json's accepted 1..100. */
export function streamQuant(per: number): number {
  if (!Number.isFinite(per)) return 25;
  return Math.min(100, Math.max(1, Math.floor(per)));
}

/**
 * stream.json request for one page of a spec's results. The caller
 * guarantees a single-ListRef spec (wildcards are fine); multi-list
 * virtual inboxes stay on the legacy stats.json path.
 */
export function buildStreamRequest(
  spec: SearchSpec,
  mode: StreamMode,
  page: number,
  quant: number,
  sort: StreamSort = "activity",
): StreamRequest {
  const l = spec.lists[0];
  const req: StreamRequest = {
    list: l.list || "*",
    domain: l.domain || "*",
    mode,
    page: Math.max(0, Math.floor(page)),
    quant: streamQuant(quant),
  };
  // The server default; omitted so equal requests stay byte-identical
  // with pre-sort clients (and HTTP caches).
  if (sort !== "activity") req.sort = sort;
  if (spec.date) req.d = spec.date;
  if (spec.query) req.q = spec.query;
  if (spec.headers.from) req.header_from = spec.headers.from;
  if (spec.headers.subject) req.header_subject = spec.headers.subject;
  if (spec.headers.to) req.header_to = spec.headers.to;
  if (spec.headers.body) req.header_body = spec.headers.body;
  if (spec.headers.messageid) req.header_messageid = spec.headers.messageid;
  return req;
}

/**
 * Cross-list stream.json request: one page of threads collated over a
 * set of List-IDs (the hostname landing page's panels). No date spec
 * means the backend's default last-30-days window.
 */
export function buildListsStreamRequest(
  listIds: string[],
  mode: StreamMode,
  page: number,
  quant: number,
  opts: { sort?: StreamSort; d?: string } = {},
): StreamRequest {
  const req: StreamRequest = {
    lists: listIds.join(","),
    mode,
    page: Math.max(0, Math.floor(page)),
    quant: streamQuant(quant),
  };
  if (opts.sort && opts.sort !== "activity") req.sort = opts.sort;
  if (opts.d) req.d = opts.d;
  return req;
}

/** stream.json rejects lists= requests beyond this many List-IDs. */
export const STREAM_MAX_LISTS = 64;

/**
 * The List-IDs of one domain's mailing lists (from the preferences.json
 * directory), for the lists= collation parameter. Names in `exclude`
 * (config boringLists: commits, cvs, ...) are automation noise and are
 * left out; inactive lists are included. The window filter is the
 * backend's job. List-heavy domains are capped at the server's limit,
 * keeping the busiest lists. Sorted for stable request/cache identity.
 */
export function domainListIds(
  domain: string,
  all: Record<string, Record<string, number>>,
  exclude: string[] = [],
  max: number = STREAM_MAX_LISTS,
): string[] {
  const lists = all?.[domain] ?? {};
  return Object.entries(lists)
    .filter(([name]) => !exclude.includes(name))
    .sort(([an, ac], [bn, bc]) => bc - ac || (an < bn ? -1 : 1))
    .slice(0, Math.max(0, max))
    .map(([name]) => addressToRaw(`${name}@${domain}`))
    .sort();
}

/** "dev@lists.example.org" -> "<dev.lists.example.org>" (stats raw form). */
export function addressToRaw(list: string): string {
  const at = list.indexOf("@");
  if (at < 0) return `<${list}>`;
  return `<${list.slice(0, at)}.${list.slice(at + 1)}>`;
}

/**
 * Adapt a stream per-email object (starter or child) to the EmailSummary
 * shape EmailRow renders. stream.json sends list as "l@d", but consumers
 * of list_raw expect "<l.d>", so both forms are provided.
 */
export function streamEmail(e: StreamStarter | StreamChild): EmailSummary {
  const out: EmailSummary = {
    id: e.id,
    mid: e.mid,
    from: e.from,
    subject: e.subject,
    epoch: e.epoch,
    list: e.list,
    list_raw: addressToRaw(e.list),
    private: e.private,
    gravatar: e.gravatar,
  };
  if ("body" in e) out.body = e.body;
  return out;
}

export interface StreamBounds {
  /** Clamped 0-based page. */
  page: number;
  /** Total page count, always >= 1. */
  pages: number;
  /** 1-based bounds for "Showing X through Y of Z"; 0 when empty. */
  first: number;
  last: number;
  total: number;
}

/**
 * Pagination display math for a fetched page: first = page*quant+1,
 * last = min(total, page*quant + rows shown), like the pinned contract's
 * min(total, (page+1)*quant) but honest about short pages.
 */
export function streamBounds(
  page: number,
  quant: number,
  total: number,
  rowCount: number,
): StreamBounds {
  const q = Math.max(1, Math.floor(quant));
  const pages = Math.max(1, Math.ceil(total / q));
  const p = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const empty = total === 0 || rowCount === 0;
  const first = empty ? 0 : p * q + 1;
  return {
    page: p,
    pages,
    total,
    first,
    last: empty ? 0 : Math.min(total, p * q + rowCount),
  };
}

/** Thread rows of a threads-mode response ([] otherwise/on bad shape). */
export function threadRows(resp: StreamResponse): StreamRow[] {
  if (resp.mode !== "threads" || !Array.isArray(resp.rows)) return [];
  return resp.rows as StreamRow[];
}

/** Email rows of an emails-mode response ([] otherwise/on bad shape). */
export function emailRows(resp: StreamResponse): StreamStarter[] {
  if (resp.mode !== "emails" || !Array.isArray(resp.rows)) return [];
  return resp.rows as StreamStarter[];
}

/**
 * StatsResponse view of a stream response, for components written
 * against stats.json (ListHeader's mbox/searchParams, the calendar,
 * empty-state hints). emails/thread_struct are deliberately empty: a
 * paged response only carries the visible rows, and the stream path
 * never feeds the legacy topic builder.
 */
export function statsFromStream(resp: StreamResponse): StatsResponse {
  return {
    hits: resp.hits,
    numparts: resp.numparts,
    no_threads: resp.no_threads,
    firstYear: resp.firstYear,
    firstMonth: resp.firstMonth,
    lastYear: resp.lastYear,
    lastMonth: resp.lastMonth,
    active_months: resp.active_months ?? {},
    emails: [],
    thread_struct: [],
    participants: Array.isArray(resp.participants) ? resp.participants : [],
    cloud: null,
    searchlist: resp.searchlist,
    name: resp.name,
    domain: resp.domain,
    list: resp.list,
    searchParams: resp.searchParams ?? {},
    unixtime: resp.unixtime,
  };
}

/**
 * Pages worth prefetching after `page` has rendered, most-likely first:
 * the next `ahead` pages (forward reading order), then `behind` previous
 * pages (back navigation). Bounds-clamped; empty when everything fits on
 * one page.
 */
export function prefetchCandidates(
  page: number,
  quant: number,
  total: number,
  ahead = 2,
  behind = 1,
): number[] {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, quant)));
  const out: number[] = [];
  for (let i = 1; i <= ahead; i++) {
    if (page + i < pages) out.push(page + i);
  }
  for (let i = 1; i <= behind; i++) {
    if (page - i >= 0) out.push(page - i);
  }
  return out;
}
