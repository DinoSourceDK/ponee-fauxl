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
  /**
   * Paged audit log of admin actions (port of admin_audit_view() in
   * webui/js/source/mgmt.js), with an action filter the classic console
   * lacked (the server supports one; attachment removals are only
   * listed when asked for).
   */
  import { untrack } from "svelte";
  import { mgmtLog } from "../../lib/api/client";
  import type { MgmtLogEntry } from "../../lib/api/types";
  import {
    AUDIT_ACTIONS,
    AUDIT_ACTION_LABELS,
    auditEpoch,
    targetsEmail,
    type AuditAction,
  } from "../../lib/admin";
  import { formatDate } from "../../lib/dates";
  import { listRawToAddress } from "../../lib/listview";
  import { adminUrl } from "../../lib/routes";
  import { prefs } from "../../lib/stores/prefs.svelte";
  import Skeleton from "../ui/Skeleton.svelte";

  const PAGE_SIZE = 30;

  let entries: MgmtLogEntry[] = $state([]);
  let page = $state(0);
  let loading = $state(false);
  let done = $state(false);
  let errorMsg = $state("");
  let actions: Record<AuditAction, boolean> = $state(
    Object.fromEntries(AUDIT_ACTIONS.map((a) => [a, true])) as Record<
      AuditAction,
      boolean
    >,
  );
  let loadToken = 0;

  const selected = $derived(AUDIT_ACTIONS.filter((a) => actions[a]));

  async function fetchPage(p: number, filter: string[]): Promise<void> {
    const t = ++loadToken;
    loading = true;
    errorMsg = "";
    try {
      const res = await mgmtLog(p, PAGE_SIZE, filter);
      if (t !== loadToken) return;
      const got = res.entries ?? [];
      entries = p === 0 ? got : [...entries, ...got];
      page = p;
      done = got.length < PAGE_SIZE;
    } catch (e) {
      if (t !== loadToken) return;
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      if (t === loadToken) loading = false;
    }
  }

  // Start over whenever the action filter changes.
  $effect(() => {
    const filter = [...selected];
    untrack(() => {
      entries = [];
      done = false;
      if (filter.length === 0) {
        loadToken++;
        loading = false;
        done = true;
        return;
      }
      void fetchPage(0, filter);
    });
  });

  const actionStyle: Record<string, string> = {
    edit: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
    hide: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    unhide:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    delete: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    delatt: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  };
  const actionDefault =
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";

  function when(entry: MgmtLogEntry): string {
    const epoch = auditEpoch(entry.date);
    return epoch === null ? entry.date : formatDate(epoch, prefs.utc);
  }

  const th =
    "px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-500 " +
    "uppercase dark:text-slate-400";
  const td = "px-3 py-2 align-top";
</script>

<section aria-labelledby="audit-heading">
  <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
    <h2
      id="audit-heading"
      class="text-lg font-semibold text-slate-900 dark:text-slate-100"
    >
      Audit log
    </h2>
    <fieldset class="flex flex-wrap items-center gap-1.5">
      <legend class="sr-only">Show actions</legend>
      {#each AUDIT_ACTIONS as a (a)}
        <label
          class="cursor-pointer rounded-full border px-2.5 py-0.5 text-xs
                 font-medium select-none has-[:focus-visible]:ring-2
                 has-[:focus-visible]:ring-pony-500 {actions[a]
            ? `border-transparent ${actionStyle[a]}`
            : 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400'}"
        >
          <input type="checkbox" class="sr-only" bind:checked={actions[a]} />
          {AUDIT_ACTION_LABELS[a]}
        </label>
      {/each}
    </fieldset>
  </div>

  {#if errorMsg}
    <div
      class="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm
             text-red-800 dark:border-red-900 dark:bg-red-950/50
             dark:text-red-200"
      role="alert"
    >
      <p>Could not load the audit log: {errorMsg}</p>
      <button
        type="button"
        onclick={() => fetchPage(entries.length ? page + 1 : 0, [...selected])}
        class="mt-2 rounded-md border border-red-300 px-3 py-1 font-medium
               hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/50"
      >
        Try again
      </button>
    </div>
  {/if}

  {#if entries.length === 0 && loading}
    <Skeleton rows={6} compact />
  {:else if entries.length === 0 && !errorMsg}
    <p
      class="rounded-md border border-dashed border-slate-300 p-6 text-center
             text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
    >
      {selected.length === 0
        ? "Select at least one action to show."
        : "The audit log is empty."}
    </p>
  {:else if entries.length}
    <div
      class="overflow-x-auto rounded-md border border-slate-200 bg-white
             dark:border-slate-800 dark:bg-slate-900"
    >
      <!-- Wide enough to stay legible; the wrapper scrolls on phones. -->
      <table class="w-full min-w-[56rem] text-sm">
        <thead class="border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th class={th} scope="col">Date</th>
            <th class={th} scope="col">Author</th>
            <th class={th} scope="col">Remote</th>
            <th class={th} scope="col">Action</th>
            <th class={th} scope="col">Target</th>
            <th class={th} scope="col">Log</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          {#each entries as entry (entry.id)}
            <tr class="text-slate-800 dark:text-slate-100">
              <td class="{td} whitespace-nowrap" title="{entry.date} UTC">
                {when(entry)}
              </td>
              <td class="{td} break-words">{entry.author}</td>
              <td class="{td} font-mono text-xs whitespace-nowrap">
                {entry.remote ?? ""}
              </td>
              <td class={td}>
                <span
                  class="rounded-md px-1.5 py-0.5 text-xs font-semibold
                         {actionStyle[entry.action] ?? actionDefault}"
                >
                  {entry.action}
                </span>
              </td>
              <td class="{td} max-w-[16rem] font-mono text-xs break-all">
                {#if entry.target && targetsEmail(entry.action)}
                  <a
                    href={adminUrl(entry.target)}
                    class="text-pony-600 hover:underline dark:text-pony-300"
                  >
                    {entry.target}
                  </a>
                {:else}
                  {entry.target ?? ""}
                {/if}
                {#if entry.lid && entry.lid !== "<system>"}
                  <div class="mt-0.5 font-sans text-slate-500 dark:text-slate-400">
                    {listRawToAddress(entry.lid)}
                  </div>
                {/if}
              </td>
              <td class="{td} min-w-[16rem] break-words">{entry.log}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="mt-3 flex items-center gap-3">
      {#if !done}
        <button
          type="button"
          disabled={loading}
          onclick={() => fetchPage(page + 1, [...selected])}
          class="rounded-md border border-slate-300 px-3 py-1.5 text-sm
                 font-medium text-slate-700 hover:bg-slate-100 focus:ring-2
                 focus:ring-pony-500 focus:outline-none disabled:opacity-50
                 dark:border-slate-700 dark:text-slate-200
                 dark:hover:bg-slate-800"
        >
          {loading ? "Loading…" : "Load more entries"}
        </button>
      {/if}
      <span class="text-xs text-slate-500 dark:text-slate-400">
        {entries.length}
        {entries.length === 1 ? "entry" : "entries"} shown{done
          ? ", end of log"
          : ""}
      </span>
    </div>
  {/if}
</section>
