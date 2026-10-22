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
  /** Modal yes/no confirmation, in place of window.confirm(). */
  import type { Snippet } from "svelte";
  import Modal from "./Modal.svelte";

  interface Props {
    open?: boolean;
    title: string;
    confirmLabel?: string;
    /** Style the confirm button as destructive. */
    danger?: boolean;
    onconfirm: () => void;
    children: Snippet;
  }

  let {
    open = $bindable(false),
    title,
    confirmLabel = "Confirm",
    danger = false,
    onconfirm,
    children,
  }: Props = $props();

  function confirm(): void {
    open = false;
    onconfirm();
  }
</script>

<Modal bind:open {title}>
  <div class="text-sm text-slate-700 dark:text-slate-200">
    {@render children()}
  </div>
  <div class="mt-4 flex justify-end gap-2">
    <!-- Cancel comes first so it takes the initial focus. -->
    <button
      type="button"
      class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium
             text-slate-700 hover:bg-slate-100 focus:ring-2 focus:ring-pony-500
             focus:outline-none dark:border-slate-700 dark:text-slate-200
             dark:hover:bg-slate-800"
      onclick={() => (open = false)}
    >
      Cancel
    </button>
    <button
      type="button"
      class="rounded-md px-3 py-1.5 text-sm font-medium text-white
             focus:ring-2 focus:outline-none {danger
        ? 'bg-red-600 hover:bg-red-700 focus:ring-red-400'
        : 'bg-pony-600 hover:bg-pony-700 focus:ring-pony-400'}"
      onclick={confirm}
    >
      {confirmLabel}
    </button>
  </div>
</Modal>
