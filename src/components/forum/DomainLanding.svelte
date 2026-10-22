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
<!--
  Hostname landing page (list.html?*@hostname), styled after the classic
  forum front page: the domain's mailing lists as categories, plus
  cross-list panels for top contributors, latest activity and trending
  (most upvoted) topics over the backend's default last-30-days window.

  Data comes from two stream.json requests collating every non-boring
  list on the domain via the lists parameter (List-IDs reverse-built
  from the preferences.json directory): one in activity order for the
  latest-activity panel and the contributors, one in upvotes order for
  trending. The second is nearly free server-side. Both share one
  cached listing, sort is applied at slice time. Older servers without
  stream.json fall back to a single wildcard stats.json request that
  yields the same panels client-side.
-->
<script lang="ts">
  import { ApiError, stats } from "../../lib/api/client";
  import type { StreamResponse } from "../../lib/api/stream";
  import { stream } from "../../lib/api/stream";
  import type { Participant, StatsResponse } from "../../lib/api/types";
  import { formatCount, latestActiveMonth } from "../../lib/calendar";
  import { config } from "../../lib/config";
  import { dateSpecLabel, relativeTime, utcIso } from "../../lib/dates";
  import { organizeLists } from "../../lib/directory";
  import { FAVORITES_DOMAIN, favoritesToRefs } from "../../lib/favorites";
  import type { TopicRow } from "../../lib/forum";
  import {
    categoryDescription,
    perListStats,
    topicsFromStats,
    topicsFromStream,
  } from "../../lib/forum";
  import {
    authorName,
    emailListAddress,
    mergeStats,
    teaser,
  } from "../../lib/listview";
  import { threadUrl } from "../../lib/routes";
  import { listUrl } from "../../lib/search";
  import {
    addressToRaw,
    buildListsStreamRequest,
    domainListIds,
    STREAM_MAX_LISTS,
  } from "../../lib/stream";
  import {
    favorites,
    toggleFavorite,
  } from "../../lib/stores/favorites.svelte";
  import { session } from "../../lib/stores/session.svelte";
  import { streamview } from "../../lib/stores/streamview.svelte";
  import Avatar from "../ui/Avatar.svelte";
  import Skeleton from "../ui/Skeleton.svelte";

  interface Props {
    domain: string;
  }

  let { domain }: Props = $props();

  // Same favored-list ordering as the home page directory.
  const FAVORED = ["dev", "user", "users"];
  // Fetch pools: more rows than the default display, so taller screens
  // fill instantly from what is already loaded (the visible counts are
  // measured from the viewport below, classic forum style).
  const LATEST_FETCH = 20;
  const TRENDING_FETCH = 12;
  const CONTRIB_COUNT = 5;

  let loading = $state(true);
  let error = $state("");
  // Whole responses swapped atomically; no deep reactivity needed.
  let latestResp = $state.raw<StreamResponse | null>(null);
  let trendingResp = $state.raw<StreamResponse | null>(null);
  let legacyStats = $state.raw<StatsResponse | null>(null);
  // Month the panels fell back to when the default last-30-days window
  // was empty (dormant projects); undefined = the default window.
  let windowMonth = $state<string | undefined>(undefined);

  // A slow response for an old domain must never clobber a newer one.
  let generation = 0;

  // The $favorites pseudo-domain renders this same landing over the
  // user's favorited lists instead of one domain's directory.
  const isFavorites = $derived(domain === FAVORITES_DOMAIN);

  const listIds = $derived(
    isFavorites
      ? favorites.lists.slice(0, STREAM_MAX_LISTS).map(addressToRaw)
      : domainListIds(domain, session.lists, config.boringLists),
  );

  async function load(): Promise<void> {
    // preferences.json hasn't resolved yet: keep the skeleton up; the
    // effect below reruns once the directory lands. A failed or empty
    // directory still proceeds (wildcard stats fallback). The favorites
    // landing needs no directory. Its lists come from localStorage.
    if (!session.loaded && !isFavorites) return;
    if (isFavorites && listIds.length === 0) {
      // Nothing favorited (yet): render the empty state, no fetching.
      latestResp = null;
      trendingResp = null;
      legacyStats = null;
      windowMonth = undefined;
      loading = false;
      error = "";
      ++generation; // discard any in-flight load for a previous state
      return;
    }
    const gen = ++generation;
    const ids = listIds;
    loading = true;
    error = "";
    try {
      if (streamview.available && ids.length > 0) {
        try {
          let d: string | undefined;
          let [act, up] = await Promise.all([
            stream(buildListsStreamRequest(ids, "threads", 0, LATEST_FETCH)),
            stream(
              buildListsStreamRequest(ids, "threads", 0, TRENDING_FETCH, {
                sort: "upvotes",
              }),
            ),
          ]);
          // Nothing in the default window (a dormant project): the
          // response's activity span knows the newest month that DOES
          // have mail. Show that instead of empty panels.
          if (act.hits === 0) {
            d = latestActiveMonth(act.active_months);
            if (d) {
              [act, up] = await Promise.all([
                stream(
                  buildListsStreamRequest(ids, "threads", 0, LATEST_FETCH, {
                    d,
                  }),
                ),
                stream(
                  buildListsStreamRequest(ids, "threads", 0, TRENDING_FETCH, {
                    sort: "upvotes",
                    d,
                  }),
                ),
              ]);
            }
          }
          if (gen !== generation) return;
          latestResp = act;
          trendingResp = up;
          legacyStats = null;
          windowMonth = d;
          return;
        } catch (e) {
          // Older server without stream.json (404) or one that rejects
          // this lists request (400): fall through to the wildcard
          // stats.json path rather than dead-ending the landing.
          if (
            !(e instanceof ApiError && (e.status === 404 || e.status === 400))
          ) {
            throw e;
          }
        }
      }
      let d: string | undefined;
      let res: StatsResponse;
      if (isFavorites) {
        // No wildcard exists for the pseudo-domain: fan out one stats
        // request per favorited list and merge, like the virtual inbox.
        const refs = favoritesToRefs(favorites.lists);
        const fan = (month?: string): Promise<StatsResponse[]> =>
          Promise.all(
            refs.map((r) =>
              month
                ? stats({
                    list: r.list,
                    domain: r.domain,
                    social: "yes",
                    d: month,
                  })
                : stats({ list: r.list, domain: r.domain, social: "yes" }),
            ),
          );
        res = mergeStats(await fan());
        if (res.hits === 0) {
          d = latestActiveMonth(res.active_months);
          if (d) res = mergeStats(await fan(d));
        }
      } else {
        res = await stats({ list: "*", domain, social: "yes" });
        if (res.hits === 0) {
          d = latestActiveMonth(res.active_months);
          if (d) res = await stats({ list: "*", domain, social: "yes", d });
        }
      }
      if (gen !== generation) return;
      legacyStats = res;
      latestResp = null;
      trendingResp = null;
      windowMonth = d;
    } catch (e) {
      if (gen !== generation) return;
      error = e instanceof Error ? e.message : String(e);
    } finally {
      if (gen === generation) loading = false;
    }
  }

  /** Refetch the panels (the parent's refresh button delegates here). */
  export function refresh(): void {
    void load();
  }

  $effect(() => {
    void domain;
    void listIds;
    void session.loaded; // error path sets loaded without touching lists
    void load();
  });

  interface CategoryRow {
    /** Display name: the list part, or the full address on $favorites. */
    label: string;
    list: string;
    /** The list's real domain (differs from the page's on $favorites). */
    domain: string;
    /** Favorites toggle identity, "list@domain". */
    address: string;
    count: number;
    active: boolean;
  }

  const catRows = $derived.by<CategoryRow[]>(() => {
    if (isFavorites) {
      return favorites.lists.map((address) => {
        const at = address.indexOf("@");
        const list = address.slice(0, at);
        const dom = address.slice(at + 1);
        const count = session.lists[dom]?.[list] ?? 0;
        return {
          label: address,
          list,
          domain: dom,
          address,
          count,
          active: count > 0,
        };
      });
    }
    const group = organizeLists(
      session.lists[domain] ?? {},
      config.boringLists,
      FAVORED,
    );
    const row = (name: string, count: number, active: boolean): CategoryRow => ({
      label: name,
      list: name,
      domain,
      address: `${name}@${domain}`,
      count,
      active,
    });
    return [
      ...group.active.map((l) => row(l.name, l.count, true)),
      ...group.inactive.map((l) => row(l.name, l.count, false)),
    ];
  });

  // The stream path excludes boring lists at query level (domainListIds);
  // the wildcard stats fallback cannot, so its rows are filtered here to
  // keep automation noise out of the panels on legacy servers too.
  function isBoring(row: TopicRow): boolean {
    if (!row.starter) return false;
    const part = emailListAddress(row.starter).split("@")[0];
    return config.boringLists.includes(part);
  }

  /* --- viewport fitting -------------------------------------------- */

  // The panels size themselves to the screen, classic-forum style: the
  // right column shows as many topic rows as fit the viewport (from
  // the fetched pools), and the categories list pages with up/down
  // chevrons instead of stretching the page. Defaults hold until the
  // first measurement (and on stacked sub-lg layouts, which scroll).
  let gridEl = $state<HTMLElement | undefined>();
  let latestCap = $state(8);
  let trendingCap = $state(6);
  let catPageSize = $state(Number.MAX_SAFE_INTEGER);
  let catPage = $state(0);

  function measure(): void {
    const vh = window.innerHeight;
    if (!gridEl || vh <= 0) return;
    if (window.innerWidth < 1024) {
      // Single-column layout: the page scrolls naturally.
      latestCap = 8;
      trendingCap = 6;
      catPageSize = Number.MAX_SAFE_INTEGER;
      return;
    }
    // Measured geometry where rows exist; design heights otherwise.
    const headH =
      gridEl.querySelector<HTMLElement>("section > div")?.offsetHeight ?? 42;
    const topicH =
      (gridEl.querySelector<HTMLElement>(
        'section[aria-label="Latest activity"] li',
      )?.offsetHeight ?? 38) + 1; // +1 divider
    const catH =
      (gridEl.querySelector<HTMLElement>(
        'section[aria-label="Active lists"] li, section[aria-label="Favorite lists"] li',
      )?.offsetHeight ?? 58) + 1;
    const contribH =
      gridEl.querySelector<HTMLElement>(
        'section[aria-label="Top contributors"]',
      )?.offsetHeight ?? headH + CONTRIB_COUNT * 54;
    const top = gridEl.getBoundingClientRect().top + window.scrollY;
    const avail = Math.max(260, vh - top - 20);
    // Right column: two headed panels and the gap between them.
    const budget = Math.floor((avail - 2 * headH - 24) / topicH);
    latestCap = Math.min(LATEST_FETCH, Math.max(3, Math.ceil(budget * 0.55)));
    trendingCap = Math.min(TRENDING_FETCH, Math.max(3, budget - latestCap));
    // Left column: categories share it with the contributors panel.
    const catAvail = avail - contribH - 24 - headH;
    catPageSize = Math.max(3, Math.floor(catAvail / catH));
  }

  // Re-measure when content shape changes (skeletons swap for rows) and
  // on window resizes; row queries fall back to constants when empty.
  $effect(() => {
    void haveData;
    void loading;
    void catRows.length;
    measure();
  });

  $effect(() => {
    let timer = 0;
    const onResize = (): void => {
      clearTimeout(timer);
      timer = window.setTimeout(measure, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  });

  const catPages = $derived(
    Math.max(1, Math.ceil(catRows.length / catPageSize)),
  );
  // Resizes and data changes can strand the page index past the end.
  $effect(() => {
    if (catPage > catPages - 1) catPage = catPages - 1;
  });
  const catSlice = $derived(
    catRows.slice(catPage * catPageSize, (catPage + 1) * catPageSize),
  );

  const latestTopics = $derived.by<TopicRow[]>(() => {
    if (latestResp) return topicsFromStream(latestResp).slice(0, latestCap);
    if (!legacyStats) return [];
    return topicsFromStats(legacyStats)
      .filter((r) => !isBoring(r))
      .sort((a, b) => b.lastEpoch - a.lastEpoch)
      .slice(0, latestCap);
  });

  // Server order for a sort=upvotes page is upvotes, then replies, then
  // newest activity, so on archives without social data this panel
  // degrades to "most replied", which is still a fair "trending".
  const trendingTopics = $derived.by<TopicRow[]>(() => {
    if (trendingResp) {
      return topicsFromStream(trendingResp).slice(0, trendingCap);
    }
    if (!legacyStats) return [];
    return topicsFromStats(legacyStats)
      .filter((r) => !isBoring(r))
      .sort(
        (a, b) =>
          b.upvotes - a.upvotes ||
          b.replies - a.replies ||
          b.lastEpoch - a.lastEpoch,
      )
      .slice(0, trendingCap);
  });

  // The server's top-10 keys authors by their full from-string, so one
  // person can appear twice under name variants; merge by address (the
  // longer display name wins), like the classic forum page.
  const contributors = $derived.by<Participant[]>(() => {
    const arr = latestResp?.participants ?? legacyStats?.participants;
    const merged = new Map<string, Participant>();
    for (const p of Array.isArray(arr) ? arr : []) {
      const key = p.email || p.gravatar;
      const prev = merged.get(key);
      if (prev) {
        merged.set(key, {
          ...prev,
          count: prev.count + p.count,
          name: (p.name?.length ?? 0) > (prev.name?.length ?? 0)
            ? p.name
            : prev.name,
        });
      } else {
        merged.set(key, p);
      }
    }
    return [...merged.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, CONTRIB_COUNT);
  });

  // Per-category activity for the panels' window (HyperKitty style):
  // straight from the stream response, or computed from the full stats
  // payload on the legacy path. Empty for lists outside the panel query
  // (boring lists) and on pre-breakdown servers. Those rows keep the
  // plain 90-day badge.
  const catStats = $derived.by(() => {
    if (latestResp) return latestResp.list_stats ?? {};
    if (legacyStats) return perListStats(legacyStats);
    return {};
  });

  const posts = $derived(latestResp?.hits ?? legacyStats?.hits ?? 0);
  const topicCount = $derived(
    latestResp?.no_threads ?? legacyStats?.no_threads ?? 0,
  );
  const people = $derived(latestResp?.numparts ?? legacyStats?.numparts ?? 0);
  const haveData = $derived(!!latestResp || !!legacyStats);
  const windowLabel = $derived(
    windowMonth ? dateSpecLabel(windowMonth) : "last 30 days",
  );
  /** Chip form of the window ("Last 30 days" / "September 2025"). */
  const windowTitle = $derived(
    windowLabel.charAt(0).toUpperCase() + windowLabel.slice(1),
  );

  // When the searched lists span several hostnames (a cross-domain
  // favorites landing), the panels' list badges need the full address
  // to disambiguate, as dev@tomcat vs dev@httpd both read "dev" otherwise.
  const multiDomain = $derived(
    new Set(catRows.map((r) => r.domain)).size > 1,
  );

  function categoryUrl(list: string, dom: string): string {
    return listUrl({ lists: [{ list, domain: dom }], headers: {} });
  }

  // The combined recent-messages view of all the domain's lists (the
  // pre-landing wildcard browse), reachable behind an explicit date,
  // the panels' window, so it never lands on an empty page.
  const inboxUrl = $derived(
    listUrl({
      lists: [{ list: "*", domain }],
      headers: {},
      date: windowMonth ?? "lte=30d",
    }),
  );

  // Every category gets a stable accent color from its name, like the
  // classic forum's swatch-by-hash. Full literals so Tailwind sees them.
  const PALETTE = [
    "border-l-pony-500",
    "border-l-sky-500",
    "border-l-emerald-500",
    "border-l-amber-500",
    "border-l-rose-500",
    "border-l-violet-500",
    "border-l-cyan-500",
    "border-l-lime-600",
  ];
  function catColor(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) {
      h = (h * 31 + name.charCodeAt(i)) >>> 0;
    }
    return PALETTE[h % PALETTE.length];
  }

  const card =
    "rounded-md border border-slate-200 bg-white " +
    "dark:border-slate-800 dark:bg-slate-900";
  const cardHead =
    "flex items-baseline justify-between gap-2 border-b border-slate-200 " +
    "px-4 py-2.5 dark:border-slate-800";
  const cardTitle =
    "text-sm font-semibold tracking-wide text-slate-700 uppercase " +
    "dark:text-slate-200";
  const badge =
    "inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 " +
    "text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  const listBadge =
    "shrink-0 rounded-md bg-pony-100 px-1.5 py-0.5 text-[10px] " +
    "font-semibold text-pony-700 dark:bg-pony-900 dark:text-pony-200";
  const chevronBtn =
    "rounded-md p-0.5 text-slate-400 hover:text-pony-600 " +
    "focus:ring-2 focus:ring-pony-500 focus:outline-none " +
    "disabled:opacity-40 disabled:hover:text-slate-400 " +
    "dark:text-slate-500 dark:hover:text-pony-300 " +
    "dark:disabled:hover:text-slate-500";
</script>

{#snippet favStar(address: string)}
  {@const fav = favorites.has(address)}
  <button
    type="button"
    onclick={() => toggleFavorite(address)}
    aria-pressed={fav}
    data-guide="favstar"
    title={fav
      ? "Remove from your favorite lists"
      : "Add to your favorite lists. Favorites get a combined landing page"}
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
      class="h-4 w-4"
      aria-hidden="true"
    >
      <polygon
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77
                5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      />
    </svg>
    <span class="sr-only">
      {fav ? "Remove" : "Add"}
      {address}
      {fav ? "from" : "to"} favorites
    </span>
  </button>
{/snippet}

<!-- HyperKitty-style stat mini-column: the number over a tiny label. -->
{#snippet statCol(n: number, label: string)}
  <span class="flex w-11 shrink-0 flex-col items-center leading-tight">
    <span
      class="text-sm font-semibold {n > 0
        ? 'text-slate-700 dark:text-slate-200'
        : 'text-slate-400 dark:text-slate-600'}"
    >
      {formatCount(n)}
    </span>
    <span class="text-[10px] text-slate-400 dark:text-slate-500">
      {label}
    </span>
  </span>
{/snippet}

{#snippet lockIcon()}
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    class="inline h-3.5 w-3.5 text-red-500 dark:text-red-400"
    role="img"
    aria-label="Private list"
  >
    <title>
      This topic is on a private list and may contain sensitive information.
    </title>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
{/snippet}

<!-- One sleek single-line row per topic: avatar, list badge, subject
     (teaser inline on wide screens), then compact stat pills, so both
     right-side panels fit a viewport together. The whole row links to
     the thread; the starter's name lives in the avatar/row tooltips. -->
{#snippet topicCard(row: TopicRow)}
  <li>
    <a
      href={threadUrl(row.node.tid)}
      title={row.starter
        ? `${row.subject}, started by ${authorName(row.starter.from)}`
        : row.subject}
      class="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50
             focus:ring-2 focus:ring-pony-500 focus:outline-none
             focus:ring-inset dark:hover:bg-slate-800/50"
    >
      {#if row.starter}
        <span class="shrink-0">
          <Avatar
            md5={row.starter.gravatar}
            name={authorName(row.starter.from)}
            size={24}
          />
        </span>
      {/if}
      <span class="flex min-w-0 flex-1 items-center gap-2">
        {#if row.starter}
          <!-- stats.json emails carry list in raw <l.d> form; normalize. -->
          {@const address = emailListAddress(row.starter)}
          {@const listLabel = multiDomain ? address : address.split("@")[0]}
          {#if listLabel}
            <span class={listBadge}>{listLabel}</span>
          {/if}
          {#if row.starter.private}
            {@render lockIcon()}
          {/if}
        {/if}
        <span
          class="truncate text-sm font-medium text-pony-700
                 dark:text-pony-300"
        >
          {row.subject}
        </span>
        {#if row.starter?.body}
          <span
            class="hidden min-w-0 truncate text-xs text-slate-400
                   xl:inline dark:text-slate-500"
          >
            {teaser(row.starter.body)}
          </span>
        {/if}
      </span>
      <span class="flex shrink-0 items-center gap-1.5 text-xs">
        {#if row.replies > 0}
          <span
            class={badge}
            title="{row.replies} {row.replies === 1 ? 'reply' : 'replies'}"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-10 6L2 7" />
            </svg>
            {row.replies}
            <span class="sr-only">
              {row.replies === 1 ? "reply" : "replies"}
            </span>
          </span>
        {/if}
        <span
          class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5
                 {row.upvotes > 0
            ? 'bg-pony-100 font-medium text-pony-700 dark:bg-pony-900 dark:text-pony-200'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}"
          title="{row.upvotes} {row.upvotes === 1 ? 'upvote' : 'upvotes'}"
        >
          <span aria-hidden="true">&#9650;</span>
          {row.upvotes}
          <span class="sr-only">
            {row.upvotes === 1 ? "upvote" : "upvotes"}
          </span>
        </span>
        <span
          class="rounded-md bg-slate-100 px-1.5 py-0.5 whitespace-nowrap
                 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          title={utcIso(row.lastEpoch)}
        >
          {relativeTime(row.lastEpoch)}
        </span>
      </span>
    </a>
  </li>
{/snippet}

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
  <p class="text-sm text-slate-500 dark:text-slate-400">
    {#if haveData}
      {formatCount(posts)}
      {posts === 1 ? "post" : "posts"} in {formatCount(topicCount)}
      {topicCount === 1 ? "topic" : "topics"} by {formatCount(people)}
      {people === 1 ? "person" : "people"}, {windowLabel}
    {:else if isFavorites}
      Your favorite lists from across the archive
    {:else}
      Discussions across the {domain} mailing lists
    {/if}
  </p>
  {#if !isFavorites || catRows.length > 0}
    <a
      href={inboxUrl}
      class="rounded-md text-sm font-medium text-pony-600 hover:underline
             focus:ring-2 focus:ring-pony-500 focus:outline-none
             dark:text-pony-300"
    >
      Browse all recent messages &rarr;
    </a>
  {/if}
</div>

{#if error}
  <div
    class="rounded-md border border-red-200 bg-red-50 p-4 text-red-800
           dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
    role="alert"
  >
    <p class="font-semibold">Could not load discussions</p>
    <p class="mt-1 text-sm break-words">{error}</p>
    <button
      type="button"
      onclick={() => void load()}
      class="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm
             font-medium hover:bg-red-100 dark:border-red-800
             dark:hover:bg-red-900/50"
    >
      Try again
    </button>
  </div>
{:else}
  <div bind:this={gridEl} class="grid items-start gap-6 lg:grid-cols-3">
    <!-- Left column: categories and contributors. -->
    <div class="space-y-6">
      <section
        class={card}
        aria-label={isFavorites ? "Favorite lists" : "Active lists"}
      >
        <div class={cardHead}>
          <h2 class={cardTitle}>
            {isFavorites ? "Favorite lists" : "Active lists"}
          </h2>
          {#if catPages > 1}
            <span class="flex shrink-0 items-center gap-0.5">
              <span
                class="mr-1 text-xs whitespace-nowrap text-slate-400
                       dark:text-slate-500"
              >
                {catPage * catPageSize + 1}&ndash;{Math.min(
                  catRows.length,
                  (catPage + 1) * catPageSize,
                )} of {catRows.length} &middot; {windowTitle}
              </span>
              <button
                type="button"
                onclick={() => (catPage = Math.max(0, catPage - 1))}
                disabled={catPage === 0}
                aria-label="Previous lists"
                class={chevronBtn}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  class="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="m18 15-6-6-6 6" />
                </svg>
              </button>
              <button
                type="button"
                onclick={() =>
                  (catPage = Math.min(catPages - 1, catPage + 1))}
                disabled={catPage >= catPages - 1}
                aria-label="More lists"
                class={chevronBtn}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  class="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </span>
          {:else}
            <span class="text-xs text-slate-400 dark:text-slate-500">
              {windowTitle}
            </span>
          {/if}
        </div>
        {#if catRows.length === 0}
          <p class="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
            {#if isFavorites}
              No favorite lists yet. Click the star next to any list to
              pin it here.
            {:else}
              No mailing lists found for {domain}.
            {/if}
          </p>
        {:else}
          <ul class="divide-y divide-slate-100 dark:divide-slate-800/60">
            {#each catSlice as row (row.address)}
              {@const desc = categoryDescription(row.list, row.domain)}
              {@const ls = catStats[row.address]}
              <li
                class="flex items-center gap-2 border-l-4 px-4 py-2
                       {row.active
                  ? catColor(row.label)
                  : 'border-l-slate-200 dark:border-l-slate-700'}"
              >
                <span class="min-w-0 flex-1">
                  <a
                    href={categoryUrl(row.list, row.domain)}
                    title={row.active
                      ? desc
                      : `${desc}. No mail in the last 90 days`}
                    class="block truncate focus:ring-2 focus:ring-pony-500
                           focus:outline-none
                           {row.active
                      ? 'font-medium text-pony-600 hover:underline dark:text-pony-300'
                      : `text-slate-400 hover:text-pony-600 hover:underline
                         dark:text-slate-500 dark:hover:text-pony-300`}"
                  >
                    {row.label}
                  </a>
                  <span
                    class="block truncate text-sm
                           {row.active
                      ? 'text-slate-600 dark:text-slate-300'
                      : 'text-slate-500 dark:text-slate-400'}"
                  >
                    {desc}
                  </span>
                </span>
                {#if ls}
                  {@const lsTitle =
                    `Activity ${windowLabel}: ${ls.hits} ` +
                    `${ls.hits === 1 ? "post" : "posts"}, ` +
                    `${ls.participants} ` +
                    `${ls.participants === 1 ? "participant" : "participants"}, ` +
                    `${ls.threads} ${ls.threads === 1 ? "topic" : "topics"}`}
                  <span class="flex shrink-0 items-center" title={lsTitle}>
                    {@render statCol(ls.hits, "posts")}
                    {@render statCol(ls.participants, "people")}
                    {@render statCol(ls.threads, "topics")}
                  </span>
                {:else if row.active}
                  <span
                    class="shrink-0 rounded-full bg-pony-100 px-2.5 py-0.5
                           text-xs font-semibold text-pony-700
                           dark:bg-pony-900 dark:text-pony-200"
                    title="Emails in the last 90 days"
                  >
                    {formatCount(row.count)}
                  </span>
                {/if}
                {@render favStar(row.address)}
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class={card} aria-label="Top contributors">
        <div class={cardHead}>
          <h2 class={cardTitle}>Top contributors</h2>
          <span class="text-xs text-slate-400 dark:text-slate-500">
            {windowLabel}
          </span>
        </div>
        {#if loading && !haveData}
          <div class="p-4"><Skeleton rows={3} compact={true} /></div>
        {:else if contributors.length === 0}
          <p class="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
            No posts in this period.
          </p>
        {:else}
          <ul class="divide-y divide-slate-100 dark:divide-slate-800/60">
            {#each contributors as p, i (i)}
              <li class="flex items-center gap-3 px-4 py-2.5">
                <Avatar md5={p.gravatar} name={p.name || p.email} size={32} />
                <span
                  class="min-w-0 flex-1 truncate text-sm font-medium
                         text-slate-700 dark:text-slate-200"
                >
                  {p.name || p.email}
                </span>
                <span class={badge}>
                  {formatCount(p.count)}
                  {p.count === 1 ? "post" : "posts"}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>

    <!-- Right column: latest activity and trending topics. -->
    <div class="space-y-6 lg:col-span-2">
      <section class={card} aria-label="Latest activity">
        <div class={cardHead}>
          <h2 class={cardTitle}>Latest activity</h2>
        </div>
        {#if loading && !haveData}
          <div class="p-4"><Skeleton rows={6} compact={false} /></div>
        {:else if latestTopics.length === 0}
          <p class="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
            {#if isFavorites}
              No discussions found on your favorite lists.
            {:else}
              No discussions found on the {domain} lists.
            {/if}
          </p>
        {:else}
          <ul class="divide-y divide-slate-100 dark:divide-slate-800/60">
            {#each latestTopics as row (row.node.tid)}
              {@render topicCard(row)}
            {/each}
          </ul>
        {/if}
      </section>

      <section class={card} aria-label="Trending topics">
        <div class={cardHead}>
          <h2 class={cardTitle}>Trending topics</h2>
          <span class="text-xs text-slate-400 dark:text-slate-500">
            Most upvoted
          </span>
        </div>
        {#if loading && !haveData}
          <div class="p-4"><Skeleton rows={4} compact={false} /></div>
        {:else if trendingTopics.length === 0}
          <p class="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
            Nothing trending yet.
          </p>
        {:else}
          <ul class="divide-y divide-slate-100 dark:divide-slate-800/60">
            {#each trendingTopics as row (row.node.tid)}
              {@render topicCard(row)}
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  </div>
{/if}
