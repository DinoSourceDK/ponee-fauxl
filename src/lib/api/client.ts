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
 * Typed client for the Pony Mail Foal JSON API (/api/<name>.json).
 *
 * Read-only endpoints use GET with query-string parameters so HTTP
 * caches apply; mutating or secret-bearing endpoints (compose, mgmt,
 * oauth, logout) POST a JSON body. The session cookie (`ponymail`,
 * path=/api) rides along via same-origin credentials. Errors surface
 * as ApiError; several endpoints return plain text rather than JSON
 * (source.json, mgmt.json write actions).
 */

import type {
  ActionResponse,
  ComposeRequest,
  EmailResponse,
  MgmtLogResponse,
  MgmtRequest,
  OauthPreferencesResponse,
  PreferencesResponse,
  StatsRequest,
  StatsResponse,
  ThreadResponse,
} from "./types";
import { config } from "../config";

/** API prefix from config.json (classic apiURL), e.g. "/api/". */
function apiBase(): string {
  return `${config.apiUrl}/`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    // Server errors are often plain text (or a traceback); keep line one.
    super(body.split("\n", 1)[0] || `HTTP ${status}`);
    this.name = "ApiError";
  }
}

async function postRaw(endpoint: string, body: unknown): Promise<Response> {
  const resp = await fetch(`${apiBase()}${endpoint}.json`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    credentials: "same-origin",
  });
  if (!resp.ok) {
    throw new ApiError(resp.status, await resp.text());
  }
  return resp;
}

/** Longest query string worth sending; longer requests fall back to POST. */
const GET_MAX_QUERY = 4000;

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === false) continue;
    q.set(key, value === true ? "true" : String(value));
  }
  return q.toString();
}

/**
 * Read-only endpoints go over GET (parameters in the query string, which
 * the server reads for any method) so HTTP caches can do their job -
 * like the classic UI's api/*.lua?… calls. Mutating or secret-bearing
 * calls (compose, mgmt, oauth, logout) stay on POST.
 */
async function getRaw(endpoint: string, params?: unknown): Promise<Response> {
  const qs = toQuery((params ?? {}) as Record<string, unknown>);
  if (qs.length > GET_MAX_QUERY) return postRaw(endpoint, params);
  const resp = await fetch(
    `${apiBase()}${endpoint}.json${qs ? `?${qs}` : ""}`,
    { credentials: "same-origin" },
  );
  if (!resp.ok) {
    throw new ApiError(resp.status, await resp.text());
  }
  return resp;
}

export async function postJson<T>(endpoint: string, body?: unknown): Promise<T> {
  const resp = await postRaw(endpoint, body);
  return (await resp.json()) as T;
}

export async function postText(endpoint: string, body?: unknown): Promise<string> {
  const resp = await postRaw(endpoint, body);
  return await resp.text();
}

export async function getJson<T>(endpoint: string, params?: unknown): Promise<T> {
  const resp = await getRaw(endpoint, params);
  return (await resp.json()) as T;
}

export async function getText(endpoint: string, params?: unknown): Promise<string> {
  const resp = await getRaw(endpoint, params);
  return await resp.text();
}

export async function getBlob(endpoint: string, params?: unknown): Promise<Blob> {
  const resp = await getRaw(endpoint, params);
  return await resp.blob();
}

/** Trigger a browser download of a blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ------------------------------------------------------------------ */
/* Typed endpoint facade                                               */
/* ------------------------------------------------------------------ */

export function stats(req: StatsRequest): Promise<StatsResponse> {
  return getJson<StatsResponse>("stats", req);
}

export function statsQuick(req: StatsRequest): Promise<StatsResponse> {
  return getJson<StatsResponse>("stats", { ...req, quick: true });
}

/** Poll for changes; resolves true if new mail arrived after `epoch`. */
export async function changedSince(
  params: Record<string, string>,
  epoch: number,
): Promise<boolean> {
  const res = await getJson<{ changed?: boolean }>("stats", {
    ...params,
    quick: true,
    since: String(epoch),
  });
  return res.changed !== false;
}

/**
 * email.json fetches deduplicated via an in-memory cache, since thread
 * rendering requests many emails at once and revisits are common.
 */
const emailCache = new Map<string, Promise<EmailResponse>>();

export function email(id: string, listid?: string): Promise<EmailResponse> {
  const key = `${id} ${listid ?? ""}`;
  let hit = emailCache.get(key);
  if (!hit) {
    hit = getJson<EmailResponse>("email", listid ? { id, listid } : { id });
    hit.catch(() => emailCache.delete(key)); // don't cache failures
    emailCache.set(key, hit);
  }
  return hit;
}

/**
 * email.json bypassing both caches (POST is never HTTP-cached), for the
 * admin editor, which must show the live stored state.
 */
export function emailFresh(id: string): Promise<EmailResponse> {
  return postJson<EmailResponse>("email", { id });
}

/** Drop cached emails; must be called on login/logout (privacy). */
export function clearEmailCache(): void {
  emailCache.clear();
}

export function attachment(id: string, file: string): Promise<Blob> {
  return getBlob("email", { id, attachment: true, file });
}

export function thread(
  id: string,
  opts?: { listid?: string; findParent?: boolean },
): Promise<ThreadResponse> {
  const req: Record<string, unknown> = { id };
  if (opts?.listid) req.listid = opts.listid;
  if (opts?.findParent) req.find_parent = true;
  return getJson<ThreadResponse>("thread", req);
}

export function source(id: string, listid?: string): Promise<string> {
  return getText("source", listid ? { id, listid } : { id });
}

/** Download search results as an mbox; pass StatsResponse.searchParams. */
export function mbox(searchParams: Record<string, string>): Promise<Blob> {
  return getBlob("mbox", searchParams);
}

/** Persist the user's UI preferences dict server-side (login only). */
export function savePreferences(
  preferences: Record<string, unknown>,
): Promise<{ okay: boolean }> {
  return postJson("preferences", { action: "save", preferences });
}

export function preferences(): Promise<PreferencesResponse> {
  return getJson<PreferencesResponse>("preferences", {});
}

export function oauthConfig(): Promise<OauthPreferencesResponse> {
  return getJson<OauthPreferencesResponse>("preferences", { oauth: true });
}

export function logout(): Promise<PreferencesResponse> {
  return postJson<PreferencesResponse>("preferences", { logout: true });
}

export function compose(req: ComposeRequest): Promise<ActionResponse> {
  return postJson<ActionResponse>("compose", req);
}

/** Exchange an OAuth callback for a session cookie. */
export function oauthCallback(
  args: Record<string, string>,
): Promise<ActionResponse> {
  return postJson<ActionResponse>("oauth", args);
}

export function mgmtLog(
  page: number,
  size: number,
  filter?: string[],
): Promise<MgmtLogResponse> {
  const req: MgmtRequest = { action: "log", page, size };
  if (filter?.length) req.filter = filter;
  return postJson<MgmtLogResponse>("mgmt", req);
}

/** Admin write actions return plain text like "Hid 1 emails from archives." */
export function mgmtAction(req: MgmtRequest): Promise<string> {
  return postText("mgmt", req);
}
