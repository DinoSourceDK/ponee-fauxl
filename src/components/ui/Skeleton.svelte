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
  interface Props {
    rows?: number;
    compact?: boolean;
  }

  let { rows = 5, compact = false }: Props = $props();

  // Deterministic width variation so rows read as text, not bars.
  const widths = ["100%", "92%", "97%", "85%", "95%"];
</script>

<div class="animate-pulse space-y-2" role="status" aria-label="Loading">
  {#each { length: rows } as _, i (i)}
    <div
      class="rounded-md bg-slate-200 dark:bg-slate-800 {compact ? 'h-6' : 'h-10'}"
      style="width: {widths[i % widths.length]}"
    ></div>
  {/each}
</div>
