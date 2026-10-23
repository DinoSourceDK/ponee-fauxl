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
 Global composer modal (port of webui/js/source/composer.js). Driven
 entirely by the composer store; mounted once in App.svelte.
-->
<script lang="ts">
  import Modal from "../ui/Modal.svelte";
  import { compose as apiCompose } from "../../lib/api/client";
  import type { ComposeRequest } from "../../lib/api/types";
  import {
    mailtoNew,
    mailtoReply,
    quoteReply,
    replyAddress,
    replyReferences,
    replySubject,
  } from "../../lib/compose";
  import { OAUTH_URL } from "../../lib/routes";
  import { closeComposer, composer } from "../../lib/stores/compose.svelte";
  import { session } from "../../lib/stores/session.svelte";
  import { toast } from "../../lib/stores/toasts.svelte";

  const uid = $props.id();

  let subject = $state("");
  let body = $state("");
  let cc = $state("");
  let bcc = $state("");
  let error = $state("");
  let sending = $state(false);

  let subjectInput: HTMLInputElement | undefined = $state();
  let bodyInput: HTMLTextAreaElement | undefined = $state();

  const isReply = $derived(
    composer.mode === "reply" && composer.email !== null,
  );
  const listAddress = $derived(
    composer.to || (composer.email ? replyAddress(composer.email) : ""),
  );
  const title = $derived(
    isReply
      ? `Reply to email on ${listAddress}:`
      : `Start a new thread on ${listAddress}:`,
  );
  const mailto = $derived(
    isReply && composer.email
      ? mailtoReply(composer.email)
      : mailtoNew(listAddress),
  );
  const canSend = $derived(
    !sending &&
      subject.trim() !== "" &&
      body.trim() !== "" &&
      listAddress !== "",
  );

  // Rebuild the form each time the modal opens.
  $effect(() => {
    if (!composer.open) return;
    const email = composer.email;
    subject = isReply && email ? replySubject(email.subject) : "";
    body = isReply && email ? quoteReply(email) : "";
    cc = "";
    bcc = "";
    error = "";
    sending = false;
    // Modal focuses its first focusable in a microtask; override after it.
    setTimeout(() => {
      if (isReply) bodyInput?.focus();
      else subjectInput?.focus();
    }, 0);
  });

  async function send(): Promise<void> {
    if (!canSend) return;
    sending = true;
    error = "";
    const req: ComposeRequest = { to: listAddress, subject, body };
    if (cc.trim()) req.cc = cc.trim();
    if (bcc.trim()) req.bcc = bcc.trim();
    if (isReply && composer.email) {
      if (composer.email["message-id"]) {
        req["in-reply-to"] = composer.email["message-id"];
      }
      const refs = replyReferences(composer.email);
      if (refs) req.references = refs;
    }
    try {
      const res = await apiCompose(req);
      if (res.error) {
        error = res.error;
        return;
      }
      toast(
        "success",
        "Message dispatched! Depending on moderation, it may take a while before it appears in the archives.",
      );
      closeComposer();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      sending = false;
    }
  }

  const labelClass =
    "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";
  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 " +
    "text-sm text-slate-900 focus:ring-2 focus:ring-pony-500 " +
    "focus:outline-none dark:border-slate-700 dark:bg-slate-800 " +
    "dark:text-slate-100";
  const linkClass =
    "font-medium text-pony-600 hover:underline dark:text-pony-400";
</script>

<!-- Not dismissible: a stray Escape or click outside would discard the draft. -->
<Modal
  bind:open={composer.open}
  onclose={closeComposer}
  dismissible={false}
  wide
  {title}
>
  {#if !session.credentials}
    {#if isReply}
      <p class="text-sm text-slate-700 dark:text-slate-300">
        To reply from the web interface you need to be logged in first.
        <a href={OAUTH_URL} class={linkClass}>Log in</a>
      </p>
      <p class="mt-3 text-sm text-slate-700 dark:text-slate-300">
        You can still reply using your own email client:
        <a href={mailto} class={linkClass}>Reply via your email client</a>
      </p>
    {:else}
      <p class="text-sm text-slate-700 dark:text-slate-300">
        You need to be logged in before you can start a new thread.
        <a href={OAUTH_URL} class={linkClass}>Log in</a>
      </p>
    {/if}
  {:else}
    <form
      class="space-y-3"
      onsubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <p class="text-sm text-slate-700 dark:text-slate-300">
        <span class="font-semibold">Sending as:</span>
        {session.credentials.fullname} &lt;{session.credentials.email}&gt;
      </p>
      <p class="text-sm text-slate-700 dark:text-slate-300">
        <span class="font-semibold">To:</span>
        {listAddress}
      </p>
      {#if error}
        <div
          role="alert"
          class="rounded-md border border-red-200 bg-red-50 p-3 text-sm
                 text-red-800 dark:border-red-900 dark:bg-red-950/50
                 dark:text-red-200"
        >
          {error}
        </div>
      {/if}
      <div>
        <label for="{uid}-subject" class={labelClass}>Subject</label>
        <input
          id="{uid}-subject"
          type="text"
          bind:this={subjectInput}
          bind:value={subject}
          class={inputClass}
        />
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="{uid}-cc" class={labelClass}>Cc</label>
          <input
            id="{uid}-cc"
            type="text"
            bind:value={cc}
            class={inputClass}
          />
        </div>
        <div>
          <label for="{uid}-bcc" class={labelClass}>Bcc</label>
          <input
            id="{uid}-bcc"
            type="text"
            bind:value={bcc}
            class={inputClass}
          />
        </div>
      </div>
      <div>
        <label for="{uid}-body" class={labelClass}>
          {isReply ? "Reply" : "Message"}
        </label>
        <textarea
          id="{uid}-body"
          bind:this={bodyInput}
          bind:value={body}
          class="{inputClass} min-h-[320px] font-mono whitespace-pre"
        ></textarea>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!canSend}
          class="rounded-md bg-pony-600 px-3 py-1.5 text-sm font-medium
                 text-white hover:bg-pony-700 focus:ring-2 focus:ring-pony-500
                 focus:outline-none disabled:cursor-not-allowed
                 disabled:opacity-50 dark:bg-pony-700 dark:hover:bg-pony-600"
        >
          {sending ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          onclick={closeComposer}
          class="rounded-md border border-slate-300 px-3 py-1.5 text-sm
                 font-medium text-slate-700 hover:bg-slate-100 focus:ring-2
                 focus:ring-pony-500 focus:outline-none dark:border-slate-700
                 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <a
          href={mailto}
          class="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          or compose via your own email client
        </a>
      </div>
    </form>
  {/if}
</Modal>
