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
 * Types and client for /api/stream.json, the paged list-view endpoint.
 * Unlike stats.json (which returns every matching email and the full
 * thread structure), stream.json returns exactly one page of rows, so
 * the browser only ever downloads what it displays.
 *
 * Kept separate from types.ts/client.ts while both evolve; the request
 * shares stats.json's search parameters (list/domain/d/q/header_*).
 */

import type { Participant } from "./types";
import { getJson } from "./client";

/** "threads": one row per discussion thread; "emails": one row per email. */
export type StreamMode = "threads" | "emails";

/**
 * Row order (threads mode): newest activity, most upvotes or most
 * replies first. Count sorts break ties on newest activity; "upvotes"
 * implies social=yes server-side.
 */
export type StreamSort = "activity" | "upvotes" | "replies";

export interface StreamRequest {
  /** List part, e.g. "dev"; "*" matches all lists. Omitted with `lists`. */
  list?: string;
  /** Domain part, e.g. "httpd.apache.org"; "*" matches all domains. */
  domain?: string;
  /**
   * Comma-separated List-IDs ("<dev.example.org>,...") to collate
   * results across, replacing the list/domain pair (max 64).
   */
  lists?: string;
  mode: StreamMode;
  /** Row order, threads mode only (default "activity"). */
  sort?: StreamSort;
  /** 0-based page number (default 0). */
  page?: number;
  /** Rows per page, 1..100 (default 25). */
  quant?: number;
  /** Date spec, as for stats.json ("YYYY-M", "lte=1M", "dfr=..|dto=.."). */
  d?: string;
  /** Free-text query: words are ANDed; +required, -excluded, "phrases". */
  q?: string;
  header_from?: string;
  header_subject?: string;
  header_to?: string;
  header_body?: string;
  header_messageid?: string;
  /** "yes" asks for per-thread upvote sums (degrades to 0 if unsupported). */
  social?: string;
}

/** Fields shared by every per-email object in a stream response. */
interface StreamEmailBase {
  id: string;
  mid: string;
  from: string;
  gravatar: string;
  epoch: number;
  subject: string;
  /** Address form, "l@d" (unlike stats.json's raw "<l.d>"). */
  list: string;
  private: boolean;
}

/** Thread-starting email; also the row shape in emails mode. */
export interface StreamStarter extends StreamEmailBase {
  /** Body teaser, <= 250 chars. */
  body: string;
}

/** Flattened descendant of a thread root (treeview); no body. */
export interface StreamChild extends StreamEmailBase {
  depth: number;
}

/** One discussion thread (threads mode). */
export interface StreamRow {
  tid: string;
  /** Thread root's subject/epoch. */
  subject: string;
  epoch: number;
  last_epoch: number;
  replies: number;
  participants: number;
  upvotes: number;
  /** Author of the newest post in the thread. */
  last_from: string | null;
  starter: StreamStarter;
  /** Flattened descendants, capped at 200 per thread. */
  children: StreamChild[];
}

/** One list's share of the searched window (landing category stats). */
export interface ListWindowStats {
  /** Matching emails on the list. */
  hits: number;
  /** Unique authors on the list. */
  participants: number;
  /** Threads started on the list (0 in emails mode). */
  threads: number;
}

export interface StreamResponse {
  mode: StreamMode;
  page: number;
  quant: number;
  /** Row order this response was sliced under (older servers omit it). */
  sort?: StreamSort;
  /** Normalized List-IDs of a `lists` request; null/absent otherwise. */
  lists?: string[] | null;
  /** Pageable rows: thread count (threads mode) or hits (emails mode). */
  total: number;
  /** Matching emails, threads and unique authors, as in stats.json. */
  hits: number;
  no_threads: number;
  numparts: number;
  firstYear: number;
  firstMonth: number;
  lastYear: number;
  lastMonth: number;
  /** Map of "YYYY-MM" to email count for calendar rendering. */
  active_months: Record<string, number>;
  /** Top-10 authors, same shape as stats.json. */
  participants: Participant[];
  /** Per-list window breakdown, keyed by address (older servers omit). */
  list_stats?: Record<string, ListWindowStats>;
  searchlist: string;
  name: string;
  domain: string;
  list: string;
  /** Echo of the effective search params; reuse verbatim for mbox.json. */
  searchParams: Record<string, string>;
  unixtime: number;
  /** Listing was served from the server-side cache. */
  cached: boolean;
  /** StreamRow[] in threads mode, StreamStarter[] in emails mode. */
  rows: StreamRow[] | StreamStarter[];
}

/**
 * Fetch one page of list-view rows. Always asks for social upvotes,
 * mirroring specToRequests (the backend degrades them to 0 when the
 * social plugin is off).
 */
export function stream(req: StreamRequest): Promise<StreamResponse> {
  return getJson<StreamResponse>("stream", { ...req, social: "yes" });
}
