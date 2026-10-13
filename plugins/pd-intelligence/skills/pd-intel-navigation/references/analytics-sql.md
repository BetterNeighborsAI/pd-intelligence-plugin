# run_analytics_sql — the main read surface

`run_analytics_sql` runs one read-only DuckDB `SELECT` over in-memory copies of
a dataset's tables. It is the main way to read posts, accounts and the daily
brief: lookups by id, keyword search (`ILIKE`), a day's top posts, an
account's profile and tracking history. Use it too whenever a report needs a
number over the **whole** corpus rather than over a page of search results:
totals, shares of a total, medians and percentiles, distributions, cohorts,
correlations, time series, and any join the search tools cannot express.

Reach for it in particular when you would otherwise be tempted to estimate from
a sample, or to write "roughly" in front of a number.

The tool's own description carries the live table list and limits — read it
before writing SQL rather than trusting this file's summary.

## The load-cap trap — the mistake that silently understates answers

Tables are loaded, **filtered and capped, and only then** does your SQL run.
The cap keeps the **newest** rows.

So a `WHERE post_timestamp >= '2026-07-01'` clause filters what survived the
load, not the dataset. On a busy dataset, asking for a past month in SQL alone
returns an empty or badly understated answer.

**Pass the window as arguments, not as SQL:**

| Narrowing | Wrong (inside `sql`) | Right (as an argument) |
|---|---|---|
| Date window | `WHERE post_timestamp >= '2026-07-01'` | `date_from: "2026-07-01"`, `date_to: "2026-08-01"` |
| Platform | `WHERE platform = 'tiktok'` | `platform: "tiktok"`, or several: `platform: "tiktok,instagram"` |
| Tags | joining and filtering `entity_tags` by name | `tag_names: "Launch,Recap"` |

The window applies to the tables that grow without bound — `posts`
(`post_timestamp`), `post_metrics` and `account_metrics` (`created_at`),
`comments` (`comment_timestamp`), with `comment_metrics_latest` following the
comments window. The one-row-per-entity tables load whole.

**`date_basis: "collected"`** windows `posts` and `comments` on `created_at`
(when PD captured them) instead of when they were published or written. Use it
for "what arrived this week": most platforms' comments are scraped once, about
three days after the post, so "recent conversation" by write time and by
arrival time are different sets.

The tool **refuses** a query that reads any time column of a table the cap
truncated, and says so — narrow the load with the arguments and run it again.
Always read `notes` and `tables_loaded` in the result to confirm what was
actually loaded before quoting the number.

## Name the text columns you need

The wide text columns — `posts.title`, `post_text`, `hashtags`, `mentions`,
`media_urls` and `comments.comment_text` — load **only when the query names
them**; that is what keeps a load fast. Name them explicitly when you need the
text (`p.post_text`, not `p.*`). `SELECT *`,
`DESCRIBE`, `SUMMARIZE` and `NATURAL JOIN` load every column, which is slow on
a big dataset: select the columns you need by name.

## Reading the result

Returns `{columns, rows, row_count, total_row_count, tables_loaded, notes,
cached, source, load_ms, query_ms}`.

- `notes` flags any truncation — table load or result — and, when tables were
  reused, how old they are. A truncated result that you quote as a total is a
  wrong number in a report.
- Results are capped at 500 rows and 150,000 serialized characters;
  `total_row_count` is the exact size of the full result. **Aggregate in SQL**;
  never select raw rows and count them yourself. Long `post_text` columns hit
  the character cap well before 500 rows — select the text only for the rows
  you will read.
- **Loaded tables are cached per user for about 3 minutes**, keyed on the
  dataset and the narrowing arguments, so iterating on the same slice is cheap.
  The flip side: a change made elsewhere in the last few minutes may not be in
  it yet (`cached` and `notes` say so). A write through this server's own write
  tools clears the cache for that dataset.
- One query per user runs at a time. "Sandbox is busy — retry in a few
  seconds" means exactly that; run your queries one after another, not in
  parallel.

## Tables

Read the exact list and columns from the tool description. The shape:

- `posts` — one row per active post (`id`, `post_id`, `platform`,
  `content_type`, `title`, `post_text`, `post_url`, `author_username`,
  `post_timestamp`, `account_id`, `hashtags`, `mentions`, `language`,
  `created_at` = when PD captured it, …).
- `post_metrics_latest` — **one row per post**, latest snapshot (`views`,
  `likes`, `comments`, `shares`, `saves`). Prefer this.
- `post_metrics` — every snapshot (time series; large). Only when you
  genuinely need history.
