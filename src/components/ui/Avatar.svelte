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
  import { gravatarUrl, identiconDataUri } from "../../lib/gravatar";

  interface Props {
    /** Sender md5; absent/empty renders the identicon immediately
     *  (trimmed API responses may omit the gravatar field). */
    md5?: string;
    name?: string;
    size?: number;
  }

  let { md5, name, size = 32 }: Props = $props();

  const hash = $derived(md5 ?? "");

  // Remember which hash failed so the fallback resets when md5 changes.
  let failedMd5 = $state("");
  const src = $derived(
    failedMd5 === hash ? identiconDataUri(hash) : gravatarUrl(hash),
  );
</script>

<img
  {src}
  alt={name ?? ""}
  width={size}
  height={size}
  loading="lazy"
  class="inline-block rounded-full bg-slate-200 dark:bg-slate-700"
  onerror={() => (failedMd5 = hash)}
/>
