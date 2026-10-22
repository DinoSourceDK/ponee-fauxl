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

import { describe, expect, it } from "vitest";
import { segmentize, type Segment } from "./bodyfixups";

const chatty = { chatty: true };
const classic = { chatty: false };

function ofKind<K extends Segment["kind"]>(segs: Segment[], kind: K): Extract<Segment, { kind: K }>[] {
  return segs.filter((s): s is Extract<Segment, { kind: K }> => s.kind === kind);
}

/** Concatenate the text of text/link segments (one level). */
function flatText(segs: Segment[]): string {
  return segs
    .map((s) => (s.kind === "text" || s.kind === "link" ? s.text : ""))
    .join("");
}

describe("segmentize: quotes", () => {
  const body =
    "Thanks for the patch!\n\n" +
    "On 2026-01-05, Bob <bob@example.org> wrote:\n" +
    "> First line of quote\n" +
    "> Second line of quote\n";

  it("collapses an 'On ... wrote:' intro plus '>' lines into one quote segment", () => {
    const segs = segmentize(body, classic);
    const quotes = ofKind(segs, "quote");
    expect(quotes).toHaveLength(1);

    expect(segs[0]).toEqual({ kind: "text", text: "Thanks for the patch!\n" });

    const inner = flatText(quotes[0].children);
    expect(inner).toContain("Bob <bob@example.org> wrote:");
    expect(inner).toContain("> First line of quote");
    expect(inner).toContain("> Second line of quote");

    // Nothing quoted leaks outside the quote segment
    const outside = flatText(segs);
    expect(outside).not.toContain(">");
    expect(outside).not.toContain("wrote:");
  });

  it("handles CRLF line endings the same way", () => {
    const crlf = body.replace(/\n/g, "\r\n");
    const segs = segmentize(crlf, classic);
    const quotes = ofKind(segs, "quote");
    expect(quotes).toHaveLength(1);
    expect(flatText(quotes[0].children)).toContain("> First line of quote");
    expect(segs[0]).toEqual({ kind: "text", text: "Thanks for the patch!\n" });
  });

  it("linkifies URLs inside quotes", () => {
    const withUrl =
      "Check this:\n\nOn Mon, Bob <bob@example.org> wrote:\n" +
      "> see http://example.org/patch for details\n";
    const segs = segmentize(withUrl, classic);
    const quotes = ofKind(segs, "quote");
    expect(quotes).toHaveLength(1);
    const links = ofKind(quotes[0].children, "link");
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe("http://example.org/patch");
    // No nested quote segments: children are text/link only
    expect(quotes[0].children.every((c) => c.kind === "text" || c.kind === "link")).toBe(true);
  });
});

describe("segmentize: diffs", () => {
  const body = [
    "Here is the fix:",
    "",
    "--- a/src/foo.c",
    "+++ b/src/foo.c",
    "@@ -1,3 +1,4 @@",
    " int main() {",
    "+    return 0;",
    "-    return 1;",
    " }",
    "",
    "Cheers",
  ].join("\n");

  it("yields a diff segment with correctly typed lines", () => {
    const segs = segmentize(body, chatty);
    const diffs = ofKind(segs, "diff");
    expect(diffs).toHaveLength(1);
    expect(diffs[0].lines.map((l) => l.type)).toEqual([
      "meta",
      "meta",
      "hunk",
      "ctx",
      "add",
      "del",
      "ctx",
    ]);
    expect(diffs[0].lines[0].text).toBe("--- a/src/foo.c");
    expect(diffs[0].lines[2].text).toBe("@@ -1,3 +1,4 @@");
    expect(diffs[0].lines[4].text).toBe("+    return 0;");

    // Surrounding prose stays as text
    expect(segs[0]).toEqual({ kind: "text", text: "Here is the fix:\n\n" });
    expect(flatText(segs)).toContain("Cheers");
  });

  it("also detects diffs in classic mode", () => {
    const segs = segmentize(body, classic);
    expect(ofKind(segs, "diff")).toHaveLength(1);
  });
});

