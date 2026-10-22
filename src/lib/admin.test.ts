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
import type { EmailResponse } from "./api/types";
import {
  auditEpoch,
  changedFields,
  editRequest,
  fmtBytes,
  formFromEmail,
  knownListAddresses,
  listProblem,
  listToForum,
  lookupId,
  targetsEmail,
} from "./admin";

const EMAIL = {
  id: "m1",
  mid: "m1",
  "message-id": "<x@y>",
  from: "Jane <jane@example.org>",
  subject: "Hello",
  epoch: 0,
  list: "<dev.example.org>",
  list_raw: "<dev.example.org>",
  body: "Body text",
  private: false,
  gravatar: "",
} as EmailResponse;

const KNOWN = { "example.org": { dev: 3, users: 1 }, "b.org": { a: 1 } };

describe("editor form", () => {
  it("derives the list address from list_raw", () => {
    expect(formFromEmail(EMAIL)).toEqual({
      from: "Jane <jane@example.org>",
      subject: "Hello",
      list: "dev@example.org",
      private: false,
      body: "Body text",
    });
  });

  it("reports changed fields", () => {
    const a = formFromEmail(EMAIL);
    expect(changedFields(a, { ...a })).toEqual([]);
    expect(changedFields(a, { ...a, subject: "X", private: true })).toEqual([
      "subject",
      "private",
    ]);
  });

  it("sends only changed text fields but always the privacy flag", () => {
    const a = formFromEmail(EMAIL);
    expect(editRequest("m1", a, { ...a })).toEqual({
      action: "edit",
      document: "m1",
      private: false,
    });
    expect(
      editRequest("m1", a, { ...a, body: "New", list: "users@example.org" }),
    ).toEqual({
      action: "edit",
      document: "m1",
      private: false,
      list: "users@example.org",
      body: "New",
    });
  });
});

describe("list validation", () => {
  it("converts list IDs like the server", () => {
    expect(listToForum("dev@example.org")).toBe("dev@example.org");
    expect(listToForum("<dev.example.org>")).toBe("dev@example.org");
  });

  it("flags malformed and unknown lists", () => {
    expect(listProblem("dev@example.org", KNOWN)).toBe("");
    expect(listProblem("<dev.example.org>", KNOWN)).toBe("");
    expect(listProblem("Dev@example.org", KNOWN)).toMatch(/lower case/);
    expect(listProblem("nope", KNOWN)).toMatch(/listname@domain/);
    expect(listProblem("x@example.org", KNOWN)).toMatch(/not a list known/);
  });

  it("lists known addresses sorted", () => {
    expect(knownListAddresses(KNOWN)).toEqual([
      "a@b.org",
      "dev@example.org",
      "users@example.org",
    ]);
  });
});

describe("audit log", () => {
  it("parses auditlog.py UTC timestamps", () => {
    expect(auditEpoch("2021/01/02 03:04:05")).toBe(
      Date.UTC(2021, 0, 2, 3, 4, 5) / 1000,
    );
    expect(auditEpoch("garbage")).toBeNull();
    expect(auditEpoch(undefined)).toBeNull();
  });

  it("links only email-targeting actions", () => {
    expect(targetsEmail("edit")).toBe(true);
    expect(targetsEmail("hide")).toBe(true);
    expect(targetsEmail("delatt")).toBe(false);
  });

  it("formats sizes like the classic console", () => {
    expect(fmtBytes(512)).toBe("512 bytes");
    expect(fmtBytes(2048)).toBe("2 KB");
    expect(fmtBytes(3 * 1024 * 1024)).toBe("3 MB");
  });
});

describe("lookupId", () => {
  it("accepts bare IDs and expands short links", () => {
    expect(lookupId("  abc123  ")).toBe("abc123");
    expect(lookupId("")).toBe("");
    expect(lookupId("Z" + "-".repeat(6) + "1" + "-".repeat(6) + "2")).toBe(
      "000000001000000002",
    );
  });

  it("extracts IDs from thread and admin permalinks", () => {
    expect(lookupId("https://lists.example.org/thread/abc")).toBe("abc");
    expect(lookupId("https://x.org/thread.html/a%2Fb/c?find_parent=true")).toBe(
      "a/b/c",
    );
    expect(lookupId("/admin.html/xyz")).toBe("xyz");
    expect(lookupId("/admin/xyz#frag")).toBe("xyz");
  });

  it("rejects URLs that do not name a document", () => {
    expect(lookupId("https://x.org/list.html?dev@x.org")).toBe("");
  });
});
