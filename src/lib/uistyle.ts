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
 * Extraction of the `ui=` layout-switch parameter from a raw query
 * string. Works on the raw string on purpose: list-page URLs carry a
 * positional spec with unencoded characters ("?dev@x.org:2024-3:a b"),
 * so running the whole thing through URLSearchParams would mangle it.
 */

import type { UiStyle } from "./stores/prefs.svelte";

// A ui= parameter delimited by start-of-string, '?' or '&' on the left
// and '&' or end-of-string on the right ("gui=forum" must not match).
const UI_PARAM = /(?:^|[?&])ui=([^&]*)/g;

/**
 * Find a `ui=standard|forum` parameter anywhere in a raw query string,
 * as a normal parameter ("?ui=forum", "?find_parent=true&ui=forum") or
 * glued to a positional list spec ("?dev@x.org:2024-3&ui=forum").
 * The last occurrence wins; unknown values yield null.
 */
export function uiStyleFromSearch(rawSearch: string): UiStyle | null {
  let value: string | null = null;
  for (const m of rawSearch.matchAll(UI_PARAM)) value = m[1];
  return value === "standard" || value === "forum" ? value : null;
}
