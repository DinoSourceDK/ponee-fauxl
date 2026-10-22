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
 * Client-side UI preferences, persisted to localStorage under
 * "ponymail2_prefs" (key also read by the pre-paint theme script in
 * index.html, so keep the schema in sync).
 */

import { config } from "../config";
import { readJson, writeJson } from "../storage";

export type ListMode = "threaded" | "flat" | "treeview";
export type Theme = "auto" | "light" | "dark";
export type HomeView = "grid" | "list";
export type UiStyle = "standard" | "forum";

export interface Prefs {
  listmode: ListMode;
  compact: boolean;
  /** Modern chat-style email rendering (vs classic headers + pre body). */
  chatty: boolean;
  theme: Theme;
  showStatsSidebar: boolean;
  /** Wall-clock dates in UTC instead of browser-local time. */
  utc: boolean;
  /** Home page list directory layout: domain cards or a flat list. */
  homeView: HomeView;
  /** Overall layout: the standard archive UI or a phpBB-style forum. */
  uiStyle: UiStyle;
}

const STORAGE_KEY = "ponymail2_prefs";

// config.json is loaded before this module (see main.ts), so operator
// defaults apply to browsers that have no stored preferences yet.
const defaults: Prefs = { ...config.defaults };

// Spread over defaults so preferences stored by an older version that
// lacked newer keys (e.g. utc) still get sensible values.
export const prefs: Prefs = $state({
  ...defaults,
  ...readJson<Partial<Prefs>>(STORAGE_KEY, {}),
});

function applyTheme(theme: Theme): void {
  const dark =
    theme === "dark" ||
    (theme === "auto" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

// Persist and apply on any change, for the lifetime of the app.
$effect.root(() => {
  $effect(() => {
    writeJson(STORAGE_KEY, {
      listmode: prefs.listmode,
      compact: prefs.compact,
      chatty: prefs.chatty,
      theme: prefs.theme,
      showStatsSidebar: prefs.showStatsSidebar,
      utc: prefs.utc,
      homeView: prefs.homeView,
      uiStyle: prefs.uiStyle,
    });
    applyTheme(prefs.theme);
  });
});

// Follow OS theme changes while in "auto".
if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => applyTheme(prefs.theme));
}
