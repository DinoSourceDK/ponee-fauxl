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
 * Word-cloud layout for the StatsResponse.cloud map: picks the top-N
 * words, assigns font sizes and colors, and shuffles deterministically
 * so the cloud looks organic yet renders identically for the same data.
 */

export interface CloudWord {
  word: string;
  weight: number;
  /** Font size in rem, 0.8 (lightest) to 2.0 (heaviest). */
  remSize: number;
  /** Tailwind text color classes, including the dark: variant. */
  colorClass: string;
}

// Full literal class strings so Tailwind's source scanner keeps them.
const COLOR_CLASSES = [
  "text-pony-700 dark:text-pony-300",
  "text-sky-700 dark:text-sky-300",
  "text-teal-700 dark:text-teal-300",
  "text-indigo-700 dark:text-indigo-300",
  "text-slate-600 dark:text-slate-400",
] as const;

/** djb2-xor string hash, unsigned 32-bit. */
function hashWord(word: string): number {
  let h = 5381;
  for (let i = 0; i < word.length; i++) {
    h = (Math.imul(h, 33) ^ word.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** mulberry32 PRNG: cheap, deterministic for a given 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function layoutCloud(
  cloud: Record<string, number>,
  max = 40,
): CloudWord[] {
  const top = Object.entries(cloud)
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max);
  if (top.length === 0) return [];

  // Scale by sqrt(weight), min-max normalized onto 0.8-2.0rem.
  const sqrts = top.map(([, w]) => Math.sqrt(w));
  const lo = Math.min(...sqrts);
  const hi = Math.max(...sqrts);
  const span = hi - lo;

  const words: CloudWord[] = top.map(([word, weight], i) => {
    const frac = span > 0 ? (sqrts[i] - lo) / span : 1;
    return {
      word,
      weight,
      remSize: Math.round((0.8 + 1.2 * frac) * 100) / 100,
      colorClass: COLOR_CLASSES[hashWord(word) % COLOR_CLASSES.length],
    };
  });

  // Deterministic Fisher-Yates shuffle seeded by the word hash sum.
  let seed = 0;
  for (const w of words) seed = (seed + hashWord(w.word)) >>> 0;
  const rand = mulberry32(seed);
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words;
}
