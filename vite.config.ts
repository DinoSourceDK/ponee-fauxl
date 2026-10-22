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
import { execSync } from "node:child_process";
import { copyFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

// Emit list.html, thread.html, oauth.html and admin.html as copies of the
// built index.html, so every URL the app pushes into browser history
// resolves as a real file on a plain static server (reloads and shared
// links work without SPA rewrite rules). Asset URLs are absolute
// (base: "/"), so the copies work from any path depth, including
// path-info URLs like /thread.html/<id>.
const LEGACY_PAGES = [
  "list.html",
  "thread.html",
  "oauth.html",
  "admin.html",
  "apidocs.html",
];

function legacyHtmlPages(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "ponymail-legacy-pages",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const index = resolve(outDir, "index.html");
      await Promise.all(
        LEGACY_PAGES.map((page) => copyFile(index, resolve(outDir, page))),
      );
    },
  };
}

// Dev-only middleware: serve index.html for legacy .html routes and path-info
// routes (thread.html/<id>, admin/<mid>, ...) that Vite's default SPA fallback
// won't catch because they look like file paths.
// IMPORTANT: req.url is used raw — never decodeURIComponent here, since
// message IDs may contain encoded slashes (%2F) that must survive verbatim.
function legacyHtmlFallback(): Plugin {
  const legacy =
    /^\/(list|thread|oauth|admin|apidocs|index)\.html(\/|$)|^\/(list|thread|admin|oauth|apidocs)(\/|$)/;
  return {
    name: "ponymail-legacy-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && !req.url.startsWith("/api/")) {
          const path = req.url.split("?")[0];
          if (legacy.test(path)) {
            req.url = "/index.html";
          }
        }
        next();
      });
    },
  };
}

// Latest commit hash of the site source — the software version shown in
// the footer ("Pony Mail Fauxl v/<hash>", see src/lib/version.ts).
function gitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

// The API documentation page (/apidocs) renders server/openapi.yaml:
// served from the repo in dev, copied into dist/ at build time.
function apiSpec(): Plugin {
  let config: ResolvedConfig;
  const specPath = (): string =>
    resolve(config.root, "../server/openapi.yaml");
  return {
    name: "ponymail-openapi-spec",
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/openapi.yaml") return next();
        readFile(specPath()).then(
          (buf) => {
            res.setHeader("content-type", "application/yaml");
            res.end(buf);
          },
          () => next(),
        );
      });
    },
    async closeBundle() {
      if (config.command !== "build") return;
      await copyFile(
        specPath(),
        resolve(config.root, config.build.outDir, "openapi.yaml"),
      );
    },
  };
}

export default defineConfig({
  define: {
    __PONYMAIL_VERSION__: JSON.stringify(gitHash()),
  },
  // History-API routing assumes a root deploy; for a sub-path deployment,
  // change base here and BASE_PATH in src/lib/router.ts.
  base: "/",
  plugins: [
    tailwindcss(),
    svelte(),
    legacyHtmlFallback(),
    legacyHtmlPages(),
    apiSpec(),
  ],
  server: {
    proxy: {
      "/api": {
        // The local backend is fronted by Apache httpd on https://localhost
        // with a self-signed certificate; secure:false skips TLS verification.
        target: "https://localhost",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      // Brand the emitted bundles: assets/ponymail-<hash>.js/.css
      // instead of Vite's default index-<hash>.*.
      output: {
        entryFileNames: "assets/ponymail-[hash].js",
        chunkFileNames: "assets/ponymail-[hash].js",
        assetFileNames: "assets/ponymail-[hash][extname]",
      },
    },
  },
});
