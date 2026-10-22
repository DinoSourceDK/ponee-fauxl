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
  import { SvelteSet } from "svelte/reactivity";
  import ForumIndex from "../components/forum/ForumIndex.svelte";
  import { formatCount } from "../lib/calendar";
  import { config } from "../lib/config";
  import type { DirectoryGroup } from "../lib/directory";
  import { organizeLists, topActiveLists } from "../lib/directory";
  import { FAVORITES_DOMAIN, favoritesToRefs } from "../lib/favorites";
  import { navigate } from "../lib/router.svelte";
  import { listUrl } from "../lib/search";
  import { favorites } from "../lib/stores/favorites.svelte";
  import { prefs } from "../lib/stores/prefs.svelte";
  import { loadSession, session } from "../lib/stores/session.svelte";

  // A–Z first, then '#' for domains starting with a non-letter (matches the
  // legacy list-index.js is_letter() bucketing).
  const LETTERS: string[] = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

  const SKELETON_CARDS: number[] = Array.from({ length: 9 }, (_, i) => i);
  const SKELETON_CHIP_WIDTHS = ["w-28", "w-36", "w-24"] as const;

  // Lists surfaced first within a domain, regardless of activity.
  const FAVORED = ["dev", "user", "users"];

  interface DomainEntry {
    domain: string;
    group: DirectoryGroup;
  }
  interface LetterGroup {
    letter: string;
    domains: DomainEntry[];
  }

  let query = $state("");
  let filter = $state("");

  // Domains whose inactive-list rollup is expanded (SvelteSet: mutations
  // are reactive, no reassignment dance needed).
  const expanded = new SvelteSet<string>();

  function toggleInactive(domain: string): void {
    if (expanded.has(domain)) expanded.delete(domain);
    else expanded.add(domain);
  }

  // Archive-wide numbers for the hero (counts are 90-day activity).
  const archiveStats = $derived.by(() => {
    let lists = 0;
    let recent = 0;
    for (const domain of Object.values(session.lists)) {
      for (const count of Object.values(domain)) {
        lists += 1;
        recent += count;
      }
    }
    return { projects: Object.keys(session.lists).length, lists, recent };
  });

  // Busiest lists across the archive, a newcomer's entry points.
  // Boring lists (commits, issues, notifications, ...) are noise here.
  const topActive = $derived(
    topActiveLists(session.lists, 8, config.boringLists),
  );

  // Directory narrowed by the filter box: a domain match keeps the whole
  // project; otherwise only its matching list names are kept.
  const filteredLists = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return session.lists;
    const out: Record<string, Record<string, number>> = {};
    for (const [domain, lists] of Object.entries(session.lists)) {
      if (domain.toLowerCase().includes(q)) {
        out[domain] = lists;
        continue;
      }
      const matched: Record<string, number> = {};
      for (const [name, count] of Object.entries(lists)) {
        if (name.toLowerCase().includes(q)) matched[name] = count;
      }
      if (Object.keys(matched).length > 0) out[domain] = matched;
    }
    return out;
  });

  const groups: LetterGroup[] = $derived.by(() => {
    const byLetter = new Map<string, DomainEntry[]>();
    for (const domain of Object.keys(filteredLists).sort()) {
      const first = domain.charAt(0).toLowerCase();
      const letter = first >= "a" && first <= "z" ? first.toUpperCase() : "#";
      const entry: DomainEntry = {
        domain,
        group: organizeLists(
          filteredLists[domain] ?? {},
          config.boringLists,
          FAVORED,
        ),
      };
      const bucket = byLetter.get(letter);
      if (bucket) bucket.push(entry);
      else byLetter.set(letter, [entry]);
    }
    return LETTERS.filter((l) => byLetter.has(l)).map((letter) => ({
      letter,
      domains: byLetter.get(letter) ?? [],
    }));
  });

  const activeLetters = $derived(new Set(groups.map((g) => g.letter)));

  // Starred lists pin a "Favorite lists" entry on top of the project
  // directory, linking to the combined $favorites activity summary.
  const favEntry = $derived.by(() => {
    const refs = favoritesToRefs(favorites.lists);
    if (refs.length === 0) return null;
    return {
      count: refs.length,
      total: refs.reduce(
        (sum, r) => sum + (session.lists[r.domain]?.[r.list] ?? 0),
        0,
      ),
      url: listUrl({
        lists: [{ list: "*", domain: FAVORITES_DOMAIN }],
        headers: {},
      }),
    };
  });

  // '#' is not usable in a fragment link, so that bucket gets a word id.
  function anchorId(letter: string): string {
    return letter === "#" ? "domains-other" : `domains-${letter}`;
  }

  function submitSearch(event: SubmitEvent): void {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(
      listUrl({
        lists: [{ list: "*", domain: "*" }],
        date: "lte=1M",
        query: q,
        headers: {},
      }),
    );
  }

  const activeChip = `inline-flex items-center gap-1 rounded-md border
    border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700
    hover:border-pony-300 hover:text-pony-700 dark:border-slate-700
    dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-pony-400
    dark:hover:text-pony-300`;

  const inactiveChip = `inline-flex items-center rounded-md border
    border-slate-200 px-2 py-0.5 text-xs text-slate-400
    hover:border-pony-300 hover:text-pony-600 dark:border-slate-800
    dark:text-slate-500 dark:hover:border-pony-400 dark:hover:text-pony-300`;

  const viewBtn = `border-l border-slate-300 px-2.5 py-1.5 first:border-l-0
    focus:ring-2 focus:ring-pony-500 focus:outline-none
    dark:border-slate-700`;
