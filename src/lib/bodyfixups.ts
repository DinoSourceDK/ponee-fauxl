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
 * Pure, data-only port of the old webui email body fixups
 * (webui/js/source/body-fixups.js): URL linkification, quote-block
 * detection, unified diff classification and, in chatty mode,
 * signature/trailer trimming. Produces a Segment list; no DOM, no HTML.
 */

export type DiffLineType = "add" | "del" | "hunk" | "meta" | "ctx";

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "link"; href: string; text: string }
  | { kind: "quote"; children: Segment[] }
  | { kind: "diff"; lines: { type: DiffLineType; text: string }[] };

export interface FixupOptions {
  /** Social rendering mode: additionally trims trailing signatures. */
  chatty: boolean;
}

type TextSegment = Extract<Segment, { kind: "text" }>;
type DiffSegment = Extract<Segment, { kind: "diff" }>;

// Iteration caps carried over from the old webui so a hostile email
// cannot make us loop forever; unlike the old per-call counters these
// budgets are shared across one whole email.
const MAX_URLS = 250;
const MAX_QUOTES = 50;
const MAX_DIFFS = 25;
// Above this size only linkification runs. The quote/diff regexes can
// backtrack catastrophically on very large bodies.
const MAX_ANALYZE_SIZE = 512 * 1024;

interface Budget {
  urls: number;
  diffs: number;
}

// The regexes below are ported byte-for-byte from body-fixups.js.
const PONYMAIL_URL_RE = new RegExp("(" + "(?:(?:[a-z]+)://)" + "(?:\\S+(?::\\S*)?@)?" + "(?:" + "([01][0-9][0-9]|2[0-4][0-9]|25[0-5])" + "|" + "(?:(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)" + "(?:\\.(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)*" + "(?:\\.(?:[a-z\\u00a1-\\uffff]{2,}))" + "\\.?" + ")" + "(?::\\d{2,5})?" + "\\/?" + "(?:[/?#]?([^,<>()\\[\\] \\t\\r\\n]|(<[^:\\s]*?>|\\([^:\\s]*?\\)|\\[[^:\\s]*?\\]))*)?" + ")\\.?" + "\\b", "mi");

// Regex for things to potentially put inside quote segments:
// quotes, forwarded emails, inline quoting, top posting with the
// original email following.
const PONYMAIL_QUOTE_RE = new RegExp("(" +
    // Typical encapsulation of context by ticketing systems and/or bug trackers
    "(---\\r?\\n([^\\r\\n]*?\\r?\\n)*?---$)|" +
    "(" +
    "(?:\\r?\\n|^)" + // start of line or after a colon
    // Classic method; a signal line and the quote with '>' starting each line quoted
    "(" +
    "(" + // Initial line signalling a quote
    "((\\d+-\\d+-\\d+)\\s+.+<\\S+@\\S+>:[ \t\r\n]+)|" + // "01-02-1982 Foo Bar <foo@bar.baz>:" OR
    "(on\\s+(.+|.+\\n.+)\\s+wrote:[\r?\n]+)|" + // "On $somedate, $someone wrote:", OR...
    "(le\\s+(.+|.+\\n.+)\\s+écrit:[\r?\n]+)|" + // French version of the above, OR...
    "(.?am .+? schrieb\\s+.+:[\r?\n]+)|" + // German version of the above, OR...
    "(envoy[ée] de mon .+|sent from my .+|von meinem .+ gesendet)[ \t\r\n]+" + // "sent from my iphone/..." usually means the next part is a quote.
    ")" + // End initial signal line
    "(^$)*" + // Accept blank newlines following it...
    "(((^(?!>)[\\s\\S]+$)*)|(^\\s*>[\\s\\S]+$)*)" + // Either text that follows immediately after with no '>' first, OR text with '>' first, but NOT both...
    ")|" +
    "(" +
    // Lines after the signal line; comes in one shape, generally speaking...
    "(^\\s*>+[ \\t]*[^\r\n]*\r*\n+)+" + // Lines beginning with one or more '>' after the initial signal line
    ")" +
    ")+|" + //OR...
    "(" +
    "^(-{5,10}) .+? \\1[\r\n]+" + // ----- Forwarded Message -----
    "(^\\w+:\\s+.+[\r\n]+){3,10}[\r\n]+" + // Between three and ten header fields (at least 3, so as to not quote PGP blocks)
    "[\\S\\s]+" + // Whatever comes next...
    ")+" +
    ")", "mi");

