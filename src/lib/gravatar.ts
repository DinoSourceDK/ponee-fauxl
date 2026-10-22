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
 * Avatar helpers: the server-side gravatar proxy plus a local SVG
 * identicon fallback (used when the proxy is unreachable).
 */

import { config } from "./config";

/**
 * URL for a sender's avatar. The template comes from config.json
 * (classic GRAVATAR_URL); the default is the same-origin caching proxy
 * (server/endpoints/gravatar.py), which never links to gravatar.com
 * directly, so readers' addresses are not leaked to a third party.
 */
export function gravatarUrl(md5: string): string {
  return config.gravatarUrl.replace("%s", encodeURIComponent(md5));
}

/** Nibble (0-15) at position i of the seed, tolerant of non-hex input. */
function nibble(seed: string, i: number): number {
  if (seed.length === 0) return 0;
  const ch = seed[i % seed.length];
  const n = parseInt(ch, 16);
  return Number.isNaN(n) ? ch.charCodeAt(0) % 16 : n;
}

/**
 * Deterministic 5x5 vertically-mirrored pixel identicon as an SVG data:
 * URI, derived from an md5-hex seed. Muted color (hue from the seed,
 * fixed low saturation) on a pale background of the same hue.
 */
export function identiconDataUri(seed: string): string {
  // Hue from the tail of the seed (the grid uses the head).
  const hue =
    (nibble(seed, 15) * 256 + nibble(seed, 16) * 16 + nibble(seed, 17)) % 360;
  const fg = `hsl(${hue},38%,52%)`;
  const bg = `hsl(${hue},30%,93%)`;

  // 15 cells (3 columns x 5 rows), mirrored onto columns 3 and 4.
  let rects = "";
  for (let cell = 0; cell < 15; cell++) {
    if (nibble(seed, cell) % 2 === 0) continue;
    const col = Math.floor(cell / 5);
    const row = cell % 5;
    rects += `<rect x="${col}" y="${row}" width="1" height="1"/>`;
    if (col < 2) {
      rects += `<rect x="${4 - col}" y="${row}" width="1" height="1"/>`;
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 6 6" shape-rendering="crispEdges">` +
    `<rect x="-0.5" y="-0.5" width="6" height="6" fill="${bg}"/>` +
    `<g fill="${fg}">${rects}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
