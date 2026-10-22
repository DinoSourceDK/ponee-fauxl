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
 * Helpers for the thread_struct trees returned by stats.json. Ports of
 * last_email()/count_replies()/count_people() from the legacy
 * webui/js/source/listview-threaded.js. All traversals are iterative:
 * real-world threads can degenerate into very deep reply chains, which
 * would overflow the stack with recursion.
 */

import type { EmailSummary, ThreadStructNode } from "./api/types";

/** Epoch of the newest email anywhere in the subtree. */
export function lastEpoch(node: ThreadStructNode): number {
  let newest = node.epoch;
  const stack: ThreadStructNode[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur.epoch > newest) newest = cur.epoch;
    if (Array.isArray(cur.children)) {
      for (const child of cur.children) stack.push(child);
    }
  }
  return newest;
}

/** Number of replies (descendants) below the root of the subtree. */
export function countReplies(node: ThreadStructNode): number {
  let reps = 0;
  const stack: ThreadStructNode[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (Array.isArray(cur.children)) {
      for (const child of cur.children) {
        // Legacy quirk: a child duplicating its parent's tid is the same
        // email, not a reply.
        if (child.tid !== cur.tid) reps++;
        stack.push(child);
      }
    }
  }
  return reps;
}

/**
 * Number of unique senders in the subtree. Each node is resolved to an
 * email via its tid (falling back to mid) in `emailsById`; nodes without
 * a matching email are skipped, as in the legacy count_people().
 */
export function countParticipants(
  node: ThreadStructNode,
  emailsById: Map<string, EmailSummary>,
): number {
  const senders = new Set<string>();
  const stack: ThreadStructNode[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const eml =
      emailsById.get(cur.tid) ??
      (cur.mid ? emailsById.get(cur.mid) : undefined);
    if (eml) senders.add(eml.from);
    if (Array.isArray(cur.children)) {
      for (const child of cur.children) stack.push(child);
    }
  }
  return senders.size;
}

/** Pre-order flattening of a subtree with the depth of each node. */
export function flatten(
  node: ThreadStructNode,
): { node: ThreadStructNode; depth: number }[] {
  const out: { node: ThreadStructNode; depth: number }[] = [];
  const stack: { node: ThreadStructNode; depth: number }[] = [
    { node, depth: 0 },
  ];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    out.push(cur);
    const kids = cur.node.children;
    if (Array.isArray(kids)) {
      // Reverse push so children pop in document order.
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push({ node: kids[i], depth: cur.depth + 1 });
      }
    }
  }
  return out;
}

/** Threads ordered by most recent activity, newest first (stable). */
export function sortThreadsNewestFirst(
  nodes: ThreadStructNode[],
): ThreadStructNode[] {
  const newest = new Map<ThreadStructNode, number>();
  for (const n of nodes) newest.set(n, lastEpoch(n));
  return [...nodes].sort((a, b) => newest.get(b)! - newest.get(a)!);
}

/** Index emails by both `id` and `mid` for thread-node lookups. */
export function buildEmailIndex(
  emails: EmailSummary[],
): Map<string, EmailSummary> {
  const index = new Map<string, EmailSummary>();
  for (const eml of emails) {
    index.set(eml.id, eml);
    index.set(eml.mid, eml);
  }
  return index;
}

/** One visible treeview row: the row plus its expander state. */
export interface TreeRowView<T> {
  row: T;
  /** Number of descendants under this node (0 = leaf, no expander). */
  descendants: number;
  expanded: boolean;
}

/**
 * The visible rows of a flattened (pre-order, depth-annotated) thread
 * tree under a set of expanded node keys: children stay hidden until
 * every ancestor is expanded. Collapsed by default, true treeview
 * style. Collapsing a mid-level node hides its whole subtree while
 * later siblings keep showing.
 */
export function visibleTreeRows<T extends { key: string; depth: number }>(
  rows: readonly T[],
  expanded: ReadonlySet<string>,
): TreeRowView<T>[] {
  const out: TreeRowView<T>[] = [];
  let skipDepth: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (skipDepth !== null) {
      if (row.depth > skipDepth) continue; // inside a collapsed subtree
      skipDepth = null;
    }
    let descendants = 0;
    for (let j = i + 1; j < rows.length && rows[j].depth > row.depth; j++) {
      descendants++;
    }
    const isOpen = expanded.has(row.key);
    out.push({ row, descendants, expanded: isOpen });
    if (descendants > 0 && !isOpen) skipDepth = row.depth;
  }
  return out;
}
