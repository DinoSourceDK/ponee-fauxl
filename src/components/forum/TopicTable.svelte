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
  import type { StatsResponse } from "../../lib/api/types";
  import { relativeTime, utcIso } from "../../lib/dates";
  import type { TopicRow } from "../../lib/forum";
  import { topicsFromStats } from "../../lib/forum";
  import type { PageSlice } from "../../lib/listview";
  import {
    authorName,
    listRawToAddress,
    pageSlice,
    showsListBadge,
  } from "../../lib/listview";
  import { threadUrl } from "../../lib/routes";
  import type { SearchSpec } from "../../lib/search";
  import type { StreamBounds } from "../../lib/stream";
  import Avatar from "../ui/Avatar.svelte";
  import Pagination from "../listview/Pagination.svelte";

  /**
   * phpBB-style topic table for forum view mode: one row per thread,
   * plain links to the thread page (no inline expansion in forum mode).
   *
   * Two row sources: a legacy stats.json response (full result set,
   * sorted and paged client-side), or a stream.json page (streamRows +
   * bounds, already sorted and sliced by the server, so sort clicks
   * and paging are delegated to the owner via onsortchange/onpage).
   */
  interface Props {
    spec: SearchSpec;
    /** Legacy full-stats source; ignored when streamRows is given. */
    stats?: StatsResponse | null;
    /** One server-sorted page of topic rows (stream path). */
    streamRows?: TopicRow[];
    /** Page bounds of the stream page. */
    bounds?: StreamBounds;
    /** Current sort order (stream path; owner-controlled). */
    sort?: "last" | "replies" | "upvotes";
    onsortchange?: (sort: "last" | "replies" | "upvotes") => void;
    onpage?: (page: number) => void;
  }

  let {
    spec,
    stats = null,
    streamRows,
    bounds,
    sort,
    onsortchange,
    onpage,
  }: Props = $props();

  const PER_PAGE = 25;

  // Server-paged (stream) rows win over the legacy client-side pipeline.
  const external = $derived(streamRows !== undefined);
  const rows = $derived(
    external ? (streamRows ?? []) : stats ? topicsFromStats(stats) : [],
  );
  const showList = $derived(showsListBadge(spec.lists));

  type SortKey = "last" | "replies" | "upvotes";
  let sortLocal = $state<SortKey>("last");
  const sortBy = $derived(external ? (sort ?? "last") : sortLocal);

  function setSort(key: SortKey): void {
    if (external) {
      onsortchange?.(key);
    } else {
      sortLocal = key;
    }
  }

  // "last" keeps the server order (newest activity first); the count
  // sorts are descending, ties broken by newest activity. Stream rows
  // arrive already sorted (and paged) by the server.
  const sorted = $derived.by(() => {
    if (external || sortBy === "last") return rows;
    const key: "replies" | "upvotes" = sortBy;
    return rows
      .slice()
      .sort((a, b) => b[key] - a[key] || b.lastEpoch - a.lastEpoch);
  });

  let page = $state(0);
  // Back to the first page whenever a new stats response arrives or the
  // sort order changes (legacy pipeline only).
  $effect(() => {
    void stats;
    void sortLocal;
    page = 0;
  });

  const slice = $derived.by<PageSlice<TopicRow>>(() => {
    if (external) {
      const b = bounds ?? {
        page: 0,
        pages: 1,
        first: rows.length > 0 ? 1 : 0,
        last: rows.length,
        total: rows.length,
      };
      return { items: rows, ...b };
    }
    return pageSlice(sorted, page, PER_PAGE);
  });

  function gotoPage(p: number): void {
    if (external) {
      onpage?.(Math.min(Math.max(0, p), slice.pages - 1));
    } else {
      page = Math.min(Math.max(0, p), slice.pages - 1);
    }
  }

  // Shared column template so the header lines up with the rows.
  const cols = "md:grid-cols-[minmax(0,1fr)_11rem_5rem_5rem_13rem]";

  // Sortable column headers; the active one is darker and carries a ▼.
  const sortBtn =
    "inline-flex items-center gap-1 rounded-md uppercase " +
    "hover:text-slate-700 focus:ring-2 focus:ring-pony-500 " +
    "focus:outline-none dark:hover:text-slate-200";
  const sortBtnActive = "text-slate-700 dark:text-slate-200";
</script>