- `accounts` — every active account in the dataset, including ones with no
  posts yet (`id`, `creator_id`, `platform`, `username`, `display_name`,
  `profile_url`, `verification_status`, `account_status`, `platform_user_id`,
  `notes`, …). `account_metrics_latest` / `account_metrics` hold follower and
  following counts.
- `subscriptions` — one row per collection period: `account_id`, `started_at`
  (NULL = grandfathered), `ended_at` (NULL = still collecting). An account with
  an open period is being tracked.
- `creators` — no contact fields; email, phone and notes are only in
  `get_creator_detail`.
- `comments`, `commenters` — no X/Twitter rows exist; comments are not
  collected there. `comments.created_at` is arrival time, `comment_timestamp`
  write time. A root comment has `root_comment_id` NULL; its replies carry the
  root's id. `commenters.first_seen_at` / `last_seen_at` cover this dataset only.
- `comment_metrics_latest` — newest `likes` / `replies_count` per comment
  (`comment_id`); no row means the comment was never measured.
- `daily_summaries` — the stored daily brief, one row per day, history
  included: `summary_date`, `narrative_text`, and `top_posts`, `top_creators`,
  `top_accounts`, `growth_highlights` as JSON text (any may be empty),
  `ai_model_used`, `generated_at`. A brief is generated after its day ends, so
  the newest row is usually yesterday's.
- `post_sounds`, `sounds`, `songs` — music behind TikTok and Instagram posts.
- `tags`, `entity_tags` — `entity_tags` holds **effective** (direct +
  inherited) assignments, one row per (tag, entity). Join it on
  `entity_type` + `entity_id`; do not re-walk the creator → account → post
  chain yourself. Only tags the caller can see are loaded.

Join posts to metrics on `post_metrics_latest.post_id = posts.id`. Use a
`LEFT JOIN` when the question is about coverage — an `INNER JOIN` quietly drops
posts that have no metrics row, which is the population you were measuring.

There is no `engagement_rate` column. Compute a post's rate as PD defines it:
`(likes + comments + shares) * 100 / views`, and `0` when views are `0`. A
platform that hides a post's likes reports them as `-1`: count those as none
(`greatest(likes, 0)`), as the examples below do.

## Lookups

These replace the old per-entity detail and search tools. Replace the
placeholders (`POST_ID`, `KEYWORD`, …) with real values.

**One post by internal id** (add `title` / `hashtags` / `mentions` only if
needed — each is loaded only when named). On a big dataset, an old post is
only in the load when `date_from`/`date_to` cover its publish date:

```sql
SELECT p.id, p.platform, p.content_type, p.author_username, p.post_timestamp,
       p.post_url, p.post_text, p.account_id,
       m.views, m.likes, m.comments, m.shares, m.saves,
       CASE WHEN m.views > 0
            THEN (greatest(m.likes, 0) + m.comments + m.shares) * 100.0 / m.views
            ELSE 0 END AS engagement_rate
FROM posts p
LEFT JOIN post_metrics_latest m ON m.post_id = p.id
WHERE p.id = POST_ID
```

Its direct permanent tags: `SELECT name FROM entity_tags WHERE entity_type =
'post' AND entity_id = POST_ID AND is_direct AND tag_system = 'permanent'`
(drop the `is_direct` condition for inherited tags too).

**Keyword search with metrics** — pass the window and platforms as arguments;
size it first with `count(*)`, then fetch the rows you will read. Unlike the
search tools' `search` string, SQL can combine terms (`AND` / `OR` of several
`ILIKE`s):

```sql
SELECT p.id, p.platform, p.author_username, p.post_timestamp, p.post_url,
       p.post_text, m.views, m.likes, m.comments, m.shares
FROM posts p
LEFT JOIN post_metrics_latest m ON m.post_id = p.id
WHERE p.post_text ILIKE '%KEYWORD%' OR p.title ILIKE '%KEYWORD%'
ORDER BY m.views DESC NULLS LAST
LIMIT 25
```

To find an account's or a creator's posts, filter on `p.account_id` (ids from
`search_accounts`) rather than matching the username in the text.

**A day's (or a period's) top posts** — `date_from: "2026-07-14"`,
`date_to: "2026-07-15"` as arguments (the tool loads rows *before* `date_to`),
then:

```sql
SELECT p.id, p.platform, p.author_username, p.post_url,
       m.views, m.likes, m.comments, m.shares
FROM posts p
JOIN post_metrics_latest m ON m.post_id = p.id
ORDER BY m.views DESC
LIMIT 10
```

Rank no-view platforms (Threads, Bluesky, Instagram photos) separately by
likes — see `metric-semantics.md`.

