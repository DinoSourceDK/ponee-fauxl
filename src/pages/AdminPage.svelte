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
   * Admin console (port of webui/admin.html + mgmt.js):
   *   /admin.html        the audit log, plus a lookup to open any email
   *   /admin.html/<mid>  the editor for one email
   * The server enforces access (mgmt.json answers 403 unless the session
   * is an admin and the console is enabled); the gate here only saves
   * non-admins a page of errors.
   */
  import { lookupId } from "../lib/admin";
  import { config } from "../lib/config";
  import { navigate } from "../lib/router.svelte";
  import { OAUTH_URL, adminUrl } from "../lib/routes";
  import { session } from "../lib/stores/session.svelte";
  import { toast } from "../lib/stores/toasts.svelte";
  import AuditLog from "../components/admin/AuditLog.svelte";
  import EmailEditor from "../components/admin/EmailEditor.svelte";
  import Skeleton from "../components/ui/Skeleton.svelte";

  let { mid }: { mid?: string } = $props();

  let lookup = $state("");

  function openLookup(event: SubmitEvent): void {
    event.preventDefault();
    const id = lookupId(lookup);
    if (!id) {
      toast("error", "Enter an email ID or a thread permalink.");
      return;
    }
    lookup = "";
    navigate(adminUrl(id));
  }

  const originalTitle = document.title;
  $effect(() => {
    document.title = `${mid ? "Edit email" : "Admin console"} - ${config.title}`;
    return () => {
      document.title = originalTitle;
    };
  });
</script>

<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6">
  {#if !session.loaded}
    <Skeleton rows={6} />
  {:else if !session.credentials}
    <div
      class="mx-auto max-w-2xl rounded-md border border-amber-300 bg-amber-50
             p-4 text-sm text-amber-900 dark:border-amber-800
             dark:bg-amber-950 dark:text-amber-200"
    >
      <p class="font-semibold">Login required</p>
      <p class="mt-1">The admin console is only available to administrators.</p>
      <a
        href={OAUTH_URL}
        class="mt-3 inline-block rounded-md border border-amber-400 px-3
               py-1.5 font-medium hover:bg-amber-100 dark:border-amber-700
               dark:hover:bg-amber-900/50"
      >
        Log in
      </a>
    </div>
  {:else if !session.credentials.admin}
    <div
      class="mx-auto max-w-2xl rounded-md border border-red-200 bg-red-50 p-4
             text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50
             dark:text-red-200"
      role="alert"
    >
      <p class="font-semibold">No administrative access</p>
      <p class="mt-1">
        You are logged in as {session.credentials.email}, which is not an
        administrator of this archive.
      </p>
    </div>
  {:else if mid}
    <EmailEditor {mid} />
  {:else}
    <div class="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
      <h1
        class="mr-auto text-xl font-semibold text-slate-900 dark:text-slate-100"
      >
        Admin console
      </h1>
      <form class="flex w-full gap-2 sm:w-auto" onsubmit={openLookup}>
        <label for="adm-lookup" class="sr-only">Email ID or permalink</label>
        <input
          id="adm-lookup"
          bind:value={lookup}
          placeholder="Email ID or permalink"
          autocomplete="off"
          spellcheck="false"
          class="min-w-0 flex-1 rounded-md border border-slate-300 bg-white
                 px-2.5 py-1.5 text-sm text-slate-900 focus:border-pony-500
                 focus:ring-2 focus:ring-pony-500/30 focus:outline-none
                 sm:w-80 dark:border-slate-700 dark:bg-slate-950
                 dark:text-slate-100"
        />
        <button
          type="submit"
          class="rounded-md bg-pony-600 px-3 py-1.5 text-sm font-medium
                 text-white hover:bg-pony-700 focus:ring-2 focus:ring-pony-400
                 focus:outline-none"
        >
          Edit email
        </button>
      </form>
    </div>
    <AuditLog />
  {/if}
</div>
