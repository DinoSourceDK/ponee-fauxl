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
   * Inline thread/email expansion, mounted inside a list view under a row.
   * `single` renders just the one email; otherwise the whole thread. Also
   * owns the message-source modal for the emails it shows.
   */
  import {
    ApiError,
    email as fetchEmail,
    source as fetchSource,
    thread as fetchThread,
    saveBlob,
  } from "../../lib/api/client";
  import type { EmailResponse, ThreadNode } from "../../lib/api/types";
  import { config } from "../../lib/config";
  import { replyCandidate } from "../../lib/stores/compose.svelte";
  import { toast } from "../../lib/stores/toasts.svelte";
  import Modal from "../ui/Modal.svelte";
  import Skeleton from "../ui/Skeleton.svelte";
  import EmailDisplay from "./EmailDisplay.svelte";
  import ThreadView from "./ThreadView.svelte";

  interface Props {
    tid: string;
    listid?: string;
    single?: boolean;
  }

  let { tid, listid, single = false }: Props = $props();

  type Phase = "loading" | "ok" | "notfound" | "error";
  let phase: Phase = $state("loading");
  let errorMsg = $state("");
  let threadRoot: ThreadNode | null = $state(null);
  let emails: EmailResponse[] = $state([]);
  let singleEmail: EmailResponse | null = $state(null);

  let loadToken = 0;

  async function load(
    id: string,
    lid: string | undefined,
    one: boolean,
  ): Promise<void> {
    const t = ++loadToken;
    phase = "loading";
    try {
      if (one) {
        const eml = await fetchEmail(id, lid);
        if (t !== loadToken) return;
        singleEmail = eml;
        threadRoot = null;
        emails = [];
      } else {
        const res = await fetchThread(id, lid ? { listid: lid } : undefined);
        if (t !== loadToken) return;
        threadRoot = res.thread;
        emails = res.emails ?? [];
        singleEmail = null;
      }
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
    void load(tid, listid, single);
  });

  // The expanded email/thread root is the target of the global "R"
  // (reply) shortcut while this inline view is open.
  $effect(() => {
    replyCandidate.email =
      phase === "ok"
        ? (singleEmail ?? threadRoot ?? emails[0] ?? null)
        : null;
    return () => {
      replyCandidate.email = null;
    };
  });

  /* Message-source modal, shared by every email shown here. */
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

<div
  class="rounded-b-md border border-slate-200 bg-slate-50 p-3
         dark:border-slate-800 dark:bg-slate-950/50"
>
  {#if phase === "loading"}
    <Skeleton rows={4} />
  {:else if phase === "notfound"}
    <div
      class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm
             text-amber-900 dark:border-amber-800 dark:bg-amber-950
             dark:text-amber-200"
    >
      This email could not be found. It may be private. Try logging in.
      {#if config.permErrorPostface}
        {" "}{config.permErrorPostface}
      {/if}
    </div>
  {:else if phase === "error"}
    <div
      class="rounded-md border border-red-200 bg-red-50 p-3 text-sm
             text-red-800 dark:border-red-900 dark:bg-red-950/50
             dark:text-red-200"
      role="alert"
    >
      <p class="break-words">{errorMsg}</p>
      <button
        type="button"
        onclick={() => load(tid, listid, single)}
        class="mt-2 rounded-md border border-red-300 px-3 py-1.5 font-medium
               hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/50"
      >
        Try again
      </button>
    </div>
  {:else if single && singleEmail}
    <EmailDisplay email={singleEmail} isRoot onsource={showSource} />
  {:else if threadRoot}
    <ThreadView node={threadRoot} onsource={showSource} />
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
