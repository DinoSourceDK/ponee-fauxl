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
 * Composer state shared between the global shell (C/R shortcuts), email
 * views (Reply buttons) and the Composer modal itself.
 */

import type { EmailResponse } from "../api/types";

export interface ComposerState {
  open: boolean;
  mode: "reply" | "new";
  /** Email being replied to (reply mode). */
  email: EmailResponse | null;
  /** Target list address, e.g. "dev@ponymail.apache.org" (new mode). */
  to: string;
}

export const composer: ComposerState = $state({
  open: false,
  mode: "new",
  email: null,
  to: "",
});

/**
 * Most recent email shown to the user, the target for the global "R"
 * (reply) shortcut. Email views update this as threads are opened.
 */
export const replyCandidate: { email: EmailResponse | null } = $state({
  email: null,
});

export function openComposer(opts: {
  mode: "reply" | "new";
  email?: EmailResponse;
  to?: string;
}): void {
  composer.mode = opts.mode;
  composer.email = opts.email ?? null;
  composer.to = opts.to ?? "";
  composer.open = true;
}

export function closeComposer(): void {
  composer.open = false;
}
