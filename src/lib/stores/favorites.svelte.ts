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
 * Favorite mailing lists ("list@domain" addresses), persisted to
 * localStorage. Kept client-side for now; the shape is deliberately a
 * plain sorted string array so a later move to a backend user store is
 * a drop-in swap.
 */

import { normalizeFavorites } from "../favorites";

const STORAGE_KEY = "ponymail-favorites";

function read(): string[] {
  try {
    return normalizeFavorites(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"),
    );
  } catch {
    return []; // corrupt storage or blocked access: start clean
  }
}

let _lists = $state<string[]>(read());

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_lists));
  } catch {
    // Private-mode/quota failures: favorites just don't survive reload.
  }
}

export const favorites = {
  /** Sorted "list@domain" addresses. */
  get lists(): string[] {
    return _lists;
  },
  has(address: string): boolean {
    return _lists.includes(address);
  },
};

/** Add or remove one list from the favorites. */
export function toggleFavorite(address: string): void {
  _lists = _lists.includes(address)
    ? _lists.filter((a) => a !== address)
    : normalizeFavorites([..._lists, address]);
  persist();
}

/** Replace the whole set (server-side preferences applying on login). */
export function setFavorites(addresses: readonly string[]): void {
  _lists = normalizeFavorites([...addresses]);
  persist();
}
