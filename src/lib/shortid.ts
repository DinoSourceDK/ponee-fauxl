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
 * Legacy short-link decoder, an exact port of unshortenID() from
 * webui/js/source/primer.js. Short links are 15 chars: a 'Z' (or old 'B')
 * prefix followed by two 7-char base-36 halves, left-padded with '-'.
 * Decoding yields two 9-char zero-padded hex halves, concatenated into
 * the 18-char hex document id.
 */

/** Decode a legacy short link id; non-short ids pass through unchanged. */
export function unshortenID(mid: string): string {
  if ((mid[0] === "Z" || mid[0] === "B") && mid.length === 15) {
    // Remove '-' padding, then base36 -> number -> hex.
    let id1 = parseInt(mid.substring(1, 8).replace(/-/g, ""), 36).toString(16);
    let id2 = parseInt(mid.substring(8, 15).replace(/-/g, ""), 36).toString(16);
    // Re-add zero padding.
    while (id1.length < 9) id1 = "0" + id1;
    while (id2.length < 9) id2 = "0" + id2;
    return id1 + id2;
  }
  return mid;
}
