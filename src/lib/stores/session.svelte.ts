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
 * Server-backed session state: login credentials and the archive overview
 * (domains and lists with activity counts) from preferences.json.
 */

import { clearEmailCache, logout, preferences } from "../api/client";
import type { Credentials } from "../api/types";

export const session = $state({
  loaded: false,
  error: "" as string,
  credentials: null as Credentials | null,
  /** domain -> list-part -> recent activity count */
  lists: {} as Record<string, Record<string, number>>,
  versions: {} as Record<string, string>,
  /** Server-saved UI preferences for the logged-in user (null = none). */
  preferences: null as Record<string, unknown> | null,
});

export async function loadSession(): Promise<void> {
  try {
    const res = await preferences();
    session.credentials = res.login?.credentials ?? null;
    session.lists = res.lists ?? {};
    session.versions = res.versions ?? {};
    session.preferences = res.preferences ?? null;
    session.error = "";
  } catch (e) {
    session.error = e instanceof Error ? e.message : String(e);
  } finally {
    session.loaded = true;
  }
}

export async function doLogout(): Promise<void> {
  try {
    await logout();
  } finally {
    // Privacy: cached email bodies may include private-list content.
    clearEmailCache();
    await loadSession();
  }
}
