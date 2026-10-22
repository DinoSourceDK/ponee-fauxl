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
import type { EmailResponse } from "./api/types";
import {
  mailtoNew,
  mailtoReply,
  quoteReply,
  replyAddress,
  replyReferences,
  replySubject,
} from "./compose";

function makeEmail(overrides: Partial<EmailResponse> = {}): EmailResponse {
  return {
    id: "abc123",
    mid: "abc123",
    "message-id": "<msg-1@example.org>",
    from: '"Jane Doe" <jane@example.org>',
    subject: "Ponies are great",
    date: "2025-04-01 12:00:00",
    epoch: 1743508800,
    list: "dev@ponymail.apache.org",
    list_raw: "<dev.ponymail.apache.org>",
    body: "Hello world\n\nSecond paragraph",
    private: false,
    gravatar: "",
    ...overrides,
  };
}

describe("replySubject", () => {
  it("prefixes Re: on a fresh subject", () => {
    expect(replySubject("Ponies are great")).toBe("Re: Ponies are great");
  });

  it("is idempotent for any-case existing Re: prefixes", () => {
    expect(replySubject("Re: Ponies")).toBe("Re: Ponies");
    expect(replySubject("RE: Ponies")).toBe("RE: Ponies");
    expect(replySubject("re: Ponies")).toBe("re: Ponies");
    expect(replySubject(replySubject("Ponies"))).toBe("Re: Ponies");
  });

  it("still prefixes when Re: lacks trailing whitespace or is mid-word", () => {
    expect(replySubject("Re:Ponies")).toBe("Re: Re:Ponies");
    expect(replySubject("Regarding ponies")).toBe("Re: Regarding ponies");
  });
});

describe("replyAddress", () => {
  it("prefers the parsed list address", () => {
    expect(replyAddress(makeEmail())).toBe("dev@ponymail.apache.org");
  });

  it("falls back to list_raw when list is absent", () => {
    const email = makeEmail({ list: undefined });
    expect(replyAddress(email)).toBe("dev@ponymail.apache.org");
  });
});

describe("quoteReply", () => {
  it("builds the attribution header and quotes every line", () => {
    const email = makeEmail({ body: "line one\n\nline three" });
    expect(quoteReply(email)).toBe(
      "\n\nOn 2025-04-01 12:00:00 Jane Doe wrote:\n" +
        "> line one\n" +
        "> \n" +
        "> line three",
    );
  });

  it("splits CRLF bodies", () => {
    const email = makeEmail({ body: "a\r\nb" });
    expect(quoteReply(email)).toContain("> a\n> b");
  });

  it("falls back to formatDate(epoch, true) when date is missing", () => {
    const email = makeEmail({ date: undefined, epoch: 1743508800 });
    expect(quoteReply(email)).toContain("On 2025-04-01 12:00 UTC Jane Doe");
  });
});

describe("replyReferences", () => {
  it("returns just the message-id when there are no references", () => {
    expect(replyReferences(makeEmail())).toBe("<msg-1@example.org>");
  });

  it("appends the message-id to the existing chain", () => {
    const email = makeEmail({ references: "<a@x> <b@x>" });
    expect(replyReferences(email)).toBe("<a@x> <b@x> <msg-1@example.org>");
  });

  it("dedupes when the message-id is already referenced", () => {
    const email = makeEmail({
      references: "<a@x>  <msg-1@example.org>\n<a@x>",
    });
    expect(replyReferences(email)).toBe("<a@x> <msg-1@example.org>");
  });

  it("is empty-safe", () => {
    const email = makeEmail({ references: "", "message-id": "" });
    expect(replyReferences(email)).toBe("");
  });
});

describe("mailtoReply", () => {
  it("targets the list with encoded subject, in-reply-to and quoted body", () => {
    const email = makeEmail();
    const link = mailtoReply(email);
    expect(link.startsWith("mailto:dev@ponymail.apache.org?")).toBe(true);
    expect(link).toContain(
      `subject=${encodeURIComponent("Re: Ponies are great")}`,
    );
    expect(link).toContain(
      `&In-Reply-To=${encodeURIComponent("<msg-1@example.org>")}`,
    );
    expect(link).toContain(`&body=${encodeURIComponent(quoteReply(email))}`);
  });

  it("truncates quoted bodies above 16000 chars", () => {
    const email = makeEmail({ body: "x".repeat(20000) });
    const body = decodeURIComponent(mailtoReply(email).split("&body=")[1]);
    expect(body.length).toBe(16000 + "\n[message truncated...]".length);
    expect(body.endsWith("\n[message truncated...]")).toBe(true);
  });

  it("does not truncate bodies at or below the cap", () => {
    const email = makeEmail({ body: "short" });
    const body = decodeURIComponent(mailtoReply(email).split("&body=")[1]);
    expect(body).toBe(quoteReply(email));
  });
});

describe("mailtoNew", () => {
  it("emits the classic placeholder-subject link verbatim", () => {
    expect(mailtoNew("dev@ponymail.apache.org")).toBe(
      "mailto:dev@ponymail.apache.org?subject=Subject+goes+here",
    );
  });
});
