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
  import { segmentize } from "../../lib/bodyfixups";
  import type { DiffLineType, Segment } from "../../lib/bodyfixups";

  interface Props {
    body: string;
    chatty: boolean;
  }

  let { body, chatty }: Props = $props();

  const segments: Segment[] = $derived(segmentize(body, { chatty }));

  // Per-quote fold overrides keyed by segment path; a new body or a mode
  // switch resets every quote to the mode default (chatty folds them).
  let quoteOverrides: Record<string, boolean> = $state({});
  $effect(() => {
    void body;
    void chatty;
    quoteOverrides = {};
  });

  function quoteExpanded(path: string): boolean {
    return quoteOverrides[path] ?? !chatty;
  }

  function toggleQuote(path: string): void {
    quoteOverrides[path] = !quoteExpanded(path);
  }

  const DIFF_CLASSES: Record<DiffLineType, string> = {
    add: "text-green-700 dark:text-green-400",
    del: "text-red-700 dark:text-red-400",
    hunk: "text-sky-700 dark:text-sky-400",
    meta: "font-semibold",
    ctx: "",
  };
</script>

<!-- The container is whitespace-pre-wrap, so the markup below must not
     introduce stray whitespace text nodes: tags hug the segment text. -->
{#snippet seglist(segs: Segment[], path: string)}{#each segs as seg, i (i)}{#if seg.kind === "text"}{seg.text}{:else if seg.kind === "link"}<a
      href={seg.href}
      rel="nofollow noopener"
      target="_blank"
      class="break-all text-pony-600 underline dark:text-pony-300"
      >{seg.text}</a
    >{:else if seg.kind === "quote"}<div class="my-1 whitespace-normal">
      <button
        type="button"
        aria-expanded={quoteExpanded(`${path}.${i}`)}
        class="rounded-md text-xs text-slate-500 hover:text-slate-700
               focus:ring-2 focus:ring-pony-500 focus:outline-none
               dark:text-slate-400 dark:hover:text-slate-200"
        onclick={() => toggleQuote(`${path}.${i}`)}
      >
        ︙ {quoteExpanded(`${path}.${i}`)
          ? "hide quoted text"
          : "show quoted text"}
      </button>
      {#if quoteExpanded(`${path}.${i}`)}<blockquote
          class="border-l-2 border-slate-300 pl-3 whitespace-pre-wrap
                 text-slate-500 dark:border-slate-600 dark:text-slate-400"
          >{@render seglist(seg.children, `${path}.${i}`)}</blockquote
        >{/if}
    </div>{:else if seg.kind === "diff"}<pre
      class="my-1 overflow-x-auto rounded-md bg-slate-100 p-2 text-xs dark:bg-slate-800">{#each seg.lines as line, j (j)}<div
          class={DIFF_CLASSES[line.type]}>{line.text}</div>{/each}</pre>{/if}{/each}{/snippet}

<div
  class="text-sm whitespace-pre-wrap break-words {chatty
    ? 'leading-relaxed'
    : 'font-mono'}"
>{@render seglist(segments, "")}</div>
