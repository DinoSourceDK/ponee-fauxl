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
 * Runtime deployment configuration, the counterpart of the classic
 * webui's config.js. Loaded from <base>/config.json before the app
 * mounts (see main.ts), so operators can configure a built dist/
 * without rebuilding. A missing or invalid file means defaults.
 *
 * Not carried over from config.js: URLBase (a build-time setting here,
 * vite.config.ts `base` + router BASE_PATH), long_tabs and
 * LOTS_OF_LISTS (the list index and switcher layouts differ).
 */

// Type-only: erased at runtime, so no module cycle with the prefs store.
import type { HomeView, ListMode, Theme, UiStyle } from "./stores/prefs.svelte";

/** Initial UI preferences for browsers that have none stored yet. */
export interface PrefDefaults {
  listmode: ListMode;
  compact: boolean;
  chatty: boolean;
  theme: Theme;
  showStatsSidebar: boolean;
  /** Show wall-clock dates in UTC instead of browser-local time. */
  utc: boolean;
  /** Home page list directory layout: domain cards or a flat list. */
  homeView: HomeView;
  /** Overall layout: the standard archive UI or a phpBB-style forum. */
  uiStyle: UiStyle;
}

export interface UiConfig {
  /** Site name: header wordmark and document.title. */
  title: string;
  /** Site logo URL, used for the header wordmark and the favicon. */
  logo: string;
  /** API prefix, no trailing slash ("" = endpoints at the site root). */
  apiUrl: string;
  /** Avatar URL template; %s is replaced with the md5 hash. */
  gravatarUrl: string;
  /** Preferred list when jumping to a domain (classic favorite_list). */
  favoriteList: string;
  /**
   * High-volume automation lists (boring_lists): never auto-picked when
   * jumping to a domain, sorted last in directories, and excluded from
   * the landing page's active-lists strip.
   */
  boringLists: string[];
  /** Offer a mailto: subscribe link on single-list pages. */
  subscribeLinks: boolean;
  /** Extra text after "not found or private" messages (e.g. a contact). */
  permErrorPostface: string;
  defaults: PrefDefaults;
}

export const DEFAULT_CONFIG: UiConfig = {
  title: "Pony Mail",
  logo: "/foal-logo.svg",
  apiUrl: "/api",
  gravatarUrl: "/api/gravatar?md5=%s",
  favoriteList: "dev",
  boringLists: [
    "commits",
    "cvs",
    "site-cvs",
    "security",
    "notifications",
    "issues",
  ],
  subscribeLinks: false,
  permErrorPostface: "",
  defaults: {
    listmode: "threaded",
    compact: false,
    chatty: true,
    theme: "auto",
    showStatsSidebar: true,
    utc: false,
    homeView: "grid",
    uiStyle: "standard",
  },
};

const LISTMODES: readonly ListMode[] = ["threaded", "flat", "treeview"];
const THEMES: readonly Theme[] = ["auto", "light", "dark"];
const HOMEVIEWS: readonly HomeView[] = ["grid", "list"];
const UISTYLES: readonly UiStyle[] = ["standard", "forum"];

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asStringArray(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  return v.filter((x): x is string => typeof x === "string");
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fb: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fb;
}

/** Merge a parsed config.json over the defaults; bad values are ignored. */
export function mergeConfig(raw: unknown): UiConfig {
  const d = DEFAULT_CONFIG;
  if (typeof raw !== "object" || raw === null) return structuredClone(d);
  const o = raw as Record<string, unknown>;
  const rd =
    typeof o.defaults === "object" && o.defaults !== null
      ? (o.defaults as Record<string, unknown>)
      : {};
  return {
    title: asString(o.title, d.title),
    logo: asString(o.logo, d.logo),
    apiUrl: asString(o.apiUrl, d.apiUrl).replace(/\/+$/, ""),
    gravatarUrl: asString(o.gravatarUrl, d.gravatarUrl),
    favoriteList: asString(o.favoriteList, d.favoriteList),
    boringLists: asStringArray(o.boringLists, d.boringLists),
    subscribeLinks: asBool(o.subscribeLinks, d.subscribeLinks),
    permErrorPostface: asString(o.permErrorPostface, d.permErrorPostface),
    defaults: {
      listmode: oneOf(rd.listmode, LISTMODES, d.defaults.listmode),
      compact: asBool(rd.compact, d.defaults.compact),
      chatty: asBool(rd.chatty, d.defaults.chatty),
      theme: oneOf(rd.theme, THEMES, d.defaults.theme),
      showStatsSidebar: asBool(
        rd.showStatsSidebar,
        d.defaults.showStatsSidebar,
      ),
      utc: asBool(rd.utc, d.defaults.utc),
      homeView: oneOf(rd.homeView, HOMEVIEWS, d.defaults.homeView),
      uiStyle: oneOf(rd.uiStyle, UISTYLES, d.defaults.uiStyle),
    },
  };
}

/**
 * The active configuration. Populated by loadConfig() before the app
 * module graph is evaluated; consumers may read it at any time after.
 */
export const config: UiConfig = structuredClone(DEFAULT_CONFIG);

export async function loadConfig(): Promise<void> {
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}config.json`, {
      headers: { accept: "application/json" },
    });
    if (!resp.ok) return; // no config.json: run on defaults
    Object.assign(config, mergeConfig(await resp.json()));
  } catch {
    // Unreachable or unparsable config: run on defaults.
  }
}
