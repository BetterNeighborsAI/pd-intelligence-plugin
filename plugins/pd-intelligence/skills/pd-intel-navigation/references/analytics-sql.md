# run_analytics_sql — corpus-level numbers without paging

`run_analytics_sql` runs one read-only DuckDB `SELECT` over in-memory copies of
a dataset's tables. Use it whenever a report needs a number over the **whole**
corpus rather than over a page of search results: totals, shares of a total,
medians and percentiles, distributions, cohorts, correlations, time series,
and any join the search tools cannot express.

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
| Platform | `WHERE platform = 'tiktok'` | `platform: "tiktok"` |
| Tags | joining and filtering `entity_tags` by name | `tag_names: "Launch,Recap"` |

The tool refuses a query that filters on time in SQL while hitting the cap, and
says so. Always read `notes` and `tables_loaded` in the result to confirm what
was actually loaded before quoting the number.

## Reading the result

Returns `{columns, rows, row_count, total_row_count, tables_loaded, notes}`.

- `notes` flags any truncation — table load or result. A truncated result that
  you quote as a total is a wrong number in a report.
- Results are capped (a few hundred rows). **Aggregate in SQL**; never select
  raw rows and count them yourself.

## Tables

Read the exact list and columns from the tool description. The shape:

- `posts` — one row per active post (`id`, `platform`, `content_type`,
  `post_timestamp`, `post_url`, `author_username`, `account_id`, `hashtags`,
  `mentions`, `language`, …).
- `post_metrics_latest` — **one row per post**, latest snapshot. Prefer this.
- `post_metrics` — every daily snapshot (time series; large). Only when you
  genuinely need history.
- `accounts`, `account_metrics_latest`, `account_metrics`, `creators`.
- `comments`, `commenters` — no X/Twitter rows exist; comments are not
  collected there.
- `tags`, `entity_tags` — `entity_tags` holds **effective** (direct +
  inherited) assignments, one row per (tag, entity). Join it on
  `entity_type` + `entity_id`; do not re-walk the creator → account → post
  chain yourself. Only tags the caller can see are loaded.

Join posts to metrics on `post_metrics_latest.post_id = posts.id`. Use a
`LEFT JOIN` when the question is about coverage — an `INNER JOIN` quietly drops
posts that have no metrics row, which is the population you were measuring.

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
       sum(m.likes + m.comments + m.shares) * 100.0 / nullif(sum(m.views), 0)
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
- **Reading content** — meaning, sentiment, themes, and whether a pattern
  matters are not aggregation questions. Establish the frame and the
  denominator here, then read actual posts and comments with the search and
  detail tools before drawing a conclusion. Keyword counts alone do not
  establish what people said.
