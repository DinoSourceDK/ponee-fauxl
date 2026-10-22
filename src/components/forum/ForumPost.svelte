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
  import { ApiError, email as fetchEmail } from "../../lib/api/client";
  import type { EmailResponse, ThreadNode } from "../../lib/api/types";
  import { formatDate, relativeTime, utcIso } from "../../lib/dates";
  import { adminUrl, threadUrl } from "../../lib/routes";
  import { openComposer } from "../../lib/stores/compose.svelte";
  import { prefs } from "../../lib/stores/prefs.svelte";
  import { session } from "../../lib/stores/session.svelte";
  import { toast } from "../../lib/stores/toasts.svelte";
  import Avatar from "../ui/Avatar.svelte";
  import Skeleton from "../ui/Skeleton.svelte";
  import Attachments from "../email/Attachments.svelte";
  import EmailBody from "../email/EmailBody.svelte";

  /**
   * One post in the forum topic view. thread.json only carries a full
   * body for the thread root; short reply nodes are fetched on demand
   * via email.json (cached client-side), like LazyEmail.
   */
  interface Props {
    node: ThreadNode;
    /** 1-based position in the flat post stream (#1 = the topic post). */
    n: number;
    isRoot?: boolean;
    onsource?: (email: EmailResponse) => void;
  }

  let { node, n, isRoot = false, onsource }: Props = $props();

  const full = $derived(typeof node.body === "string" ? node : null);

  let fetched = $state<EmailResponse | null>(null);
  let notfound = $state(false);
  let error = $state("");

  $effect(() => {
    if (full) return;
    const id = node.mid || node.id;
    fetched = null;
    notfound = false;
    error = "";
    let stale = false;
    fetchEmail(id)
      .then((eml) => {
        if (!stale) fetched = eml;
      })
      .catch((e: unknown) => {
        if (stale) return;
        if (e instanceof ApiError && e.status === 404) notfound = true;
        else error = e instanceof Error ? e.message : String(e);
      });
    return () => {
      stale = true;
    };
  });

  const eml = $derived(full ?? fetched);

  // "Name <a@b>" → name + address; anonymized senders ("th...@a.org")
  // have no address part and are shown as-is.
  const sender = $derived.by(() => {
    if (!eml) return { name: "", address: "" };
    const m = /^\s*"?([^"<]*?)"?\s*<([^>]*)>\s*$/.exec(eml.from);
    if (m) return { name: m[1] || m[2], address: m[2] };
    return { name: eml.from, address: "" };
  });

  const threadPath = $derived(eml ? threadUrl(eml.id) : "");

  // social_upvotes is optional everywhere: stats.json carries it when
  // asked (social: "yes"), the thread/email endpoints may not yet.
  // Absent means unknown, so the chip renders nothing rather than 0.
  const upvotes = $derived(
    typeof eml?.social_upvotes === "number" ? eml.social_upvotes : null,
  );

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
</script>

{#if eml}
  <article
    id="post-{n}"
    aria-label="Post #{n}"
    class="rounded-md border border-slate-200 bg-white dark:border-slate-800
           dark:bg-slate-900
           {isRoot ? 'border-l-4 border-l-pony-400 dark:border-l-pony-500' : ''}"
  >
    <div class="grid gap-3 p-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4 sm:p-4">
      <!-- Author column: left on sm+, stacked on top on small screens. -->
      <div class="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
        <Avatar md5={eml.gravatar} name={sender.name} size={48} />
        <div class="min-w-0">
          <div
            class="text-sm font-bold break-words text-slate-800
                   dark:text-slate-100"
          >
            {sender.name}
          </div>
          {#if sender.address}
            <div class="text-xs break-all text-slate-500 dark:text-slate-400">
              &lt;{sender.address}&gt;
            </div>
          {/if}
        </div>
      </div>

      <div class="min-w-0">
        <div
          class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b
                 border-slate-200 pb-2 text-xs dark:border-slate-800"
        >
          <span
            class="font-semibold text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          >
            #{n}
          </span>
          <span
            class="text-slate-600 dark:text-slate-300"
            title={utcIso(eml.epoch)}
          >
            {formatDate(eml.epoch, prefs.utc)}
          </span>
          <span class="text-slate-400 dark:text-slate-500">
            &middot; {relativeTime(eml.epoch)}
          </span>
          {#if upvotes !== null}
            <span
              class="inline-flex items-center gap-0.5 rounded-full
                     bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500
                     dark:bg-slate-800 dark:text-slate-400"
              title="{upvotes} {upvotes === 1 ? 'upvote' : 'upvotes'}"
            >
              <span aria-hidden="true">&#9650;</span>
              {upvotes}
              <span class="sr-only">
                {upvotes === 1 ? "upvote" : "upvotes"}
              </span>
            </span>
          {/if}
          {#if eml.deleted}
            <!-- Hidden emails are only served to admins; flag them. -->
            <span
              class="rounded-md bg-purple-100 px-1.5 py-0.5 font-semibold
                     text-purple-800 dark:bg-purple-900 dark:text-purple-200"
              title="Hidden from the archive; only administrators can see this post"
            >
              Hidden
            </span>
          {/if}
          <span class="min-w-2 flex-1"></span>
          <span class="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              class={toolBtn}
              title="Reply"
              aria-label="Reply to post #{n}"
              onclick={() => eml && openComposer({ mode: "reply", email: eml })}
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
              aria-label="Copy permalink to post #{n}"
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
                <path
                  d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                />
                <path
                  d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                />
              </svg>
            </a>
            {#if onsource}
              <button
                type="button"
                class={toolBtn}
                title="View message source"
                aria-label="View source of post #{n}"
                onclick={() => eml && onsource?.(eml)}
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
                href={adminUrl(eml.mid)}
                class={toolBtn}
                title="Administer this email"
                aria-label="Administer post #{n}"
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
          </span>
        </div>

        <div class="mt-3 text-slate-800 dark:text-slate-100">
          <EmailBody body={eml.body} chatty={true} />
        </div>
        <Attachments email={eml} />
      </div>
    </div>
  </article>
{:else if notfound}
  <div
    class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm
           text-amber-900 dark:border-amber-800 dark:bg-amber-950
           dark:text-amber-200"
  >
    Post <span class="font-semibold">#{n}</span> could not be loaded.
    It may be private.
  </div>
{:else if error}
  <div
    class="rounded-md border border-red-200 bg-red-50 p-3 text-sm
           text-red-800 dark:border-red-900 dark:bg-red-950/50
           dark:text-red-200"
    role="alert"
  >
    Could not load post #{n}: {error}
  </div>
{:else}
  <div
    class="rounded-md border border-slate-200 bg-white p-3 sm:p-4
           dark:border-slate-800 dark:bg-slate-900"
    role="status"
    aria-label="Loading post #{n}"
  >
    <Skeleton rows={3} />
  </div>
{/if}
