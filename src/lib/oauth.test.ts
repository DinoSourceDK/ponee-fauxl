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
import type { OauthProvider } from "./api/types";
import {
  EMPTY_OVERRIDES,
  exchangeArgs,
  mergeOauthProviders,
  parseOauthOverrides,
  portalRedirectUrl,
} from "./oauth";

const SERVER: Record<string, OauthProvider> = {
  google: { name: "Google", oauth_portal: "https://accounts.google.com/x" },
  generic: { name: "Generic", oauth_portal: "https://idp.example.org/auth" },
};

describe("parseOauthOverrides", () => {
  it("returns empty overrides for missing or malformed payloads", () => {
    expect(parseOauthOverrides(undefined)).toEqual(EMPTY_OVERRIDES);
    expect(parseOauthOverrides("x")).toEqual(EMPTY_OVERRIDES);
    expect(parseOauthOverrides({ providers: "x", order: 3 })).toEqual(
      EMPTY_OVERRIDES,
    );
  });

  it("keeps object provider entries and string order keys", () => {
    const parsed = parseOauthOverrides({
      providers: { google: { image: "/i.png" }, bad: 7 },
      order: ["google", 42],
    });
    expect(parsed.providers).toEqual({ google: { image: "/i.png" } });
    expect(parsed.order).toEqual(["google"]);
  });
});

describe("mergeOauthProviders", () => {
  it("passes server providers through alphabetically by default", () => {
    const out = mergeOauthProviders(SERVER, EMPTY_OVERRIDES);
    expect(out.map((d) => d.key)).toEqual(["generic", "google"]);
    expect(out[1].provider.name).toBe("Google");
  });

  it("overlays fields, keeps image UI-only, and hides providers", () => {
    const out = mergeOauthProviders(
      SERVER,
      parseOauthOverrides({
        providers: {
          google: { image: "/images/oauth_google.png", name: "Google SSO" },
          generic: { hidden: true },
        },
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("google");
    expect(out[0].image).toBe("/images/oauth_google.png");
    expect(out[0].provider.name).toBe("Google SSO");
    // image/hidden must not leak into portal params (construct:true).
    expect("image" in out[0].provider).toBe(false);
    expect("hidden" in out[0].provider).toBe(false);
  });

  it("adds client-only providers with a portal, ignores those without", () => {
    const out = mergeOauthProviders(
      SERVER,
      parseOauthOverrides({
        providers: {
          corp: { oauth_portal: "https://sso.corp/x", construct: true },
          broken: { name: "No portal" },
        },
      }),
    );
    const keys = out.map((d) => d.key);
    expect(keys).toContain("corp");
    expect(keys).not.toContain("broken");
    const corp = out.find((d) => d.key === "corp")!;
    expect(corp.provider.name).toBe("corp");
    expect(corp.provider.construct).toBe(true);
  });

  it("offers only allowlisted keys when enabled is non-empty", () => {
    const out = mergeOauthProviders(
      SERVER,
      parseOauthOverrides({ enabled: ["google"] }),
    );
    expect(out.map((d) => d.key)).toEqual(["google"]);
    // Empty allowlist means everything is offered.
    expect(
      mergeOauthProviders(SERVER, parseOauthOverrides({ enabled: [] })),
    ).toHaveLength(2);
  });

  it("applies the allowlist to override-added providers too", () => {
    const out = mergeOauthProviders(
      SERVER,
      parseOauthOverrides({
        enabled: ["apache_oidc"],
        providers: { apache_oidc: { oauth_portal: "https://o.example/x" } },
      }),
    );
    expect(out.map((d) => d.key)).toEqual(["apache_oidc"]);
  });

  it("orders listed keys first, then the rest alphabetically", () => {
    const out = mergeOauthProviders(
      SERVER,
      parseOauthOverrides({
        providers: { corp: { oauth_portal: "https://sso.corp/x" } },
        order: ["google"],
      }),
    );
    expect(out.map((d) => d.key)).toEqual(["google", "corp", "generic"]);
  });
});

describe("exchangeArgs", () => {
  it("adds the provider's oauth_token to the callback exchange", () => {
    const payload = exchangeArgs(
      { code: "c0d3", state: "12345" },
      "apache_oidc",
      {
        name: "Apache OpenID Connect",
        oauth_portal: "https://oauth.apache.org/oauth-oidc",
        oauth_token: "oidc",
      },
    );
    expect(payload).toEqual({
      code: "c0d3",
      state: "12345",
      key: "apache_oidc",
      oauth_token: "oidc",
    });
  });

  it("leaves the payload alone when no oauth_token is configured", () => {
    const payload = exchangeArgs({ code: "x" }, "generic", SERVER.generic);
    expect(payload).toEqual({ code: "x", key: "generic" });
  });
});

describe("portalRedirectUrl", () => {
  it("threads key=apache_oidc through the redirect_uri", () => {
    const url = portalRedirectUrl(
      "apache_oidc",
      {
        name: "Apache OpenID Connect",
        oauth_portal: "https://oauth.apache.org/oauth-oidc",
      },
      "12345",
      "https://lists.example.org/oauth.html",
    );
    expect(url).toBe(
      "https://oauth.apache.org/oauth-oidc?state=12345&redirect_uri=" +
        encodeURIComponent(
          "https://lists.example.org/oauth.html?key=apache_oidc&state=12345",
        ),
    );
  });

  it("urlencodes every provider field for construct:true portals", () => {
    const url = portalRedirectUrl(
      "corp",
      {
        name: "Corp",
        oauth_portal: "https://sso.corp/auth",
        construct: true,
        scope: "openid email",
      },
      "9",
      "https://x.org/oauth.html",
    );
    expect(url).toContain("&scope=openid%20email");
    expect(url).toContain("&name=Corp");
  });

  it("uses the implicit id_token flow for google", () => {
    const url = portalRedirectUrl(
      "google",
      { name: "G", oauth_portal: "https://g/auth", client_id: "cid" },
      "7",
      "https://x.org/oauth.html",
    );
    expect(url).toContain("response_type=id_token");
    expect(url).toContain("client_id=cid");
    expect(url).not.toContain("key=google");
  });
});
