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
import { uiStyleFromSearch } from "./uistyle";

describe("uiStyleFromSearch", () => {
  it("reads a lone ui parameter, with or without '?'", () => {
    expect(uiStyleFromSearch("?ui=forum")).toBe("forum");
    expect(uiStyleFromSearch("?ui=standard")).toBe("standard");
    expect(uiStyleFromSearch("ui=forum")).toBe("forum");
  });

  it("reads ui among ordinary key=value parameters", () => {
    expect(uiStyleFromSearch("?find_parent=true&ui=forum")).toBe("forum");
    expect(uiStyleFromSearch("?ui=standard&find_parent=true")).toBe(
      "standard",
    );
  });

  it("reads ui glued to a positional list spec", () => {
    expect(uiStyleFromSearch("?users@x.org:2025-9&ui=forum")).toBe("forum");
    expect(uiStyleFromSearch("?dev@x.org:lte=1M:crash&ui=standard")).toBe(
      "standard",
    );
    // ...including with header filters after it.
    expect(
      uiStyleFromSearch("?dev@x.org:2025-9&ui=forum&header_from=bob"),
    ).toBe("forum");
    // ...or before it.
    expect(
      uiStyleFromSearch("?dev@x.org:2025-9&header_from=bob&ui=forum"),
    ).toBe("forum");
  });

  it("requires a real parameter boundary", () => {
    expect(uiStyleFromSearch("?gui=forum")).toBeNull();
    expect(uiStyleFromSearch("?dev@x.org:2024-3:gui=forum")).toBeNull();
  });

  it("lets the last occurrence win", () => {
    expect(uiStyleFromSearch("?ui=standard&ui=forum")).toBe("forum");
    expect(uiStyleFromSearch("?ui=forum&ui=nope")).toBeNull();
  });

  it("returns null for unknown values and junk", () => {
    expect(uiStyleFromSearch("")).toBeNull();
    expect(uiStyleFromSearch("?")).toBeNull();
    expect(uiStyleFromSearch("?ui=")).toBeNull();
    expect(uiStyleFromSearch("?ui=brutalist")).toBeNull();
    expect(uiStyleFromSearch("?ui=FORUM")).toBeNull();
    expect(uiStyleFromSearch("?dev@x.org:2025-9")).toBeNull();
    expect(uiStyleFromSearch("?uist=forum&u=standard")).toBeNull();
  });
});
