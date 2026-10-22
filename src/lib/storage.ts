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
 * Guarded browser-storage helpers: localStorage/sessionStorage throw in
 * some private-browsing modes; all failures degrade to in-memory no-ops.
 */

function safeGet(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    /* storage unavailable: ignore */
  }
}

function safeRemove(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = safeGet(localStorage, key);
  if (raw === null) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  safeSet(localStorage, key, JSON.stringify(value));
}

export function sessionGet(key: string): string | null {
  return safeGet(sessionStorage, key);
}

export function sessionSet(key: string, value: string): void {
  safeSet(sessionStorage, key, value);
}

export function sessionRemove(key: string): void {
  safeRemove(sessionStorage, key);
}
