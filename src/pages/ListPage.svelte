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
  import InlineThread from "../components/email/InlineThread.svelte";
  import DomainLanding from "../components/forum/DomainLanding.svelte";
  import TopicTable from "../components/forum/TopicTable.svelte";
  import EmailRow from "../components/listview/EmailRow.svelte";
  import ListHeader from "../components/listview/ListHeader.svelte";
  import Pagination from "../components/listview/Pagination.svelte";
  import Calendar from "../components/sidebar/Calendar.svelte";
  import Skeleton from "../components/ui/Skeleton.svelte";
  import type { EmailSummary } from "../lib/api/types";
  import { buildCalendar, latestActiveMonth } from "../lib/calendar";
  import { config } from "../lib/config";
  import { dateSpecLabel, monthSpec, parseMonthSpec } from "../lib/dates";
  import { registerShortcut } from "../lib/keyboard";
  import type { PageSlice } from "../lib/listview";
  import {
    emailForNode,
    originalEmail,
    pageSlice,
    perPage,
    showsListBadge,
  } from "../lib/listview";
  import {
    atomFeedUrl,
    expandFavoritesSpec,
    FAVORITES_DOMAIN,
  } from "../lib/favorites";
  import { topicsFromStream } from "../lib/forum";
  import { navigate, route } from "../lib/router.svelte";
  import type { SearchSpec } from "../lib/search";
  import { isSearch, listUrl, parseListSearch } from "../lib/search";
  import {
    emailRows,
    statsFromStream,
    streamBounds,
    streamEmail,
    threadRows,
  } from "../lib/stream";
  import { composer, openComposer } from "../lib/stores/compose.svelte";
  import { favorites } from "../lib/stores/favorites.svelte";
  import { listview, loadListView } from "../lib/stores/listview.svelte";
  import { prefs } from "../lib/stores/prefs.svelte";
  import {
    loadStreamPage,
    streamview,
  } from "../lib/stores/streamview.svelte";
  import {
    buildEmailIndex,
    countParticipants,
    countReplies,
    flatten,
    lastEpoch,
    visibleTreeRows,
  } from "../lib/threads";
  import { SvelteSet } from "svelte/reactivity";

  // $favorites specs with a date or search expand into the real
  // multi-list spec (virtual inbox machinery); the bare landing form
  // keeps the marker and renders the favorites landing below.
  const spec = $derived(
    expandFavoritesSpec(parseListSearch(route.search), favorites.lists),
  );

  let page = $state(0);
  /** Key of the row whose inline thread/email is expanded (one at a time). */
  let openKey = $state<string | null>(null);
  /** Treeview nodes whose children are shown (collapsed by default). */
  const expandedNodes = new SvelteSet<string>();

  function toggleNode(key: string): void {
    if (!expandedNodes.delete(key)) expandedNodes.add(key);
  }
  let listEl: HTMLElement | undefined = $state();
  let per = $state(20);
  let header: ReturnType<typeof ListHeader> | undefined = $state();
  let landing: ReturnType<typeof DomainLanding> | undefined = $state();

  const forum = $derived(prefs.uiStyle === "forum");

  // A bare hostname selection (*@domain, no date/query/filters) is the
  // domain landing page: categories plus cross-list activity panels,
  // with its own data loading. Dated or filtered wildcards browse the
  // combined lists as usual.
  const domainLanding = $derived(
    !!spec &&
      spec.lists.length === 1 &&
      spec.lists[0].list === "*" &&
      spec.lists[0].domain !== "*" &&
      !spec.date &&
      !isSearch(spec),
  );

  // Paged stream.json serves single-list specs (wildcards fine) in both
  // UI styles, when the server has the endpoint. Everything else keeps
  // the legacy stats path, meaning multi-list virtual inboxes, the
  // self-loading domain landing and older servers.
  const streamEligible = $derived(
    !!spec &&
      spec.lists.length === 1 &&
      !domainLanding &&
      streamview.available,
  );
  // Forum mode always tables threads; the standard UI follows listmode.
  const streamMode = $derived(
    !forum && prefs.listmode === "flat"
      ? ("emails" as const)
      : ("threads" as const),
  );
  // Stream data counts only while the stream path is active.
  const resp = $derived(streamEligible ? streamview.resp : null);

  // Forum topic-table ordering; served by stream.json's sort parameter
  // so count sorts are correct across the whole result set, not just
  // the fetched page.
  let forumSort = $state<"last" | "replies" | "upvotes">("last");
  const streamSort = $derived(
    forum && forumSort !== "last" ? forumSort : ("activity" as const),
  );
  // The forum table lays out its own rows; viewport row measurement
  // only fits the standard EmailRow list.
  const streamPer = $derived(forum ? 25 : per);

  // URL is the single source of truth: any route change re-derives the
  // spec and resets paging; the stores' spec/page-key guards make the
  // data effect below a no-op unless something really changed.
  $effect(() => {
    void spec;
    page = 0;
    openKey = null;
    forumSort = "last";
    expandedNodes.clear();
  });

  const title = $derived.by(() => {
    if (!spec) return "Malformed search";
    if (isSearch(spec)) return "Custom search";
    if (spec.lists.length > 1) return "Virtual inbox";
    const l = spec.lists[0];
    if (domainLanding) {
      return l.domain === FAVORITES_DOMAIN ? "Favorite lists" : l.domain;
    }
    return `${l.list}@${l.domain} - ${dateSpecLabel(spec.date)}`;
  });

  $effect(() => {
    document.title = `${title} - ${config.title}`;
    return () => {
      document.title = config.title;
    };
  });

  // Header/calendar/empty-state model: the stream response adapted to the
  // StatsResponse shape those components were written against, or the
  // legacy merged stats when the stream path is not (yet) active.
  const stats = $derived(resp ? statsFromStream(resp) : listview.stats);
  const viewLoading = $derived(
    streamEligible ? streamview.loading : listview.loading,
  );
  const viewError = $derived(
    streamEligible ? streamview.error : listview.error,
  );
  const emailIndex = $derived(
    stats ? buildEmailIndex(stats.emails) : new Map<string, EmailSummary>(),
  );
  const showList = $derived(!!spec && showsListBadge(spec.lists));
  const now = $derived(stats?.unixtime ?? 0);

  interface ThreadTopic {
    kind: "thread";
    key: string;
    /** Thread id for inline expansion. */
    tid: string;
    email: EmailSummary;
    epoch: number;
    participants: number;
    replies: number;
  }
  interface EmailTopic {
    kind: "email";
    key: string;
    email: EmailSummary;
  }
  interface TreeTopic {
    kind: "tree";
    key: string;
    rows: {
      key: string;
      email: EmailSummary;
      depth: number;
      /** Set on thread roots: expand the whole thread, not one email. */
      tid?: string;
    }[];
  }
  type Topic = ThreadTopic | EmailTopic | TreeTopic;

  // One "topic" per pageable unit: a thread (threaded/treeview) or a single
  // email (flat). Nodes without a fetched email are skipped (legacy quirk).
  const topics = $derived.by<Topic[]>(() => {
    if (!stats) return [];
    if (prefs.listmode === "flat") {
      return stats.emails.map((email, i) => ({
        kind: "email" as const,
        key: `e:${i}:${email.id}`,
        email,
      }));
    }
    if (prefs.listmode === "treeview") {
      const out: TreeTopic[] = [];
      stats.thread_struct.forEach((node, t) => {
        const rows: TreeTopic["rows"] = [];
        flatten(node).forEach((f, i) => {
          const email = emailForNode(f.node, emailIndex);
          if (email) {
            rows.push({ key: `t:${t}:${node.tid}:${i}`, email, depth: f.depth });
          }
        });
        if (rows.length > 0) {
          out.push({ kind: "tree", key: `t:${t}:${node.tid}`, rows });
        }
      });
      return out;
    }
    const out: ThreadTopic[] = [];
    stats.thread_struct.forEach((node, t) => {
      const email = originalEmail(node, emailIndex);
      if (!email) return;
      out.push({
        kind: "thread",
        key: `th:${t}:${node.tid}`,
        tid: node.tid,
        email,
        epoch: lastEpoch(node),
        participants: countParticipants(node, emailIndex),
        replies: countReplies(node),
      });
    });
    return out;
  });

  // One page of topics straight from stream.json rows (already paged
  // server-side, so no client-side slicing). While a mode switch is in
  // flight, the shape of the *response* wins over prefs.listmode, so the
  // previous page stays rendered until the new one lands.
  const streamTopics = $derived.by<Topic[]>(() => {
    if (!resp) return [];
    if (resp.mode === "emails") {
      return emailRows(resp).map((row, i) => ({
        kind: "email" as const,
        key: `se:${i}:${row.id}`,
        email: streamEmail(row),
      }));
    }
    if (prefs.listmode === "treeview") {
      return threadRows(resp).map((row) => ({
        kind: "tree" as const,
        key: `sv:${row.tid}`,
        rows: [
          {
            key: `sv:${row.tid}:root`,
            email: streamEmail(row.starter),
            depth: 0,
            tid: row.tid,
          },
          ...(Array.isArray(row.children) ? row.children : []).map(
            (child, i) => ({
              key: `sv:${row.tid}:${i}:${child.id}`,
              email: streamEmail(child),
              depth: child.depth,
            }),
          ),
        ],
      }));
    }
    return threadRows(resp).map((row) => ({
      kind: "thread" as const,
      key: `st:${row.tid}`,
      tid: row.tid,
      email: streamEmail(row.starter),
      epoch: row.last_epoch,
      participants: row.participants,
      replies: row.replies,
    }));
  });

  const unit = $derived(prefs.listmode === "flat" ? "emails" : "topics");
  const slice = $derived.by<PageSlice<Topic>>(() => {
    if (resp) {
      return {
        items: streamTopics,
        ...streamBounds(
          resp.page,
          resp.quant,
          resp.total,
          streamTopics.length,
        ),
      };
    }
    return pageSlice(topics, page, per);
  });

  // Mode or page-size switches can leave `page` beyond the last page of
  // the new result shape; snap back so the refetch lands on a real page.
  $effect(() => {
    if (resp && page > slice.pages - 1) page = slice.pages - 1;
  });

  function gotoPage(p: number): void {
    page = Math.min(Math.max(0, p), slice.pages - 1);
    openKey = null;
    expandedNodes.clear();
  }

  function toggleRow(key: string): void {
    openKey = openKey === key ? null : key;
  }

  function refresh(): void {
    if (!spec) return;
    if (domainLanding) {
      landing?.refresh();
      return;
    }
    if (streamEligible) {
      void loadStreamPage(spec, streamMode, page, streamPer, {
        force: true,
        sort: streamSort,
      });
    } else {
      void loadListView(spec, { force: true });
    }
  }

  // A single, concrete list (no wildcards) can be composed to.
  const concreteList = $derived(
    !!spec &&
      spec.lists.length === 1 &&
      spec.lists[0].list !== "*" &&
      spec.lists[0].domain !== "*",
  );

  function composeNew(): void {
    if (!spec || !concreteList) return;
    const l = spec.lists[0];
    openComposer({ mode: "new", to: `${l.list}@${l.domain}` });
  }

  // Rows per page from the viewport and a measured row (legacy
  // calc_per_page); design heights are the pre-render fallback.
  function measure(): void {
    const row = listEl?.querySelector<HTMLElement>("[data-listrow]");
    const rowH = (row?.offsetHeight ?? (prefs.compact ? 30 : 58)) + 4;
    const top = listEl
      ? listEl.getBoundingClientRect().top + window.scrollY
      : 220;
    per = perPage(window.innerHeight - top - 16, rowH);
  }

  $effect(() => {
    // Re-measure whenever row geometry can change.
    void prefs.compact;
    void prefs.listmode;
    void stats;
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

  // Data effect, registered after the measure effects so the first fetch
  // already uses a measured rows-per-page. Stream path: fetch exactly the
  // visible page (tracks spec, mode, page and page size; cached pages
  // render instantly). Legacy path: the full stats fetch, sliced client-
  // side. When stream.json 404s (older server), `available` flips false
  // and this effect reruns onto the legacy path with no visible break.
  $effect(() => {
    if (!spec || domainLanding) return;
    if (streamEligible) {
      void loadStreamPage(spec, streamMode, page, streamPer, {
        sort: streamSort,
      });
    } else {
      void loadListView(spec);
    }
  });

  $effect(() => {
    const disposers = [
      registerShortcut({
        key: "ArrowRight",
        description: "Next page of results",
        when: () => openKey === null && !domainLanding,
        handler: () => gotoPage(slice.page + 1),
      }),
      registerShortcut({
        key: "ArrowLeft",
        description: "Previous page of results",
        when: () => openKey === null && !domainLanding,
        handler: () => gotoPage(slice.page - 1),
      }),
      registerShortcut({
        key: "s",
        description: "Search the current list",
        handler: () => header?.focusSearch(),
      }),
      registerShortcut({
        key: "c",
        description: "Compose a new thread",
        when: () => concreteList && !composer.open,
        handler: composeNew,
      }),
      registerShortcut({
        key: "Escape",
        description: "Collapse the open email",
        when: () => openKey !== null,
        handler: () => {
          openKey = null;
        },
      }),
    ];
    return () => {
      for (const dispose of disposers) dispose();
    };
  });

  const showAllTimeHint = $derived(
    !!spec && (!spec.date || /^lte=\d+[dwMy]$/.test(spec.date)),
  );

  const calendarYears = $derived(
    stats ? buildCalendar(stats.active_months) : [],
  );
  const latestActive = $derived(
    stats ? latestActiveMonth(stats.active_months) : undefined,
  );
  // Canonical "YYYY-M" of the shown month, so the calendar can highlight it
  // even when the URL says "2025-09".
  const currentMonth = $derived.by(() => {
    if (!spec?.date) return undefined;
    const parsed = parseMonthSpec(spec.date);
    return parsed ? monthSpec(parsed.year, parsed.month) : undefined;
  });

  // Month browsing keeps the query and header filters, like the legacy
  // calendar_click().
  function monthUrl(month: string): string {
    if (!spec) return "/";
    const next: SearchSpec = {
      lists: spec.lists,
      headers: spec.headers,
      date: month,
    };
    if (spec.query) next.query = spec.query;
    return listUrl(next);
  }

  function jumpToLatest(): void {
    if (latestActive) navigate(monthUrl(latestActive));
  }

  // Feed auto-discovery: a rel=alternate link in <head> pointing at the
  // Atom feed for the current view, so feed readers detect it.
  $effect(() => {
    const href = spec ? atomFeedUrl(spec, favorites.lists) : null;
    if (!href) return;
    const el = document.createElement("link");
    el.rel = "alternate";
    el.type = "application/atom+xml";
    el.title = title;
    el.href = href;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  });

  function searchAllTime(): void {
    if (!spec) return;
    const next: SearchSpec = {
      lists: spec.lists,
      headers: spec.headers,
      date: "gte=0d",
    };
    if (spec.query) next.query = spec.query;
    navigate(listUrl(next));
  }
</script>

<!-- Full-width like the classic UI; wide monitors get all the room. -->
<div class="w-full px-4 py-6 sm:px-6">
  {#if !spec}
    <div
      class="mx-auto max-w-2xl rounded-md border border-amber-300 bg-amber-50
             p-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50
             dark:text-amber-200"
      role="alert"
    >
      <p class="font-semibold">Malformed search</p>
      <p class="mt-1 text-sm">
        The list selection in this URL could not be understood. Pick a
        mailing list from the
        <a href="/" class="font-medium underline">archive index</a> instead.
      </p>
    </div>
  {:else}
    <ListHeader
      bind:this={header}
      {spec}
      {title}
      {stats}
      loading={viewLoading}
      onrefresh={refresh}
    />

    {#if domainLanding}
      <!-- Hostname landing: categories plus cross-list activity panels.
           Keyed by domain so navigating landing-to-landing starts from a
           clean slate instead of showing the old domain's panels. -->
      <div class="mt-3">
        {#key spec.lists[0].domain}
          <DomainLanding bind:this={landing} domain={spec.lists[0].domain} />
        {/key}
      </div>
    {:else}
    <div class="flex items-start gap-6">
      {#if calendarYears.length > 0}
        <aside class="hidden w-56 shrink-0 md:block">
          <Calendar years={calendarYears} current={currentMonth} {monthUrl} />
        </aside>
      {/if}

      <div class="min-w-0 flex-1">
    {#if viewError}
      <div
        class="rounded-md border border-red-200 bg-red-50 p-4 text-red-800
               dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
        role="alert"
      >
        <p class="font-semibold">Could not load emails</p>
        <p class="mt-1 text-sm break-words">{viewError}</p>
        <button
          type="button"
          onclick={refresh}
          class="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm
                 font-medium hover:bg-red-100 dark:border-red-800
                 dark:hover:bg-red-900/50"
        >
          Try again
        </button>
      </div>
    {:else if !stats}
      <Skeleton rows={10} compact={prefs.compact} />
    {:else if slice.total === 0}
      <div
        class="rounded-md border border-slate-200 bg-white p-8 text-center
               dark:border-slate-800 dark:bg-slate-900"
      >
        <p class="text-slate-600 dark:text-slate-300">
          No emails found for {title}.
        </p>
        {#if latestActive || showAllTimeHint}
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
            The most recent activity on this list may be older than the
            selected period.
          </p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            {#if latestActive}
              <button
                type="button"
                onclick={jumpToLatest}
                class="rounded-md bg-pony-600 px-4 py-2 text-sm font-medium
                       text-white hover:bg-pony-700 focus:ring-2
                       focus:ring-pony-500 focus:ring-offset-2
                       focus:outline-none dark:hover:bg-pony-500
                       dark:focus:ring-offset-slate-950"
              >
                Jump to latest activity ({dateSpecLabel(latestActive)})
              </button>
            {/if}
            {#if showAllTimeHint}
              <button
                type="button"
                onclick={searchAllTime}
                class="rounded-md border border-slate-300 px-4 py-2 text-sm
                       font-medium text-slate-700 hover:bg-slate-50
                       focus:ring-2 focus:ring-pony-500 focus:outline-none
                       dark:border-slate-700 dark:text-slate-200
                       dark:hover:bg-slate-800"
              >
                Search all time
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {:else if forum}
      <!-- Forum layout: threads as a topic table. Stream pages arrive
           server-sorted/-sliced; the legacy path sorts and pages the
           full stats set client-side inside the table. A leftover
           emails-mode response (standard flat view -> forum switch) has
           no thread rows; show a skeleton while the refetch lands. -->
      {#if resp && resp.mode !== "threads"}
        <Skeleton rows={10} compact={prefs.compact} />
      {:else}
        <TopicTable
          {spec}
          stats={resp ? null : stats}
          streamRows={resp ? topicsFromStream(resp) : undefined}
          bounds={resp
            ? {
                page: slice.page,
                pages: slice.pages,
                first: slice.first,
                last: slice.last,
                total: slice.total,
              }
            : undefined}
          sort={forumSort}
          onsortchange={(s) => {
            forumSort = s;
            page = 0;
            openKey = null;
          }}
          onpage={gotoPage}
        />
      {/if}
    {:else}
      <div class="mb-2 flex justify-end">
        <Pagination
          first={slice.first}
          last={slice.last}
          total={slice.total}
          {unit}
          onprev={() => gotoPage(slice.page - 1)}
          onnext={() => gotoPage(slice.page + 1)}
        />
      </div>

        <div class="relative min-w-0" bind:this={listEl}>
          {#if viewLoading}
            <div
              class="absolute inset-0 z-10 flex items-start justify-center
                     rounded-md bg-white/60 backdrop-blur-[1px]
                     dark:bg-slate-950/60"
            >
              <div
                class="sticky top-1/3 mt-24 flex items-center gap-2.5
                       rounded-md border border-slate-200 bg-white/95 px-4
                       py-2.5 text-sm font-medium text-slate-700 shadow-lg
                       dark:border-slate-700 dark:bg-slate-900/95
                       dark:text-slate-200"
                role="status"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  class="h-4 w-4 animate-spin text-pony-600 dark:text-pony-300"
                  aria-hidden="true"
                >
                  <path d="M21 12a9 9 0 1 1-9-9" />
                </svg>
                Loading results&hellip;
              </div>
            </div>
          {/if}
          <ol class="space-y-1">
            {#each slice.items as topic (topic.key)}
              <li>
                {#if topic.kind === "thread"}
                  <EmailRow
                    email={topic.email}
                    epoch={topic.epoch}
                    participants={topic.participants}
                    replies={topic.replies}
                    {showList}
                    {now}
                    expanded={openKey === topic.key}
                    ontoggle={() => toggleRow(topic.key)}
                  />
                  {#if openKey === topic.key}
                    <div class="mt-1 mb-2">
                      <InlineThread tid={topic.tid} />
                    </div>
                  {/if}
                {:else if topic.kind === "email"}
                  <EmailRow
                    email={topic.email}
                    {showList}
                    {now}
                    expanded={openKey === topic.key}
                    ontoggle={() => toggleRow(topic.key)}
                  />
                  {#if openKey === topic.key}
                    <div class="mt-1 mb-2">
                      <InlineThread tid={topic.email.mid} single={true} />
                    </div>
                  {/if}
                {:else}
                  <ol class="space-y-1">
                    {#each visibleTreeRows(topic.rows, expandedNodes) as v (v.row.key)}
                      <li>
                        <EmailRow
                          email={v.row.email}
                          depth={v.row.depth}
                          treeChildren={v.descendants}
                          treeExpanded={v.expanded}
                          ontreetoggle={() => toggleNode(v.row.key)}
                          {showList}
                          {now}
                          expanded={openKey === v.row.key}
                          ontoggle={() => toggleRow(v.row.key)}
                        />
                        {#if openKey === v.row.key}
                          <div class="mt-1 mb-2">
                            <InlineThread
                              tid={v.row.tid ?? v.row.email.mid}
                              single={!v.row.tid}
                            />
                          </div>
                        {/if}
                      </li>
                    {/each}
                  </ol>
                {/if}
              </li>
            {/each}
          </ol>
        </div>
    {/if}
      </div>
    </div>
    {/if}
  {/if}
</div>
