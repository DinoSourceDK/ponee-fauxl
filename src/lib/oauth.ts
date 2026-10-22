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
 * Deployment-side OAuth customization, the counterpart of the classic
 * webui's editable oauth.js. The backend supplies the provider list
 * (preferences.json {oauth:true}, from ponymail.yaml); an optional
 * /oauth.json overlays it per provider key:
 *
 *   {
 *     "enabled": ["apache_oidc"],
 *     "providers": {
 *       "google": { "image": "/images/oauth_google.png" },
 *       "generic": { "hidden": true },
 *       "myidp":  { "name": "Corp SSO", "oauth_portal": "https://…",
 *                    "construct": true, "customParam": "x" }
 *     },
 *     "order": ["google", "myidp"]
 *   }
 *
 * A non-empty `enabled` is an allowlist: only those provider keys are
 * offered, whatever the backend advertises.
 *
 * `image` and `hidden` are UI-only; every other key is merged into the
 * provider and (for construct:true portals) urlencoded into the
 * redirect, exactly like the classic oauthPortal().
 */

import type { OauthProvider } from "./api/types";

export interface OauthOverrides {
  providers: Record<string, Record<string, unknown>>;
  order: string[];
  /** Allowlist: when non-empty, only these provider keys are offered. */
  enabled: string[];
}

export const EMPTY_OVERRIDES: OauthOverrides = {
  providers: {},
  order: [],
  enabled: [],
};

export interface DisplayProvider {
  key: string;
  provider: OauthProvider;
  /** Button image URL (classic images/oauth_<key>.png), if configured. */
  image?: string;
}

/** Tolerant parse of an oauth.json payload; bad shapes become empty. */
export function parseOauthOverrides(raw: unknown): OauthOverrides {
  if (typeof raw !== "object" || raw === null) return EMPTY_OVERRIDES;
  const o = raw as Record<string, unknown>;
  const providers: Record<string, Record<string, unknown>> = {};
  if (typeof o.providers === "object" && o.providers !== null) {
    for (const [key, val] of Object.entries(o.providers)) {
      if (typeof val === "object" && val !== null) {
        providers[key] = val as Record<string, unknown>;
      }
    }
  }
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];
  return { providers, order: strings(o.order), enabled: strings(o.enabled) };
}

/**
 * Overlay overrides on the server's provider map and produce the
 * display list: hidden providers dropped, override-only providers
 * (with an oauth_portal) added, `order` keys first then the rest
 * alphabetically.
 */
export function mergeOauthProviders(
  server: Record<string, OauthProvider>,
  overrides: OauthOverrides,
): DisplayProvider[] {
  const merged = new Map<string, DisplayProvider>();
  for (const [key, provider] of Object.entries(server)) {
    merged.set(key, { key, provider: { ...provider } });
  }
  for (const [key, over] of Object.entries(overrides.providers)) {
    const { image, hidden, ...fields } = over;
    if (hidden === true) {
      merged.delete(key);
      continue;
    }
    const existing = merged.get(key);
    if (existing) {
      existing.provider = { ...existing.provider, ...fields };
    } else if (typeof fields.oauth_portal === "string") {
      // Client-only provider: needs at least a portal to redirect to.
      merged.set(key, {
        key,
        provider: { name: key, ...fields } as OauthProvider,
      });
    } else {
      continue;
    }
    if (typeof image === "string" && image) {
      const entry = merged.get(key);
      if (entry) entry.image = image;
    }
  }

  let keys = [...merged.keys()];
  if (overrides.enabled.length > 0) {
    keys = keys.filter((k) => overrides.enabled.includes(k));
  }
  const rank = new Map(overrides.order.map((k, i) => [k, i]));
  keys.sort((a, b) => {
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ra !== rb ? ra - rb : a.localeCompare(b);
  });
  return keys.map((k) => merged.get(k)!);
}

/**
 * Payload for the /api/oauth.json exchange after the provider
 * redirected back: every callback argument, the provider key, and,
 * when the provider entry configures one, its `oauth_token` value.
 * The backend relays this form data verbatim to the provider's
 * .oauth_url; the ASF OIDC token endpoint requires oauth_token=oidc.
 */
export function exchangeArgs(
  args: Record<string, string>,
  key: string,
  provider: OauthProvider,
): Record<string, string> {
  const payload: Record<string, string> = { ...args, key };
  if (typeof provider.oauth_token === "string" && provider.oauth_token) {
    payload.oauth_token = provider.oauth_token;
  }
  return payload;
}

/**
 * Portal redirect URL, built exactly as the classic oauthPortal(). The
 * provider key rides in the redirect_uri (`?key=<key>&state=<nonce>`),
 * so both the callback and the backend's oauth.json exchange know
 * which provider (e.g. apache_oidc) is in play. Google is the exception:
 * implicit flow, id_token in the URL hash, no key round-trip needed.
 */
export function portalRedirectUrl(
  key: string,
  p: OauthProvider,
  nonce: string,
  base: string,
): string {
  if (key === "google") {
    return (
      p.oauth_portal +
      "?state=" + nonce +
      "&client_id=" + encodeURIComponent(p.client_id ?? "") +
      "&response_type=id_token&scope=email" +
      "&redirect_uri=" + encodeURIComponent(base)
    );
  }
  let extra = "";
  if (p.construct) {
    // construct:true providers get every config key urlencoded along.
    for (const [k, v] of Object.entries(p)) {
      extra += "&" + k + "=" + encodeURIComponent(String(v));
    }
  }
  return (
    p.oauth_portal +
    "?state=" + nonce +
    "&redirect_uri=" + encodeURIComponent(base + "?key=" + key + "&state=" + nonce) +
    extra
  );
}

/** Fetch /oauth.json; a missing or invalid file means no overrides. */
export async function loadOauthOverrides(): Promise<OauthOverrides> {
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}oauth.json`, {
      headers: { accept: "application/json" },
    });
    if (!resp.ok) return EMPTY_OVERRIDES;
    return parseOauthOverrides(await resp.json());
  } catch {
    return EMPTY_OVERRIDES;
  }
}
