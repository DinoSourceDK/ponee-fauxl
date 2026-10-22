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
# Pony Mail Foal — modern frontend

A single-page frontend for Apache Pony Mail Foal built with
[Svelte 5](https://svelte.dev), TypeScript, [Vite](https://vite.dev) and
[Tailwind CSS 4](https://tailwindcss.com). It talks to the standard Foal API
(`/api/*.json`) and is a feature-parity replacement for the classic `webui/`.

Everything is built and served locally: the production bundle contains no
CDN or other external references. The app itself is dependency-free; the
one bundled runtime dependency is [Swagger UI](https://swagger.io/tools/swagger-ui/)
(Apache-2.0), lazy-loaded only on the `/apidocs` page, which renders the
server's `openapi.yaml` (copied into `dist/` at build time).

## Development

Requirements: Node.js 20.19+ (or 22.12+).

```bash
cd frontend
npm install
npm run dev        # dev server on http://localhost:5173
```

The dev server proxies `/api/*` to `https://localhost/` (a local Pony Mail
backend behind a reverse proxy with a self-signed certificate — TLS
verification is disabled for the proxy hop; see `vite.config.ts`).

Other scripts:

```bash
npm run check      # svelte-check (type checking)
npm run test       # vitest unit tests (URL parser, body fixups, etc.)
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

## Deployment

`npm run build` emits a fully static `dist/` directory. Serve it as the
document root and proxy `/api/` to the Pony Mail API server.

Every URL the app pushes into browser history resolves as a real file:
the build ships `list.html`, `thread.html`, `oauth.html` and `admin.html`
(copies of `index.html`), so reloads and shared links work without SPA
rewrite rules. The server must:

- **not** decode encoded slashes in paths (legacy message IDs may contain
  `%2F`) — Apache: `AllowEncodedSlashes NoDecode`;
- accept path-info on the static pages (`/thread.html/<id>`,
  `/admin.html/<mid>`) — Apache: `AcceptPathInfo On`; nginx falls back via
  `try_files`.

A catch-all rewrite to `index.html` is optional; it additionally makes the
extensionless aliases (`/list`, `/thread/<id>`, …) reachable directly.

Apache httpd:

```apache
<VirtualHost *:443>
    ServerName lists.example.org
    DocumentRoot /opt/ponymail-foal/frontend/dist
    AllowEncodedSlashes NoDecode

    ProxyPass /api/ http://127.0.0.1:8080/api/ nocanon
    ProxyPassReverse /api/ http://127.0.0.1:8080/api/

    <Directory /opt/ponymail-foal/frontend/dist>
        Require all granted
        AcceptPathInfo On
        # Optional: also serve extensionless deep links (/list, /thread/<id>)
        FallbackResource /index.html
    </Directory>
</VirtualHost>
```

nginx:

```nginx
server {
    listen 443 ssl;
    server_name lists.example.org;
    root /opt/ponymail-foal/frontend/dist;
    index index.html;

    location /api/ {
        # $request_uri keeps %2F in message IDs intact (no re-decoding)
        proxy_pass http://127.0.0.1:8080$request_uri;
    }
    location / {
        try_files $uri /index.html;
    }
}
```

## Runtime configuration

The app loads `config.json` from the site root at startup (shipped in
`dist/` with defaults; edit it in place — no rebuild needed). A missing
or invalid file means defaults. It is the counterpart of the classic
webui's `config.js`:

| Key                 | Default                    | Classic equivalent    |
| ------------------- | -------------------------- | --------------------- |
| `title`             | `"Pony Mail"`              | `prefs.title`         |
| `apiUrl`            | `"/api"`                   | `pm_config.apiURL`    |
| `gravatarUrl`       | `"/api/gravatar?md5=%s"`   | `GRAVATAR_URL`        |
| `favoriteList`      | `"dev"`                    | `favorite_list`       |
| `boringLists`       | `["commits", "cvs", …]`    | `boring_lists`        |
| `subscribeLinks`    | `false`                    | `prefs.subscribeLinks`|
| `permErrorPostface` | `""`                       | `perm_error_postface` |
| `defaults.listmode` | `"threaded"`               | `prefs.displayMode`   |
| `defaults.chatty`   | `true`                     | (social theme)        |
| `defaults.compact`  | `false`                    | compact checkbox      |
| `defaults.theme`    | `"auto"`                   | `prefs.theme`         |
| `defaults.showStatsSidebar` | `true`             | `prefs.hideStats`     |
| `defaults.utc`      | `false`                    | `prefs.UTC`           |
| `defaults.homeView` | `"grid"`                   | —                     |
| `defaults.uiStyle`  | `"standard"`               | —                     |

`title` names the site/archive (header wordmark, window titles). The
software identity is separate and not configurable: the footer shows
"Pony Mail Fauxl v/`<hash>`", the source commit the bundle was built
from.

`defaults.*` seed the per-browser preferences and apply until a visitor
changes any setting (preferences persist in localStorage). Not carried
over: `URLBase` (a build-time setting here — `base` in `vite.config.ts`),
`long_tabs` and `LOTS_OF_LISTS` (the list index and switcher layouts
differ from the classic UI). Any page also accepts `?ui=forum` /
`?ui=standard` (on list pages, `&ui=…` after the positional spec) to
switch and persist the layout.

### OAuth customization (`oauth.json`)

The login page's provider list comes from the backend
(`preferences.json {oauth:true}`, configured in `ponymail.yaml`). An
optional `oauth.json` at the site root customizes it in place — the
counterpart of editing the classic webui's `oauth.js`:

```json
{
  "enabled": ["apache_oidc"],
  "providers": {
    "google":  { "image": "/images/oauth_google.png" },
    "generic": { "hidden": true },
    "corpsso": { "name": "Corp SSO",
                 "oauth_portal": "https://sso.example.org/auth",
                 "construct": true, "client_id": "ponymail" }
  },
  "order": ["google", "corpsso"]
}
```

A non-empty `enabled` is an allowlist: only those provider keys are
offered, whatever the backend advertises. The shipped default enables
exactly `apache_oidc` (Apache OpenID Connect, as on lists.apache.org)
and defines its portal, `https://oauth.apache.org/oauth-oidc`. The
whole flow is keyed by `key=apache_oidc`: the login page redirects to
the portal with `state` and a `redirect_uri` carrying the key, and the
backend's generic OAuth handler exchanges the returned `code` against
the provider's `.oauth_url` (`https://oauth.apache.org/token-oidc`),
which must be configured under `oauth.providers.apache_oidc` in
`ponymail.yaml`.

Per provider key: `image` renders the button as a picture (classic
`images/oauth_<key>.png`; serve the file from the document root),
`hidden` removes the provider, `oauth_token` is passed along in the
callback exchange (the ASF OIDC token endpoint requires
`oauth_token: "oidc"`), and any other field overrides or extends
the backend entry — for `construct: true` portals every field is
urlencoded into the redirect, exactly like the classic `oauthPortal()`.
Entries unknown to the backend are offered too, provided they carry an
`oauth_portal`. `order` puts listed providers first; the rest follow
alphabetically.

## URL compatibility

Deep links from the classic UI keep working:

- `/list.html?<list>@<domain>:<date>:<query>` (incl. `&header_from=...` filters
  and multi-list virtual inboxes `a@x.org,b@y.org`)
- `/thread.html/<id>` and `/thread/<id>` permalinks (incl. legacy short IDs)
- `/oauth.html`, `/admin.html`, `/admin/<mid>`

New in this UI: `/apidocs` (also `/apidocs.html`) — interactive API
documentation rendered from the server's OpenAPI specification.

## Testing authenticated features

Run the API server with mock authentication and log in via the "Test Auth"
provider on the login page:

```bash
cd server
python3 main.py --testendpoints
```
