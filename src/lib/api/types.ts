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
 * Request/response types for the Pony Mail Foal JSON API.
 * Mirrors server/openapi.yaml and the endpoint implementations in
 * server/endpoints/.
 */

/** Search / listing request accepted by stats.json and mbox.json. */
export interface StatsRequest {
  /** List part, e.g. "dev"; "*" matches all lists. */
  list: string;
  /** Domain part, e.g. "httpd.apache.org"; "*" matches all domains. */
  domain: string;
  /**
   * Date spec: "YYYY-M" (single month), "lte=1M"/"gte=2y" (relative,
   * units d/w/M/y) or "dfr=YYYY-M-D|dto=YYYY-M-D" (absolute range).
   */
  d?: string;
  /** Free-text query: words are ANDed; +required, -excluded, "phrases". */
  q?: string;
  header_from?: string;
  header_subject?: string;
  header_to?: string;
  header_body?: string;
  header_messageid?: string;
  /** Stats only: omit emails and thread structure (fast). */
  quick?: boolean;
  /** Omit thread_struct/participants; emails only. */
  emailsOnly?: boolean;
  /** UNIX epoch (as string); server replies {changed:false} if no new mail. */
  since?: string;
  /** "yes" asks the backend to include social_upvotes per email. */
  social?: string;
  /** "yes" returns a more condensed response for faster transfers */
  streaming?: string;
}

/** Compact email as returned in stats.json emails[] and thread nodes. */
export interface EmailSummary {
  id: string;
  mid: string;
  from: string;
  subject: string;
  epoch: number;
  list: string;
  list_raw?: string;
  private: boolean;
  gravatar: string;
  /** Body teaser truncated to ~201 chars (stats.json). */
  body?: string;
  attachments?: Attachment[];
  "message-id"?: string;
  "in-reply-to"?: string;
  /** Upvote count; present when the request asked for social: "yes". */
  social_upvotes?: number;
}

export interface Attachment {
  filename: string;
  hash: string;
  size: number;
  "content-type"?: string;
}

/** Node in the thread_struct tree returned by stats.json. */
export interface ThreadStructNode {
  tid: string;
  mid?: string;
  subject: string;
  tsubject?: string;
  epoch: number;
  nest: number;
  children: ThreadStructNode[];
}

export interface Participant {
  email: string;
  name: string;
  count: number;
  gravatar: string;
}

/** Response from stats.json (the main search/list endpoint). */
export interface StatsResponse {
  hits: number;
  numparts: number;
  no_threads: number;
  firstYear: number;
  firstMonth: number;
  lastYear: number;
  lastMonth: number;
  /** Map of "YYYY-MM" to email count for calendar rendering. */
  active_months: Record<string, number>;
  emails: EmailSummary[];
  thread_struct: ThreadStructNode[];
  participants: Participant[];
  /** Word cloud: word to weight. Present only if enabled server-side. */
  cloud?: Record<string, number> | null;
  searchlist: string;
  name: string;
  domain: string;
  list: string;
  /** Echo of the effective search params; reuse verbatim for mbox.json. */
  searchParams: Record<string, string>;
  unixtime: number;
  /** Only present in `since` polling responses. */
  changed?: boolean;
}

/** Full single email, as returned by email.json and thread.json emails[]. */
export interface EmailResponse {
  id: string;
  mid: string;
  dbid?: string;
  "message-id": string;
  from: string;
  from_raw?: string;
  to?: string;
  cc?: string;
  subject: string;
  date?: string;
  epoch: number;
  list?: string;
  list_raw: string;
  body: string;
  private: boolean;
  references?: string;
  "in-reply-to"?: string;
  attachments?: Attachment[];
  permalinks?: string[];
  gravatar: string;
  /** Upvote count; optional. Absent means unknown, not zero. */
  social_upvotes?: number;
  /** Hidden by an admin; such emails are only served to admins. */
  deleted?: boolean;
}

/** Nested thread tree returned by thread.json (root node). */
export type ThreadNode = EmailResponse & { children?: ThreadNode[] };

export interface ThreadResponse {
  thread: ThreadNode | null;
  emails: EmailResponse[];
}

export interface Credentials {
  uid?: string;
  email: string;
  fullname: string;
  /** True for admins (mgmt console access). */
  admin?: boolean;
  /** Server allows full GDPR deletion (admins only). */
  fully_delete?: boolean;
}

export interface PreferencesResponse {
  login: { credentials?: Credentials };
  /** domain -> list-part -> recent activity count */
  lists: Record<string, Record<string, number>>;
  versions?: Record<string, string>;
  /** Server-saved UI preferences of the logged-in user. */
  preferences?: Record<string, unknown>;
}

/** OAuth provider config entry from preferences.json {oauth: true}. */
export interface OauthProvider {
  name: string;
  oauth_portal: string;
  client_id?: string;
  scope?: string;
  /** If true, all keys are urlencoded into the portal redirect. */
  construct?: boolean;
  [key: string]: unknown;
}

export interface OauthPreferencesResponse {
  login: { credentials?: Credentials };
  oauth: Record<string, OauthProvider>;
}

export interface ComposeRequest {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  "in-reply-to"?: string;
  references?: string;
  /** Alternate sender address (must belong to the logged-in user). */
  alt?: string;
}

export interface ActionResponse {
  okay?: boolean;
  message?: string;
  error?: string;
}

/** Audit log entry (server/plugins/auditlog.py). */
export interface MgmtLogEntry {
  id: string;
  /** UTC timestamp, "YYYY/MM/DD HH:MM:SS". */
  date: string;
  action: string;
  /** Client address of the admin. */
  remote?: string;
  /** "uid@oauth-provider" of the admin. */
  author: string;
  /** Email permalink, or attachment hash for "delatt". */
  target?: string;
  lid?: string;
  log: string;
}

export interface MgmtLogResponse {
  entries: MgmtLogEntry[];
}

export type MgmtAction =
  | "delete"
  | "hide"
  | "unhide"
  | "delatt"
  | "edit"
  | "log";

export interface MgmtRequest {
  action: MgmtAction;
  document?: string;
  documents?: string[];
  /** Audit log paging. */
  size?: number;
  page?: number;
  /** Audit log actions to include (default: all but "delatt"). */
  filter?: string[];
  /** Edit fields. */
  from?: string;
  subject?: string;
  list?: string;
  body?: string;
  private?: boolean;
  attachments?: Attachment[];
}
