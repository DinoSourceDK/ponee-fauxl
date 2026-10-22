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
  import { untrack } from "svelte";
  import type { CalendarYear } from "../../lib/calendar";
  import { formatCount, visibleYearWindow } from "../../lib/calendar";
  import { MONTHS, parseMonthSpec } from "../../lib/dates";

  interface Props {
    years: CalendarYear[];
    /** Canonical month spec ("YYYY-M") of the currently shown month. */
    current?: string;
    monthUrl: (spec: string) => string;
  }

  let { years, current, monthUrl }: Props = $props();

  // Height left for the up/down pagination controls.
  const CONTROLS_ALLOWANCE = 64;
  // Pre-measure estimate of one year card plus the space-y-3 gap.
  const CARD_FALLBACK = 150;
  const CARD_GAP = 12;

  // Wrapper around chevrons + year cards: a stable measuring anchor whose
  // top does not move when the chevrons appear or disappear.
  let wrapEl: HTMLElement | undefined = $state();

  let fit = $state(4);
  let offset = $state(0);

  const win = $derived(visibleYearWindow(offset, fit, years.length));
  const visible = $derived(years.slice(win.start, win.end));
  const paged = $derived(years.length > fit);

  // How many year cards fit between the top of the sidebar calendar and
  // the bottom of the viewport (legacy calendar_max_height).
  function measure(): void {
    if (!wrapEl) return;
    const card = wrapEl.querySelector<HTMLElement>("[data-yearcard]");
    const cardH = card ? card.offsetHeight + CARD_GAP : CARD_FALLBACK;
    const available =
      window.innerHeight -
      wrapEl.getBoundingClientRect().top -
      CONTROLS_ALLOWANCE;
    fit = Math.max(1, Math.min(years.length, Math.floor(available / cardH)));
  }

  $effect(() => {
    // Re-measure when the year list changes; fit is written, never read.
    void years.length;
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

  // Keep the browsed month's year visible whenever `current` changes, but
  // do not fight the chevrons: only `current` is tracked here.
  $effect(() => {
    const year = current ? parseMonthSpec(current)?.year : undefined;
    untrack(() => {
      if (year === undefined) return;
      const idx = years.findIndex((y) => y.year === year);
      if (idx < 0) return;
      const { start, end } = visibleYearWindow(offset, fit, years.length);
      if (idx < start) offset = idx;
      else if (idx >= end) offset = idx - fit + 1;
    });
  });

  function page(delta: number): void {
    offset = visibleYearWindow(win.start + delta, fit, years.length).start;
  }
</script>

<nav aria-label="Archive calendar">
  <h2
    class="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase
           dark:text-slate-400"
  >
    Archive
  </h2>

  <div bind:this={wrapEl}>
    {#if paged}
      <button
        type="button"
        onclick={() => page(-1)}
        disabled={win.start === 0}
        aria-label="Show newer years"
        title="Show newer years"
        class="mb-2 flex w-full items-center justify-center rounded-md
               border border-slate-200 py-0.5 text-slate-600
               enabled:hover:bg-slate-50 focus:ring-2 focus:ring-pony-500
               focus:outline-none disabled:cursor-not-allowed
               disabled:opacity-40 dark:border-slate-800
               dark:text-slate-300 dark:enabled:hover:bg-slate-800"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
    {/if}

    <div class="space-y-3">
      {#each visible as { year, months } (year)}
        <section
          data-yearcard
          class="rounded-md border border-slate-200 bg-white p-2
                 dark:border-slate-800 dark:bg-slate-900"
        >
          <h3
            class="mb-1 px-1 text-sm font-semibold text-slate-700
                   dark:text-slate-200"
          >
            {year}
          </h3>
          <ul class="grid grid-cols-4 gap-0.5">
            {#each months as m (m.spec)}
              <li>
                {#if m.count > 0}
                  <a
                    href={monthUrl(m.spec)}
                    title="{m.count} email{m.count === 1 ? '' : 's'} in
                           {MONTHS[m.month - 1]} {year}"
                    aria-current={current === m.spec ? "page" : undefined}
                    class="flex flex-col items-center rounded px-1 py-0.5
                           leading-tight focus:ring-2 focus:ring-pony-500
                           focus:outline-none
                           {current === m.spec
                      ? 'bg-pony-600 text-white'
                      : `text-pony-700 hover:bg-pony-50 dark:text-pony-300
                         dark:hover:bg-slate-800`}"
                  >
                    <span class="text-xs font-medium">
                      {MONTHS[m.month - 1].slice(0, 3)}
                    </span>
                    <span
                      class="text-[10px]
                             {current === m.spec
                        ? 'text-pony-100'
                        : 'text-slate-400 dark:text-slate-500'}"
                    >
                      {formatCount(m.count)}
                    </span>
                  </a>
                {:else}
                  <span
                    class="flex flex-col items-center rounded px-1 py-0.5
                           leading-tight text-slate-300 dark:text-slate-700"
                    aria-hidden="true"
                  >
                    <span class="text-xs">
                      {MONTHS[m.month - 1].slice(0, 3)}
                    </span>
                    <span class="text-[10px]">&nbsp;</span>
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>

    {#if paged}
      <button
        type="button"
        onclick={() => page(1)}
        disabled={win.end >= years.length}
        aria-label="Show older years"
        title="Show older years"
        class="mt-2 flex w-full items-center justify-center rounded-md
               border border-slate-200 py-0.5 text-slate-600
               enabled:hover:bg-slate-50 focus:ring-2 focus:ring-pony-500
               focus:outline-none disabled:cursor-not-allowed
               disabled:opacity-40 dark:border-slate-800
               dark:text-slate-300 dark:enabled:hover:bg-slate-800"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    {/if}
  </div>
</nav>