**A comment thread** — prefer `search_comments(root_comment_id=ROOT_ID)`,
which reads the full comment tables. In SQL (an old thread on a big dataset
needs `date_from` / `date_to` covering it):

```sql
SELECT c.id, c.parent_comment_id, c.comment_timestamp, cr.username,
       c.comment_text, cm.likes, cm.replies_count
FROM comments c
LEFT JOIN commenters cr ON cr.id = c.commenter_id
LEFT JOIN comment_metrics_latest cm ON cm.comment_id = c.id
WHERE c.id = ROOT_ID OR c.root_comment_id = ROOT_ID
ORDER BY c.comment_timestamp
```

**An account's profile, followers and tracking history** (`search_accounts`
already carries `subscribed`, `subscription_started_at` and
`subscription_ended_at` on every row):

```sql
SELECT a.id, a.platform, a.username, a.display_name, a.profile_url,
       a.verification_status, a.account_status, a.platform_user_id, a.notes,
       a.creator_id, am.followers_count, am.following_count,
       s.started_at, s.ended_at
FROM accounts a
LEFT JOIN account_metrics_latest am ON am.account_id = a.id
LEFT JOIN subscriptions s ON s.account_id = a.id
WHERE a.id = ACCOUNT_ID
ORDER BY s.started_at NULLS FIRST
```

One row per collection period; a row with `ended_at` NULL means the dataset is
collecting it now.

**The daily brief** — the latest, or any past day's:

```sql
SELECT summary_date, narrative_text, top_posts, top_creators, top_accounts,
       growth_highlights
FROM daily_summaries
ORDER BY summary_date DESC
LIMIT 1
```

For history, `WHERE summary_date BETWEEN '2026-07-01' AND '2026-07-07'` is fine
here — `daily_summaries` loads whole, so filtering it in SQL is safe. Select
only `summary_date, narrative_text` across many days to stay under the
character cap.

## Patterns worth reusing

**Coverage by platform and content type** (before writing any caveat about
"missing" metrics — see `metric-semantics.md`):

```sql
SELECT p.platform, p.content_type,
       count(*) AS posts,
       count(*) FILTER (WHERE m.views > 0) AS posts_with_views
FROM posts p
LEFT JOIN post_metrics_latest m ON m.post_id = p.id
GROUP BY 1, 2 ORDER BY posts DESC
```

**Typical vs outlier** — never report a mean alone when a few posts dominate:

```sql
SELECT p.platform,
       count(*) AS posts,
       median(m.views) AS median_views,
       avg(m.views) AS mean_views,
       quantile_cont(m.views, 0.9) AS p90_views,
       max(m.views) AS max_views
FROM posts p
JOIN post_metrics_latest m ON m.post_id = p.id
WHERE m.views > 0
GROUP BY 1 ORDER BY posts DESC
```

A mean far above the median means outliers are carrying it — report both and
name the outliers.

**An honest engagement rate over a set of posts** — aggregate, never an average
of per-post rates (per-post `engagement_rate` is 0 wherever views are 0):

```sql
SELECT p.platform,
       sum(greatest(m.likes, 0) + m.comments + m.shares) * 100.0 / nullif(sum(m.views), 0)
         AS engagement_rate_pct,
       count(*) AS posts_with_views
FROM posts p
JOIN post_metrics_latest m ON m.post_id = p.id
WHERE m.views > 0
GROUP BY 1
```

Restricting to `views > 0` in both numerator and denominator is the point: it
is the same views-matched correction the account- and creator-level stats
apply, so a rate you compute this way is comparable to theirs.

**Tagged slice, counted properly** (pass the tag as `tag_names`; the join is
only for labelling):

```sql
SELECT t.name, count(DISTINCT p.id) AS posts
FROM posts p
JOIN entity_tags t ON t.entity_type = 'post' AND t.entity_id = p.id
GROUP BY 1 ORDER BY posts DESC
```

## When not to use it

- **Audience overlap across accounts** — use `get_cross_account_commenters`.
  It reads the full table in the database, which an in-memory copy capped at
  load time cannot match.
- **Reading comments on a busy dataset** — `search_comments`,
  `list_commenters` and `get_comment_summary` read the full comment tables,
  which can exceed the sandbox's load cap.
- **Headline counts and period-over-period deltas** — `get_totals`
  (`comparison_days`) answers these in one call.
- **Reading content** — meaning, sentiment, themes, and whether a pattern
  matters are not aggregation questions. Establish the frame and the
  denominator here, then read actual post text (selected by name, a page at a
  time) and comments with `search_comments` before drawing a conclusion.
  Keyword counts alone do not establish what people said.
