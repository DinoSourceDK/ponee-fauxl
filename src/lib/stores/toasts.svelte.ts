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

/** Transient notification queue (errors, "new mail" notices, ...). */

export type ToastKind = "info" | "success" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  /** Optional action button (e.g. "Refresh" on a new-mail notice). */
  actionLabel?: string;
  action?: () => void;
  /** ms before auto-dismissal; 0 = sticky until closed. */
  timeout: number;
}

export const toasts: Toast[] = $state([]);

let nextId = 1;

export function toast(
  kind: ToastKind,
  text: string,
  opts?: { actionLabel?: string; action?: () => void; timeout?: number },
): number {
  const id = nextId++;
  const t: Toast = {
    id,
    kind,
    text,
    actionLabel: opts?.actionLabel,
    action: opts?.action,
    timeout: opts?.timeout ?? (kind === "error" ? 8000 : 5000),
  };
  toasts.push(t);
  if (t.timeout > 0) {
    setTimeout(() => dismissToast(id), t.timeout);
  }
  return id;
}

export function dismissToast(id: number): void {
  const idx = toasts.findIndex((t) => t.id === id);
  if (idx >= 0) toasts.splice(idx, 1);
}
