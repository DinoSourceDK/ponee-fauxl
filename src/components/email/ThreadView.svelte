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
  import type { EmailResponse, ThreadNode } from "../../lib/api/types";
  import LazyEmail from "./LazyEmail.svelte";
  import ThreadView from "./ThreadView.svelte";

  interface Props {
    node: ThreadNode;
    depth?: number;
    /** id/mid of an email to highlight (e.g. the find_parent origin). */
    open?: string;
    onsource?: (email: EmailResponse) => void;
  }

  let { node, depth = 0, open, onsource }: Props = $props();

  const NEST_COLORS = ["#286090", "#ccab0a", "#c04331", "#169e4e", "#6d4ca5"];

  // Port of construct-thread.js: visually cap nesting at 10 levels, less on
  // narrow screens. Computed once per mount; resizing does not re-nest.
  const maxDepth =
    window.innerWidth < 700 ? Math.floor(window.innerWidth / 250) : 10;

  const children = $derived(
    [...(node.children ?? [])].sort((a, b) => a.epoch - b.epoch),
  );

  const highlighted = $derived(
    !!open && (node.id === open || node.mid === open),
  );
</script>

<div
  class={highlighted ? "rounded-lg ring-2 ring-pony-400 dark:ring-pony-500" : ""}
>
  <LazyEmail {node} isRoot={depth === 0} {onsource} />
</div>
{#each children as child, i (i)}
  {#if depth + 1 < maxDepth}
    <div
      class="mt-3 border-l-2 pl-3 sm:pl-4"
      style="border-left-color: {NEST_COLORS[(depth + 1) % NEST_COLORS.length]}"
    >
      <ThreadView node={child} depth={depth + 1} {open} {onsource} />
    </div>
  {:else}
    <!-- Beyond the visual cap: flat, no further indentation. -->
    <div class="mt-3">
      <ThreadView node={child} depth={depth + 1} {open} {onsource} />
    </div>
  {/if}
{/each}
