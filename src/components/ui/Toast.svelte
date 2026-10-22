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
  import { toasts, dismissToast } from "../../lib/stores/toasts.svelte";
  import type { ToastKind } from "../../lib/stores/toasts.svelte";

  const kindClasses: Record<ToastKind, string> = {
    info: "border-pony-200 bg-slate-50 text-slate-800 dark:border-pony-800 dark:bg-slate-900 dark:text-slate-100",
    success:
      "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-100",
    error:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
  };
</script>

<div
  class="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
  aria-live="polite"
>
  {#each toasts as t (t.id)}
    <div
      class="flex items-start gap-2 rounded-md border px-3 py-2 text-sm {kindClasses[
        t.kind
      ]}"
    >
      <span class="min-w-0 flex-1 break-words">{t.text}</span>
      {#if t.actionLabel && t.action}
        <button
          type="button"
          class="shrink-0 font-medium underline underline-offset-2 hover:opacity-75"
          onclick={() => {
            t.action?.();
            dismissToast(t.id);
          }}
        >
          {t.actionLabel}
        </button>
      {/if}
      <button
        type="button"
        aria-label="Dismiss"
        class="shrink-0 -mr-1 rounded-md px-1 leading-none opacity-60 hover:opacity-100"
        onclick={() => dismissToast(t.id)}
      >
        &times;
      </button>
    </div>
  {/each}
</div>
