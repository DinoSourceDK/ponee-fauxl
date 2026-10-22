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
  import { attachment as fetchAttachment, saveBlob } from "../../lib/api/client";
  import type { EmailResponse } from "../../lib/api/types";
  import { toast } from "../../lib/stores/toasts.svelte";

  let { email }: { email: EmailResponse } = $props();

  let busy: Record<string, boolean> = $state({});

  function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function download(hash: string, filename: string): Promise<void> {
    if (busy[hash]) return;
    busy[hash] = true;
    try {
      saveBlob(await fetchAttachment(email.id, hash), filename);
    } catch (e) {
      toast(
        "error",
        `Could not download ${filename}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      busy[hash] = false;
    }
  }
</script>

{#if email.attachments?.length}
  <div
    class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200
           pt-2 dark:border-slate-700"
  >
    <svg
      class="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1
           5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
      />
    </svg>
    <span class="sr-only">Attachments</span>
    {#each email.attachments as att, i (i)}
      <button
        type="button"
        title="Download {att.filename}"
        disabled={busy[att.hash]}
        onclick={() => download(att.hash, att.filename)}
        class="inline-flex items-center gap-1.5 rounded-md border
               border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700
               hover:border-pony-400 hover:text-pony-700 focus:ring-2
               focus:ring-pony-500 focus:outline-none disabled:opacity-60
               dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200
               dark:hover:border-pony-400 dark:hover:text-pony-300"
      >
        {#if busy[att.hash]}
          <span
            class="h-3 w-3 animate-spin rounded-full border-2 border-slate-300
                   border-t-pony-600 dark:border-slate-600 dark:border-t-pony-300"
            aria-hidden="true"
          ></span>
        {/if}
        <span class="break-all">{att.filename}</span>
        <span class="text-slate-400 dark:text-slate-500">
          ({fmtSize(att.size)})
        </span>
      </button>
    {/each}
  </div>
{/if}
