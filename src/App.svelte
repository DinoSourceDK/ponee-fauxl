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
  import { route, link } from "./lib/router.svelte";
  import { resolveRoute } from "./lib/routes";
  import { loadSession } from "./lib/stores/session.svelte";
  import { prefs } from "./lib/stores/prefs.svelte";
  import { startPreferenceSync } from "./lib/stores/prefsync.svelte";
  import { uiStyleFromSearch } from "./lib/uistyle";
  import { installKeyboard, registerShortcut } from "./lib/keyboard";
  import {
    composer,
    openComposer,
    replyCandidate,
  } from "./lib/stores/compose.svelte";
  import { SOFTWARE_VERSION } from "./lib/version";
  import Header from "./components/Header.svelte";
  import Composer from "./components/compose/Composer.svelte";
  import GuideTour from "./components/ui/GuideTour.svelte";
  import HelpModal from "./components/ui/HelpModal.svelte";
  import Toast from "./components/ui/Toast.svelte";
  import ApiDocsPage from "./pages/ApiDocsPage.svelte";
  import HomePage from "./pages/HomePage.svelte";
  import ListPage from "./pages/ListPage.svelte";
  import ThreadPage from "./pages/ThreadPage.svelte";
  import OAuthPage from "./pages/OAuthPage.svelte";
  import AdminPage from "./pages/AdminPage.svelte";
  import NotFoundPage from "./pages/NotFoundPage.svelte";

  const resolved = $derived(resolveRoute(route));

  let helpOpen = $state(false);

  // Load login state + archive overview once at startup.
  loadSession();
  startPreferenceSync();

  // A ?ui=forum / ?ui=standard parameter on any URL switches (and
  // persists) the layout. Only the URL is tracked here, so the header
  // toggle is never fought while the parameter lingers in the address.
  $effect(() => {
    const style = uiStyleFromSearch(route.search);
    if (!style) return;
    untrack(() => {
      if (prefs.uiStyle !== style) prefs.uiStyle = style;
    });
  });

  // Global keyboard handling for the app's lifetime.
  $effect(() => {
    const uninstall = installKeyboard();
    const disposers = [
      registerShortcut({
        key: "h",
        description: "Show keyboard shortcuts",
        handler: () => (helpOpen = true),
      }),
      registerShortcut({
        key: "r",
        description: "Reply to the shown email",
        when: () => replyCandidate.email !== null && !composer.open,
        handler: () =>
          openComposer({ mode: "reply", email: replyCandidate.email! }),
      }),
    ];
    return () => {
      for (const dispose of disposers) dispose();
      uninstall();
    };
  });
</script>

<div class="min-h-screen flex flex-col" use:link>
  <Header onhelp={() => (helpOpen = true)} />
  <main class="flex-1">
    {#if resolved.page === "home"}
      <HomePage />
    {:else if resolved.page === "list"}
      <ListPage />
    {:else if resolved.page === "thread"}
      <ThreadPage id={resolved.id} />
    {:else if resolved.page === "oauth"}
      <OAuthPage />
    {:else if resolved.page === "admin"}
      <AdminPage mid={resolved.mid} />
    {:else if resolved.page === "apidocs"}
      <ApiDocsPage />
    {:else}
      <NotFoundPage />
    {/if}
  </main>
  <!-- Software identity (the site title lives in config.json / Header). -->
  <footer
    class="border-t border-slate-200 px-4 py-3 text-center text-xs
           text-slate-400 dark:border-slate-800 dark:text-slate-500"
  >
    {SOFTWARE_VERSION}
    <span aria-hidden="true">&middot;</span>
    <a href="/apidocs.html" class="hover:text-slate-600 hover:underline dark:hover:text-slate-300">
      API
    </a>
  </footer>
  <HelpModal bind:open={helpOpen} />
  <Composer />
  <Toast />
  <GuideTour />
</div>
