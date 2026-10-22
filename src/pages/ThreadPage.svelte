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
   * Thread permalink page: /thread/<id>[?find_parent=true], or the legacy
   * /thread/<message-id>?<list-id> form, which redirects to /thread/<id>.
   */
  import {
    ApiError,
    source as fetchSource,
    thread as fetchThread,
    saveBlob,
  } from "../lib/api/client";
  import type { EmailResponse, ThreadNode } from "../lib/api/types";
  import { config } from "../lib/config";
  import { monthSpec } from "../lib/dates";
  import { emailListAddress } from "../lib/listview";
  import { navigate, route } from "../lib/router.svelte";
  import { permalinkListId, threadUrl } from "../lib/routes";
  import { replyCandidate } from "../lib/stores/compose.svelte";
  import { prefs } from "../lib/stores/prefs.svelte";
  import { listUrl } from "../lib/search";
  import { unshortenID } from "../lib/shortid";
  import { toast } from "../lib/stores/toasts.svelte";
  import EmailDisplay from "../components/email/EmailDisplay.svelte";
  import ThreadView from "../components/email/ThreadView.svelte";
  import TopicView from "../components/forum/TopicView.svelte";
  import Modal from "../components/ui/Modal.svelte";
  import Skeleton from "../components/ui/Skeleton.svelte";

  let { id }: { id: string } = $props();

  // Legacy Z…/B… short links decode to the full document id.
  const unshortened = $derived(unshortenID(id));
  const findParent = $derived(
    new URLSearchParams(route.search).get("find_parent") === "true",
  );
  // Set when `id` is a Message-ID that needs a List-ID to disambiguate.
  const listid = $derived(permalinkListId(route.search));

  type Phase = "loading" | "ok" | "notfound" | "error";
  let phase: Phase = $state("loading");
  let errorMsg = $state("");
  let threadRoot: ThreadNode | null = $state(null);
  let emails: EmailResponse[] = $state([]);
  let loadToken = 0;

  async function load(
    tid: string,
    parent: boolean,
    lid: string | null,
  ): Promise<void> {
    const t = ++loadToken;
    phase = "loading";
    try {
      const res = await fetchThread(
        tid,
        lid ? { listid: lid } : parent ? { findParent: true } : undefined,
      );
      if (t !== loadToken) return;
      // Message-ID lookup: move to the canonical permalink of the thread.
      if (lid && res.thread?.id) {
        navigate(`/thread/${encodeURIComponent(res.thread.id)}`, {
          replace: true,
        });
        return;
      }
      threadRoot = res.thread;
      emails = res.emails ?? [];
      phase = "ok";
    } catch (e) {
      if (t !== loadToken) return;
      if (e instanceof ApiError && e.status === 404) {
        phase = "notfound";
      } else {
        errorMsg = e instanceof Error ? e.message : String(e);
        phase = "error";
      }
    }
  }

  $effect(() => {
    // Message-IDs are never short links, so skip unshortening them.
    void load(listid ? id : unshortened, findParent, listid);
  });

  const root = $derived(threadRoot ?? emails[0] ?? null);

  // The shown thread root is the target of the global "R" (reply) shortcut.
  $effect(() => {
    replyCandidate.email = phase === "ok" ? root : null;
    return () => {
      replyCandidate.email = null;
    };
  });

  const rootList = $derived.by(() => {
    if (!root) return null;
    const addr = emailListAddress(root);
    const at = addr.indexOf("@");
    if (at < 0) return null;
    const d = new Date(root.epoch * 1000);
    return {
      addr,
      url: listUrl({
        lists: [{ list: addr.slice(0, at), domain: addr.slice(at + 1) }],
        date: monthSpec(d.getUTCFullYear(), d.getUTCMonth() + 1),
        headers: {},
      }),
    };
  });

  const parentUrl = $derived(`${threadUrl(id)}?find_parent=true`);
  // $derived.by: inline $derived would narrow `phase` to its initial value.
  const showParentHint = $derived.by(
    () =>
      phase === "ok" &&
      !findParent &&
      !!threadRoot &&
      !!threadRoot["in-reply-to"],
  );

  function copyPermalink(): void {
    const link = location.origin + threadUrl(root?.id ?? unshortened);
    navigator.clipboard
      .writeText(link)
      .then(() => toast("success", "Permalink copied to clipboard."))
      .catch((e: unknown) =>
        toast(
          "error",
          `Could not copy permalink: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
  }

  const originalTitle = document.title;
  $effect(() => {
    const subject = root?.subject;
    if (subject) document.title = `${subject} - ${config.title}`;
    return () => {
      document.title = originalTitle;
    };
  });

  /* Message-source modal (same mechanism as InlineThread). */
  let sourceOpen = $state(false);
  let sourceEmail: EmailResponse | null = $state(null);
  let sourceText = $state("");
  let sourceError = $state("");
  let sourceLoading = $state(false);
  let sourceToken = 0;

  async function showSource(eml: EmailResponse): Promise<void> {
    const t = ++sourceToken;
    sourceEmail = eml;
    sourceOpen = true;
    sourceText = "";
    sourceError = "";
    sourceLoading = true;
    try {
      const text = await fetchSource(eml.mid);
      if (t !== sourceToken) return;
      sourceText = text;
    } catch (e) {
      if (t !== sourceToken) return;
      sourceError = e instanceof Error ? e.message : String(e);
    } finally {
      if (t === sourceToken) sourceLoading = false;
    }
  }

  function downloadSource(): void {
    if (!sourceEmail) return;
    saveBlob(
      new Blob([sourceText], { type: "message/rfc822" }),
      `${sourceEmail.mid}.eml`,
    );
  }

  function copySource(): void {
    navigator.clipboard
      .writeText(sourceText)
      .then(() => toast("success", "Message source copied to clipboard."))
      .catch((e: unknown) =>
        toast(
          "error",
          `Could not copy source: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
  }

  const modalBtn =
    "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium " +
    "text-slate-700 hover:bg-slate-100 focus:ring-2 focus:ring-pony-500 " +
    "focus:outline-none dark:border-slate-700 dark:text-slate-200 " +
    "dark:hover:bg-slate-800";
</script>

<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6">
  {#if phase === "loading"}
    <div class="animate-pulse" aria-hidden="true">
      <div class="mb-6 h-8 w-2/3 rounded-md bg-slate-200 dark:bg-slate-800"></div>
    </div>
    <Skeleton rows={8} />
  {:else if phase === "notfound"}
    <div
      class="mx-auto max-w-2xl rounded-md border border-amber-300 bg-amber-50
             p-4 text-sm text-amber-900 dark:border-amber-800
             dark:bg-amber-950 dark:text-amber-200"
    >
      <p class="font-semibold">Thread not found</p>
      <p class="mt-1">
        This thread was not found or is private. Try logging in.
        {#if config.permErrorPostface}
          {" "}{config.permErrorPostface}
        {/if}
      </p>
      <a
        href="/oauth.html"
        class="mt-3 inline-block rounded-md border border-amber-400 px-3
               py-1.5 font-medium hover:bg-amber-100 dark:border-amber-700
               dark:hover:bg-amber-900/50"
      >
        Log in
      </a>
    </div>
  {:else if phase === "error"}
    <div
      class="mx-auto max-w-2xl rounded-md border border-red-200 bg-red-50 p-4
             text-red-800 dark:border-red-900 dark:bg-red-950/50
             dark:text-red-200"
      role="alert"
    >
      <p class="font-semibold">Could not load this thread</p>
      <p class="mt-1 text-sm break-words">{errorMsg}</p>
      <button
        type="button"
        onclick={() => load(listid ? id : unshortened, findParent, listid)}
        class="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm
               font-medium hover:bg-red-100 dark:border-red-800
               dark:hover:bg-red-900/50"
      >
        Try again
      </button>
    </div>
  {:else}
    <div class="mb-4">
      {#if rootList}
        <a
          href={rootList.url}
          class="text-sm text-pony-600 hover:underline dark:text-pony-300"
        >
          &lsaquo; Back to {rootList.addr}
        </a>
      {/if}
      <div class="mt-1 flex items-start gap-2">
        <h1
          class="min-w-0 flex-1 text-xl font-semibold break-words
                 text-slate-900 dark:text-slate-100"
        >
          {root?.subject ?? "(no subject)"}
        </h1>
        <button
          type="button"
          title="Copy permalink"
          aria-label="Copy permalink"
          onclick={copyPermalink}
          class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100
                 hover:text-slate-700 focus:ring-2 focus:ring-pony-500
                 focus:outline-none dark:text-slate-400 dark:hover:bg-slate-800
                 dark:hover:text-slate-200"
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
            <path
              d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
            />
            <path
              d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
            />
          </svg>
        </button>
      </div>
    </div>

    {#if showParentHint}
      <div
        class="mb-4 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm
               text-sky-900 dark:border-sky-800 dark:bg-sky-950
               dark:text-sky-200"
      >
        This may not be the start of the conversation.
        <a href={parentUrl} class="font-medium underline">
          Show from the parent email
        </a>
      </div>
    {/if}

    {#if threadRoot}
      {#if prefs.uiStyle === "forum"}
        <!-- Forum layout: the thread as a flat chronological post stream. -->
        <TopicView thread={threadRoot} onsource={showSource} />
      {:else}
        <ThreadView
          node={threadRoot}
          open={findParent ? unshortened : undefined}
          onsource={showSource}
        />
      {/if}
    {:else if emails.length > 0}
      <!-- No thread structure returned: show the emails flat. -->
      <div class="space-y-3">
        {#each emails as eml, i (i)}
          <EmailDisplay email={eml} isRoot={i === 0} onsource={showSource} />
        {/each}
      </div>
    {:else}
      <p class="text-sm text-slate-500 dark:text-slate-400">
        This thread contains no visible emails.
      </p>
    {/if}
  {/if}
</div>

<Modal
  bind:open={sourceOpen}
  title={sourceEmail ? `Source: ${sourceEmail.subject}` : "Message source"}
  wide
>
  {#if sourceLoading}
    <Skeleton rows={6} compact />
  {:else if sourceError}
    <p class="text-sm text-red-700 dark:text-red-300">{sourceError}</p>
  {:else}
    <div class="mb-2 flex gap-2">
      <button type="button" class={modalBtn} onclick={downloadSource}>
        Download
      </button>
      <button type="button" class={modalBtn} onclick={copySource}>
        Copy
      </button>
    </div>
    <pre
      class="max-h-[70vh] overflow-auto rounded-md bg-slate-100 p-2 text-xs
             dark:bg-slate-950">{sourceText}</pre>
  {/if}
</Modal>
