---
name: pd-intel-bulk-pull
description: Use when a PD Intelligence pull is too big to hold in context — thousands of posts or comments, "pull everything", "all posts for this account/tag/date range", full-dataset exports, bulk extraction, or any request where paging blindly would blow up or lose track. Partitions the pull, caches it to local NDJSON with a manifest, resumes after interruption, and verifies completeness. Also use to resume or verify a cache a previous run started.
---

# PD Intelligence — Bulk Pull & Local Cache

A pull-and-cache primitive for large PD Intelligence extractions. Any agent
with the PD Intelligence MCP tools and a filesystem can call it.

**The core move: never hold the data.** Hold a *plan* and a *manifest*; the
rows live on disk. An agent that accumulates 40,000 posts in context loses
track of where it was, can't tell whether it finished, and dies partway.
An agent that writes each partition to a file and keeps one line of counts
per partition can pull indefinitely and survive a context reset.

This skill's job ends when the cache is complete and verified. Analysis on
the cache belongs to the caller or to `pd-intel-deep-dive` /
`pd-intel-report`.

## When to use this

- Any pull whose `total` exceeds ~500 rows, or that spans more than ~5 pages.
- "Pull all posts for X", "export everything", "get every comment on Y".
- Resuming or verifying a cache an earlier run left behind.

For a handful of posts, or a question answerable from `get_totals` or a
single `run_analytics_sql` query (an aggregate, or one result of at most 500
rows), skip this. Paging directly is fine and
cheaper. This skill is for when the size is the problem.

## Prerequisites

- Call `list_datasets` first; pass the dataset's integer `id` everywhere.
  If it's ambiguous which dataset is meant, ask — don't guess.
- A writable directory. Default to `./pd-cache/<dataset>-<entity>-<scope>/`
  unless the user names one.
- **This skill only reads.** The tools it uses (`run_analytics_sql`,
  `search_comments`, `list_commenters`) are read-only, so a pull never changes
  source data — say so, and never let a bulk pull drift into the server's
  write tools (tags, creators, accounts, posts, documents).

## Pagination rules — these are not optional

**Posts come from `run_analytics_sql`; comments and commenters from the paged
search tools.** There is no post search tool.

### Posts — keyset pages in SQL

`run_analytics_sql` returns at most 500 rows and 150,000 characters per query.
Page by `id`, not by `OFFSET`:

```sql
SELECT p.id, p.post_id, p.platform, p.content_type, p.author_username,
       p.account_id, p.post_timestamp, p.post_url, p.post_text,
       m.views, m.likes, m.comments, m.shares, m.saves
FROM posts p
LEFT JOIN post_metrics_latest m ON m.post_id = p.id
WHERE p.id > LAST_ID
ORDER BY p.id
LIMIT 500
```

- Start with `LAST_ID` = 0; each next page starts after the **last id actually
  returned**. Long `post_text` hits the character cap before 500 rows, so a
  page can come back short — `notes` says so — and keyset paging just carries
  on from where it stopped. Stop when a page returns no rows.
- The partition's window, platforms and tags go in the `date_from` /
  `date_to` / `platform` / `tag_names` **arguments**, never in the `WHERE`.
  A keyword filter (`p.post_text ILIKE '%term%'`) can join the `WHERE`.
- Name every column; text columns (`post_text`, `title`, `hashtags`,
  `mentions`, `media_urls`) load only when named, so leave out the ones you
  don't need.
- Read `notes` on every page. If the partition's `posts` load was truncated
  (500,000 rows), the partition is too big — split it finer; never cache a
  truncated load as complete.
- The loaded copy is reused for about 3 minutes per user and filter set, so
  the pages of one partition read the same snapshot while it lasts.
- **Run SQL partitions one after another, even across subagents.** Each user
  has one query in flight and only a few sandboxes are kept per server, so
  parallel partitions evict each other's loads and fail with "sandbox is
  busy".

### Comments and commenters — offset pages

The search tools are offset-paginated (`page`, `page_size` max 100) and
return `{items, total, page, page_size, total_pages}`.

`search_comments` orders deterministically: it applies an `id` tie-break, so
rows that tie on the sort column (thousands of comments at `likes = 0`) come
back in a stable order. **Sort by whatever you need** — `comment_timestamp`,
`likes`, `replies_count` — pages will not reshuffle between calls.