describe("segmentize: links", () => {
  it("caps linkification at 250 URLs", () => {
    const urls = Array.from({ length: 300 }, (_, n) => `http://example.org/page${n}`);
    const segs = segmentize(urls.join(" "), classic);
    const links = ofKind(segs, "link");
    expect(links).toHaveLength(250);
    expect(links[0]).toEqual({
      kind: "link",
      href: "http://example.org/page0",
      text: "http://example.org/page0",
    });
    expect(links[249].href).toBe("http://example.org/page249");

    // The rest remains as raw text
    const tail = segs[segs.length - 1];
    expect(tail.kind).toBe("text");
    expect(flatText([tail])).toContain("http://example.org/page299");
  });
});

describe("segmentize: trailers", () => {
  const body = "The build works now.\n\n--\nBob Bobson\n";

  it("trims a '--' signature trailer in chatty mode", () => {
    const segs = segmentize(body, chatty);
    const all = flatText(segs);
    expect(all).toContain("The build works now.");
    expect(all).not.toContain("Bob Bobson");
    expect(ofKind(segs, "quote")).toHaveLength(0);
  });

  it("keeps the trailer in classic mode", () => {
    const segs = segmentize(body, classic);
    expect(flatText(segs)).toContain("Bob Bobson");
  });

  it("keeps JIRA-style dashed separators in chatty mode", () => {
    const jira =
      "See the ticket for details.\n\n" +
      "-".repeat(64) +
      "\nThis message was sent by Atlassian Jira\n";
    const segs = segmentize(jira, chatty);
    const all = flatText(segs);
    expect(all).toContain("-".repeat(64));
    expect(all).toContain("This message was sent by Atlassian Jira");
  });
});

describe("segmentize: plain and degenerate bodies", () => {
  it("returns a single text segment for a plain body", () => {
    const body = "Hello there, this is a simple message.";
    expect(segmentize(body, classic)).toEqual([{ kind: "text", text: body }]);
    expect(segmentize(body, chatty)).toEqual([{ kind: "text", text: body }]);
  });

  it("returns [] for empty or null bodies", () => {
    expect(segmentize("", chatty)).toEqual([]);
    expect(segmentize(null as unknown as string, chatty)).toEqual([]);
    expect(segmentize(undefined as unknown as string, classic)).toEqual([]);
  });

  it("is unfazed by %-signs and regex metacharacters", () => {
    const body =
      "Progress at 100% (really!) [see notes] {ok} $HOME ^top *bold* +plus? \\back|pipe| 50%.";
    expect(segmentize(body, chatty)).toEqual([{ kind: "text", text: body }]);

    const quoted = "On 2026-02-02, Ann <ann@x.org> wrote:\n> 100% of tests pass ($5 & \\o/)\n";
    const segs = segmentize(quoted, chatty);
    const quotes = ofKind(segs, "quote");
    expect(quotes).toHaveLength(1);
    expect(flatText(quotes[0].children)).toContain("100% of tests pass ($5 & \\o/)");
  });
});

describe("segmentize: oversized bodies", () => {
  it("only linkifies bodies larger than 512 KB", () => {
    const filler = ("lorem ipsum dolor sit amet ".repeat(40) + "\n").repeat(500);
    expect(filler.length).toBeGreaterThan(512 * 1024);
    const body =
      filler +
      "On 2026-01-05, Bob <bob@example.org> wrote:\n> quoted stuff\nhttp://example.org/big\n";
    const segs = segmentize(body, chatty);
    expect(ofKind(segs, "quote")).toHaveLength(0);
    expect(ofKind(segs, "diff")).toHaveLength(0);
    const links = ofKind(segs, "link");
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe("http://example.org/big");
    expect(flatText(segs)).toContain("> quoted stuff");
  });
});