// Somewhat simplified method for catching email footers/trailers.
const PONYMAIL_TRAILER_RE = new RegExp("^--[\r\n]+.*", "mi");

// Captures unified diff blocks in an email.
const PONYMAIL_DIFF_RE = new RegExp(
    "(" +
    "^-{3} .+?[\r\n]+" + // Starts with a "--- /foo/bar/baz"
    "^\\+{3} .+?[\r\n]+" + // Then a "+++ /foo/bar/baz"
    "(" + // Then one or more of...
    "^@@@? .+[\r\n]+" + // positioning
    "(^ .*[\r\n]*$){0,3}" + // diff header
    "(^[-+ ].*[\r\n]*)+" + // actual diff
    "(^ .*[\r\n]*$){0,3}" + // diff trailer
    ")+" +
    ")", "mi");

/** Split an email body into renderable segments. */
export function segmentize(body: string, opts: FixupOptions): Segment[] {
  if (!body) return []; // defensive: also covers null/undefined at runtime
  let splicer = body.replace(/\r\n/g, "\n");

  const budget: Budget = { urls: MAX_URLS, diffs: MAX_DIFFS };

  // Huge bodies: linkify only, skip quote/diff analysis (regex blowup).
  if (splicer.length > MAX_ANALYZE_SIZE) return linkify(splicer, budget);

  // Tweak from the old code: make quotes match the last line even when
  // the body has no final newline. Stripped again after processing.
  const addedNewline = !splicer.endsWith("\n");
  if (addedNewline) splicer += "\n";

  const out: Segment[] = [];
  let quotes = 0;
  let i = splicer.search(PONYMAIL_QUOTE_RE);

  while (i !== -1) {
    quotes++;
    if (quotes > MAX_QUOTES) break;

    if (i > 0) {
      pushChunk(splicer.substring(0, i), opts, budget, out);
      splicer = splicer.substring(i);
    }

    const m = splicer.match(PONYMAIL_QUOTE_RE);
    if (m && m[0].length) {
      // Advance past the raw match, but drop trailing bare '>' marker
      // lines from the rendered quote (old behavior).
      const quote = m[0].replace(/\n>[>\s]*$/g, "\n");
      out.push({ kind: "quote", children: linkify(quote, budget) });
      splicer = splicer.substring(m[0].length);
    } else {
      break; // cannot advance; bail rather than loop forever
    }

    i = splicer.search(PONYMAIL_QUOTE_RE);
  }

  pushChunk(splicer, opts, budget, out);
  if (addedNewline) stripHelperNewline(out);
  return out;
}

/** Process a non-quote chunk: diffs, then (chatty) trailers, then URLs. */
function pushChunk(chunk: string, opts: FixupOptions, budget: Budget, out: Segment[]): void {
  if (!chunk.length) return;
  for (const piece of extractDiffs(chunk, budget)) {
    if (piece.kind === "diff") {
      out.push(piece);
      continue;
    }
    // Trailer trimming applies only in chatty mode and never inside
    // quotes or diff blocks (diffs were already split out above).
    const text = opts.chatty ? cutTrailer(piece.text) : piece.text;
    if (text.length) out.push(...linkify(text, budget));
  }
}