**`list_commenters` is the exception: it has no tie-break.** Sorting it by
`total_comments`, where huge numbers of commenters tie at one comment each,
gives an arbitrary order within each tie, so paging deep can skip and repeat
rows. Sort it by `username` when you need a complete pass — ties there are rare
rather than pervasive — dedupe by `id` regardless, and treat any shortfall against
`total` as real rather than assuming the pages lined up.

What ordering can't fix is that offsets are computed against a **live** table.
If rows are ingested mid-pull, a `page`-based scan can still skip or repeat
rows. There is no cursor. The rules below close that gap:

1. **Always `sort_order: "asc"` inside a closed date range.** Ascending order
   within a fixed `date_from`/`date_to` means newly-ingested rows land after
   the range and cannot shift pages under you mid-pull. Descending order
   pushes every later page down by however many rows arrived at the head.
2. **Always `page_size: 100`.** The max. Fewer calls, fewer chances to drift.
3. **Dedupe by `id` on write.** The backstop that makes the pull correct
   without trusting the server's ordering at all. Accumulate unique ids;
   ignore repeats across pages.
4. **Keep partitions small enough that offsets stay shallow.** Deep offsets
   degrade linearly — the server walks and discards every skipped row. A
   partition of ~2,000 rows (20 pages, max offset 1,900) stays fast. A
   single 400-page pull does not.

Sorting by a metric is safe for ordering, but for a *complete* pull prefer
`comment_timestamp` anyway: it's the axis your partitions are cut on, so it
keeps each partition a contiguous, independently reproducible range. Want top
comments by likes? Pull the range, then sort the cache locally — you have every
row.

## Workflow

### 1. Preflight — size the job before starting it

For posts, run `SELECT count(*) FROM posts p` (plus any keyword condition)
with the **real arguments**; for comments, call `search_comments` with the real
filters and `page_size: 1`, ignore the item and read `total`. One cheap call
tells you how big the job is, which partition strategy to use, and gives you
the number to reconcile against at the end. On the SQL count, check `notes`
too: a truncated load means the count is short and the job needs narrower
partitions from the start.

Report the size to the user before a long pull: "41,230 posts across 14
months — I'll pull in monthly partitions." A user who expected 500 rows
should get a chance to narrow the filters first.

Note `total` comes from a separate count query than the page query (and a
SQL count from a snapshot up to a few minutes old), so it is a
**reconciliation signal, not gospel**. A small drift on a live dataset is
expected; a large gap is a real problem.

### 2. Choose a partition key

Pick the axis that splits the job into chunks of roughly ≤2,000 rows:

| Situation | Partition by |
|---|---|
| Default; any date-ranged pull | month, or week if dense |
| Pull scoped to a few accounts/creators | account, then date if still large |
| Pull scoped to a tag | tag, then date if still large |
| Multi-platform pull | platform × date — also isolates coverage gaps |

Date is the default because closed ranges are what make partitions stable
and independently reproducible. If one partition still exceeds ~2,000 rows,
split it finer (month → week → day). Never let a partition run past ~40
pages.

**Do not derive partition sizes by dividing the total by the number of
months.** Volume is wildly non-uniform — a dataset that averages a few
thousand posts a month can have a handful in an early month and several times
the average in a recent one, because accounts get added over time and
backfills land unevenly. Sizing by the
average gives you partitions that are 4× too big exactly where the data is
densest.

