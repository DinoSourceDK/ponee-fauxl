<!--
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
-->
<script lang="ts">
  import { mbox, saveBlob } from "../../lib/api/client";
  import type { StatsResponse } from "../../lib/api/types";
  import { config } from "../../lib/config";
  import { atomFeedUrl, FAVORITES_DOMAIN } from "../../lib/favorites";
  import { mboxFilename, pickDomainList } from "../../lib/listview";
  import { navigate } from "../../lib/router.svelte";
  import type { SearchSpec } from "../../lib/search";
  import { listUrl } from "../../lib/search";
  import { openComposer } from "../../lib/stores/compose.svelte";
  import {
    favorites,
    toggleFavorite,
  } from "../../lib/stores/favorites.svelte";
  import type { ListMode } from "../../lib/stores/prefs.svelte";
  import { prefs } from "../../lib/stores/prefs.svelte";
  import { session } from "../../lib/stores/session.svelte";
  import { toast } from "../../lib/stores/toasts.svelte";
  import Dropdown from "../ui/Dropdown.svelte";
  import AdvancedSearch from "./AdvancedSearch.svelte";

  interface Props {
    spec: SearchSpec;
    title: string;
    /** Merged response; null before the first fetch completes. */
    stats: StatsResponse | null;
    loading: boolean;
    onrefresh: () => void;
  }

  let { spec, title, stats, loading, onrefresh }: Props = $props();

  let searchInput: HTMLInputElement | undefined = $state();

  /** Used by the page-level "s" shortcut. */
  export function focusSearch(): void {
    searchInput?.focus();
    searchInput?.select();
  }

  let query = $state("");
  $effect(() => {
    query = spec.query ?? "";
  });

  let advancedOpen = $state(false);

  const single = $derived(spec.lists.length === 1);
  const currentList = $derived(single ? spec.lists[0].list : "");
  const currentDomain = $derived(single ? spec.lists[0].domain : "");
  const concreteList = $derived(
    single && currentList !== "*" && currentDomain !== "*",
  );

  // Same list/date without the query (and without header filters, which get
  // their own UI in a later milestone).
  function specWithQuery(q: string): SearchSpec {
    const next: SearchSpec = { lists: spec.lists, headers: spec.headers };
    if (spec.date) next.date = spec.date;
    if (q) next.query = q;
    return next;
  }

  function submitSearch(event: SubmitEvent): void {
    event.preventDefault();
    navigate(listUrl(specWithQuery(query.trim())));
  }

  function clearSearch(): void {
    query = "";
    if (spec.query) navigate(listUrl(specWithQuery("")));
    else searchInput?.focus();
  }

  /* --- list/domain switcher ------------------------------------------ */

  const domainLists = $derived(
    currentDomain ? session.lists[currentDomain] : undefined,
  );

  interface ListTab {
    name: string;
    count: number;
    current: boolean;
  }

  const listTabs = $derived.by<ListTab[]>(() => {
    if (!domainLists) return [];
    const entries = Object.entries(domainLists)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    let top = entries.slice(0, 3);
    const cur = entries.find((e) => e.name === currentList);
    if (cur && !top.includes(cur)) top = [cur, ...top.slice(0, 2)];
    // Current list leads the tab strip.
    top = [
      ...top.filter((e) => e.name === currentList),
      ...top.filter((e) => e.name !== currentList),
    ];
    return top.map((e) => ({ ...e, current: e.name === currentList }));
  });

  const otherLists = $derived.by<string[]>(() => {
    if (!domainLists) return [];
    const shown = new Set(listTabs.map((t) => t.name));
    return Object.keys(domainLists)
      .filter((name) => !shown.has(name))
      .sort();
  });

  const domainCount = $derived(Object.keys(session.lists).length);

  function tabUrl(list: string, domain: string): string {
    const next: SearchSpec = { lists: [{ list, domain }], headers: {} };
    if (spec.date) next.date = spec.date;
    return listUrl(next);
  }

  function gotoDomain(domain: string): void {
    const best = pickDomainList(
      session.lists[domain] ?? {},
      config.favoriteList,
      config.boringLists,
    );
    if (best) navigate(tabUrl(best, domain));
  }

  // Atom feed carrying this exact view's search parameters (single
  // list/domain selections only, since virtual inboxes have no one feed).
  const feedHref = $derived(atomFeedUrl(spec, favorites.lists));

  // Classic subscribeLinks option: mailto for the list's -subscribe alias.
  const subscribeHref = $derived.by(() => {
    if (!config.subscribeLinks || !concreteList || !spec) return null;
    const l = spec.lists[0];
    return `mailto:${l.list}-subscribe@${l.domain}`;
  });

  /* --- mbox download -------------------------------------------------- */

  let downloading = $state(false);

  async function downloadMbox(): Promise<void> {
    if (!stats?.searchParams || downloading) return;
    downloading = true;
    try {
      const blob = await mbox(stats.searchParams);
      const name =
        `${currentList}@${currentDomain}` +
        (spec.date ? `-${spec.date}` : "");
      saveBlob(blob, mboxFilename(name));
    } catch (e) {
      toast(
        "error",
        `mbox download failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      downloading = false;
    }
  }

  const MODES: { mode: ListMode; label: string }[] = [
    { mode: "threaded", label: "Threaded" },
    { mode: "flat", label: "Flat" },
    { mode: "treeview", label: "Tree" },
  ];

  const toolBtn = `inline-flex items-center gap-1 rounded-md border
    border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-600
    hover:bg-slate-50 focus:ring-2 focus:ring-pony-500 focus:outline-none
    disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700
    dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800`;
</script>

<header class="mb-4 flex flex-col gap-3">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex min-w-0 items-center">
      {#if concreteList}
        {@const favAddress = `${currentList}@${currentDomain}`}
        {@const fav = favorites.has(favAddress)}
        <button
          type="button"
          onclick={() => toggleFavorite(favAddress)}
          aria-pressed={fav}
          data-guide="favstar"
          title={fav
            ? "Remove from your favorite lists"
            : "Add to your favorite lists"}
          class="shrink-0 rounded-md p-1 focus:ring-2 focus:ring-pony-500
                 focus:outline-none
                 {fav
            ? 'text-amber-400 hover:text-amber-500'
            : `text-slate-300 hover:text-amber-400 dark:text-slate-600
               dark:hover:text-amber-400`}"
        >
          <svg
            viewBox="0 0 24 24"
            fill={fav ? "currentColor" : "none"}
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
            class="h-5 w-5"
            aria-hidden="true"
          >
            <polygon
              points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12
                      17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            />
          </svg>
          <span class="sr-only">
            {fav ? "Remove" : "Add"}
            {favAddress}
            {fav ? "from" : "to"} favorites
          </span>
        </button>
      {/if}
      <h1
        class="truncate text-xl font-semibold text-slate-800
               dark:text-slate-100"
      >
        {title}
      </h1>
    </div>

    <form role="search" class="flex items-center gap-1" onsubmit={submitSearch}>
      <div class="relative">
        <input
          bind:this={searchInput}
          bind:value={query}
          type="text"
          placeholder="Search this list&hellip;"
          aria-label="Search this list"
          class="w-56 rounded-md border border-slate-300 bg-white px-3 py-1.5
                 pr-8 text-sm text-slate-900 placeholder:text-slate-400
                 focus:border-pony-500 focus:ring-2 focus:ring-pony-500
                 focus:outline-none sm:w-72 dark:border-slate-700
                 dark:bg-slate-900 dark:text-slate-100
                 dark:placeholder:text-slate-500"
        />
        {#if query || spec.query}
          <button
            type="button"
            aria-label="Clear search"
            onclick={clearSearch}
            class="absolute inset-y-0 right-1.5 my-auto flex h-5 w-5
                   items-center justify-center rounded-md text-slate-400
                   hover:text-slate-600 focus:ring-2 focus:ring-pony-500
                   focus:outline-none dark:hover:text-slate-200"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        {/if}
      </div>
      <button
        type="submit"
        class="rounded-md bg-pony-600 px-3 py-1.5 text-sm font-medium
               text-white hover:bg-pony-700 focus:ring-2 focus:ring-pony-500
               focus:ring-offset-2 focus:outline-none dark:hover:bg-pony-500
               dark:focus:ring-offset-slate-950"
      >
        Search
      </button>
      <button
        type="button"
        aria-expanded={advancedOpen}
        aria-label="Advanced search"
        title="Advanced search"
        onclick={() => (advancedOpen = !advancedOpen)}
        class={toolBtn}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="h-4 w-4 transition-transform {advancedOpen
            ? 'rotate-180'
            : ''}"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </form>
  </div>

  {#if advancedOpen}
    <AdvancedSearch {spec} {query} onclose={() => (advancedOpen = false)} />
  {/if}

  <div class="flex flex-wrap items-center justify-between gap-3">
    <nav
      class="flex flex-wrap items-center gap-1.5"
      aria-label="Mailing lists"
    >
      {#if domainCount > 1 && currentDomain && currentDomain !== "*"}
        <Dropdown>
          {#snippet label()}
            <span class="max-w-40 truncate">
              {currentDomain === FAVORITES_DOMAIN
                ? "Favorite lists"
                : currentDomain}
            </span>
          {/snippet}
          {#if favorites.lists.length > 0}
            <button
              type="button"
              role="menuitem"
              onclick={() =>
                navigate(
                  listUrl({
                    lists: [{ list: "*", domain: FAVORITES_DOMAIN }],
                    headers: {},
                  }),
                )}
              class="block w-full border-b border-slate-200 px-3 py-1.5
                     text-left text-sm text-slate-700 hover:bg-slate-100
                     dark:border-slate-800 dark:text-slate-200
                     dark:hover:bg-slate-800
                     {currentDomain === FAVORITES_DOMAIN
                ? 'font-semibold text-pony-700 dark:text-pony-300'
                : ''}"
            >
              <span aria-hidden="true" class="mr-1 text-amber-400">&#9733;</span>
              Favorite lists
            </button>
          {/if}
          {#each Object.keys(session.lists).sort() as domain (domain)}
            <button
              type="button"
              role="menuitem"
              onclick={() => gotoDomain(domain)}
              class="block w-full px-3 py-1.5 text-left text-sm
                     text-slate-700 hover:bg-slate-100 dark:text-slate-200
                     dark:hover:bg-slate-800
                     {domain === currentDomain
                ? 'font-semibold text-pony-700 dark:text-pony-300'
                : ''}"
            >
              {domain}
            </button>
          {/each}
        </Dropdown>
      {/if}

      {#each listTabs as tab (tab.name)}
        <a
          href={tabUrl(tab.name, currentDomain)}
          aria-current={tab.current ? "page" : undefined}
          class="rounded-md px-2.5 py-1.5 text-sm
                 {tab.current
            ? 'bg-pony-100 font-semibold text-pony-700 dark:bg-pony-900 dark:text-pony-200'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'}"
        >
          {tab.name}
        </a>
      {/each}

      {#if domainLists && otherLists.length > 0}
        <Dropdown>
          {#snippet label()}
            All lists ({Object.keys(domainLists).length})
          {/snippet}
          {#each otherLists as name (name)}
            <a
              role="menuitem"
              href={tabUrl(name, currentDomain)}
              class="block px-3 py-1.5 text-sm text-slate-700
                     hover:bg-slate-100 dark:text-slate-200
                     dark:hover:bg-slate-800"
            >
              {name}
            </a>
          {/each}
        </Dropdown>
      {/if}
    </nav>

    <div class="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="View mode"
        data-guide="viewmode"
        class="inline-flex overflow-hidden rounded-md border border-slate-300
               dark:border-slate-700"
      >
        {#each MODES as m (m.mode)}
          <!-- The forum layout always tables whole topics, so flat and
               tree modes cannot apply there: show threaded as active
               and disable the other two rather than having them
               silently do nothing. -->
          {@const forumStyle = prefs.uiStyle === "forum"}
          {@const active = forumStyle
            ? m.mode === "threaded"
            : prefs.listmode === m.mode}
          {@const disabled = forumStyle && m.mode !== "threaded"}
          <button
            type="button"
            aria-pressed={active}
            {disabled}
            title={disabled ? "Not available in the forum layout" : undefined}
            onclick={() => (prefs.listmode = m.mode)}
            class="border-l border-slate-300 px-2.5 py-1.5 text-sm
                   first:border-l-0 focus:ring-2 focus:ring-pony-500
                   focus:outline-none dark:border-slate-700
                   {active
              ? 'bg-pony-600 font-medium text-white dark:bg-pony-500'
              : disabled
                ? 'cursor-not-allowed bg-white text-slate-300 dark:bg-slate-900 dark:text-slate-600'
                : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}"
          >
            {m.label}
          </button>
        {/each}
      </div>

      <button
        type="button"
        aria-pressed={prefs.compact}
        aria-label="Toggle compact rows"
        title="Compact rows"
        onclick={() => (prefs.compact = !prefs.compact)}
        class="{toolBtn} {prefs.compact
          ? 'border-pony-400 bg-pony-50 text-pony-700 dark:border-pony-600 dark:bg-pony-950 dark:text-pony-200'
          : ''}"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      </button>

      {#if concreteList}
        <button
          type="button"
          aria-label="Start a new thread"
          title="Start a new thread"
          onclick={() =>
            openComposer({
              mode: "new",
              to: `${currentList}@${currentDomain}`,
            })}
          class={toolBtn}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      {/if}

      <button
        type="button"
        aria-label="Refresh results"
        title="Refresh"
        onclick={onrefresh}
        disabled={loading}
        class={toolBtn}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="h-4 w-4 {loading ? 'animate-spin' : ''}"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
        </svg>
      </button>

      {#if concreteList}
        <button
          type="button"
          aria-label="Download as mbox archive"
          title="Download as mbox archive"
          onclick={downloadMbox}
          disabled={downloading || !stats}
          class={toolBtn}
        >
          {#if downloading}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="h-4 w-4 animate-spin"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-9-9" />
            </svg>
          {:else}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
            </svg>
          {/if}
          <span class="hidden sm:inline">mbox</span>
        </button>
      {/if}

      {#if feedHref}
        <a
          href={feedHref}
          target="_blank"
          rel="alternate noopener"
          type="application/atom+xml"
          aria-label="Atom feed for this view"
          title="Atom feed for this view"
          class={toolBtn}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
            <circle cx="5" cy="19" r="1" fill="currentColor" />
          </svg>
          <span class="hidden sm:inline">Feed</span>
        </a>
      {/if}

      {#if subscribeHref}
        <a
          href={subscribeHref}
          aria-label="Subscribe to this list"
          title="Subscribe to this list"
          class={toolBtn}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M4 6h16v12H4zM4 7l8 6 8-6M19 16h4M21 14v4" />
          </svg>
          <span class="hidden sm:inline">Subscribe</span>
        </a>
      {/if}
    </div>
  </div>
</header>
