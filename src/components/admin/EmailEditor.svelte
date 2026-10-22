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
   * Admin editor for one archived email (port of admin_email_preview()
   * in webui/js/source/mgmt.js): edit author, subject, list, visibility
   * and body; remove attachments; hide, unhide or delete the email.
   */
  import {
    ApiError,
    clearEmailCache,
    emailFresh,
    mgmtAction,
  } from "../../lib/api/client";
  import type { Attachment, EmailResponse } from "../../lib/api/types";
  import {
    changedFields,
    editRequest,
    fmtBytes,
    formFromEmail,
    knownListAddresses,
    listProblem,
    type EditForm,
  } from "../../lib/admin";
  import { config } from "../../lib/config";
  import { formatDate, utcIso } from "../../lib/dates";
  import { adminUrl, threadUrl } from "../../lib/routes";
  import { prefs } from "../../lib/stores/prefs.svelte";
  import { session } from "../../lib/stores/session.svelte";
  import { toast } from "../../lib/stores/toasts.svelte";
  import EmailBody from "../email/EmailBody.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Skeleton from "../ui/Skeleton.svelte";

  let { mid }: { mid: string } = $props();

  type Phase = "loading" | "ok" | "notfound" | "error" | "gone";
  let phase: Phase = $state("loading");
  let errorMsg = $state("");
  let email: EmailResponse | null = $state(null);
  /** Stored state of the editable fields, and the form over it. */
  let original: EditForm | null = $state(null);
  let form: EditForm | null = $state(null);
  let busy = $state(false);
  let preview = $state(false);
  let loadToken = 0;

  const fullyDelete = $derived(!!session.credentials?.fully_delete);
  const dirty = $derived(
    original && form ? changedFields(original, form) : [],
  );
  const knownLists = $derived(knownListAddresses(session.lists));
  // $derived.by: inline $derived would narrow form/original to null.
  const listIssue = $derived.by(() =>
    form && original && form.list !== original.list
      ? listProblem(form.list, session.lists)
      : "",
  );
  // Malformed IDs are refused by the server; an unknown list may just
  // be outside this host's focus domain, so that only warns.
  const listBlocking = $derived(listIssue.includes("listname@domain"));

  /**
   * (Re)load the stored email. With `keepEdits`, fields the admin has
   * changed but not saved survive the refresh (e.g. across a hide).
   */
  async function load(keepEdits = false): Promise<void> {
    const t = ++loadToken;
    const pending: Partial<EditForm> = {};
    if (keepEdits && form) {
      for (const key of dirty) {
        (pending as Record<string, unknown>)[key] = form[key];
      }
    }
    if (!keepEdits) phase = "loading";
    try {
      const res = await emailFresh(mid);
      if (t !== loadToken) return;
      email = res;
      original = formFromEmail(res);
      form = { ...original, ...pending };
      phase = "ok";
    } catch (e) {
      if (t !== loadToken) return;
      if (e instanceof ApiError && e.status === 404) {
        phase = "notfound";
      } else {
        errorMsg = e instanceof Error ? e.message : String(e);
        phase = "error";
      }
    }
  }

  $effect(() => {
    void mid;
    preview = false;
    void load();
  });

  // Unsaved edits: ask before the tab is closed or reloaded.
  $effect(() => {
    if (dirty.length === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  });

  /** Run one mgmt.json call; toasts the server's reply or error. */
  async function run(
    action: () => Promise<string>,
    after: () => Promise<void>,
  ): Promise<boolean> {
    if (busy) return false;
    busy = true;
    try {
      const reply = await action();
      // Cached copies elsewhere in the app are now stale.
      clearEmailCache();
      toast("success", reply || "Done.");
      await after();
      return true;
    } catch (e) {
      toast(
        "error",
        `The server refused the change: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    } finally {
      busy = false;
    }
  }

  function save(): void {
    if (!original || !form || busy) return;
    if (dirty.length === 0) {
      toast("info", "There are no changes to save.");
      return;
    }
    if (listBlocking) {
      toast("error", `List: ${listIssue}`);
      return;
    }
    const req = editRequest(mid, original, form);
    void run(
      () => mgmtAction(req),
      () => load(),
    );
  }

  function revert(): void {
    if (original) form = { ...original };
  }

  function onFormKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      save();
    }
  }

  /* Confirmed actions ------------------------------------------------ */

  type Pending =
    | { kind: "hide" }
    | { kind: "unhide" }
    | { kind: "delete" }
    | { kind: "delatt"; att: Attachment };
  let pending: Pending | null = $state(null);
  let confirmOpen = $state(false);

  function ask(p: Pending): void {
    pending = p;
    confirmOpen = true;
  }

  function confirmed(): void {
    const p = pending;
    if (!p || !email || !original) return;
    if (p.kind === "hide" || p.kind === "unhide") {
      void run(
        () => mgmtAction({ action: p.kind, document: mid }),
        () => load(true),
      );
    } else if (p.kind === "delete") {
      void run(
        () => mgmtAction({ action: "delete", document: mid }),
        async () => {
          if (fullyDelete) {
            phase = "gone";
          } else {
            await load(true);
          }
        },
      );
    } else {
      // Drop the attachment document, then rewrite the email's list of
      // attachments. Only the stored field values go with that edit, so
      // unsaved form changes are not committed behind the admin's back.
      const remaining = (email.attachments ?? []).filter(
        (a) => a.hash !== p.att.hash,
      );
      const stored = original;
      void run(
        async () => {
          const reply = await mgmtAction({
            action: "delatt",
            document: p.att.hash,
          });
          await mgmtAction({
            action: "edit",
            document: mid,
            private: stored.private,
            attachments: remaining,
          });
          return reply;
        },
        () => load(true),
      );
    }
  }

  function attachmentHref(att: Attachment): string {
    const q = new URLSearchParams({
      attachment: "true",
      id: mid,
      file: att.hash,
    });
    return `${config.apiUrl}/email.json?${q}`;
  }

  const label =
    "text-sm font-semibold text-slate-600 sm:pt-1.5 dark:text-slate-300";
  const input =
    "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 " +
    "text-sm text-slate-900 focus:border-pony-500 focus:ring-2 " +
    "focus:ring-pony-500/30 focus:outline-none disabled:opacity-60 " +
    "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
  const btn =
    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 " +
    "text-sm font-medium focus:ring-2 focus:outline-none " +
    "disabled:cursor-not-allowed disabled:opacity-50";
  const btnPlain =
    `${btn} border-slate-300 text-slate-700 hover:bg-slate-100 ` +
    "focus:ring-pony-500 dark:border-slate-700 dark:text-slate-200 " +
    "dark:hover:bg-slate-800";
  const tab =
    "rounded-md px-2.5 py-1 text-xs font-medium focus:ring-2 " +
    "focus:ring-pony-500 focus:outline-none";
  const tabOn = "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100";
  const tabOff =
    "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800";
</script>

<div class="mb-4">
  <a
    href={adminUrl()}
    class="text-sm text-pony-600 hover:underline dark:text-pony-300"
  >
    &lsaquo; Admin console
  </a>
  <h1
    class="mt-1 text-xl font-semibold break-all text-slate-900
           dark:text-slate-100"
  >
    Edit email <span class="font-mono text-base font-normal">{mid}</span>
  </h1>
</div>

{#if phase === "loading"}
  <Skeleton rows={8} />
{:else if phase === "notfound" || phase === "gone"}
  <div
    class="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm
           text-amber-900 dark:border-amber-800 dark:bg-amber-950
           dark:text-amber-200"
  >
    {#if phase === "gone"}
      <p class="font-semibold">Email deleted</p>
      <p class="mt-1">
        The email was removed from the archive for good and can no longer be
        edited.
      </p>
    {:else}
      <p class="font-semibold">Email not found</p>
      <p class="mt-1">
        No email with this ID is in the archive. It may have been deleted
        permanently, or the ID may be wrong.
      </p>
    {/if}
    <a
      href={adminUrl()}
      class="mt-3 inline-block rounded-md border border-amber-400 px-3 py-1.5
             font-medium hover:bg-amber-100 dark:border-amber-700
             dark:hover:bg-amber-900/50"
    >
      Back to the admin console
    </a>
  </div>
{:else if phase === "error"}
  <div
    class="rounded-md border border-red-200 bg-red-50 p-4 text-red-800
           dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
    role="alert"
  >
    <p class="font-semibold">Could not load this email</p>
    <p class="mt-1 text-sm break-words">{errorMsg}</p>
    <button
      type="button"
      onclick={() => load()}
      class="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm
             font-medium hover:bg-red-100 dark:border-red-800
             dark:hover:bg-red-900/50"
    >
      Try again
    </button>
  </div>
{:else if email && form}
  {#if email.deleted}
    <div
      class="mb-4 flex flex-wrap items-center gap-3 rounded-md border
             border-purple-300 bg-purple-50 p-3 text-sm text-purple-900
             dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200"
      role="status"
    >
      <span class="flex-1">
        This email is <strong>hidden</strong>: only administrators can see it.
      </span>
      <button
        type="button"
        disabled={busy}
        class="{btn} border-purple-400 hover:bg-purple-100 focus:ring-purple-400
               dark:border-purple-700 dark:hover:bg-purple-900/50"
        onclick={() => ask({ kind: "unhide" })}
      >
        Unhide
      </button>
    </div>
  {/if}

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <form
    class="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800
           dark:bg-slate-900"
    onsubmit={(event) => {
      event.preventDefault();
      save();
    }}
    onkeydown={onFormKeydown}
  >
    <div class="grid gap-x-4 gap-y-3 sm:grid-cols-[8rem_1fr]">
      <label for="adm-from" class={label}>From</label>
      <input
        id="adm-from"
        class={input}
        bind:value={form.from}
        disabled={busy}
        autocomplete="off"
      />

      <label for="adm-subject" class={label}>Subject</label>
      <input
        id="adm-subject"
        class={input}
        bind:value={form.subject}
        disabled={busy}
        autocomplete="off"
      />

      <span class={label}>Date</span>
      <span
        class="text-sm text-slate-800 sm:pt-1.5 dark:text-slate-100"
        title={utcIso(email.epoch)}
      >
        {formatDate(email.epoch, prefs.utc)}
      </span>

      <span class={label}>Message-ID</span>
      <span
        class="font-mono text-xs break-all text-slate-600 sm:pt-2
               dark:text-slate-300"
      >
        {email["message-id"]}
      </span>

      <label for="adm-list" class={label}>List</label>
      <div>
        <input
          id="adm-list"
          class={input}
          list="adm-known-lists"
          bind:value={form.list}
          disabled={busy}
          autocomplete="off"
          spellcheck="false"
          aria-describedby={listIssue ? "adm-list-issue" : undefined}
          aria-invalid={listBlocking}
        />
        <datalist id="adm-known-lists">
          {#each knownLists as addr (addr)}
            <option value={addr}></option>
          {/each}
        </datalist>
        {#if listIssue}
          <p
            id="adm-list-issue"
            class="mt-1 text-xs {listBlocking
              ? 'text-red-700 dark:text-red-300'
              : 'text-amber-700 dark:text-amber-300'}"
          >
            {listIssue}
          </p>
        {/if}
      </div>

      <span class={label} id="adm-vis-label">Visibility</span>
      <div
        class="inline-flex w-fit rounded-md border border-slate-300 p-0.5
               dark:border-slate-700"
        role="radiogroup"
        aria-labelledby="adm-vis-label"
      >
        {#each [false, true] as priv (priv)}
          <label
            class="cursor-pointer rounded px-3 py-1 text-sm font-medium
                   has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-pony-500
                   {form.private === priv
              ? priv
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'
                : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}"
          >
            <input
              type="radio"
              class="sr-only"
              name="adm-visibility"
              value={priv}
              checked={form.private === priv}
              disabled={busy}
              onchange={() => form && (form.private = priv)}
            />
            {priv ? "Private" : "Public"}
          </label>
        {/each}
      </div>

      {#if email.attachments?.length}
        <span class={label}>Attachments</span>
        <ul class="space-y-1 text-sm">
          {#each email.attachments as att (att.hash)}
            <li class="flex flex-wrap items-center gap-x-2">
              <a
                href={attachmentHref(att)}
                target="_blank"
                rel="noopener"
                class="break-all text-pony-600 hover:underline dark:text-pony-300"
              >
                {att.filename}
              </a>
              <span class="text-xs text-slate-500 dark:text-slate-400">
                {fmtBytes(att.size)}
              </span>
              <button
                type="button"
                disabled={busy}
                class="rounded px-1.5 py-0.5 text-xs font-medium text-red-700
                       hover:bg-red-50 focus:ring-2 focus:ring-red-400
                       focus:outline-none disabled:opacity-50
                       dark:text-red-300 dark:hover:bg-red-950"
                onclick={() => ask({ kind: "delatt", att })}
              >
                Remove
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="mt-4">
      <div class="mb-1.5 flex items-center gap-1">
        <label for="adm-body" class="{label} mr-auto sm:pt-0">Body</label>
        <button
          type="button"
          class="{tab} {preview ? tabOff : tabOn}"
          aria-pressed={!preview}
          onclick={() => (preview = false)}
        >
          Edit
        </button>
        <button
          type="button"
          class="{tab} {preview ? tabOn : tabOff}"
          aria-pressed={preview}
          onclick={() => (preview = true)}
        >
          Preview
        </button>
      </div>
      {#if preview}
        <div
          class="min-h-[30rem] rounded-md border border-slate-300 p-3
                 text-slate-800 dark:border-slate-700 dark:text-slate-100"
        >
          <EmailBody body={form.body} chatty={false} />
        </div>
      {:else}
        <textarea
          id="adm-body"
          class="{input} min-h-[30rem] font-mono"
          bind:value={form.body}
          disabled={busy}
          spellcheck="false"
        ></textarea>
      {/if}
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="submit"
        disabled={busy || dirty.length === 0 || listBlocking}
        class="{btn} border-pony-600 bg-pony-600 text-white hover:bg-pony-700
               focus:ring-pony-400"
        title="Save changes to the archive (Ctrl+S)"
      >
        Save changes
      </button>
      <button
        type="button"
        disabled={busy || dirty.length === 0}
        class={btnPlain}
        onclick={revert}
      >
        Revert
      </button>
      {#if dirty.length}
        <span class="text-xs text-slate-500 dark:text-slate-400">
          Unsaved: {dirty.join(", ")}
        </span>
      {/if}
      <span class="flex-1"></span>
      <a href={threadUrl(mid)} class={btnPlain}>View in archive</a>
      {#if email.deleted}
        <button
          type="button"
          disabled={busy}
          class="{btn} border-purple-400 text-purple-800 hover:bg-purple-50
                 focus:ring-purple-400 dark:border-purple-700
                 dark:text-purple-200 dark:hover:bg-purple-950"
          onclick={() => ask({ kind: "unhide" })}
        >
          Unhide email
        </button>
      {:else}
        <button
          type="button"
          disabled={busy}
          class="{btn} border-purple-400 text-purple-800 hover:bg-purple-50
                 focus:ring-purple-400 dark:border-purple-700
                 dark:text-purple-200 dark:hover:bg-purple-950"
          onclick={() => ask({ kind: "hide" })}
        >
          Hide email
        </button>
      {/if}
      <button
        type="button"
        disabled={busy}
        class="{btn} border-red-400 text-red-700 hover:bg-red-50
               focus:ring-red-400 dark:border-red-800 dark:text-red-300
               dark:hover:bg-red-950"
        onclick={() => ask({ kind: "delete" })}
      >
        Delete email
      </button>
    </div>

    <div class="mt-4 space-y-1 text-xs text-slate-500 dark:text-slate-400">
      <p>
        Changing the author, subject, body or attachments removes the option to
        view the email's source in the web interface, as the source may contain
        traces that reveal the edit. Changing only the visibility or list keeps
        it.
      </p>
      {#if fullyDelete}
        <p class="font-medium text-red-700 dark:text-red-300">
          Full delete enforcement is enabled on this server: deleted emails are
          removed from the archive forever and cannot be recovered.
        </p>
      {:else}
        <p>
          Deleted emails may still be recovered by the base system
          administrator. For complete expungement, contact the system
          administrator.
        </p>
      {/if}
    </div>
  </form>
{/if}

<ConfirmDialog
  bind:open={confirmOpen}
  title={pending?.kind === "delete"
    ? "Delete this email?"
    : pending?.kind === "hide"
      ? "Hide this email?"
      : pending?.kind === "unhide"
        ? "Unhide this email?"
        : "Remove this attachment?"}
  confirmLabel={pending?.kind === "delete"
    ? "Delete"
    : pending?.kind === "hide"
      ? "Hide"
      : pending?.kind === "unhide"
        ? "Unhide"
        : "Remove"}
  danger={pending?.kind === "delete" || pending?.kind === "delatt"}
  onconfirm={confirmed}
>
  {#if pending?.kind === "delete"}
    {#if fullyDelete}
      <p>
        The email and its source are <strong>removed permanently</strong>.
        This cannot be undone.
      </p>
    {:else}
      <p>
        The email is removed from the public archive. A system administrator
        can still recover it.
      </p>
    {/if}
  {:else if pending?.kind === "hide"}
    <p>
      The email disappears from the archive for everyone but administrators.
      You can unhide it later.
    </p>
  {:else if pending?.kind === "unhide"}
    <p>The email becomes visible in the archive again.</p>
  {:else if pending?.kind === "delatt"}
    <p>
      <span class="font-medium break-all">{pending.att.filename}</span> is
      removed from the archive for good. This cannot be undone.
    </p>
  {/if}
</ConfirmDialog>
