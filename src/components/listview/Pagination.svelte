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
  interface Props {
    /** 1-based bounds of the visible slice (0 when empty). */
    first: number;
    last: number;
    total: number;
    /** "topics" (threaded/treeview) or "emails" (flat). */
    unit: string;
    onprev: () => void;
    onnext: () => void;
  }

  let { first, last, total, unit, onprev, onnext }: Props = $props();

  const canPrev = $derived(first > 1);
  const canNext = $derived(last < total);

  const btn = `rounded-md border border-slate-300 bg-white p-1.5
    text-slate-600 hover:bg-slate-50 focus:ring-2 focus:ring-pony-500
    focus:outline-none disabled:cursor-not-allowed disabled:opacity-40
    dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300
    dark:hover:bg-slate-800`;
</script>

<div
  class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
>
  <span>
    Showing
    <span class="font-semibold text-slate-700 dark:text-slate-200">
      {first} through {last}
    </span>
    of
    <span class="font-semibold text-slate-700 dark:text-slate-200">
      {total}
    </span>
    {unit}
  </span>
  <button
    type="button"
    aria-label="Previous page"
    disabled={!canPrev}
    onclick={onprev}
    class={btn}
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      class="h-4 w-4"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  </button>
  <button
    type="button"
    aria-label="Next page"
    disabled={!canNext}
    onclick={onnext}
    class={btn}
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      class="h-4 w-4"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  </button>
</div>
