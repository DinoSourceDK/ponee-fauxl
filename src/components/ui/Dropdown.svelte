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
    label: Snippet;
    children: Snippet;
    align?: "left" | "right";
  }

  let { label, children, align = "left" }: Props = $props();

  let open = $state(false);
  let root: HTMLElement | undefined = $state();
  let menu: HTMLElement | undefined = $state();
  let button: HTMLButtonElement | undefined = $state();

  function items(): HTMLElement[] {
    if (!menu) return [];
    return Array.from(
      menu.querySelectorAll<HTMLElement>(
        '[role="menuitem"], a[href], button:not([disabled])',
      ),
    );
  }

  function openMenu(focusLast = false): void {
    open = true;
    // Menu items exist only after the {#if open} block renders.
    queueMicrotask(() => {
      const els = items();
      (focusLast ? els[els.length - 1] : els[0])?.focus();
    });
  }

  function closeMenu(refocus = false): void {
    open = false;
    if (refocus) button?.focus();
  }

  function onWindowClick(event: MouseEvent): void {
    if (!open) return;
    if (root && event.target instanceof Node && !root.contains(event.target)) {
      closeMenu();
    }
  }

  function onButtonKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp");
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu(true);
    }
  }

  function onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === "Tab") {
      closeMenu();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const els = items();
    if (els.length === 0) return;
    const idx = els.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    els[(idx + delta + els.length) % els.length].focus();
  }

  function onMenuClick(event: MouseEvent): void {
    // Activating any item (link or button) closes the menu.
    if (
      event.target instanceof Element &&
      event.target.closest("a, button, [role='menuitem']")
    ) {
      closeMenu();
    }
  }
</script>

<svelte:window onclick={onWindowClick} />

<div bind:this={root} class="relative inline-block">
  <button
    bind:this={button}
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    onclick={() => (open ? closeMenu() : openMenu())}
    onkeydown={onButtonKeydown}
  >
    {@render label()}
    <svg viewBox="0 0 16 16" class="h-3 w-3 opacity-60" aria-hidden="true">
      <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>
  </button>
  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={menu}
      role="menu"
      tabindex="-1"
      class="absolute z-30 mt-1 min-w-40 rounded-md border border-slate-200 bg-white py-1 dark:border-slate-800 dark:bg-slate-900 {align ===
      'right'
        ? 'right-0'
        : 'left-0'}"
      onclick={onMenuClick}
      onkeydown={onMenuKeydown}
    >
      {@render children()}
    </div>
  {/if}
</div>
