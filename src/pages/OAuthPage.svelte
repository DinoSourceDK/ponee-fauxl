<!--
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
-->
<script lang="ts">
  /**
   * OAuth login page. Two modes, decided on mount (ported from
   * webui/js/oauth.js oauthInit/oauthPortal/parseOauthResponse):
   *  - provider selection: list configured providers, redirect to portal;
   *  - callback: `code` in the query string (generic providers, testauth)
   *    or `id_token` in the hash (Google), then exchange via oauth.json.
   */
  import { clearEmailCache, oauthCallback, oauthConfig } from "../lib/api/client";
  import type { OauthProvider } from "../lib/api/types";
  import { config } from "../lib/config";
  import type { DisplayProvider } from "../lib/oauth";
  import {
    exchangeArgs,
    loadOauthOverrides,
    mergeOauthProviders,
    portalRedirectUrl,
  } from "../lib/oauth";
  import { navigate } from "../lib/router.svelte";
  import { doLogout, loadSession, session } from "../lib/stores/session.svelte";
  import { toast } from "../lib/stores/toasts.svelte";

  const STATE_KEY = "ponymail2_oauth_state";
  const ORIGIN_KEY = "ponymail2_oauth_origin";

  type Phase = "loading" | "select" | "authenticating" | "error";
  let phase: Phase = $state("loading");
  let providers: Record<string, OauthProvider> = $state({});
  let display: DisplayProvider[] = $state([]);
  let errorMsg = $state("");

  /** Server provider list overlaid with the /oauth.json customization. */
  async function fetchProviders(): Promise<void> {
    const [cfg, overrides] = await Promise.all([
      oauthConfig(),
      loadOauthOverrides(),
    ]);
    display = mergeOauthProviders(cfg.oauth ?? {}, overrides);
    providers = Object.fromEntries(display.map((d) => [d.key, d.provider]));
  }

  /** Current /oauth URL without query/hash, the redirect_uri base. */
  function currentBase(): string {
    return location.origin + location.pathname;
  }

  // Same nonce shape as oauth.js: two random 0..1e9 ints concatenated.
  function makeNonce(): string {
    return (
      String(Math.floor(Math.random() * 1_000_000_000)) +
      String(Math.floor(Math.random() * 1_000_000_000))
    );
  }

  function beginLogin(key: string): void {
    const p = providers[key];
    if (!p) return;
    const nonce = makeNonce();
    // Where to return after login: the referring page if same-origin.
    let origin = "/";
    if (document.referrer) {
      try {
        const u = new URL(document.referrer);
        if (u.origin === location.origin) origin = u.pathname + u.search + u.hash;
      } catch {
        // unparsable referrer: keep "/"
      }
    }
    sessionStorage.setItem(STATE_KEY, nonce);
    sessionStorage.setItem(ORIGIN_KEY, origin);
    location.href = portalRedirectUrl(key, p, nonce, currentBase());
  }

  /** Collect callback args from query + hash; null if not a callback. */
  function callbackArgs(): Record<string, string> | null {
    const args: Record<string, string> = {};
    new URLSearchParams(location.search).forEach((v, k) => {
      args[k] = v;
    });
    // Google (response_type=id_token) returns its response in the hash.
    new URLSearchParams(location.hash.replace(/^#/, "")).forEach((v, k) => {
      args[k] = v;
    });
    if (!args.code && !args.id_token) return null;
    if (args.id_token) args.key = "google";
    return args;
  }

  function fail(msg: string): void {
    errorMsg = msg;
    phase = "error";
  }

  async function handleCallback(args: Record<string, string>): Promise<void> {
    phase = "authenticating";
    try {
      await fetchProviders();
      const key = args.key ?? "";
      if (!key || !providers[key]) {
        fail(`OAuth provider key missing or invalid: ${key || "(none)"}`);
        return;
      }
      // CSRF check: any returned state must match the nonce we stored.
      if (args.state !== undefined && args.state !== sessionStorage.getItem(STATE_KEY)) {
        fail("OAuth state mismatch. This login attempt could not be verified. Please try again.");
        return;
      }
      const res = await oauthCallback(exchangeArgs(args, key, providers[key]));
      if (!res.okay) {
        fail(res.message || "Authentication failed.");
        return;
      }
      let origin = sessionStorage.getItem(ORIGIN_KEY) || "/";
      if (!origin.startsWith("/")) origin = "/";
      sessionStorage.removeItem(STATE_KEY);
      sessionStorage.removeItem(ORIGIN_KEY);
      clearEmailCache(); // privacy: private-list access may have changed
      await loadSession();
      const who = session.credentials?.fullname || session.credentials?.email;
      toast("success", who ? `Logged in as ${who}.` : "Logged in.");
      navigate(origin, { replace: true });
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  }

  async function showOptions(): Promise<void> {
    phase = "loading";
    try {
      await fetchProviders();
      phase = "select";
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  }

  function retry(): void {
    // Drop stale callback args from the URL, then offer the providers again.
    navigate("/oauth.html", { replace: true });
    void showOptions();
  }

  const cb = callbackArgs();
  if (cb) {
    void handleCallback(cb);
  } else {
    void showOptions();
  }
</script>

<div class="mx-auto max-w-md px-4 py-12">
  <div
    class="rounded-md border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
  >
    <h1 class="mb-4 text-center text-lg font-semibold text-slate-900 dark:text-slate-100">
      Log in to {config.title}
    </h1>

    {#if phase === "loading"}
      <p class="text-center text-sm text-slate-500 dark:text-slate-400">
        Loading login options…
      </p>
    {:else if phase === "authenticating"}
      <div class="flex flex-col items-center gap-3 py-4">
        <div
          class="h-8 w-8 animate-spin rounded-full border-4 border-pony-200 border-t-pony-600 dark:border-pony-800 dark:border-t-pony-300"
        ></div>
        <p class="text-sm text-slate-600 dark:text-slate-300">Logging you in, hang on…</p>
      </div>
    {:else if phase === "error"}
      <div
        class="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      >
        <p class="font-medium">Authentication failed</p>
        <p class="mt-1">{errorMsg}</p>
        <button
          type="button"
          class="mt-3 text-pony-600 underline hover:text-pony-700 dark:text-pony-300 dark:hover:text-pony-200"
          onclick={retry}
        >
          Try again
        </button>
      </div>
    {:else}
      {#if session.credentials}
        <div
          class="mb-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950"
        >
          <p class="text-slate-700 dark:text-slate-200">
            Logged in as
            <span class="font-medium">{session.credentials.fullname}</span>
            {#if session.credentials.email}
              <span class="text-slate-500 dark:text-slate-400">
                ({session.credentials.email})
              </span>
            {/if}
          </p>
          <button
            type="button"
            class="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onclick={() => doLogout()}
          >
            Log out
          </button>
        </div>
      {/if}

      {#if display.length > 0}
        <p class="mb-3 text-center text-sm text-slate-600 dark:text-slate-300">
          {#if session.credentials}
            Or log in with a different identity provider:
          {:else}
            Log in using one of the following identity providers:
          {/if}
        </p>
        <div class="flex flex-col gap-2">
          {#each display as { key, provider, image } (key)}
            {#if image}
              <!-- Image button, like the classic images/oauth_<key>.png -->
              <button
                type="button"
                title="Log in with {provider.name || key}"
                class="w-full rounded-md border border-slate-200 bg-white p-2
                       hover:border-pony-300 hover:bg-slate-50
                       focus:ring-2 focus:ring-pony-500 focus:outline-none
                       dark:border-slate-700 dark:bg-slate-100
                       dark:hover:border-pony-500"
                onclick={() => beginLogin(key)}
              >
                <img
                  src={image}
                  alt="Log in with {provider.name || key}"
                  class="mx-auto max-h-10"
                />
              </button>
            {:else}
              <button
                type="button"
                class="w-full rounded-md bg-pony-600 px-4 py-2 text-sm font-medium text-white hover:bg-pony-700 dark:bg-pony-700 dark:hover:bg-pony-600"
                onclick={() => beginLogin(key)}
              >
                Log in with {provider.name || key}
              </button>
            {/if}
          {/each}
        </div>
      {:else}
        <div
          class="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <p class="font-medium">No login providers available</p>
          <p class="mt-1">
            No OAuth providers are configured on this server. An administrator
            can add them under the <code>oauth</code> section of
            <code>ponymail.yaml</code>. Development setups can start the server
            with <code>--testendpoints</code> to enable a local test login.
          </p>
        </div>
      {/if}
    {/if}

    <p class="mt-6 text-center">
      <button
        type="button"
        class="text-sm text-pony-600 hover:underline dark:text-pony-300"
        onclick={() => history.back()}
      >
        Never mind, take me back to the previous page
      </button>
    </p>
  </div>
</div>
