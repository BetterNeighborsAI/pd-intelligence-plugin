# Metric Semantics — what a number means before it goes in a report

Read this before writing any sentence that compares platforms, averages an
engagement rate, or explains a zero. The failure mode below is the single most
common defect in reports built on this data.

## The one rule

**A zero or absent metric is a statement about the platform, not about the
audience and not about our data.**

Every platform publishes a different subset of metrics. Where a platform does
not publish one, the value is stored as **0** — not null, not "unknown". So a
zero can mean any of three things, and you cannot tell them apart from the
number alone:

1. The platform never publishes that metric (Threads views, Instagram shares).
2. The platform publishes it for some content types only (Instagram views exist
   on Reels, not on photos or carousels).
3. The audience genuinely did nothing.

Resolve which one you are looking at from the platform and the post's
`content_type` **before** the number reaches a sentence.

## Framings that are wrong — do not write these

Each of these treats normal platform behavior as a data-quality problem:

| Wrong | Right |
|---|---|
| "Instagram is missing views on a third of its posts." | "Instagram publishes view counts on Reels only; photos and carousels never carry them, so reach comparisons on Instagram use the Reels subset." |
| "Threads has no view data at all." (under caveats/limitations) | "Threads does not publish view counts — no platform consumer can retrieve them. Threads is compared on likes and replies." |
| "Facebook views are missing on 46% of posts." | "Facebook publishes view counts on some post types and not others. Reach figures for Facebook cover the posts that report views." |
| "The data records neither shares nor saves for Instagram." | Say nothing, or note that Instagram share/save counts are not public, so engagement on Instagram is likes plus comments. |
| A "What the data can't tell you" / "Limitations" section built out of these zeros. | A note on **method** — which metric was used per platform and why. |

The tell: if a caveat would still be true on a perfectly ingested dataset with
zero pipeline defects, it is not a caveat. It is how the platform works, and it
belongs in the method note, not in a limitations section.

Genuine data-quality caveats do exist and are worth flagging — a collection gap
in a date range, an account whose collection stopped, a backfill still
running. Those are visible as a **break in a series that previously had
values**, not as a metric that was never populated for that platform.

## What each platform publishes

Platform coverage in any given dataset is a separate question — read the
`platforms` map from `get_dashboard_stats` to see which of these a dataset
actually carries.

| Platform | views | likes | comments | shares | saves | quotes |
|---|---|---|---|---|---|---|
| TikTok | yes (plays) | yes | yes | yes | yes | — |
| YouTube | yes | yes | yes | not collected | — | — |
| X / Twitter | yes | yes | yes (replies) | yes (retweets) | yes (bookmarks) | yes |
| Facebook | on some post types | yes | yes | yes | — | — |
| Instagram | **Reels/video only** | yes | yes | **never public** | **never public** | — |
| Threads | **never public** | yes | yes (replies) | yes (reposts) | — | yes |
| Bluesky | **never public** | yes | yes (replies) | yes (reposts) | — | — |

Consequences worth stating out loud in a report's method note:

- **Instagram engagement is structurally lower** than TikTok's on any
  likes+comments+shares measure, because Instagram contributes no shares or
  saves at all. This is a metric artifact, not an audience difference.
- **Comment text is not collected for X/Twitter.** Posts on X carry a
  `comments` count, but no comment rows exist. An empty `search_comments`
  result for X means "not collected", never "no discussion". Check
  `get_comment_summary`'s `platform_stats` for actual per-platform coverage.
- **Instagram `likes` can be `-1`** — that is the platform hiding the like
  count, stored as-is. Exclude `-1` rows from like sums and averages; treating
  it as a number produces a negative total.

## engagement_rate: the trap that makes creators look bad

`engagement_rate = (likes + comments + shares) * 100 / views`, and it is
**forced to `0.0` whenever views is 0.**

So every Threads post, every Instagram photo, and every Facebook post without a
published view count carries `engagement_rate: 0` — not null, not absent.

This matters most for exactly the people a report judges hardest:

- **Never average post-level `engagement_rate` yourself.** A creator who posts
  on Threads gets a pile of hard zeros dragging the mean toward zero. They look
  like the worst performer in the deck because of where they post, not how
  they perform.
- If you need a rate over a set of posts, compute it as
  `sum(engagements on posts that reported views) / sum(views)`, and say which
  posts were in scope. Or drop the rate and compare on likes per post.
  This is the platform's own convention at every grain — post aggregates,
  accounts and creators all mask no-view posts out of the numerator while
  leaving `total_views` alone — so a rate you compute this way agrees with the
  dashboard's rather than competing with it.
- **Sorting by `engagement_rate` ascending does not find underperformers.** It
  finds the no-view platforms. Use `get_leaderboard` with
  `mode: "needs_attention"` (see below), or filter to posts with views before
  sorting.

### Account and creator rates are both views-matched

Both grains apply the same correction: engagements from posts that reported no
views are removed from the numerator, while `total_views` stays as it is, so
partial view coverage cannot inflate either rate. Raw `total_likes`,
`total_comments` and `total_shares` are never masked — only the rate's
numerator is.

A creator's rate is therefore the views-weighted aggregate of their accounts,
computed the same way, and the two are comparable. A creator whose rate differs
from one of their handles is showing you a real mix effect across their
accounts, not a methodology gap — don't report it as a data error.

### `needs_attention` behaves the same across entity types

`get_leaderboard(mode="needs_attention")` is a genuine underperformer list for
`"posts"`, `"accounts"` and `"creators"` alike. Each drops a noise floor — at
least 50 views, and for posts at least 24 hours old — so content that never
reported views can't tie at `engagement_rate` 0 and swamp the list, then sorts
engagement **ascending** (with reach descending, so "had reach, nothing landed"
outranks low-reach ties) and caps to `limit`. Read these top-down and trust
them.

Two consequences worth stating in a report:

- The list is **scoped to entities that reported views**, so it is not a
  complete underperformer census — content on view-less surfaces is out of
  scope by construction, not by judgement.
- Because the floor and the ascending sort are the tool's job, do not
  re-implement "worst N" by sorting `engagement_rate` yourself. That is the
  path that surfaces Threads and Instagram photos instead of weak performers.

## Cross-platform comparison rules

1. **Never put TikTok views next to Instagram views without saying what each
   covers.** TikTok views are all posts; Instagram views are the Reels subset.
2. **Pick a metric every compared platform actually publishes.** With Instagram
   or Threads in scope, likes per post is usually the only honest common
   denominator; views comparisons should be labeled as reach on the
   view-reporting subset.
3. **State the denominator.** Before calling anything typical or broad, say how
   many items were examined and how many showed the pattern.
4. **Separate typical from outlier.** Report the median alongside the mean when
   a handful of viral posts dominate, and name the outliers separately. An
   outlier-skewed average presented as typical is the most expensive analytical
   mistake available here.

## Verify before you assert

If a claim about coverage is load-bearing in the report, measure it in the
dataset rather than assuming — `run_analytics_sql` answers this directly (see
`analytics-sql.md`). Split by `content_type`, not just platform, so Reels and
photos do not get averaged together:

```sql
SELECT p.platform, p.content_type,
       count(*) AS posts,
       count(*) FILTER (WHERE m.views > 0) AS posts_with_views,
       median(m.views) FILTER (WHERE m.views > 0) AS median_views
FROM posts p
LEFT JOIN post_metrics_latest m ON m.post_id = p.id
GROUP BY 1, 2
ORDER BY posts DESC
```

Then read the result as a platform fact ("Instagram carousels never report
views") rather than a defect, and write the method note from it.
