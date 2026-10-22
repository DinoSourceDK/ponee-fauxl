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
  import type { DateSpec } from "../../lib/dates";
  import { MONTHS, buildDateSpec, parseDateSpec } from "../../lib/dates";
  import { navigate } from "../../lib/router.svelte";
  import type { HeaderField, SearchSpec } from "../../lib/search";
  import { listUrl } from "../../lib/search";

  interface Props {
    spec: SearchSpec;
    /** Live value of the header's search input (submitted together). */
    query: string;
    onclose: () => void;
  }

  let { spec, query, onclose }: Props = $props();

  /* --- scope ----------------------------------------------------------- */

  type Scope = "list" | "domain" | "all";

  const single = $derived(spec.lists.length === 1);
  const currentList = $derived(single ? spec.lists[0].list : "");
  const currentDomain = $derived(single ? spec.lists[0].domain : "");
  const canList = $derived(
    single && currentList !== "*" && currentDomain !== "*",
  );
  const canDomain = $derived(single && currentDomain !== "*");

  /* --- date ------------------------------------------------------------ */

  type DateMode = "any" | "month" | "lte" | "gte" | "range";

  // Present only while browsing a single month; the "month" option keeps it.
  const monthBrowse = $derived.by(() => {
    const ds = parseDateSpec(spec.date);
    return ds.kind === "month" ? ds : null;
  });

  let scope = $state<Scope>("all");
  let dateMode = $state<DateMode>("lte");
  let relN = $state(30);
  let relUnit = $state<"d" | "w" | "M" | "y">("d");
  let rangeFrom = $state("");
  let rangeTo = $state("");
  let hFrom = $state("");
  let hSubject = $state("");
  let hTo = $state("");
  let hBody = $state("");
  let hMessageid = $state("");

  // Prefill from the current spec; re-runs only when navigation changes it.
  $effect(() => {
    scope = canList ? "list" : canDomain ? "domain" : "all";
    const ds = parseDateSpec(spec.date);
    dateMode = ds.kind === "rel" ? ds.dir : ds.kind;
    if (ds.kind === "rel") {
      relN = ds.n;
      relUnit = ds.unit;
    } else if (ds.kind === "range") {
      rangeFrom = ds.from;
      rangeTo = ds.to;
    }
    hFrom = spec.headers.from ?? "";
    hSubject = spec.headers.subject ?? "";
    hTo = spec.headers.to ?? "";
    hBody = spec.headers.body ?? "";
    hMessageid = spec.headers.messageid ?? "";
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();

    const lists =
      scope === "list"
        ? [{ list: currentList, domain: currentDomain }]
        : scope === "domain"
          ? [{ list: "*", domain: currentDomain }]
          : [{ list: "*", domain: "*" }];

    let ds: DateSpec = { kind: "any" };
    if (dateMode === "month" && monthBrowse) {
      ds = monthBrowse;
    } else if (dateMode === "lte" || dateMode === "gte") {
      ds = {
        kind: "rel",
        dir: dateMode,
        n: Math.max(1, Math.round(Number(relN) || 1)),
        unit: relUnit,
      };
    } else if (dateMode === "range" && rangeFrom && rangeTo) {
      ds = { kind: "range", from: rangeFrom, to: rangeTo };
    }

    const headers: SearchSpec["headers"] = {};
    const put = (key: HeaderField, value: string): void => {
      const v = value.trim();
      if (v) headers[key] = v;
    };
    put("from", hFrom);
    put("subject", hSubject);
    put("to", hTo);
    put("body", hBody);
    put("messageid", hMessageid);

    const next: SearchSpec = { lists, headers };
    const date = buildDateSpec(ds);
    if (date) next.date = date;
    const q = query.trim();
    if (q) next.query = q;

    navigate(listUrl(next));
    onclose();
  }

  const label = "text-xs font-medium text-slate-500 dark:text-slate-400";
  const field = `rounded-md border border-slate-300 bg-white px-2 py-1.5
    text-sm text-slate-900 focus:border-pony-500 focus:ring-2
    focus:ring-pony-500 focus:outline-none dark:border-slate-700
    dark:bg-slate-950 dark:text-slate-100`;
  const radio = `h-3.5 w-3.5 accent-pony-600 focus:ring-2 focus:ring-pony-500
    focus:outline-none dark:accent-pony-500`;
</script>

<form
  aria-label="Advanced search"
  onsubmit={submit}
  class="mt-2 flex flex-col gap-4 rounded-md border border-slate-300
         bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
>
  <fieldset>
    <legend class={label}>Where to search</legend>
    <div
      class="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm
             text-slate-700 dark:text-slate-200"
    >
      {#if canList}
        <label class="inline-flex items-center gap-1.5">
          <input
            type="radio"
            name="scope"
            value="list"
            bind:group={scope}
            class={radio}
          />
          This list ({currentList}@{currentDomain})
        </label>
      {/if}
      {#if canDomain}
        <label class="inline-flex items-center gap-1.5">
          <input
            type="radio"
            name="scope"
            value="domain"
            bind:group={scope}
            class={radio}
          />
          This domain ({currentDomain})
        </label>
      {/if}
      <label class="inline-flex items-center gap-1.5">
        <input
          type="radio"
          name="scope"
          value="all"
          bind:group={scope}
          class={radio}
        />
        All lists
      </label>
    </div>
  </fieldset>

  <div>
    <label class={label} for="adv-date-mode">Date range</label>
    <div class="mt-1.5 flex flex-wrap items-center gap-2">
      <select id="adv-date-mode" bind:value={dateMode} class={field}>
        <option value="any">Any time</option>
        {#if monthBrowse}
          <option value="month">
            {MONTHS[monthBrowse.month - 1]}
            {monthBrowse.year}
          </option>
        {/if}
        <option value="lte">Less than &hellip; ago</option>
        <option value="gte">More than &hellip; ago</option>
        <option value="range">Between dates</option>
      </select>

      {#if dateMode === "lte" || dateMode === "gte"}
        <input
          type="number"
          min="1"
          required
          bind:value={relN}
          aria-label="Number of time units"
          class="{field} w-20"
        />
        <select bind:value={relUnit} aria-label="Time unit" class={field}>
          <option value="d">day(s)</option>
          <option value="w">week(s)</option>
          <option value="M">month(s)</option>
          <option value="y">year(s)</option>
        </select>
        <span class="text-sm text-slate-500 dark:text-slate-400">ago</span>
      {:else if dateMode === "range"}
        <input
          type="date"
          required
          bind:value={rangeFrom}
          aria-label="From date"
          class={field}
        />
        <span class="text-sm text-slate-500 dark:text-slate-400">to</span>
        <input
          type="date"
          required
          bind:value={rangeTo}
          aria-label="To date"
          class={field}
        />
      {/if}
    </div>
  </div>

  <div>
    <span class={label}>Header filters</span>
    <div class="mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label class="block">
        <span class={label}>Author</span>
        <input
          type="text"
          bind:value={hFrom}
          placeholder="Name or email address"
          class="{field} mt-1 w-full"
        />
      </label>
      <label class="block">
        <span class={label}>Subject</span>
        <input type="text" bind:value={hSubject} class="{field} mt-1 w-full" />
      </label>
      <label class="block">
        <span class={label}>To</span>
        <input
          type="text"
          bind:value={hTo}
          placeholder="Name or email address"
          class="{field} mt-1 w-full"
        />
      </label>
      <label class="block">
        <span class={label}>Body</span>
        <input type="text" bind:value={hBody} class="{field} mt-1 w-full" />
      </label>
      <label class="block">
        <span class={label}>Message-ID</span>
        <input
          type="text"
          bind:value={hMessageid}
          class="{field} mt-1 w-full"
        />
      </label>
    </div>
  </div>

  <div class="flex items-center gap-2">
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
      onclick={onclose}
      class="rounded-md px-3 py-1.5 text-sm text-slate-600
             hover:bg-slate-100 focus:ring-2 focus:ring-pony-500
             focus:outline-none dark:text-slate-300 dark:hover:bg-slate-800"
    >
      Close
    </button>
  </div>
</form>
