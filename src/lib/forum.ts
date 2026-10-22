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
 * Pure helpers for the forum view mode: thread_struct roots become topic
 * rows (phpBB-style topic table) and thread trees flatten into a single
 * chronological post stream (classic forum reading order). Traversals are
 * iterative, like lib/threads.ts. Deep reply chains must not recurse.
 */

import type { ListWindowStats, StreamResponse } from "./api/stream";
import type {
  EmailSummary,
  StatsResponse,
  ThreadNode,
  ThreadStructNode,
} from "./api/types";
import { emailForNode, emailListAddress, originalEmail } from "./listview";
import { streamEmail, threadRows } from "./stream";
import {
  buildEmailIndex,
  countParticipants,
  countReplies,
  lastEpoch,
} from "./threads";

/** One row of the forum topic table (one thread_struct root). */
export interface TopicRow {
  node: ThreadStructNode;
  subject: string;
  /** The topic starter's email, if resolvable (originalEmail). */
  starter?: EmailSummary;
  replies: number;
  participants: number;
  /** Epoch of the newest email anywhere in the thread. */
  lastEpoch: number;
  /** The newest resolvable email in the thread, for "Last post by ...". */
  last?: EmailSummary;
  /** From header of the newest post (also set when `last` cannot be). */
  lastFrom?: string;
  /** Sum of social_upvotes over every resolvable email in the thread. */
  upvotes: number;
}

/**
 * Newest resolvable email in the subtree, the mirror image of
 * originalEmail() in lib/listview.ts, which finds the oldest.
 */
function latestEmail(
  node: ThreadStructNode,
  emailsById: Map<string, EmailSummary>,
): EmailSummary | undefined {
  let best: EmailSummary | undefined;
  let bestEpoch = Number.MIN_SAFE_INTEGER;
  const stack: ThreadStructNode[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const eml = emailForNode(cur, emailsById);
    if (eml && cur.epoch > bestEpoch) {
      best = eml;
      bestEpoch = cur.epoch;
    }
    if (Array.isArray(cur.children)) {
      for (const child of cur.children) stack.push(child);
    }
  }
  return best;
}

/**
 * Total upvotes for a thread subtree: the sum of social_upvotes over
 * every resolvable email (emailForNode). Unresolvable nodes and emails
 * without a social_upvotes field contribute 0.
 */
export function threadUpvotes(
  node: ThreadStructNode,
  emailsById: Map<string, EmailSummary>,
): number {
  let total = 0;
  const stack: ThreadStructNode[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const eml = emailForNode(cur, emailsById);
    if (eml) total += eml.social_upvotes ?? 0;
    if (Array.isArray(cur.children)) {
      for (const child of cur.children) stack.push(child);
    }
  }
  return total;
}

/**
 * One topic row per thread_struct root, in the order the stats response
 * provides them (already newest-activity-first after mergeStats).
 */
export function topicsFromStats(stats: StatsResponse): TopicRow[] {
  // The backend can emit {} instead of [] for empty fields; tolerate it.
  const emails = Array.isArray(stats.emails) ? stats.emails : [];
  const roots = Array.isArray(stats.thread_struct) ? stats.thread_struct : [];
  const emailsById = buildEmailIndex(emails);
  return roots.map((node) => {
    const last = latestEmail(node, emailsById);
    return {
      node,
      subject: node.subject || "(No subject)",
      starter: originalEmail(node, emailsById),
      replies: countReplies(node),
      participants: countParticipants(node, emailsById),
      lastEpoch: lastEpoch(node),
      last,
      lastFrom: last?.from,
      upvotes: threadUpvotes(node, emailsById),
    };
  });
}

/**
 * One topic row per stream.json thread row: the same TopicRow shape,
 * but with the per-thread stats the server already computed over the
 * WHOLE result set (a paged response only carries one page of rows, so
 * nothing can be counted client-side). The synthesized node carries
 * just what consumers use (tid for links/keys).
 */
export function topicsFromStream(resp: StreamResponse): TopicRow[] {
  return threadRows(resp).map((row) => ({
    node: {
      tid: row.tid,
      subject: row.subject,
      epoch: row.epoch,
      nest: 1,
      children: [],
    },
    subject: row.subject || "(No subject)",
    starter: streamEmail(row.starter),
    replies: row.replies,
    participants: row.participants,
    lastEpoch: row.last_epoch,
    lastFrom: row.last_from ?? undefined,
    upvotes: row.upvotes,
  }));
}

