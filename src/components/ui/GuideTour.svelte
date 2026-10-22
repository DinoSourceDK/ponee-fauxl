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
  First-visit coach marks: a small floating card walks through the
  basics, anchored to the real controls via data-guide attributes with
  a soft highlight ring. Deliberately non-modal. No backdrop, nothing
  is blocked, the page stays fully usable and Escape or the ✕ ends the
  tour at any point. Tours are page-aware: the front page introduces
  browsing and the layout toggle, while list pages cover the controls
  that actually live there (view modes, favorite stars, replying).
  Every page/layout combination has its own seen-flag in localStorage,
  so each tour shows exactly once.
-->
<script lang="ts">
  import { route } from "../../lib/router.svelte";
  import { resolveRoute } from "../../lib/routes";
  import { favorites } from "../../lib/stores/favorites.svelte";
  import { prefs } from "../../lib/stores/prefs.svelte";
  import { session } from "../../lib/stores/session.svelte";

  interface Step {
    /** data-guide anchor; the card floats bottom-right without one. */
    target?: string;
    title: string;
    body: string;
  }

  const REPLY_STEP: Step = {
    target: "login",
    title: "Join the conversation",
    body:
      "Log in to reply to threads or start new ones. On a list page, " +
      "the C key opens the composer straight away.",
  };

  const FAVORITES_STEP: Step = {
    target: "favstar",
    title: "Star your lists",
    body:
      "On a project's landing page, the star next to a list pins it to " +
      "“Favorite lists” on the front page, your own cross-project space.",
  };

  const TOURS: Record<string, Step[]> = {
    // Front page: what the archive is and how to change its shape.
    standard: [
      {
        target: "directory",
        title: "Browse the archives",
        body:
          "Every project groups its mailing lists here. Pick a list to " +
          "read its discussions, or filter to find one quickly.",
      },
      {
        target: "project",
        title: "Project summaries",
        body:
          "A project's name links to its activity summary: recent " +
          "discussions, trending topics, top contributors and all of " +
          "its lists in one place.",
      },
      {
        target: "layout",
        title: "Prefer a forum?",
        body:
          "This toggle flips the whole archive into a forum-style " +
          "layout with topics, trending discussions and favorites, " +
          "and back.",
      },
    ],
    // Shown once the first starred list makes the entry appear.
    favorites: [
      {
        target: "favlists",
        title: "Your favorite lists",
        body:
          "Starred lists gather here: one combined activity summary " +
          "with trending topics and contributors across every list " +
          "you follow.",
      },
    ],
    forum: [
      {
        target: "directory",
        title: "Forums are projects",
        body:
          "Each project space is a forum. Open one for its mailing " +
          "lists, top contributors, latest activity and trending topics.",
      },
      {
        target: "layout",
        title: "Back to classic",
        body:
          "The same toggle returns to the standard archive layout " +
          "whenever you like.",
      },
    ],
    // List pages: the controls that live here.
    "list-standard": [
      {
        target: "viewmode",
        title: "Pick your view",
        body:
          "Discussions render threaded, flat or as a collapsible tree. " +
          "Switch modes any time; the choice sticks.",
      },
      FAVORITES_STEP,
      REPLY_STEP,
    ],
    "list-forum": [FAVORITES_STEP, REPLY_STEP],
  };

  const KEY_PREFIX = "ponymail-guide-";

  // Bumped whenever a tour ends, so tourKey re-evaluates the remaining
  // candidates (localStorage flags are not reactive by themselves).
  let tourDone = $state(0);

  // The next unseen tour for this page/layout (null when caught up).
  // The home page can queue two: its own tour, then the favorites
  // pointer once the first starred list makes that entry appear.
  const tourKey = $derived.by(() => {
    void tourDone;
    const page = resolveRoute(route).page;
    const layout = prefs.uiStyle === "forum" ? "forum" : "standard";
    const candidates: string[] = [];
    if (page === "home") {
      candidates.push(layout);
      if (favorites.lists.length > 0) candidates.push("favorites");
    } else if (page === "list") {
      candidates.push(`list-${layout}`);
    }
    return candidates.find((k) => !hasSeen(k)) ?? null;
  });

  let activeKey = $state<string | null>(null);
  let step = $state(0);
  let rect = $state<DOMRect | null>(null);

  // A login pitch is moot for anyone logged in now or ever before (the
  // flag below survives logouts), so those steps are filtered out.
  const LOGIN_FLAG = "ponymail-was-logged-in";
  function everLoggedIn(): boolean {
    try {
      return localStorage.getItem(LOGIN_FLAG) === "1";
    } catch {
      return false;
    }
  }
  $effect(() => {
    if (!session.credentials) return;
    try {
      localStorage.setItem(LOGIN_FLAG, "1");
    } catch {
      // ignore: the step just reappears for storage-less sessions
    }
  });
  const skipLogin = $derived(!!session.credentials || everLoggedIn());

  function tourSteps(key: string): Step[] {
    const all = TOURS[key] ?? [];
    return skipLogin ? all.filter((s) => s.target !== "login") : all;
  }

  const steps = $derived(activeKey ? tourSteps(activeKey) : []);

  // Logging in mid-tour can shrink the step list under the cursor.
  $effect(() => {
    if (steps.length > 0 && step >= steps.length) step = steps.length - 1;
  });

  function hasSeen(m: string): boolean {
    try {
      return localStorage.getItem(KEY_PREFIX + m) === "1";
    } catch {
      return true; // storage unavailable: never nag on every load
    }
  }
  function markSeen(m: string): void {
    try {
      localStorage.setItem(KEY_PREFIX + m, "1");
    } catch {
      // ignore: the tour simply reappears next visit
    }
  }

  // First visit per page/layout: start its tour once the page has
  // settled. Any dismissal marks it seen; visiting the other page or
  // layout later triggers that tour once.
  $effect(() => {
    const key = tourKey;
    if (activeKey !== null || !key || hasSeen(key)) return;
    const timer = setTimeout(() => {
      if (tourSteps(key).length === 0) {
        // Everything this tour would say is moot: retire it silently.
        markSeen(key);
        tourDone += 1;
        return;
      }
      activeKey = key;
      step = 0;
    }, 900);
    return () => clearTimeout(timer);
  });

  function close(): void {
    if (activeKey !== null) markSeen(activeKey);
    activeKey = null;
    step = 0;
    tourDone += 1;
  }
  function next(): void {
    if (step < steps.length - 1) {
      step += 1;
    } else {
      close();
    }
  }

  // Follow the step's anchor across navigation, scrolling and resizes;
  // a missing or detached anchor floats the card instead.
  $effect(() => {
    if (activeKey === null) {
      rect = null;
      return;
    }
    void route.path;
    void route.search;
    const sel = steps[step]?.target;
    const el = sel
      ? document.querySelector<HTMLElement>(`[data-guide="${sel}"]`)
      : null;
    if (!el) {
      rect = null;
      return;
    }
    const update = (): void => {
      rect = el.isConnected ? el.getBoundingClientRect() : null;
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  });

  $effect(() => {
    if (activeKey === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Below the anchor when there is room, above it otherwise; always
  // clamped inside the viewport. Degenerate viewport reports (hidden
  // or prerendering windows can say 0) default to placing below.
  const CARD_W = 320;
  const cardStyle = $derived.by(() => {
    if (!rect) return "";
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const left = Math.max(12, Math.min(rect.left, vw - CARD_W - 12));
    const below = rect.bottom + 10;
    if (vh < 240 || below + 200 < vh) {
      return `top: ${below}px; left: ${left}px;`;
    }
    return `bottom: ${vh - rect.top + 10}px; left: ${left}px;`;
  });

  const btn =
    "rounded-md px-2.5 py-1 text-sm font-medium focus:ring-2 " +
    "focus:ring-pony-500 focus:outline-none";
</script>

{#if activeKey !== null && steps[step]}
  {#if rect}
    <!-- Soft highlight around the anchor; never intercepts clicks. -->
    <div
      class="pointer-events-none fixed z-40 rounded-lg ring-2 ring-pony-500
             transition-all duration-200 dark:ring-pony-400"
      style="top: {rect.top - 5}px; left: {rect.left - 5}px;
             width: {rect.width + 10}px; height: {rect.height + 10}px;"
      aria-hidden="true"
    ></div>
  {/if}

  <div
    role="dialog"
    aria-label="Quick tour, step {step + 1} of {steps.length}"
    class="fixed z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border
           border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700
           dark:bg-slate-900 {rect ? '' : 'right-4 bottom-4'}"
    style={rect ? cardStyle : ""}
  >
    <div class="flex items-start justify-between gap-2">
      <h2 class="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {steps[step].title}
      </h2>
      <button
        type="button"
        onclick={close}
        aria-label="Dismiss the tour"
        class="-mt-1 -mr-1 rounded-md p-1 text-slate-400
               hover:text-slate-600 focus:ring-2 focus:ring-pony-500
               focus:outline-none dark:hover:text-slate-200"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
    <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
      {steps[step].body}
    </p>
    <div class="mt-3 flex items-center justify-between">
      <span
        class="flex items-center gap-1"
        role="img"
        aria-label="Step {step + 1} of {steps.length}"
      >
        {#each steps as _, i (i)}
          <span
            class="h-1.5 w-1.5 rounded-full {i === step
              ? 'bg-pony-600 dark:bg-pony-300'
              : 'bg-slate-300 dark:bg-slate-600'}"
          ></span>
        {/each}
      </span>
      <span class="flex items-center gap-1.5">
        {#if step < steps.length - 1}
          <button
            type="button"
            onclick={close}
            class="{btn} text-slate-500 hover:text-slate-700
                   dark:text-slate-400 dark:hover:text-slate-200"
          >
            Skip
          </button>
        {/if}
        {#if step > 0}
          <button
            type="button"
            onclick={() => (step -= 1)}
            class="{btn} border border-slate-300 text-slate-700
                   hover:bg-slate-50 dark:border-slate-700
                   dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back
          </button>
        {/if}
        <button
          type="button"
          onclick={next}
          class="{btn} bg-pony-600 text-white hover:bg-pony-700
                 dark:hover:bg-pony-500"
        >
          {step < steps.length - 1 ? "Next" : "Got it"}
        </button>
      </span>
    </div>
  </div>
{/if}
