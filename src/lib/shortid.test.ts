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

import { describe, it, expect } from "vitest";
import { unshortenID } from "./shortid";

/**
 * Inverse of unshortenID, used to build fixtures: two 9-hex-digit halves
 * -> base36, left-padded with '-' to 7 chars each, 'Z' prefix.
 */
function shortenID(hexId: string, prefix = "Z"): string {
  const half = (h: string) => parseInt(h, 16).toString(36).padStart(7, "-");
  return prefix + half(hexId.substring(0, 9)) + half(hexId.substring(9, 18));
}

describe("unshortenID", () => {
  it("round-trips 18-hex-char ids through short form", () => {
    const ids = [
      "0123456789abcdef01",
      "000000001000000001", // maximal '-' padding
      "1ffffffff1ffffffff", // maximal 36-bit halves
      "abcdef012fedcba098",
      "000000000000000000", // all zeroes
    ];
    for (const id of ids) {
      const short = shortenID(id);
      expect(short.length).toBe(15);
      expect(short[0]).toBe("Z");
      expect(unshortenID(short)).toBe(id);
    }
  });

  it("accepts the legacy 'B' prefix", () => {
    const id = "0123456789abcdef01";
    expect(unshortenID(shortenID(id, "B"))).toBe(id);
  });

  it("passes non-short ids through unchanged", () => {
    // Real document ids: long hex/base64-ish strings.
    const full = "9dfe964b660b68b9e9f00807e1de1c21d3c221cb9f662a7fbe436fb2";
    expect(unshortenID(full)).toBe(full);
    // Message-id style permalinks.
    const mid = "CAOqqYVE=aTuvz6PZVFsz3A@mail.gmail.com";
    expect(unshortenID(mid)).toBe(mid);
    // Right prefix, wrong length.
    expect(unshortenID("Z-51u7i0")).toBe("Z-51u7i0");
    expect(unshortenID("Z-51u7i0j2y4bup0")).toBe("Z-51u7i0j2y4bup0");
    // Right length, wrong prefix.
    expect(unshortenID("X-51u7i0j2y4bup")).toBe("X-51u7i0j2y4bup");
    // Empty string.
    expect(unshortenID("")).toBe("");
  });

  it("decodes a known-value example", () => {
    // 0x12345678 -> base36 "51u7i0"; 0x9abcdef01 -> base36 "j2y4bup".
    expect(unshortenID("Z-51u7i0j2y4bup")).toBe("0123456789abcdef01");
  });
});
