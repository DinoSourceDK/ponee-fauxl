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
  import type { EmailSummary } from "../../lib/api/types";
  import { relativeTime, utcIso } from "../../lib/dates";
  import { authorName, emailListAddress, teaser } from "../../lib/listview";
  import { threadUrl } from "../../lib/routes";
  import { prefs } from "../../lib/stores/prefs.svelte";
  import Avatar from "../ui/Avatar.svelte";

  interface Props {
    email: EmailSummary;
    /** Badge epoch (thread rows show newest activity, not the root's). */
    epoch?: number;
    participants?: number;
    replies?: number;
    /** Treeview nesting depth; the visual indent caps at 6. */
    depth?: number;
    /** Show a list@domain badge (virtual inbox / wildcard specs). */
    showList?: boolean;
    expanded: boolean;
    /** Server "now"; rows active within the last 24h get a pony tint. */
    now?: number;
    /**
     * Treeview expander: descendant count under this node. Set (even 0)
     * only on treeview rows. Leaves get an alignment spacer, nodes
     * with children a chevron driving ontreetoggle.
     */
    treeChildren?: number;
    treeExpanded?: boolean;
    ontreetoggle?: () => void;
    ontoggle: () => void;
  }

  let {
    email,
    epoch,
    participants,
    replies,
    depth = 0,
    showList = false,
    expanded,
    now = 0,
    treeChildren,
    treeExpanded = false,
    ontreetoggle,
    ontoggle,
  }: Props = $props();

  const badgeEpoch = $derived(epoch ?? email.epoch);
  const recent = $derived(now > 0 && badgeEpoch >= now - 86400);
  const author = $derived(authorName(email.from));
  const subject = $derived(email.subject || "(No subject)");
  const preview = $derived(teaser(email.body));
  const indent = $derived(Math.min(depth, 6));
  // Trimmed API responses may omit list/list_raw; no badge then.
  const listBadge = $derived(emailListAddress(email));

  function onClick(event: MouseEvent): void {
    // Plain left-clicks expand inline; modified clicks follow the permalink.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    ontoggle();
  }

  function onTreeToggle(event: MouseEvent): void {
    // The expander lives inside the row link: keep the click to itself.
    event.preventDefault();
    event.stopPropagation();
    ontreetoggle?.();
  }
</script>

<a
  data-listrow
  href={threadUrl(email.id)}
  aria-expanded={expanded}
  onclick={onClick}
  style={indent > 0 ? `margin-left: ${indent * 1.25}rem` : undefined}
  class="flex items-center gap-3 rounded-md border px-3
         focus:ring-2 focus:ring-pony-500 focus:outline-none
         {prefs.compact ? 'py-1' : 'py-2'}
         {expanded
    ? 'border-pony-300 bg-pony-50 dark:border-pony-600 dark:bg-slate-800'
    : `border-slate-200 bg-white hover:border-pony-300 hover:bg-slate-50
       dark:border-slate-800 dark:bg-slate-900 dark:hover:border-pony-600
       dark:hover:bg-slate-800`}"
>
  {#if treeChildren !== undefined}
    <!-- Fixed-width gutter: the avatar column stays put whether a row
         has an expander (chevron + count), an open chevron, or is a
         leaf. -->
    <span class="flex w-10 shrink-0 items-center">
      {#if treeChildren > 0}
        <button
          type="button"
          onclick={onTreeToggle}
          aria-expanded={treeExpanded}
          aria-label="{treeExpanded ? 'Collapse' : 'Expand'} {treeChildren}
                      {treeChildren === 1 ? 'reply' : 'replies'}"
          title="{treeExpanded ? 'Collapse' : 'Expand'} {treeChildren}
                 {treeChildren === 1 ? 'reply' : 'replies'}"
          class="inline-flex items-center gap-0.5 rounded-md p-0.5
                 text-slate-400 hover:text-pony-600 focus:ring-2
                 focus:ring-pony-500 focus:outline-none dark:text-slate-500
                 dark:hover:text-pony-300"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            class="h-4 w-4 transition-transform {treeExpanded
              ? 'rotate-90'
              : ''}"
            aria-hidden="true"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          {#if !treeExpanded}
            <span class="text-[10px] font-semibold">{treeChildren}</span>
          {/if}
        </button>
      {/if}
    </span>
  {/if}
  <Avatar md5={email.gravatar} name={author} size={prefs.compact ? 20 : 32} />

  <span class="min-w-0 flex-1">
    <span class="flex min-w-0 items-center gap-2">
      <span
        class="truncate text-sm font-medium text-slate-800 dark:text-slate-100
               {prefs.compact ? 'w-40 shrink-0' : ''}"
      >
        {author}
      </span>
      {#if showList && listBadge}
        <span
          class="shrink-0 rounded-md bg-pony-100 px-1.5 py-0.5 text-[10px]
                 font-semibold text-pony-700 dark:bg-pony-900
                 dark:text-pony-200"
        >
          {listBadge}
        </span>
      {/if}
      {#if prefs.compact}
        <span class="truncate text-sm text-slate-600 dark:text-slate-300">
          {subject}
        </span>
      {/if}
    </span>
    {#if !prefs.compact}
      <span class="mt-0.5 flex min-w-0 items-baseline gap-2">
        <span
          class="shrink truncate text-sm text-slate-700 dark:text-slate-300"
        >
          {subject}
        </span>
        {#if preview}
          <span
            class="hidden min-w-0 truncate text-xs text-slate-400 sm:inline
                   dark:text-slate-500"
          >
            {preview}
          </span>
        {/if}
      </span>
    {/if}
  </span>

  <span class="flex shrink-0 items-center gap-1.5 text-xs">
    {#if participants !== undefined}
      <span
        title="{participants} participants"
        class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5
               py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        {participants}
        <span class="sr-only">participants</span>
      </span>
    {/if}
    {#if replies !== undefined && replies > 0}
      <span
        title="{replies} replies"
        class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5
               py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-10 6L2 7" />
        </svg>
        {replies}
        <span class="sr-only">replies</span>
      </span>
    {/if}
    <span
      title={utcIso(badgeEpoch)}
      class="rounded-md px-1.5 py-0.5 whitespace-nowrap
             {recent
        ? 'bg-pony-100 font-medium text-pony-700 dark:bg-pony-900 dark:text-pony-200'
        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}"
    >
      {relativeTime(badgeEpoch)}
    </span>
  </span>
</a>
