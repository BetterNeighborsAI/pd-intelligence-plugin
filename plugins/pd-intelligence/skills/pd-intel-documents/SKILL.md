---
name: pd-intel-documents
description: Use when publishing, updating, sharing, or finding documents on PD Docs, PD Intelligence's document surface — "push this report to PD Intelligence", "publish this briefing or deck", "share this document with the team", "share it to a dataset", "send it to someone outside the org", "make it public", "get a shareable link", "who can see this document", "revoke access", "update the published report", "find the document I published", "read that document back". Covers publish_document, share_document, get_document_sharing, list_documents and read_document, the large-document tools (begin_document_upload, append_document_chunk, finish_document_upload, get_document_download_url), plus the sandbox every published HTML document renders in. To build the document itself, use pd-intel-report.
---

# PD Docs — Publishing, Sharing & Reading Documents

PD Docs is PD Intelligence's document surface. It hosts what you produce —
briefings, reports, decks, deep-dive writeups, notes — so people read it at a
link instead of receiving pasted text or loose files, including people who have
no PD Intelligence account. These tools cover the whole lifecycle:

| Goal | Tool |
|------|------|
| Create a document / replace one you own | `publish_document` |
| Same, for a large body | `begin_document_upload` → send → `finish_document_upload` (see **Large documents**) |
| Change who can see a document you own | `share_document` |
| Check how any readable document is shared | `get_document_sharing` |
| Find a document you can read | `list_documents` |
| Read one document's body | `read_document` (paged) or `get_document_download_url` |

`publish_document`, `share_document`, `append_document_chunk` and
`finish_document_upload` write; the rest read.
The server has other write tools outside this skill — tags and creators (see
`pd-intel-tagging` and `pd-intel-creators`) — but none of them are involved
here: publishing a document never changes tracked source data.

## Publish

- Pick the `mime_type` for the content you actually produced: `text/html` for
  self-contained HTML reports/decks, `text/markdown` for briefings and
  writeups, `text/plain` otherwise. New documents default to `text/html`, so
  set it explicitly for markdown or the dashboard will render it wrong.
- **Save the returned `id`.** Updates and sharing both need it. Publishing the
  same title again *without* `document_id` creates a duplicate, not a new
  version — to revise, pass `document_id` (you must own it) and omit
  `mime_type` to keep the current type (passing one converts the document).
- Body limit is 5 MB of UTF-8 text. Large self-contained HTML decks can
  exceed this — check the size first and trim embedded assets if needed.
- Anything bigger than a short report should not go through `publish_document`
  at all — every byte of `content` is a token you write out. Use the upload
  flow in **Large documents**.
- `dataset_id` records provenance only; it grants nobody access, and setting
  it requires the `documents_manage` capability on that dataset. Access is
  entirely `share_document`'s job.
- Renaming a document re-slugs it. Retitle freely before sharing; after wide
  sharing, prefer keeping the title stable.

A new document is **private to you** until you share it.

## Share

`share_document(document_id, ...)` applies only the facets you pass:
`visibility` (`"public"` mints a link anyone can open / `"private"` revokes
it), `dataset_ids` (everyone with access to those datasets can read),
`emails` (named teammates), and `remove_dataset_ids` / `remove_emails`.

- Grants are additive and idempotent; within one call the order is fixed —
  visibility, then grants, then removals last — so a grant+removal of the
  same target ends removed.
- **Check the failure lists.** Targets that fail validation come back in
  `dataset_share_failures` / `email_share_failures` instead of raising — the
  call "succeeds" even when a grant didn't happen. Dataset shares need
  `documents_manage` on that dataset. Report failed targets to the user, don't
  silently drop them.
