/*
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
*/

/**
 * Global single-key keyboard shortcuts (H for help, C for compose, ...).
 * Views register their shortcuts on mount and unregister on destroy;
 * installKeyboard() is called once by the app shell.
 */

export interface Shortcut {
  /** Matched against KeyboardEvent.key, case-insensitively. */
  key: string;
  /** Human-readable action, shown in the help modal. */
  description: string;
  /** Optional guard; the shortcut only fires when this returns true. */
  when?: () => boolean;
  handler: () => void;
}

const registry: Shortcut[] = [];

/** Register a shortcut; returns its unregister function. */
export function registerShortcut(sc: Shortcut): () => void {
  registry.push(sc);
  return () => {
    const idx = registry.indexOf(sc);
    if (idx >= 0) registry.splice(idx, 1);
  };
}

/** Snapshot of currently registered shortcuts, in registration order. */
export function shortcuts(): readonly Shortcut[] {
  return registry.slice();
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.closest("[contenteditable]") !== null
  );
}

/** Install the window keydown listener; returns the uninstaller. */
export function installKeyboard(): () => void {
  function onKeydown(event: KeyboardEvent): void {
    // Leave typing and browser/OS chords alone: Ctrl/Cmd+C is clipboard
    // copy, never compose. The booleans cover normal chords; the live
    // getModifierState checks also catch AltGr layouts (reported
    // without ctrlKey/altKey on some platforms) and modifiers held
    // across window focus changes, where the booleans can be stale.
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.getModifierState("Control") ||
      event.getModifierState("Meta") ||
      event.getModifierState("Alt") ||
      event.getModifierState("AltGraph")
    ) {
      return;
    }
    if (isTextTarget(event.target)) return;
    const key = event.key.toLowerCase();
    for (const sc of registry) {
      if (sc.key.toLowerCase() !== key) continue;
      if (sc.when && !sc.when()) continue;
      event.preventDefault();
      sc.handler();
      return;
    }
  }
  window.addEventListener("keydown", onKeydown);
  return () => window.removeEventListener("keydown", onKeydown);
}
