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
  import type { Snippet } from "svelte";

  interface Props {
    open?: boolean;
    title?: string;
    wide?: boolean;
    /**
     * Close on Escape or a click on the backdrop. Turn off for modals
     * holding unsaved input, so a stray key or click can't discard it.
     */
    dismissible?: boolean;
    onclose?: () => void;
    children: Snippet;
  }

  let {
    open = $bindable(false),
    title,
    wide = false,
    dismissible = true,
    onclose,
    children,
  }: Props = $props();

  const uid = $props.id();
  const titleId = `${uid}-title`;
  let panel: HTMLElement | undefined = $state();

  function close(): void {
    open = false;
    onclose?.();
  }

  function focusables(): HTMLElement[] {
    if (!panel) return [];
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), ' +
          'select:not([disabled]), textarea:not([disabled]), ' +
          '[tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (!open) return;
    if (event.key === "Escape") {
      if (!dismissible) return;
      event.preventDefault();
      close();
      return;
    }
    // Focus trap: wrap Tab at the panel edges.
    if (event.key === "Tab") {
      const els = focusables();
      if (els.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const active = document.activeElement;
      const inside = panel?.contains(active) ?? false;
      if (event.shiftKey && (!inside || active === els[0])) {
        event.preventDefault();
        els[els.length - 1].focus();
      } else if (!event.shiftKey && (!inside || active === els[els.length - 1])) {
        event.preventDefault();
        els[0].focus();
      }
    }
  }

  // Body scroll lock + focus management for the lifetime of "open".
  $effect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Wait for the panel to be in the DOM before moving focus.
    queueMicrotask(() => (focusables()[0] ?? panel)?.focus());
    return () => {
      document.body.style.overflow = bodyOverflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-slate-950/70"
    onclick={(event) => {
      if (dismissible && event.target === event.currentTarget) close();
    }}
  >
    <div
      bind:this={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      tabindex="-1"
      class="flex max-h-[85vh] w-full flex-col rounded-md border border-slate-200 bg-white outline-none dark:border-slate-800 dark:bg-slate-900 {wide
        ? 'max-w-3xl'
        : 'max-w-lg'}"
    >
      <div
        class="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800"
      >
        {#if title}
          <h2
            id={titleId}
            class="flex-1 truncate text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            {title}
          </h2>
        {:else}
          <span class="flex-1"></span>
        {/if}
        <button
          type="button"
          aria-label="Close"
          class="rounded-md px-1.5 py-0.5 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          onclick={close}
        >
          &times;
        </button>
      </div>
      <div class="overflow-y-auto p-4">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
