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
import { DEFAULT_CONFIG, mergeConfig } from "./config";

describe("mergeConfig", () => {
  it("returns defaults for a missing or non-object payload", () => {
    expect(mergeConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(mergeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(mergeConfig("nope")).toEqual(DEFAULT_CONFIG);
  });

  it("overlays known keys and keeps defaults for the rest", () => {
    const merged = mergeConfig({
      title: "Apache Pony Mail",
      subscribeLinks: true,
      defaults: { theme: "dark", utc: true },
    });
    expect(merged.title).toBe("Apache Pony Mail");
    expect(merged.subscribeLinks).toBe(true);
    expect(merged.defaults.theme).toBe("dark");
    expect(merged.defaults.utc).toBe(true);
    // Untouched keys stay at their defaults.
    expect(merged.apiUrl).toBe(DEFAULT_CONFIG.apiUrl);
    expect(merged.defaults.listmode).toBe("threaded");
  });

  it("accepts a custom logo URL and defaults it otherwise", () => {
    expect(mergeConfig({ logo: "/img/acme.png" }).logo).toBe("/img/acme.png");
    expect(mergeConfig({}).logo).toBe(DEFAULT_CONFIG.logo);
    expect(mergeConfig({ logo: 42 }).logo).toBe(DEFAULT_CONFIG.logo);
  });

  it("ignores mistyped values instead of breaking the app", () => {
    const merged = mergeConfig({
      title: 42,
      boringLists: "commits",
      defaults: {
        listmode: "spiral",
        compact: "yes",
        homeView: "spiral",
        uiStyle: "brutalist",
      },
    });
    expect(merged.title).toBe(DEFAULT_CONFIG.title);
    expect(merged.boringLists).toEqual(DEFAULT_CONFIG.boringLists);
    expect(merged.defaults.listmode).toBe("threaded");
    expect(merged.defaults.compact).toBe(false);
    expect(merged.defaults.homeView).toBe("grid");
    expect(merged.defaults.uiStyle).toBe("standard");
  });

  it("normalizes apiUrl trailing slashes ('' means site root)", () => {
    expect(mergeConfig({ apiUrl: "/api/" }).apiUrl).toBe("/api");
    expect(mergeConfig({ apiUrl: "/" }).apiUrl).toBe("");
    expect(mergeConfig({ apiUrl: "" }).apiUrl).toBe("");
  });

  it("drops non-string entries from list arrays", () => {
    expect(mergeConfig({ boringLists: ["cvs", 7, "commits"] }).boringLists)
      .toEqual(["cvs", "commits"]);
  });
});
