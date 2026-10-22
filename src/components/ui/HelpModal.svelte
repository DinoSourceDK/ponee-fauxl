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
  import Modal from "./Modal.svelte";
  import { shortcuts } from "../../lib/keyboard";

  interface Props {
    open?: boolean;
  }

  let { open = $bindable(false) }: Props = $props();

  // Snapshot on each open: the registry is a plain (non-reactive) array.
  const list = $derived(open ? shortcuts() : []);

  function keyLabel(key: string): string {
    if (key === " ") return "Space";
    return key.length === 1 ? key.toUpperCase() : key;
  }
</script>

<Modal bind:open title="Keyboard shortcuts">
  {#if list.length > 0}
    <table class="w-full text-sm">
      <tbody>
        {#each list as sc, i (i)}
          <tr
            class="border-b border-slate-100 last:border-0 dark:border-slate-800"
          >
            <td class="w-24 py-2 pr-4 align-top">
              <kbd
                class="rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {keyLabel(sc.key)}
              </kbd>
            </td>
            <td class="py-2 text-slate-700 dark:text-slate-300">
              {sc.description}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="text-sm text-slate-500 dark:text-slate-400">
      No keyboard shortcuts are available on this page.
    </p>
  {/if}
</Modal>
