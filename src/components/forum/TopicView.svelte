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
  import type { EmailResponse, ThreadNode } from "../../lib/api/types";
  import { flattenPosts } from "../../lib/forum";
  import ForumPost from "./ForumPost.svelte";

  /**
   * Forum-mode thread page: the whole thread tree as one flat,
   * chronological stream of posts, the topic post first and replies in
   * arrival order regardless of nesting.
   */
  interface Props {
    thread: ThreadNode;
    onsource?: (email: EmailResponse) => void;
  }

  let { thread, onsource }: Props = $props();

  const posts = $derived(flattenPosts(thread));
</script>

<div class="space-y-3">
  {#each posts as post, i (i)}
    <ForumPost node={post} n={i + 1} isRoot={i === 0} {onsource} />
  {/each}
</div>
