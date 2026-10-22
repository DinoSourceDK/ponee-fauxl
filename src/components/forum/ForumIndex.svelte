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
  Forum-mode home page directory: one phpBB-style forum row per domain.
  Purely presentational. The parent owns loading/empty/error states and
  passes session.lists (domain → list → 90-day activity count) as a prop.
-->
<script lang="ts">
  import { formatCount } from "../../lib/calendar";
  import { FAVORITES_DOMAIN, favoritesToRefs } from "../../lib/favorites";
  import { listUrl } from "../../lib/search";
  import { favorites } from "../../lib/stores/favorites.svelte";

  interface Props {
    /** session.lists: domain → list name → emails in the last 90 days. */
    lists: Record<string, Record<string, number>>;
  }

  let { lists }: Props = $props();

  interface ForumRow {
    domain: string;
    /** Number of mailing lists on the domain. */
    listCount: number;
    /** Domain-wide activity: sum of the per-list 90-day counts. */
    total: number;
  }

  const rows: ForumRow[] = $derived(
    Object.keys(lists)
      .sort()
      .map((domain) => {
        const counts = Object.values(lists[domain] ?? {});
        return {
          domain,
          listCount: counts.length,
          total: counts.reduce((sum, n) => sum + n, 0),
        };
      }),
  );

  // Starred lists get their own pseudo-forum on top, linking to the
  // $favorites landing; shown only once something is favorited.
  const favRow = $derived.by<ForumRow | null>(() => {
    const refs = favoritesToRefs(favorites.lists);
    if (refs.length === 0) return null;
    return {
      domain: FAVORITES_DOMAIN,
      listCount: refs.length,
      total: refs.reduce(
        (sum, r) => sum + (lists[r.domain]?.[r.list] ?? 0),
        0,
      ),
    };
  });

  function domainUrl(domain: string): string {
    return listUrl({ lists: [{ list: "*", domain }], headers: {} });
  }
</script>

{#snippet countBadge(total: number)}
  {#if total > 0}
    <span
      class="shrink-0 rounded-full bg-pony-100 px-2.5 py-0.5 text-xs
             font-semibold text-pony-700 dark:bg-pony-900
             dark:text-pony-200"
      title="Emails in the last 90 days"
    >
      {formatCount(total)}
    </span>
  {:else}
    <span
      class="shrink-0 rounded-full border border-slate-200 px-2.5
             py-0.5 text-xs text-slate-400 dark:border-slate-700
             dark:text-slate-500"
      title="Emails in the last 90 days"
    >
      0
    </span>
  {/if}
{/snippet}

{#if rows.length > 0 || favRow}
  <div
    class="divide-y divide-slate-100 rounded-md border border-slate-200
           bg-white dark:divide-slate-800/60 dark:border-slate-800
           dark:bg-slate-900"
  >
    {#if favRow}
      <div
        data-guide="favlists"
        class="flex items-center gap-3 px-4 py-3 sm:gap-4"
      >
        <span
          class="flex h-10 w-10 shrink-0 items-center justify-center
                 rounded-md bg-amber-50 text-amber-500
                 dark:bg-amber-950/40 dark:text-amber-400"
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
            href={domainUrl(FAVORITES_DOMAIN)}
            class="font-semibold break-all text-pony-600 hover:underline
                   focus:ring-2 focus:ring-pony-500 focus:outline-none
                   dark:text-pony-300"
          >
            Favorite lists
          </a>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {favRow.listCount} starred
            {favRow.listCount === 1 ? "list" : "lists"}
          </p>
        </div>
        {@render countBadge(favRow.total)}
      </div>
    {/if}
    {#each rows as row (row.domain)}
      <div class="flex items-center gap-3 px-4 py-3 sm:gap-4">
        <span
          class="flex h-10 w-10 shrink-0 items-center justify-center
                 rounded-md bg-pony-50 text-pony-600 dark:bg-pony-950/60
                 dark:text-pony-300"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-5 w-5"
            role="img"
            aria-label="Forum"
          >
            <title>Forum</title>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0
                     0 1 2 2z" />
            <path d="M8 9h8M8 13h5" />
          </svg>
        </span>
        <div class="min-w-0 flex-1">
          <a
            href={domainUrl(row.domain)}
            class="font-semibold break-all text-pony-600 hover:underline
                   focus:ring-2 focus:ring-pony-500 focus:outline-none
                   dark:text-pony-300"
          >
            {row.domain}
          </a>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {row.listCount} mailing {row.listCount === 1 ? "list" : "lists"}
          </p>
        </div>
        {@render countBadge(row.total)}
      </div>
    {/each}
  </div>
{/if}