/**
 * Per-list window breakdown from a full stats.json response, matching
 * stream.json's list_stats field for the legacy fallback: posts and
 * unique authors per list address, plus thread counts attributed to
 * each thread's starter (unresolvable starters count toward no list).
 */
export function perListStats(
  stats: StatsResponse,
): Record<string, ListWindowStats> {
  const emails = Array.isArray(stats.emails) ? stats.emails : [];
  const roots = Array.isArray(stats.thread_struct) ? stats.thread_struct : [];
  const out: Record<string, ListWindowStats> = {};
  const authors = new Map<string, Set<string>>();
  const entry = (addr: string): ListWindowStats =>
    (out[addr] ??= { hits: 0, participants: 0, threads: 0 });
  for (const eml of emails) {
    const addr = emailListAddress(eml);
    if (!addr) continue;
    entry(addr).hits++;
    let set = authors.get(addr);
    if (!set) authors.set(addr, (set = new Set()));
    set.add(eml.from ?? "");
  }
  for (const [addr, set] of authors) {
    out[addr].participants = set.size;
  }
  const emailsById = buildEmailIndex(emails);
  for (const node of roots) {
    const starter = originalEmail(node, emailsById);
    const addr = starter ? emailListAddress(starter) : "";
    if (addr && out[addr]) out[addr].threads++;
  }
  return out;
}

/**
 * Mock category descriptions for the forum-style views, ported from the
 * classic forum UI's mock_descriptions table: keyed by list prefix,
 * with list@project overrides (project = the domain's first label) for
 * lists whose meaning is project-specific. "{project}" in a text is
 * replaced with that label. The archive holds no real descriptions
 * (yet), so these fill the categories panel with sensible defaults.
 */
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  announce: "All public announcements regarding the {project} project",
  board: "Foundation board discussion channel",
  bugs: "Keeping track of bug reports and their progress",
  commits:
    "Historical records of all code and documentation commits, read-only",
  cvs: "Historical records of all code and documentation commits",
  dev: "Main development discussion channel; where you propose new ideas or fine-tune existing mechanics",
  "dev@httpd": "httpd development channel",
  docs: "The {project} documentation project, where we document how to document",
  general: "General discussions about the {project} project",
  issues: "Automated notifications from the project's issue tracker",
  members: "Foundation-level discussions for members only",
  notifications: "Automated build, review and tracker notifications",
  operations: "Day-to-day operations of the foundation",
  private: "Committee-only discussions",
  security: "Discussions related to project code and service security",
  user: "Need help with the day-to-day use of {project}? This is your place to ask, learn, and answer",
  users:
    "Need help with the day-to-day use of {project}? This is your place to ask, learn, and answer",
  "users-de": "German users channel",
  "win32-msi-cvs": "Windows installer commits",
};

/**
 * A category (mailing list) description: the project-specific override
 * first, then the exact list name, then its base prefix (users-fr ->
 * users), then a generic filler. Never empty.
 */
export function categoryDescription(list: string, domain: string): string {
  const project = domain.split(".")[0] || domain;
  const text =
    CATEGORY_DESCRIPTIONS[`${list}@${project}`] ??
    CATEGORY_DESCRIPTIONS[list] ??
    CATEGORY_DESCRIPTIONS[list.split("-")[0]] ??
    `The ${list} mailing list of the {project} project`;
  return text.replaceAll("{project}", project);
}

/**
 * All nodes of a thread tree, flattened and sorted by epoch ascending:
 * the topic post first, then replies in the order they arrived,
 * regardless of nesting. Ties keep pre-order (document) order, as the
 * sort is stable and the walk pushes children reversed.
 */
export function flattenPosts(thread: ThreadNode): ThreadNode[] {
  const out: ThreadNode[] = [];
  const stack: ThreadNode[] = [thread];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    out.push(cur);
    const kids = cur.children;
    if (Array.isArray(kids)) {
      // Reverse push so siblings pop in document order.
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
  }
  return out.sort((a, b) => a.epoch - b.epoch);
}
