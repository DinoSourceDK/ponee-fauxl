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
  import type { EmailResponse } from "../../lib/api/types";
  import { formatDate, relativeTime, utcIso } from "../../lib/dates";
  import { emailListAddress } from "../../lib/listview";
  import { adminUrl, threadUrl } from "../../lib/routes";
  import { listUrl } from "../../lib/search";
  import { openComposer } from "../../lib/stores/compose.svelte";
  import { prefs } from "../../lib/stores/prefs.svelte";
  import { session } from "../../lib/stores/session.svelte";
  import { toast } from "../../lib/stores/toasts.svelte";
  import Avatar from "../ui/Avatar.svelte";
  import Attachments from "./Attachments.svelte";
  import EmailBody from "./EmailBody.svelte";

  interface Props {
    email: EmailResponse;
    isRoot?: boolean;
    /** Opens the source modal owned by ThreadPage / InlineThread. */
    onsource?: (email: EmailResponse) => void;
  }

  let { email, isRoot = false, onsource }: Props = $props();

  // "Name <a@b>" → name + address; anonymized senders ("th...@a.org")
  // have no address part and are shown as-is.
  const sender = $derived.by(() => {
    const m = /^\s*"?([^"<]*?)"?\s*<([^>]*)>\s*$/.exec(email.from);
    if (m) return { name: m[1] || m[2], address: m[2] };
    return { name: email.from, address: "" };
  });

  const listAddr = $derived(emailListAddress(email));

  const listSpec = $derived.by(() => {
    const at = listAddr.indexOf("@");
    if (at < 0) return null;
    return { list: listAddr.slice(0, at), domain: listAddr.slice(at + 1) };
  });

  const threadPath = $derived(threadUrl(email.id));
  const adminPath = $derived(adminUrl(email.mid));

  // Plain link so middle-click opens the permalink; unmodified clicks copy.
  function onPermalinkClick(event: MouseEvent): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigator.clipboard
      .writeText(location.origin + threadPath)
      .then(() => toast("success", "Permalink copied to clipboard."))
      .catch((e: unknown) =>
        toast(
          "error",
          `Could not copy permalink: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
  }

  const toolBtn =
    "rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 " +
    "focus:ring-2 focus:ring-pony-500 focus:outline-none " +
    "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200";

  const headCell =
    "pr-3 align-top font-semibold whitespace-nowrap text-slate-500 dark:text-slate-400";
  const valueCell = "align-top break-all text-slate-800 dark:text-slate-100";
</script>

{#snippet privateBadge()}
  <span
    class="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold
           text-amber-800 dark:bg-amber-900 dark:text-amber-200"
  >
    Private
  </span>
{/snippet}

{#snippet hiddenBadge()}
  <!-- Hidden emails are only served to admins; flag them. -->
  <span
    class="rounded-md bg-purple-100 px-1.5 py-0.5 text-xs font-semibold
           text-purple-800 dark:bg-purple-900 dark:text-purple-200"
    title="Hidden from the archive; only administrators can see this email"
  >
    Hidden
  </span>
{/snippet}

{#snippet toolbar()}
  <div class="flex shrink-0 items-center gap-0.5">
    <button
      type="button"
      class={toolBtn}
      title="Reply"
      aria-label="Reply"
      onclick={() => openComposer({ mode: "reply", email })}
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
        <polyline points="9 14 4 9 9 4" />
        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      </svg>
    </button>
    <a
      href={threadPath}
      class={toolBtn}
      title="Copy permalink"
      aria-label="Copy permalink"
      onclick={onPermalinkClick}
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
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </a>
    {#if onsource}
      <button
        type="button"
        class={toolBtn}
        title="View message source"
        aria-label="View message source"
        onclick={() => onsource?.(email)}
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
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>
    {/if}
    {#if session.credentials?.admin}
      <a
        href={adminPath}
        class={toolBtn}
        title="Administer this email"
        aria-label="Administer this email"
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
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2
               0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0
               0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9
               19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0
               1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0
               0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6
               9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1
               2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0
               1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1
               1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0
               1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0
               1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0
               0-1.51 1z"
          />
        </svg>
      </a>
    {/if}
  </div>
{/snippet}

{#if prefs.chatty}
  <article
    class="rounded-lg border border-slate-200 bg-white p-3 sm:p-4
           dark:border-slate-800 dark:bg-slate-900"
  >
    <div class="flex items-start gap-3">
      <Avatar md5={email.gravatar} name={sender.name} size={40} />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            class="font-semibold break-all text-slate-800 dark:text-slate-100"
          >
            {sender.name}
          </span>
          {#if sender.address}
            <span class="text-xs break-all text-slate-500 dark:text-slate-400">
              &lt;{sender.address}&gt;
            </span>
          {/if}
          {#if email.private}{@render privateBadge()}{/if}
          {#if email.deleted}{@render hiddenBadge()}{/if}
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400">
          <span title={utcIso(email.epoch)}>
            {formatDate(email.epoch, prefs.utc)}
          </span>
          &middot; {relativeTime(email.epoch)}
        </div>
      </div>
      {@render toolbar()}
    </div>
    {#if isRoot}
      <h2
        class="mt-3 text-lg font-semibold break-words text-slate-900
               dark:text-slate-100"
      >
        {email.subject}
      </h2>
    {/if}
    <div class="mt-3 text-slate-800 dark:text-slate-100">
      <EmailBody body={email.body} chatty={true} />
    </div>
    <Attachments {email} />
  </article>
{:else}
  <div
    class="rounded-md border border-slate-300 bg-white dark:border-slate-700
           dark:bg-slate-900"
  >
    <div
      class="flex items-start justify-between gap-2 border-b border-slate-200
             p-3 dark:border-slate-800"
    >
      <table class="text-sm">
        <tbody>
          <tr>
            <td class={headCell}>From</td>
            <td class={valueCell}>{email.from}</td>
          </tr>
          {#if email.to}
            <tr>
              <td class={headCell}>To</td>
              <td class={valueCell}>{email.to}</td>
            </tr>
          {/if}
          {#if email.cc}
            <tr>
              <td class={headCell}>Cc</td>
              <td class={valueCell}>{email.cc}</td>
            </tr>
          {/if}
          <tr>
            <td class={headCell}>Date</td>
            <td class={valueCell}>
              <span title={utcIso(email.epoch)}>
            {formatDate(email.epoch, prefs.utc)}
          </span>
            </td>
          </tr>
          <tr>
            <td class={headCell}>Subject</td>
            <td class="{valueCell} font-medium">{email.subject}</td>
          </tr>
          <tr>
            <td class={headCell}>List</td>
            <td class={valueCell}>
              {#if listSpec}
                <a
                  href={listUrl({ lists: [listSpec], headers: {} })}
                  class="text-pony-600 hover:underline dark:text-pony-300"
                >
                  {listAddr}
                </a>
              {:else}
                {listAddr}
              {/if}
            </td>
          </tr>
        </tbody>
      </table>
      <div class="flex shrink-0 items-center gap-2">
        {#if email.private}{@render privateBadge()}{/if}
        {#if email.deleted}{@render hiddenBadge()}{/if}
        {@render toolbar()}
      </div>
    </div>
    <div class="p-3">
      <EmailBody body={email.body} chatty={false} />
      <Attachments {email} />
    </div>
  </div>
{/if}
