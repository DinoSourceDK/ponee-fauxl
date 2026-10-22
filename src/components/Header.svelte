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
  import { config } from "../lib/config";
  import { navigate } from "../lib/router.svelte";
  import { prefs } from "../lib/stores/prefs.svelte";
  import type { Theme } from "../lib/stores/prefs.svelte";
  import { session, doLogout } from "../lib/stores/session.svelte";
  import { toast } from "../lib/stores/toasts.svelte";
  import Avatar from "./ui/Avatar.svelte";
  import Dropdown from "./ui/Dropdown.svelte";

  interface Props {
    /** Opens the keyboard-shortcuts help modal (owned by App). */
    onhelp: () => void;
  }

  let { onhelp }: Props = $props();

  const THEME_ORDER: Theme[] = ["auto", "light", "dark"];
  const nextTheme = $derived(
    THEME_ORDER[(THEME_ORDER.indexOf(prefs.theme) + 1) % THEME_ORDER.length],
  );
  const themeLabel = $derived(
    `Theme: ${prefs.theme} (switch to ${nextTheme})`,
  );

  const forumStyle = $derived(prefs.uiStyle === "forum");
  const uiStyleLabel = $derived(
    forumStyle ? "Switch to standard layout" : "Switch to forum layout",
  );

  const creds = $derived(session.credentials);

  const iconButton =
    "rounded-md p-1.5 text-pony-100 hover:bg-pony-600 hover:text-white " +
    "focus:ring-2 focus:ring-pony-300 focus:outline-none dark:hover:bg-pony-800";
  const menuItem =
    "block w-full px-3 py-1.5 text-left text-sm text-slate-700 " +
    "hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800";

  async function logOut(): Promise<void> {
    try {
      await doLogout();
      toast("success", "Logged out.");
      navigate("/");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    }
  }
</script>

<header
  class="flex items-center justify-between gap-3 bg-pony-700 px-4 py-2.5
         text-white dark:bg-pony-900"
>
  <a href="/" class="flex items-center gap-2.5 text-xl font-semibold">
    <img src={config.logo} alt="" class="h-8 w-auto" />
    {config.title}
  </a>

  <div class="flex items-center gap-1.5">
    <button
      type="button"
      aria-label={themeLabel}
      title={themeLabel}
      class={iconButton}
      onclick={() => (prefs.theme = nextTheme)}
    >
      {#if prefs.theme === "light"}
        <svg
          viewBox="0 0 24 24"
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          />
        </svg>
      {:else if prefs.theme === "dark"}
        <svg
          viewBox="0 0 24 24"
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      {:else}
        <svg
          viewBox="0 0 24 24"
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </svg>
      {/if}
    </button>

    <button
      type="button"
      aria-pressed={forumStyle}
      aria-label={uiStyleLabel}
      title={uiStyleLabel}
      class={iconButton}
      data-guide="layout"
      onclick={() => (prefs.uiStyle = forumStyle ? "standard" : "forum")}
    >
      {#if forumStyle}
        <!-- Forum layout active: message-square/chat bubble. -->
        <svg
          viewBox="0 0 24 24"
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      {:else}
        <!-- Standard layout active: three horizontal lines (list). -->
        <svg
          viewBox="0 0 24 24"
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      {/if}
    </button>

    <button
      type="button"
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (H)"
      class={iconButton}
      onclick={onhelp}
    >
      <svg
        viewBox="0 0 24 24"
        class="h-5 w-5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
    </button>

    {#if !session.loaded}
      <div
        class="ml-1 h-7 w-7 animate-pulse rounded-full bg-pony-600
               dark:bg-pony-800"
        role="status"
        aria-label="Loading session"
      ></div>
    {:else if creds}
      <Dropdown align="right">
        {#snippet label()}
          <!-- No client-side md5: empty hash makes Avatar render its
               identicon directly (no doomed gravatar request). -->
          <Avatar md5="" name={creds?.fullname ?? "Account"} size={24} />
        {/snippet}
        <div class="border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <p
            class="truncate text-sm font-medium text-slate-800
                   dark:text-slate-100"
          >
            {creds?.fullname}
          </p>
          <p class="truncate text-xs text-slate-500 dark:text-slate-400">
            {creds?.email}
          </p>
        </div>
        {#if creds?.admin}
          <a role="menuitem" href="/admin.html" class={menuItem}>
            Admin console
          </a>
        {/if}
        <button type="button" role="menuitem" class={menuItem} onclick={logOut}>
          Log out
        </button>
      </Dropdown>
    {:else}
      <a
        href="/oauth.html"
        data-guide="login"
        class="ml-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-pony-100
               hover:bg-pony-600 hover:text-white focus:ring-2
               focus:ring-pony-300 focus:outline-none dark:hover:bg-pony-800"
      >
        Log in
      </a>
    {/if}
  </div>
</header>