{#if rows.length === 0}
  <div
    class="rounded-md border border-slate-200 bg-white p-6 text-center
           text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900
           dark:text-slate-400"
  >
    No topics found.
  </div>
{:else}
  <!-- Column headers are hidden below md; offer the same sorts there. -->
  <div class="mb-2 flex items-center justify-end gap-2 md:hidden">
    <label
      for="forum-topic-sort"
      class="text-xs font-semibold text-slate-500 dark:text-slate-400"
    >
      Sort
    </label>
    <select
      id="forum-topic-sort"
      value={sortBy}
      onchange={(e) => setSort(e.currentTarget.value as SortKey)}
      class="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm
             text-slate-700 focus:ring-2 focus:ring-pony-500
             focus:outline-none dark:border-slate-700 dark:bg-slate-900
             dark:text-slate-200"
    >
      <option value="last">Last post</option>
      <option value="replies">Replies</option>
      <option value="upvotes">Upvotes</option>
    </select>
  </div>

  <div
    class="overflow-hidden rounded-md border border-slate-300 bg-white
           dark:border-slate-700 dark:bg-slate-900"
  >
    <div
      class="hidden items-center gap-x-3 border-b border-slate-200
             bg-slate-50 px-4 py-2 text-xs font-semibold tracking-wide
             text-slate-500 uppercase md:grid dark:border-slate-700
             dark:bg-slate-800 dark:text-slate-400 {cols}"
    >
      <div>Topic</div>
      <div>Started by</div>
      <div
        class="text-center"
        aria-sort={sortBy === "replies" ? "descending" : undefined}
      >
        <button
          type="button"
          class="{sortBtn} {sortBy === 'replies' ? sortBtnActive : ''}"
          aria-label="Sort by replies"
          onclick={() => setSort("replies")}
        >
          Replies
          {#if sortBy === "replies"}
            <span aria-hidden="true">&#9660;</span>
          {/if}
        </button>
      </div>
      <div
        class="text-center"
        aria-sort={sortBy === "upvotes" ? "descending" : undefined}
      >
        <button
          type="button"
          class="{sortBtn} {sortBy === 'upvotes' ? sortBtnActive : ''}"
          aria-label="Sort by upvotes"
          onclick={() => setSort("upvotes")}
        >
          Upvotes
          {#if sortBy === "upvotes"}
            <span aria-hidden="true">&#9660;</span>
          {/if}
        </button>
      </div>
      <div aria-sort={sortBy === "last" ? "descending" : undefined}>
        <button
          type="button"
          class="{sortBtn} {sortBy === 'last' ? sortBtnActive : ''}"
          aria-label="Sort by last post"
          onclick={() => setSort("last")}
        >
          Last post
          {#if sortBy === "last"}
            <span aria-hidden="true">&#9660;</span>
          {/if}
        </button>
      </div>
    </div>

    <ul class="divide-y divide-slate-200 dark:divide-slate-800">
      {#each slice.items as row (row.node.tid)}
        <li
          class="grid grid-cols-1 items-center gap-x-3 gap-y-1 px-4 py-3
                 hover:bg-slate-50 dark:hover:bg-slate-800/50 {cols}"
        >
          <div class="min-w-0">
            <a
              href={threadUrl(row.node.tid)}
              class="rounded-md text-sm font-semibold break-words
                     text-pony-700 hover:underline focus:ring-2
                     focus:ring-pony-500 focus:outline-none
                     dark:text-pony-300"
            >
              {row.subject}
            </a>
            {#if showList && row.starter}
              <span
                class="ml-1 rounded-md bg-pony-100 px-1.5 py-0.5 text-[10px]
                       font-semibold whitespace-nowrap text-pony-700
                       dark:bg-pony-900 dark:text-pony-200"
              >
                {listRawToAddress(row.starter.list_raw ?? row.starter.list)}
              </span>
            {/if}
            <!-- Starter + activity, small screens only. -->
            <div
              class="mt-1 flex items-center gap-1.5 text-xs text-slate-500
                     md:hidden dark:text-slate-400"
            >
              {#if row.starter}
                <Avatar
                  md5={row.starter.gravatar}
                  name={authorName(row.starter.from)}
                  size={20}
                />
                <span class="max-w-40 truncate">
                  {authorName(row.starter.from)}
                </span>
                <span aria-hidden="true">&middot;</span>
              {/if}
              <span>
                {row.replies}
                {row.replies === 1 ? "reply" : "replies"}
              </span>
              <span aria-hidden="true">&middot;</span>
              <span
                title="{row.upvotes} {row.upvotes === 1
                  ? 'upvote'
                  : 'upvotes'}"
              >
                <span aria-hidden="true">&#9650;</span>
                {row.upvotes}
                <span class="sr-only">
                  {row.upvotes === 1 ? "upvote" : "upvotes"}
                </span>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span title={utcIso(row.lastEpoch)}>
                {relativeTime(row.lastEpoch)}
              </span>
            </div>
          </div>

          <div
            class="hidden min-w-0 items-center gap-2 text-sm text-slate-700
                   md:flex dark:text-slate-300"
          >
            {#if row.starter}
              <Avatar
                md5={row.starter.gravatar}
                name={authorName(row.starter.from)}
                size={20}
              />
              <span class="truncate">{authorName(row.starter.from)}</span>
            {:else}
              <span class="text-slate-400 dark:text-slate-500">-</span>
            {/if}
          </div>

          <div
            class="hidden text-center text-sm text-slate-600 md:block
                   dark:text-slate-300"
            title="{row.replies} replies, {row.participants} participants"
          >
            {row.replies}
            <span class="sr-only">replies</span>
          </div>

          <div
            class="hidden text-center text-sm text-slate-600 md:block
                   dark:text-slate-300"
            title="{row.upvotes} {row.upvotes === 1 ? 'upvote' : 'upvotes'}"
          >
            {row.upvotes}
            <span class="sr-only">upvotes</span>
          </div>

          <div class="hidden min-w-0 text-sm md:block">
            <span
              class="text-slate-700 dark:text-slate-200"
              title={utcIso(row.lastEpoch)}
            >
              {relativeTime(row.lastEpoch)}
            </span>
            {#if row.lastFrom}
              <div class="truncate text-xs text-slate-500 dark:text-slate-400">
                by {authorName(row.lastFrom)}
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </div>

  <div class="mt-3 flex justify-end">
    <Pagination
      first={slice.first}
      last={slice.last}
      total={slice.total}
      unit="topics"
      onprev={() => gotoPage(slice.page - 1)}
      onnext={() => gotoPage(slice.page + 1)}
    />
  </div>
{/if}
