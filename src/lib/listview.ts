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
 * Pure helpers for the list view: merging per-list stats.json responses
 * into one view model (the multi-list "virtual inbox"), pagination math
 * ported from calc_per_page() in webui/js/source/listview-flat.js, and
 * row presentation helpers (author names, teasers, list badges).
 */

import type {
  EmailSummary,
  Participant,
  StatsRequest,
  StatsResponse,
  ThreadStructNode,
} from "./api/types";
import type { ListRef } from "./search";
import { sortThreadsNewestFirst } from "./threads";

/** searchlist label used when several lists are merged into one view. */
export const VIRTUAL_INBOX = "Virtual inbox";

/**
 * The backend emits {} instead of [] for empty list-ish fields (notably
 * participants when there are zero hits), so tolerate any non-array.
 */
function asArray<T>(value: T[] | unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Merge one stats response per selected list into a single view model:
 * emails newest-first, threads by last activity, counters summed. Single
 * responses are normalized the same way (the backend returns emails
 * oldest-first).
 */
export function mergeStats(responses: StatsResponse[]): StatsResponse {
  if (responses.length === 0) {
    throw new Error("mergeStats: no responses");
  }
  const first = responses[0];
  const multi = responses.length > 1;

  const emails = responses
    .flatMap((r) => asArray<EmailSummary>(r.emails))
    .sort((a, b) => b.epoch - a.epoch);
  const threads = sortThreadsNewestFirst(
    responses.flatMap((r) => asArray<ThreadStructNode>(r.thread_struct)),
  );

  // Overall archive span: earliest first-month, latest last-month.
  let firstYear = 0;
  let firstMonth = 0;
  let lastYear = 0;
  let lastMonth = 0;
  for (const r of responses) {
    if (
      r.firstYear > 0 &&
      (firstYear === 0 ||
        r.firstYear * 12 + r.firstMonth < firstYear * 12 + firstMonth)
    ) {
      firstYear = r.firstYear;
      firstMonth = r.firstMonth;
    }
    if (r.lastYear * 12 + r.lastMonth > lastYear * 12 + lastMonth) {
      lastYear = r.lastYear;
      lastMonth = r.lastMonth;
    }
  }

  const activeMonths: Record<string, number> = {};
  for (const r of responses) {
    for (const [month, count] of Object.entries(r.active_months ?? {})) {
      activeMonths[month] = (activeMonths[month] ?? 0) + count;
    }
  }

  const byAddress = new Map<string, Participant>();
  for (const r of responses) {
    for (const p of asArray<Participant>(r.participants)) {
      const prev = byAddress.get(p.email);
      if (prev) prev.count += p.count;
      else byAddress.set(p.email, { ...p });
    }
  }
  const participants = [...byAddress.values()].sort(
    (a, b) => b.count - a.count,
  );

  let cloud: Record<string, number> | null = null;
  for (const r of responses) {
    if (!r.cloud) continue;
    cloud ??= {};
    for (const [word, weight] of Object.entries(r.cloud)) {
      cloud[word] = (cloud[word] ?? 0) + weight;
    }
  }

  return {
    hits: responses.reduce((n, r) => n + r.hits, 0),
    numparts: responses.reduce((n, r) => n + r.numparts, 0),
    no_threads: responses.reduce((n, r) => n + r.no_threads, 0),
    firstYear,
    firstMonth,
    lastYear,
    lastMonth,
    active_months: activeMonths,
    emails,
    thread_struct: threads,
    participants,
    cloud,
    searchlist: multi ? VIRTUAL_INBOX : first.searchlist,
    name: first.name,
    domain: first.domain,
    list: first.list,
    // Only meaningful for a single list (mbox downloads are gated on that).
    searchParams: first.searchParams,
    unixtime: Math.max(...responses.map((r) => r.unixtime)),
  };
}

/**
 * Placeholder response for a list the server 404s on (unknown list),
 * so one dead entry does not fail a whole virtual inbox.
 */
export function emptyStats(req: StatsRequest): StatsResponse {
  const searchParams: Record<string, string> = {
    list: req.list,
    domain: req.domain,
  };
  if (req.d) searchParams.d = req.d;
  if (req.q) searchParams.q = req.q;
  return {
    hits: 0,
    numparts: 0,
    no_threads: 0,
    firstYear: 0,
    firstMonth: 0,
    lastYear: 0,
    lastMonth: 0,
    active_months: {},
    emails: [],
    thread_struct: [],
    participants: [],
    cloud: null,
    searchlist: `<${req.list}.${req.domain}>`,
    name: req.list,
    domain: req.domain,
    list: `${req.list}@${req.domain}`,
    searchParams,
    unixtime: 0,
  };
}

/**
 * Pick the list to land on when jumping to a domain: the configured
 * favorite if the domain has it, otherwise the most active list that is
 * not "boring" (commits, cvs, ...), otherwise the most active overall
 * (port of the legacy switch_project()).
 */
export function pickDomainList(
  lists: Record<string, number>,
  favorite: string,
  boring: string[],
): string | undefined {
  const names = Object.keys(lists);
  if (names.length === 0) return undefined;
  if (favorite && names.includes(favorite)) return favorite;
  const interesting = names.filter((n) => !boring.includes(n));
  const pool = interesting.length > 0 ? interesting : names;
  pool.sort((a, b) => (lists[b] ?? 0) - (lists[a] ?? 0));
  return pool[0];
}

/**
 * Rows per page: as many as fit in the available height, minimum 5,
 * rounded down to a multiple of 5 (port of the legacy calc_per_page()).
 */
export function perPage(availableHeight: number, rowHeight: number): number {
  if (rowHeight <= 0) return 5;
  const fit = Math.max(5, Math.floor(availableHeight / rowHeight));
  return fit - (fit % 5);
}

export interface PageSlice<T> {
  items: T[];
  /** Clamped 0-based page actually shown. */
  page: number;
  /** Total page count, always >= 1. */
  pages: number;
  /** 1-based bounds for "Showing X through Y of Z"; 0 when empty. */
  first: number;
  last: number;
  total: number;
}

/** Slice one page out of the full result set, clamping out-of-range pages. */
export function pageSlice<T>(
  all: readonly T[],
  page: number,
  per: number,
): PageSlice<T> {
  const total = all.length;
  const size = Math.max(1, Math.floor(per));
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const start = p * size;
  const items = all.slice(start, start + size);
  return {
    items,
    page: p,
    pages,
    total,
    first: total === 0 ? 0 : start + 1,
    last: total === 0 ? 0 : start + items.length,
  };
}

/** Email backing a thread node (tid, falling back to mid), if fetched. */
export function emailForNode(
  node: ThreadStructNode,
  emailsById: Map<string, EmailSummary>,
): EmailSummary | undefined {
  return (
    emailsById.get(node.tid) ??
    (node.mid ? emailsById.get(node.mid) : undefined)
  );
}

/**
 * The thread's original email, shown on the collapsed row, like the
 * classic listview_threaded_element (find_email(thread.tid)). When the
 * root itself is not in the index (e.g. outside the searched window),
 * falls back to the OLDEST resolvable email in the subtree rather than
 * dropping the row; undefined if nothing resolves.
 */
export function originalEmail(
  node: ThreadStructNode,
  emailsById: Map<string, EmailSummary>,
): EmailSummary | undefined {
  const root = emailForNode(node, emailsById);
  if (root) return root;
  let best: EmailSummary | undefined;
  let bestEpoch = Number.MAX_SAFE_INTEGER;
  const stack: ThreadStructNode[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const eml = emailForNode(cur, emailsById);
    if (eml && cur.epoch < bestEpoch) {
      best = eml;
      bestEpoch = cur.epoch;
    }
    if (Array.isArray(cur.children)) {
      for (const child of cur.children) stack.push(child);
    }
  }
  return best;
}

/** Display name from a From: header; falls back to the bare address. */
export function authorName(from: string): string {
  const name = from.replace(/\s*<.+>/, "").replace(/"/g, "").trim();
  if (name) return name;
  const addr = /<\s*(.+@.+?)\s*>/.exec(from);
  if (addr) return addr[1];
  return from.trim() || "(unknown)";
}

/** First non-empty body line, for the one-line preview on a row. */
export function teaser(body: string | undefined): string {
  if (!body) return "";
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

/** "<dev.ponymail.apache.org>" -> "dev@ponymail.apache.org". */
export function listRawToAddress(listRaw: string): string {
  return listRaw.replace(/[<>]/g, "").replace(".", "@");
}

/**
 * A displayed/mailable list address for an email. stats.json emails
 * carry list as "dev@example.org", but thread.json emails carry the
 * RAW form ("<dev.example.org>") in both list and list_raw, so only
 * trust `list` when it already looks like an address.
 */
export function emailListAddress(email: {
  list?: string;
  list_raw?: string;
}): string {
  const l = email.list;
  if (l && l.includes("@") && !l.includes("<")) return l;
  return listRawToAddress(email.list_raw ?? l ?? "");
}

/** Rows show a list@domain badge when several lists can be mixed in. */
export function showsListBadge(lists: readonly ListRef[]): boolean {
  return (
    lists.length > 1 ||
    lists.some((l) => l.list === "*" || l.domain === "*")
  );
}

/** Sanitized filename for a downloaded mbox archive. */
export function mboxFilename(name: string): string {
  return name.replace(/[^a-z0-9]/gi, "_") + ".mbox";
}