- **A recipient email does not have to belong to a platform user.** Three
  outcomes, and only one is the kind of failure you fix by picking someone
  else: an address with **no** platform account **succeeds** as an external
  guest — that is the supported way to reach someone outside the org; an
  address belonging to an **inactive** platform user **fails** ("Not an active
  authorized user"); a malformed address fails. Addresses are lowercased and
  matched case-insensitively, so casing never creates a duplicate share.
- `shared_with` / `shared_datasets` in the response are the **full audience
  after the call**, not a diff — echo them back as confirmation.
- Setting `visibility: "private"` kills the public link immediately; going
  public again mints a **new** URL, so previously circulated links stay dead.
- Removals are never gated — pulling a document back is always allowed.
- Calling `share_document` with only `document_id` changes nothing and
  returns the current sharing state.

**Sharing notifies people in the app.** A share is not a quiet database write:

- Granting to `emails` notifies **active platform members only** — an in-app
  "Document shared with you". Re-sharing to someone who already has an active
  share notifies nobody, so a silent response can mean they already had access.
- **The grant itself never emails anybody**, and an external guest has no app to
  be notified in — so a guest share completes with its recipient entirely
  unaware. Delivery is a separate, deliberate step, and there are two ways to
  take it: the owner sends `reader_url` on themselves, or they use **Send
  email** in the dashboard's share dialog, which mails the reader link to
  anyone who already holds an active share, guests included. Sending is not
  granting — that action only reaches people already shared with, and it has no
  MCP equivalent. So whenever a grant reaches a non-member, hand back
  `reader_url` and name both routes; otherwise the call succeeds, the audience
  list looks right, and nobody ever opens it.
- Granting to `dataset_ids` notifies **every user with access to that dataset**
  — "New document available". One `dataset_ids` entry can therefore ping a
  large group at once.
- The sharer is never notified of their own share, and removals never notify.

So sharing is outward-facing in the strict sense: confirm the intended audience
before granting, name the dataset when a dataset share will broadcast, and hand
back the right link: `public_url` for a public share, `reader_url` for a named
recipient.

## Inspect

`get_document_sharing(document_id)` works on any document you can read,
including ones shared *with* you ("how was this shared with me?").
When you're not the owner, `shared_with` comes back empty and `public_url`
null even for public documents — that's redaction, not "unshared"; the
audience is the owner's business. Which datasets a document reaches is
visible to every reader. Unreachable documents return the same not-found as
nonexistent ones.

Both `share_document` and `get_document_sharing` return **two** links, and they
are not interchangeable:

| Field | Link | Who it is for |
|---|---|---|
| `reader_url` | `/docs/{uuid}` | named recipients — members and external guests alike; the recipient signs in with Google or Microsoft on the invited address |
| `public_url` | `/docs/public/{token}` | anyone at all; `null` while the document is private |

Revoking public access invalidates the token, so a re-published public link is
a **new** URL and every circulated copy of the old one is dead.

## Large documents

Use the upload flow instead of `publish_document` when the body is more than
~100 KB, or whenever it already exists as a file on disk. It is the same
publish — same gate, same 5 MB cap, same result — split into steps.

1. `begin_document_upload(dataset_id?, document_id?, mime_type?)` — these
   three are set **here**, not at finish. Returns `upload_token` and
   `upload_url`. Both last one hour.
2. Send the body, one of two ways:
   - **Direct — if you can run a shell** (Claude Code, Cowork, Codex) and
     `upload_url` is not null. Write the body to a file first, then PUT it in
     one request. No auth header, no content type:

     ```bash
     curl -sf -X PUT --upload-file deck.html "<upload_url>"
     ```

     The file goes straight to storage. None of it passes through you, so it
     costs no tokens and is the fastest path. Always quote the URL.
   - **Chunked — otherwise**, or when `upload_url` is null (the server cannot
     sign links, e.g. a local backend). Split the body into pieces and call
     `append_document_chunk(upload_token, index, content)` once per piece,
     `index` counting from 0. ~100 KB pieces are reliable; the server accepts
     up to 1 MB each and 64 pieces. Split between characters, never inside
     one. A failed piece is safe to re-send with the same `index`.
3. `finish_document_upload(upload_token, title, description?)` — publishes and
   returns `{id, title, slug, visibility, updated}` exactly like
   `publish_document`. If it names a missing index, re-send that piece and
   call finish again; nothing was lost.

To revise a large document, pass its `document_id` to `begin_document_upload`
and omit `mime_type` to keep the current type.

Reading a large document back:

- `read_document` returns the body in windows of 100,000 characters by default
  (`max_chars` up to 500,000). If `has_more` is true, call again with
  `offset=next_offset` until it is false.
- If you can run a shell, `get_document_download_url(document_id)` is cheaper:
  one `curl -sf -o deck.html "<download_url>"` saves the body to disk without
  paging it through you. The link lasts 15 minutes and works for **anyone**
  holding it — use it yourself, never hand it to the user as a way to share.
  Sharing is `share_document`'s job. If `download_url` is null, fall back to
  `read_document`.

## Find and read

- `list_documents(query?, limit?)` returns **metadata only** for everything you
  can read, most recently edited first — owned, shared with you, and shared to
  a dataset you hold MCP access on. `query` is a case-insensitive substring
  matched against title, slug and description; `limit` defaults to 50. Drafts
  never appear.
- `read_document(document_id)` returns that metadata plus `content`, the body
  as text — the whole body when it fits in one window, otherwise the first
  window (see **Large documents** for paging).
- The `id` comes back as a **string**, and timestamps use `Z` wire format.
- A draft, a document you cannot reach, and an id that never existed all fail
  **identically** — so a not-found tells you nothing about whether the document
  exists. Don't infer one from the other.

Use these to revise a document whose id you no longer have: `list_documents`
with a `query` on its title, then `publish_document` with that `document_id`.

## Where documents land

- **Dashboard** — the Documents section (`/documents`: explorer, per-document
  view, editor). Platform members only.
- **PD Docs reader** — the standalone `/docs/{uuid}` and `/docs/public/{token}`
  views. A document-only page with no dashboard around it. Active members also
  see "Open in PD Intelligence" there; guests and signed-out readers do not.
  Sharing grants access to that one document and never platform membership.
- **MCP clients** — accessible documents surface back as resources
  (`pd://documents/ID`) and, depending on exposure, as prompts, so published
  content is readable in later sessions. `list_documents` / `read_document` are
  the tool equivalents, for when you need to find one yourself.

**Everything published as HTML renders inside a locked-down sandbox on every one
of those surfaces.** It decides what your document may do — no stored state, no
forms, and cited links that do not open. Read
`references/pd-docs-runtime.md` before publishing anything with scripts, charts,
or source links in it.

## Typical flows

- **Deliver a report:** build it with `pd-intel-report` → `publish_document`
  (or the upload flow for a large deck) with the right `mime_type` and the
  source `dataset_id` → `share_document` to
  the requested audience → confirm with title, audience, and the right link.
  When the audience includes anyone outside the org, say explicitly that they
  were **not** notified and hand over `reader_url`.
- **Find one you published earlier:** `list_documents` with a `query` on the
  title → `read_document` if you need the body back.
- **Revise in place:** find the `id` (it's in the publish response; otherwise
  the user can read it from the document's dashboard URL) →
  `publish_document` with `document_id`, omitting `mime_type`.
- **Audience audit:** `get_document_sharing` → report visibility,
  datasets, and (if owner) recipients and public link.
- **Lock down:** `share_document` with `visibility: "private"` and/or
  `remove_*` facets; warn that a revoked public link is dead permanently.
