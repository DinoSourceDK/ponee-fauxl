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
  import { ApiError, email as fetchEmail } from "../../lib/api/client";
  import type { EmailResponse, ThreadNode } from "../../lib/api/types";
  import Skeleton from "../ui/Skeleton.svelte";
  import EmailDisplay from "./EmailDisplay.svelte";

  /**
   * thread.json returns only the thread root as a full email; replies
   * are "short" nodes without body/gravatar. This renders a node's
   * email, fetching the full record on demand (email.json responses
   * are cached client-side, like the classic construct-thread.js).
   */
  interface Props {
    node: ThreadNode;
    isRoot?: boolean;
    onsource?: (email: EmailResponse) => void;
  }

  let { node, isRoot = false, onsource }: Props = $props();

  const full = $derived(typeof node.body === "string" ? node : null);

  let fetched = $state<EmailResponse | null>(null);
  let notfound = $state(false);
  let error = $state("");

  $effect(() => {
    if (full) return;
    const id = node.mid || node.id;
    fetched = null;
    notfound = false;
    error = "";
    let stale = false;
    fetchEmail(id)
      .then((eml) => {
        if (!stale) fetched = eml;
      })
      .catch((e: unknown) => {
        if (stale) return;
        if (e instanceof ApiError && e.status === 404) notfound = true;
        else error = e instanceof Error ? e.message : String(e);
      });
    return () => {
      stale = true;
    };
  });
</script>

{#if full}
  <EmailDisplay email={full} {isRoot} {onsource} />
{:else if fetched}
  <EmailDisplay email={fetched} {isRoot} {onsource} />
{:else if notfound}
  <div
    class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm
           text-amber-900 dark:border-amber-800 dark:bg-amber-950
           dark:text-amber-200"
  >
    The reply
    <span class="font-medium">{node.subject || "(No subject)"}</span>
    could not be loaded. It may be private.
  </div>
{:else if error}
  <div
    class="rounded-md border border-red-200 bg-red-50 p-3 text-sm
           text-red-800 dark:border-red-900 dark:bg-red-950/50
           dark:text-red-200"
    role="alert"
  >
    Could not load "{node.subject || "(No subject)"}": {error}
  </div>
{:else}
  <div
    class="rounded-lg border border-slate-200 bg-white p-4
           dark:border-slate-800 dark:bg-slate-900"
    role="status"
    aria-label="Loading reply"
  >
    <Skeleton rows={2} />
  </div>
{/if}
