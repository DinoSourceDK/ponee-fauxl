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
 * Pure helpers for the admin console (port of webui/js/source/mgmt.js):
 * the email editor's form model and change detection, list-ID checks
 * mirroring server/endpoints/mgmt.py, audit log parsing, and resolving
 * whatever an admin pastes into the lookup box to a document ID.
 */

import type { EmailResponse, MgmtRequest } from "./api/types";
import { listRawToAddress } from "./listview";
import { unshortenID } from "./shortid";

/** Editable fields of an archived email. */
export interface EditForm {
  from: string;
  subject: string;
  /** List address, "dev@example.org". */
  list: string;
  private: boolean;
  body: string;
}

export function formFromEmail(email: EmailResponse): EditForm {
  return {
    from: email.from ?? "",
    subject: email.subject ?? "",
    list: listRawToAddress(email.list_raw ?? email.list ?? ""),
    private: !!email.private,
    body: email.body ?? "",
  };
}

/** Names of the fields that differ between two forms. */
export function changedFields(a: EditForm, b: EditForm): (keyof EditForm)[] {
  return (Object.keys(a) as (keyof EditForm)[]).filter((k) => a[k] !== b[k]);
}

/**
 * The mgmt.json edit request for a form. Only changed text fields are
 * sent (the server skips empty ones); `private` is always sent because
 * the server treats an omitted value as "make private".
 */
export function editRequest(
  mid: string,
  original: EditForm,
  form: EditForm,
): MgmtRequest {
  const req: MgmtRequest = {
    action: "edit",
    document: mid,
    private: form.private,
  };
  for (const key of changedFields(original, form)) {
    if (key === "from") req.from = form.from;
    else if (key === "subject") req.subject = form.subject;
    else if (key === "list") req.list = form.list;
    else if (key === "body") req.body = form.body;
  }
  return req;
}

/** Same pattern as LISTID_RE in server/endpoints/mgmt.py. */
const LISTID_RE = /^<?[-_a-z0-9]+[.@][-_a-z0-9.]+>?$/;

/** "dev@example.org" / "<dev.example.org>" to the forum form "dev@example.org". */
export function listToForum(list: string): string {
  return list.replace(/^<|>$/g, "").replace("@", ".").replace(".", "@");
}

/**
 * Why the server would reject a list target, or "" if it looks fine.
 * `known` is the session's domain -> list-part map.
 */
export function listProblem(
  list: string,
  known: Record<string, Record<string, number>>,
): string {
  if (!LISTID_RE.test(list)) {
    return "Must look like listname@domain, in lower case.";
  }
  const forum = listToForum(list);
  const at = forum.indexOf("@");
  const domain = forum.slice(at + 1);
  const part = forum.slice(0, at);
  if (!(known[domain] && part in known[domain])) {
    return `${forum} is not a list known to this archive.`;
  }
  return "";
}

/** Every known list as "list@domain", sorted, for autocompletion. */
export function knownListAddresses(
  known: Record<string, Record<string, number>>,
): string[] {
  const out: string[] = [];
  for (const [domain, lists] of Object.entries(known)) {
    for (const part of Object.keys(lists)) out.push(`${part}@${domain}`);
  }
  return out.sort();
}

/** Attachment size as shown by the classic console. */
export function fmtBytes(size: number): string {
  if (size >= 1024 * 1024) return `${Math.floor(size / (1024 * 10.24)) / 100} MB`;
  if (size >= 1024) return `${Math.floor(size / 1024)} KB`;
  return `${size} bytes`;
}

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

/** Actions recorded in the audit log, in display order. */
export const AUDIT_ACTIONS = [
  "edit",
  "hide",
  "unhide",
  "delete",
  "delatt",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  edit: "Edit",
  hide: "Hide",
  unhide: "Unhide",
  delete: "Delete",
  delatt: "Attachment removal",
};

/** Actions whose target is an email document (and so has an editor). */
export function targetsEmail(action: string): boolean {
  return action === "edit" || action === "hide" || action === "unhide" || action === "delete";
}

/**
 * auditlog.py stamps entries "YYYY/MM/DD HH:MM:SS" in UTC. Returns the
 * UNIX epoch, or null for anything unparseable.
 */
export function auditEpoch(date: string | undefined): number | null {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(
    (date ?? "").trim(),
  );
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
}

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

const ID_PATH_RE = /^\/(?:thread|admin)(?:\.html)?\/(.+)$/;

function decodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/**
 * A document ID from a pasted permalink (thread or admin URL, from this
 * or the classic UI) or a bare ID; legacy short IDs are expanded.
 * Returns "" when nothing usable was given.
 */
export function lookupId(input: string): string {
  let text = input.trim();
  if (!text) return "";
  let path: string | null = null;
  if (/^https?:\/\//i.test(text)) {
    try {
      path = new URL(text).pathname;
    } catch {
      path = null;
    }
  } else if (text.startsWith("/")) {
    path = text.split(/[?#]/, 1)[0];
  }
  if (path !== null) {
    const m = ID_PATH_RE.exec(path);
    if (!m) return "";
    // Same rule as the router: split raw, decode each segment once.
    text = m[1].split("/").map(decodeSegment).join("/");
  }
  return unshortenID(text);
}