Instead, **preflight each partition** the same way you sized the job (a SQL
`count(*)` with the partition's window, or `page_size: 1` and `total`), and
record it as `expected` in the manifest before pulling. It's one cheap call per partition and it's what lets you split the
dense ones finer before they hurt. Write the real numbers down; don't guess.

### 3. Write the manifest before pulling anything

This is the step that prevents confusion. Progress lives on disk, not in the
agent's memory, so a crash or context reset costs one partition — not the run.

`manifest.json` — shape only; every value below is illustrative. Always take
`dataset_id` from `list_datasets` and counts from the live `total`:

```json
{
  "dataset_id": 7,
  "entity": "posts",
  "filters": { "platform": "instagram", "keyword": null, "tag_names": null },
  "order": "id asc (keyset)",
  "expected_total": 41230,
  "started_at": "2026-07-15T10:00:00Z",
  "partitions": [
    {
      "key": "2026-01",
      "date_from": "2026-01-01",
      "date_to": "2026-02-01",
      "file": "posts_2026-01.ndjson",
      "status": "pending",
      "expected": null,
      "unique_written": 0,
      "failed_pages": []
    }
  ]
}
```

Every partition starts `pending`. `filters` and the ordering are recorded so
the pull is reproducible and so a later run can tell whether a cache matches
the question being asked. `run_analytics_sql` loads rows *before* `date_to`,
so give each partition the next one's `date_from` as its `date_to`; the
dedupe by id absorbs any overlap at the boundary.

### 4. Pull each partition

For each `pending` partition:

1. Posts: the keyset query above with the partition's window as arguments,
   `LAST_ID` = 0. Comments: `page_size: 100`, `sort_order: "asc"`, closed
   `date_from`/`date_to`, `page: 1`. Record the partition's count as
   `expected`.
2. Loop — next `LAST_ID` for posts, `page` from 1 to `total_pages` for
   comments — **one call at a time**. Append each row as one JSON object per
   line to the partition's `.ndjson`, skipping ids already written.
3. Mark the partition `done` with `unique_written` — but only if no page
   failed. Otherwise mark it `partial`.
4. Keep one line of counts: `2026-01: 3,120 rows`. Never carry rows forward.

**Pull serially.** Firing many calls concurrently makes the server time out
— a burst of parallel page requests fails where the same requests one after
another succeed. For comments, parallelism belongs *between* partitions (via
subagents, below), never between pages of one partition. For posts in SQL,
keep partitions serial too (see above).

### Individual pages fail — handle it or you will ship a silent lie

A page can time out (`Tool call timed out waiting for server response`) while
its neighbors succeed. This is not hypothetical and not always transient:
some pages fail **reproducibly**, and a smaller `page_size` over the same
rows can fail too. A pull that ignores this writes a short file and reports
success.

So: **record every failed page in the manifest.**

```json
{ "key": "2026-06-w1", "status": "partial",
  "expected": 1913, "unique_written": 1413, "failed_pages": [2, 7, 8, 10, 11] }
```

- Retry a failed page a couple of times, then move on — don't let one page
  block the partition, and don't retry forever.
- After the run, retry the `failed_pages`. If a page still fails, **leave the
  partition `partial`** and say so.
- A workaround that sometimes works: re-pull the same rows through a
  different window (narrow the date range so they land on a different page).
  If that also fails, the rows themselves are the problem — report it as a
  server-side issue with the exact filters and page number, and stop.
- **Never mark a partition `done` with failed pages outstanding.** A partial
  cache honestly labelled is useful; a partial cache labelled complete
  poisons every analysis built on it.

### 5. Reconcile — and report honestly

Sum `unique_written` across partitions and compare to `expected_total`.

- **Match, or within a hair on a live dataset** — cache is complete.
- **Short** — say so, name the partitions that came up short, and give the
  numbers. Do not round a gap away or describe a partial cache as complete.
  Check `failed_pages` first: a shortfall that is an exact multiple of 100
  is almost always timed-out pages, not missing data.
- **Over** — near-certainly duplicates that slipped the dedupe. Re-check
  uniqueness by id across partition files, not just within them.

State the sample honestly downstream: "41,230 posts, complete" or "40,980 of
41,230 — the 2026-03 partition is 250 short."

### 6. Resume

Re-invoking against an existing cache directory reads `manifest.json`,
skips `done` partitions, and pulls only what's `pending` or `partial`.
Verify the manifest's `filters` and `dataset_id` match the current request
first — a cache built for a different question must not be silently reused.

If the manifest is missing but `.ndjson` files exist, rebuild the manifest by
counting unique ids per file rather than re-pulling.

## Output contract

```
pd-cache/<dataset>-<entity>-<scope>/
├── manifest.json              # plan, filters, per-partition status + counts
├── posts_2026-01.ndjson       # one JSON object per line
├── posts_2026-02.ndjson
└── ...
```

Hand the caller the directory path, the reconciliation result, and the
partition list. **Never** paste the cache contents back into context.

Reading the cache afterward: grep, stream, or aggregate line-by-line. Read
whole files into context only when a partition is genuinely small. NDJSON is
one object per line specifically so a downstream agent can filter and count
without loading everything.

## Context discipline — read this before pulling anything big

**A tool result lands in the context of whoever called the tool.** Writing it
to a file afterward does not reclaim that; the rows already arrived. So an
agent cannot page a large dataset "into a file" by itself and stay clean —
by the last page it has received every row it wrote.

The arithmetic is unforgiving. A post row is on the order of a few hundred
tokens, so ~60,000 posts is several million tokens of tool results. No
context window holds that. This is the constraint the whole skill is built
around, and you cannot instruct your way out of it.

Two mechanisms actually work. Use one:

1. **Delegate each partition to a subagent** (the general path). The subagent
   calls the tool, writes its `.ndjson`, and returns **only counts**:
   expected, unique written, failed pages, min/max timestamp. Its context
   absorbs the rows and is discarded when it exits. The orchestrator sees a
   line of numbers per partition and never touches a row. For a large pull
   this is not an optimization — it is the only way the pull completes at
   all. Give each subagent the exact filters and forbid it from returning
   post text.
2. **Let the host spill oversized results to disk** (host-dependent). Some
   hosts write a too-large tool result to a file and hand the caller a path
   instead of the payload, which can then be appended to the cache without
   the rows ever being read into context. Where this happens it's ideal —
   but don't count on it. It's host-specific, and **small results still come
   back inline**, so the last page of every partition lands in context
   regardless.

If neither is available — a single agent, no subagents, no spilling — then
be honest about the ceiling. Pull what fits (a few thousand rows), label the
cache `partial`, and tell the user the rest needs a host that can delegate.
Do not start a 600-page pull you cannot finish.

The rest of the discipline:

- Cache the **fields you need**. The keyset query returns a usable row already
  (ids, platform, author, timestamp, text, metrics) — don't run a per-post
  lookup across thousands of posts. Enrich a chosen few afterward (tags come
  from `entity_tags`, joined in the same query if you need them).
- Announce the plan, then report per-partition progress as one line each.
- Subagents run per partition, but **each subagent pages serially** — see the
  serial rule above. For comments, concurrency across partitions is fine;
  concurrency across pages is what triggers timeouts. For SQL post pulls, run
  the subagents one after another.

## Pitfalls

- **`search` is a substring match, not a boolean query.** The data explorer
  in the web app supports `AND` / `OR` / `NOT` / quoted phrases — the
  `search` parameter of `search_comments` and the other search tools does
  **not**. Passing `search: "launch AND recap"` matches the literal string
  `launch AND recap` and returns almost nothing, with no error. This is a
  silent wrong answer, and on a bulk pull it means caching an empty or
  near-empty set and reporting it as complete. One keyword per pull; combine
  locally, or partition across several single-keyword pulls and union the
  cache. For posts, write the boolean in SQL instead: several `ILIKE`
  conditions joined with `AND` / `OR`.
- **An out-of-range `page` returns empty items, not an error** (search
  tools). Trust `total_pages` from page 1 and stop there; don't probe for the end by
  paging until empty, and don't read one empty page as "the pull finished"
  if `total_pages` says otherwise.
- **Comment coverage is not universal.** Comment text is not collected for
  every platform, even where posts show a `comments` count. A zero-row
  comment partition may mean "not collected for this platform", not "no
  discussion". Check `get_comment_summary`'s `platform_stats` before
  reporting an empty pull as silence.
- **Two ids on posts.** Cache both, but `id` (internal) is the dedupe key
  and the one other tools accept. `post_id` is the platform's native id.
- **Tag filters are scoped to the caller.** Tag ids resolve against the
  authenticated user's usable tags, so a cache built under one account may
  not reproduce under another. Record `tag_names` in the manifest, not just
  ids.
- **Tags on posts are inherited** (creator → account → post). A tag-filtered
  pull returns posts whose *account or creator* carries the tag, not only
  posts tagged directly. That's usually what people want — but say which you
  measured.
- **An empty dataset looks like a failed pull.** If preflight `total` is 0,
  check `get_totals` before concluding the filters are wrong.