</script>

{#snippet quickstart()}
  {#if topActive.length > 0 && !filter.trim()}
    <section class="mx-auto mb-10 max-w-4xl" aria-label="Most active lists">
      <h2
        class="mb-3 text-center text-sm font-semibold tracking-wide
               text-slate-500 uppercase dark:text-slate-400"
      >
        Jump into an active list
      </h2>
      <div class="flex flex-wrap justify-center gap-2">
        {#each topActive as t (t.list + "@" + t.domain)}
          <a
            href="/list.html?{t.list}@{t.domain}"
            class="group flex items-center gap-2 rounded-md border
                   border-slate-200 bg-white px-3 py-2 text-sm shadow-sm
                   hover:border-pony-300 hover:shadow focus:ring-2
                   focus:ring-pony-500 focus:outline-none
                   dark:border-slate-800 dark:bg-slate-900
                   dark:hover:border-pony-500"
          >
            <span
              class="font-medium text-slate-800 group-hover:text-pony-700
                     dark:text-slate-100 dark:group-hover:text-pony-300"
            >
              {t.list}@{t.domain}
            </span>
            <span
              class="rounded-full bg-pony-100 px-2 py-0.5 text-xs
                     font-semibold text-pony-700 dark:bg-pony-900
                     dark:text-pony-200"
              title="{t.count} emails in the last 90 days"
            >
              {formatCount(t.count)}
            </span>
          </a>
        {/each}
      </div>
    </section>
  {/if}
{/snippet}

{#snippet directoryTools(heading: string)}
  <div
    class="mb-3 flex flex-wrap items-center justify-between gap-3"
    data-guide="directory"
  >
    <h2 class="text-lg font-semibold text-slate-700 dark:text-slate-200">
      {heading}
    </h2>
    <div class="flex items-center gap-2">
      <label for="home-filter" class="sr-only">Filter projects and lists</label>
      <input
        id="home-filter"
        type="search"
        bind:value={filter}
        placeholder="Filter projects&hellip;"
        class="w-44 rounded-md border border-slate-300 bg-white px-3 py-1.5
               text-sm text-slate-900 placeholder:text-slate-400
               focus:border-pony-500 focus:ring-2 focus:ring-pony-500
               focus:outline-none sm:w-56 dark:border-slate-700
               dark:bg-slate-900 dark:text-slate-100
               dark:placeholder:text-slate-500"
      />
      {#if prefs.uiStyle !== "forum"}
        <div
          role="group"
          aria-label="Directory layout"
          class="inline-flex overflow-hidden rounded-md border
                 border-slate-300 dark:border-slate-700"
        >
          <button
            type="button"
            aria-pressed={prefs.homeView !== "list"}
            aria-label="Grid view"
            title="Grid view"
            onclick={() => (prefs.homeView = "grid")}
            class="{viewBtn} {prefs.homeView !== 'list'
              ? 'bg-pony-600 text-white dark:bg-pony-500'
              : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
            </svg>
          </button>
          <button
            type="button"
            aria-pressed={prefs.homeView === "list"}
            aria-label="List view"
            title="List view"
            onclick={() => (prefs.homeView = "list")}
            class="{viewBtn} {prefs.homeView === 'list'
              ? 'bg-pony-600 text-white dark:bg-pony-500'
              : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet chips(entry: DomainEntry)}
  {#each entry.group.active as l (l.name)}
    <a href="/list.html?{l.name}@{entry.domain}" class={activeChip}>
      <span class="break-all">{l.name}@{entry.domain}</span>
      <span
        class="rounded-full bg-pony-100 px-1.5 text-[10px] font-semibold
               text-pony-700 dark:bg-pony-900 dark:text-pony-200"
        title="{l.count} recent messages"
      >
        {l.count}
      </span>
    </a>
  {/each}
  {#if entry.group.rollup}
    <button
      type="button"
      aria-expanded={expanded.has(entry.domain)}
      title={expanded.has(entry.domain)
        ? "Hide lists with no recent mail"
        : "Show lists with no recent mail"}
      onclick={() => toggleInactive(entry.domain)}
      class="inline-flex items-center gap-1 rounded-md border border-dashed
             border-slate-300 px-2 py-0.5 text-xs text-slate-500
             hover:border-slate-400 hover:text-slate-700 focus:ring-2
             focus:ring-pony-500 focus:outline-none dark:border-slate-700
             dark:text-slate-400 dark:hover:border-slate-500
             dark:hover:text-slate-200"
    >
      {entry.group.inactive.length} inactive lists
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="h-3.5 w-3.5 transition-transform {expanded.has(entry.domain)
          ? 'rotate-180'
          : ''}"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  {/if}
  {#if !entry.group.rollup || expanded.has(entry.domain)}
    {#each entry.group.inactive as l (l.name)}
      <a
        href="/list.html?{l.name}@{entry.domain}"
        title="No mail in the last 90 days"
        class={inactiveChip}
      >
        <span class="break-all">{l.name}@{entry.domain}</span>
      </a>
    {/each}
  {/if}
{/snippet}

<div class="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6">
  <!-- Hero: who we are, what's inside, and the fastest way in. -->
  <div class="mb-8 text-center">
    <img
      src={config.logo}
      alt=""
      class="mx-auto mb-3 h-16 w-auto"
    />
    <h1 class="text-3xl font-bold text-slate-800 dark:text-slate-100">
      Welcome to the {config.title}
    </h1>
    <p
      class="mx-auto mt-2 max-w-2xl text-base text-slate-500
             dark:text-slate-400"
    >
      Public mailing list archives. Every public discussion is readable and
      searchable, no account needed. Pick a project below, or search
      everything, everywhere, all at once.
    </p>
    {#if session.loaded && !session.error && archiveStats.projects > 0}
      <div
        class="mt-4 flex flex-wrap items-center justify-center gap-2
               text-sm text-slate-600 dark:text-slate-300"
      >
        <span
          class="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800/80"
        >
          <strong>{archiveStats.projects}</strong>
          project{archiveStats.projects === 1 ? "" : "s"}
        </span>
        <span
          class="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800/80"
        >
          <strong>{archiveStats.lists}</strong>
          mailing list{archiveStats.lists === 1 ? "" : "s"}
        </span>
        {#if archiveStats.recent > 0}
          <span
            class="rounded-full bg-pony-50 px-3 py-1 text-pony-700
                   dark:bg-pony-950/60 dark:text-pony-300"
          >
            <strong>{formatCount(archiveStats.recent)}</strong>
            emails in the last 90 days
          </span>
        {/if}
      </div>
    {/if}
  </div>

  <form
    class="mx-auto mb-2 max-w-2xl"
    role="search"
    onsubmit={submitSearch}
  >
    <label for="home-search" class="sr-only">Search all lists</label>
    <div class="flex gap-2">
      <input
        id="home-search"
        type="search"
        bind:value={query}
        placeholder="Search every list, try &quot;release vote&quot;&hellip;"
        class="flex-1 rounded-md border border-slate-300 bg-white px-4 py-2.5
               text-base text-slate-900 placeholder:text-slate-400
               focus:border-pony-500 focus:ring-2 focus:ring-pony-500
               focus:outline-none dark:border-slate-700 dark:bg-slate-900
               dark:text-slate-100 dark:placeholder:text-slate-500"
      />
      <button
        type="submit"
        class="rounded-md bg-pony-600 px-5 py-2.5 text-sm font-medium
               text-white hover:bg-pony-700 focus:ring-2 focus:ring-pony-500
               focus:ring-offset-2 focus:outline-none dark:hover:bg-pony-500
               dark:focus:ring-offset-slate-950"
      >
        Search
      </button>
    </div>
  </form>
  <p
    class="mx-auto mb-8 max-w-2xl text-center text-xs text-slate-400
           dark:text-slate-500"
  >
    Tip: every list page has filters for author, subject and dates,
    and pressing
    <kbd
      class="rounded border border-slate-300 bg-slate-50 px-1 font-mono
             dark:border-slate-700 dark:bg-slate-800"
    >
      h
    </kbd>
    shows all keyboard shortcuts.
  </p>

  {#if !session.loaded}
    <div class="animate-pulse" aria-hidden="true">
      <div class="mb-6 h-10 rounded-md bg-slate-200 dark:bg-slate-800"></div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each SKELETON_CARDS as i (i)}
          <div
            class="rounded-md border border-slate-200 p-4 dark:border-slate-800"
          >
            <div class="h-5 w-2/3 rounded bg-slate-200 dark:bg-slate-800"></div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              {#each SKELETON_CHIP_WIDTHS as w (w)}
                <div
                  class="h-6 {w} rounded-md bg-slate-100 dark:bg-slate-800/60"
                ></div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else if session.error}
    <div
      class="mx-auto max-w-2xl rounded-md border border-red-200 bg-red-50 p-4
             text-red-800 dark:border-red-900 dark:bg-red-950/50
             dark:text-red-200"
      role="alert"
    >
      <p class="font-semibold">Could not load the mailing list index</p>
      <p class="mt-1 text-sm break-words">{session.error}</p>
      <button
        type="button"
        onclick={() => loadSession()}
        class="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm
               font-medium hover:bg-red-100 dark:border-red-800
               dark:hover:bg-red-900/50"
      >
        Try again
      </button>
    </div>
  {:else if groups.length === 0}
    {#if filter.trim()}
      {@render directoryTools(
        prefs.uiStyle === "forum" ? "All forums" : "All projects",
      )}
      <div
        class="rounded-md border border-slate-200 bg-white p-8 text-center
               dark:border-slate-800 dark:bg-slate-900"
      >
        <p class="text-slate-600 dark:text-slate-300">
          No projects or lists match &ldquo;{filter}&rdquo;.
        </p>
        <button
          type="button"
          onclick={() => (filter = "")}
          class="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm
                 font-medium text-slate-700 hover:bg-slate-50 focus:ring-2
                 focus:ring-pony-500 focus:outline-none dark:border-slate-700
                 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Clear filter
        </button>
      </div>
    {:else}
      <p class="text-center text-slate-500 dark:text-slate-400">
        No mailing lists are available in this archive.
      </p>
    {/if}
  {:else if prefs.uiStyle === "forum"}
    <!-- Forum layout: each domain is a forum; drill in for categories. -->
    {@render quickstart()}
    <div class="mx-auto max-w-4xl">
      {@render directoryTools("All forums")}
      <ForumIndex lists={filteredLists} />
    </div>
  {:else}
    {@render quickstart()}
    {@render directoryTools("All projects")}
    {#if favEntry}
      <div
        data-guide="favlists"
        class="mb-6 flex items-center gap-3 rounded-md border
               border-amber-200 bg-amber-50/60 px-4 py-3 sm:gap-4
               dark:border-amber-900/50 dark:bg-amber-950/20"
      >
        <span
          class="flex h-10 w-10 shrink-0 items-center justify-center
                 rounded-md bg-amber-100 text-amber-500
                 dark:bg-amber-950/60 dark:text-amber-400"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
            class="h-5 w-5"
            role="img"
            aria-label="Favorite lists"
          >
            <title>Favorite lists</title>
            <polygon
              points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12
                      17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            />
          </svg>
        </span>
        <div class="min-w-0 flex-1">
          <a
            href={favEntry.url}
            class="font-semibold text-pony-600 hover:underline focus:ring-2
                   focus:ring-pony-500 focus:outline-none dark:text-pony-300"
          >
            Favorite lists
          </a>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {favEntry.count} starred
            {favEntry.count === 1 ? "list" : "lists"}, with a combined
            activity summary
          </p>
        </div>
        {#if favEntry.total > 0}
          <span
            class="shrink-0 rounded-full bg-pony-100 px-2.5 py-0.5 text-xs
                   font-semibold text-pony-700 dark:bg-pony-900
                   dark:text-pony-200"
            title="Emails in the last 90 days"
          >
            {formatCount(favEntry.total)}
          </span>
        {/if}
      </div>
    {/if}
    <nav
      class="sticky top-0 z-10 -mx-4 mb-6 border-b border-slate-200 bg-white/90
             px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90"
      aria-label="Jump to domains by first letter"
    >
      <div class="flex flex-wrap justify-center gap-1">
        {#each LETTERS as letter (letter)}
          {#if activeLetters.has(letter)}
            <a
              href="#{anchorId(letter)}"
              class="rounded-md px-1.5 py-0.5 text-sm font-medium text-pony-600
                     hover:bg-pony-50 hover:text-pony-700 dark:text-pony-300
                     dark:hover:bg-slate-800 dark:hover:text-pony-200"
            >
              {letter}
            </a>
          {:else}
            <span
              aria-disabled="true"
              class="rounded-md px-1.5 py-0.5 text-sm font-medium select-none
                     text-slate-300 dark:text-slate-700"
            >
              {letter}
            </span>
          {/if}
        {/each}
      </div>
    </nav>

    {#each groups as group (group.letter)}
      <!-- scroll-mt keeps anchor targets clear of the sticky letter bar -->
      <section id={anchorId(group.letter)} class="mb-8 scroll-mt-14">
        <h2
          class="mb-3 border-b border-slate-200 pb-1 text-lg font-semibold
                 text-slate-700 dark:border-slate-800 dark:text-slate-200"
        >
          {group.letter}
        </h2>
        {#if prefs.homeView === "list"}
          <div
            class="rounded-md border border-slate-200 bg-white px-4
                   dark:border-slate-800 dark:bg-slate-900"
          >
            {#each group.domains as entry (entry.domain)}
              <div
                class="flex flex-wrap items-baseline gap-1.5 border-b
                       border-slate-100 py-2 last:border-b-0
                       dark:border-slate-800/60"
              >
                <a
                  href="/list.html?{entry.domain}"
                  data-guide="project"
                  title="Activity summary for {entry.domain}"
                  class="group/dom mr-1 inline-flex items-center gap-1.5
                         font-semibold break-all text-pony-600
                         hover:underline dark:text-pony-300"
                >
                  {entry.domain}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="h-3.5 w-3.5 shrink-0 text-slate-400
                           group-hover/dom:text-pony-600
                           dark:text-slate-500
                           dark:group-hover/dom:text-pony-300"
                    aria-hidden="true"
                  >
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </a>
                {@render chips(entry)}
              </div>
            {/each}
          </div>
        {:else}
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {#each group.domains as entry (entry.domain)}
              <div
                class="rounded-md border border-slate-200 bg-white p-4
                       dark:border-slate-800 dark:bg-slate-900"
              >
                <a
                  href="/list.html?{entry.domain}"
                  data-guide="project"
                  title="Activity summary for {entry.domain}"
                  class="group/dom inline-flex items-center gap-1.5
                         font-semibold break-all text-pony-600
                         hover:underline dark:text-pony-300"
                >
                  {entry.domain}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="h-3.5 w-3.5 shrink-0 text-slate-400
                           group-hover/dom:text-pony-600
                           dark:text-slate-500
                           dark:group-hover/dom:text-pony-300"
                    aria-hidden="true"
                  >
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </a>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  {@render chips(entry)}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  {/if}

</div>
