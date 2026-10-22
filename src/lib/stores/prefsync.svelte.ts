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
 * Two-way sync between the browser-local preference state (the prefs
 * store, favorite lists and guide flags, all localStorage-backed) and
 * the logged-in user's server-side preferences dict (the account doc,
 * saved via preferences.json action=save).
 *
 * On login, the server copy wins and is applied locally, so settings
 * follow the user across browsers; a first login with nothing saved
 * seeds the server from the local state instead. After that, any
 * change to prefs or favorites pushes a debounced snapshot back up.
 * localStorage stays authoritative for anonymous visitors and keeps
 * working as the offline copy for logged-in ones.
 */

import { untrack } from "svelte";
import { savePreferences } from "../api/client";
import type { HomeView, ListMode, Theme, UiStyle } from "./prefs.svelte";
import { prefs } from "./prefs.svelte";
import { favorites, setFavorites } from "./favorites.svelte";
import { session } from "./session.svelte";

const PUSH_DELAY_MS = 1500;

/** Guide seen-flags that ride along with the synced snapshot. */
const GUIDE_KEYS = [
  "ponymail-guide-standard",
  "ponymail-guide-forum",
  "ponymail-guide-list-standard",
  "ponymail-guide-list-forum",
  "ponymail-guide-favorites",
  "ponymail-was-logged-in",
];

const LISTMODES: readonly ListMode[] = ["threaded", "flat", "treeview"];
const THEMES: readonly Theme[] = ["auto", "light", "dark"];
const HOME_VIEWS: readonly HomeView[] = ["grid", "list"];
const UI_STYLES: readonly UiStyle[] = ["standard", "forum"];

function readFlags(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of GUIDE_KEYS) {
    try {
      if (localStorage.getItem(key) === "1") out[key] = true;
    } catch {
      break; // no storage: nothing to report
    }
  }
  return out;
}

/** Canonical JSON of the local synced state (reads reactive sources). */
function snapshot(): string {
  return JSON.stringify({
    prefs: {
      listmode: prefs.listmode,
      compact: prefs.compact,
      chatty: prefs.chatty,
      theme: prefs.theme,
      showStatsSidebar: prefs.showStatsSidebar,
      utc: prefs.utc,
      homeView: prefs.homeView,
      uiStyle: prefs.uiStyle,
    },
    favorites: favorites.lists,
    guides: readFlags(),
  });
}

function pick<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Apply a server-saved snapshot onto the local stores and storage. */
function applyServer(saved: Record<string, unknown>): void {
  const p = (saved.prefs ?? {}) as Record<string, unknown>;
  prefs.listmode = pick(p.listmode, LISTMODES, prefs.listmode);
  prefs.compact = bool(p.compact, prefs.compact);
  prefs.chatty = bool(p.chatty, prefs.chatty);
  prefs.theme = pick(p.theme, THEMES, prefs.theme);
  prefs.showStatsSidebar = bool(p.showStatsSidebar, prefs.showStatsSidebar);
  prefs.utc = bool(p.utc, prefs.utc);
  prefs.homeView = pick(p.homeView, HOME_VIEWS, prefs.homeView);
  prefs.uiStyle = pick(p.uiStyle, UI_STYLES, prefs.uiStyle);
  if (Array.isArray(saved.favorites)) {
    setFavorites(saved.favorites as string[]);
  }
  const guides = (saved.guides ?? {}) as Record<string, unknown>;
  for (const key of GUIDE_KEYS) {
    if (guides[key] === true) {
      try {
        localStorage.setItem(key, "1");
      } catch {
        break;
      }
    }
  }
}

// Last state known to match the server; equal snapshots never push.
let lastPushed = "";
let timer = 0;

function schedulePush(): void {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    const snap = snapshot();
    if (snap === lastPushed) return;
    lastPushed = snap;
    savePreferences(JSON.parse(snap) as Record<string, unknown>).catch(() => {
      lastPushed = ""; // best effort: retry on the next change
    });
  }, PUSH_DELAY_MS);
}

/**
 * Start the sync loops. Call once from App's component initialization,
 * so the effects live for the whole app lifetime.
 */
export function startPreferenceSync(): void {
  // Login handshake: apply the server copy, or seed it when empty.
  // The apply/snapshot reads must stay untracked, or this effect would
  // rerun on every pref change and instantly revert it.
  $effect(() => {
    if (!session.loaded || !session.credentials) return;
    const saved = session.preferences;
    untrack(() => {
      if (saved && Object.keys(saved).length > 0) {
        applyServer(saved);
        lastPushed = snapshot();
      } else {
        lastPushed = "";
        schedulePush();
      }
    });
  });

  // Change tracking: any prefs/favorites change pushes a fresh snapshot
  // (guide flags are not reactive; they ride along with the next push).
  $effect(() => {
    const snap = snapshot();
    if (!session.credentials) return;
    if (snap === lastPushed) return;
    schedulePush();
  });
}
