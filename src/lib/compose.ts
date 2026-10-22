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
 * Pure helpers for the composer modal, ported from the classic
 * webui/js/source/composer.js (compose_email/composer_re/mua_link).
 */

import type { EmailResponse } from "./api/types";
import { formatDate } from "./dates";
import { authorName, emailListAddress } from "./listview";

/** Prefix "Re: " unless the subject already carries one (any case). */
export function replySubject(subject: string): string {
  return /^re:\s+/i.test(subject) ? subject : `Re: ${subject}`;
}

/** The list address replies go to (thread.json carries list raw). */
export function replyAddress(email: EmailResponse): string {
  return emailListAddress(email);
}

/**
 * Quoted reply body: "\n\nOn <date> <author> wrote:\n" followed by every
 * original body line prefixed with "> " (port of composer_re()).
 */
export function quoteReply(email: EmailResponse): string {
  const date = email.date ?? formatDate(email.epoch, true);
  const quoted = email.body
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nOn ${date} ${authorName(email.from)} wrote:\n${quoted}`;
}

/**
 * References header for a reply: the original's reference chain plus its
 * message-id, space-joined and deduplicated. The classic UI sent only the
 * message-id; carrying the chain forward gives MUAs better threading.
 */
export function replyReferences(email: EmailResponse): string {
  const refs = (email.references ?? "").split(/\s+/).filter(Boolean);
  if (email["message-id"]) refs.push(email["message-id"]);
  return [...new Set(refs)].join(" ");
}

/** Anything above 16K can cause namespace issues with mailto: links. */
const MAILTO_BODY_MAX = 16000;

/** mailto: link replying to an email via the user's own MUA. */
export function mailtoReply(email: EmailResponse): string {
  let body = quoteReply(email);
  if (body.length > MAILTO_BODY_MAX) {
    body = body.substring(0, MAILTO_BODY_MAX) + "\n[message truncated...]";
  }
  return (
    `mailto:${replyAddress(email)}` +
    `?subject=${encodeURIComponent(replySubject(email.subject))}` +
    `&In-Reply-To=${encodeURIComponent(email["message-id"])}` +
    `&body=${encodeURIComponent(body)}`
  );
}

/** mailto: link starting a new thread on a list via the user's own MUA. */
export function mailtoNew(to: string): string {
  return `mailto:${to}?subject=Subject+goes+here`;
}
