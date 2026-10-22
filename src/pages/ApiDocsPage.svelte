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
   * Interactive API documentation: Swagger UI (bundled locally, lazy
   * chunk) rendering the server's OpenAPI spec, which is shipped as
   * /openapi.yaml next to the app (see vite.config.ts apiSpec()).
   */
  import { config } from "../lib/config";
  import Skeleton from "../components/ui/Skeleton.svelte";

  let container: HTMLElement | undefined = $state();
  let loading = $state(true);
  let error = $state("");

  $effect(() => {
    if (!container) return;
    const node = container;
    let cancelled = false;
    Promise.all([
      import("swagger-ui-dist"),
      // Side-effect import: vite injects the stylesheet with the chunk.
      import("swagger-ui-dist/swagger-ui.css"),
    ])
      .then(([mod]) => {
        if (cancelled) return;
        mod.SwaggerUIBundle({
          url: `${import.meta.env.BASE_URL}openapi.yaml`,
          domNode: node,
          presets: [mod.SwaggerUIBundle.presets.apis],
          deepLinking: true,
        });
        loading = false;
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        error = e instanceof Error ? e.message : String(e);
        loading = false;
      });
    return () => {
      cancelled = true;
      node.innerHTML = "";
    };
  });

  const originalTitle = document.title;
  $effect(() => {
    document.title = `API - ${config.title}`;
    return () => {
      document.title = originalTitle;
    };
  });
</script>

<div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
  <h1 class="text-2xl font-semibold text-slate-800 dark:text-slate-100">
    API documentation
  </h1>
  <p class="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
    The Pony Mail Foal JSON API, straight from the server's OpenAPI
    specification. "Try it out" requests run against this site's own
    <code>/api/</code> endpoints.
  </p>

  {#if error}
    <div
      class="rounded-md border border-red-200 bg-red-50 p-4 text-sm
             text-red-800 dark:border-red-900 dark:bg-red-950/50
             dark:text-red-200"
      role="alert"
    >
      Could not load the API documentation: {error}
    </div>
  {/if}

  {#if loading && !error}
    <Skeleton rows={8} />
  {/if}

  <!-- Swagger UI has no dark theme; keep it on a light card. -->
  <div class="rounded-md bg-white" bind:this={container}></div>
</div>