/** Turn URLs into link segments; text in between stays text. */
function linkify(text: string, budget: Budget): Segment[] {
  const out: Segment[] = [];
  let splicer = text;
  let i = splicer.search(PONYMAIL_URL_RE);

  while (i !== -1) {
    if (budget.urls <= 0) break; // only parse the first 250 URLs... srsly
    budget.urls--;

    if (i > 0) {
      out.push({ kind: "text", text: splicer.substring(0, i) });
      splicer = splicer.substring(i);
    }

    const m = splicer.match(PONYMAIL_URL_RE);
    if (m && m[1] && m[1].length) {
      const url = m[1]; // group 1 excludes a trailing dot
      out.push({ kind: "link", href: url, text: url });
      splicer = splicer.substring(url.length);
    } else {
      break;
    }

    i = splicer.search(PONYMAIL_URL_RE);
  }

  if (splicer.length) out.push({ kind: "text", text: splicer });
  return out;
}

/** Split a text chunk into text pieces and classified diff segments. */
function extractDiffs(text: string, budget: Budget): (TextSegment | DiffSegment)[] {
  const out: (TextSegment | DiffSegment)[] = [];
  let splicer = text;
  let i = splicer.search(PONYMAIL_DIFF_RE);

  while (i !== -1) {
    if (budget.diffs <= 0) break;
    budget.diffs--;

    if (i > 0) {
      out.push({ kind: "text", text: splicer.substring(0, i) });
      splicer = splicer.substring(i);
    }

    const m = splicer.match(PONYMAIL_DIFF_RE);
    if (m && m[1] && m[1].length) {
      out.push({ kind: "diff", lines: classifyDiffLines(m[1]) });
      splicer = splicer.substring(m[1].length);
    } else {
      break;
    }

    i = splicer.search(PONYMAIL_DIFF_RE);
  }

  if (splicer.length) out.push({ kind: "text", text: splicer });
  return out;
}

function classifyDiffLines(diff: string): { type: DiffLineType; text: string }[] {
  const lines: { type: DiffLineType; text: string }[] = [];
  for (const line of diff.split(/[\r\n]+/)) {
    if (!line.length) continue;
    lines.push({ type: diffLineType(line), text: line });
  }
  return lines;
}

function diffLineType(line: string): DiffLineType {
  if (line.startsWith("---") || line.startsWith("+++")) return "meta";
  if (line.startsWith("@")) return "hunk";
  if (line.startsWith("-")) return "del";
  if (line.startsWith("+")) return "add";
  return "ctx";
}

/**
 * Cut away an email trailer if it does not look legitimate. Non-global
 * regex: only the first candidate per chunk is examined, as in the old
 * cut_trailer().
 */
function cutTrailer(text: string): string {
  return text.replace(PONYMAIL_TRAILER_RE, legitTrailer);
}

/** Old legit_trailer() heuristics: decide whether a trailer stays. */
function legitTrailer(a: string): string {
  const lines = a.split(/\s*\r?\n/);
  let firstLine = lines.shift() ?? "";
  while (firstLine.length === 0 && lines.length) firstLine = lines.shift() ?? "";
  if (!lines.length || firstLine === "--") return ""; // likely a simple trailer
  let lastLine = lines.pop() ?? "";
  while (lastLine.length === 0 && lines.length) lastLine = lines.pop() ?? "";

  // First and last line similar: usually indicative of a ticket system.
  if (lastLine === firstLine) return a;
  // First line has 3+ dashes and occurs again later (also tickets). The
  // old code wrapped this in "|||" debug markers; keep the text as-is.
  if (/^---+/.test(firstLine) && lines.includes(firstLine)) return a;
  // "Sufficient" dash length (JIRA-style separators etc.): keep.
  if (/^-{6,72}$/.test(firstLine)) return a;
  return "";
}

/** Undo the newline we appended to help quote matching. */
function stripHelperNewline(out: Segment[]): void {
  const last = out[out.length - 1];
  if (last && last.kind === "text" && last.text.endsWith("\n")) {
    last.text = last.text.slice(0, -1);
    if (!last.text.length) out.pop();
  }
}
