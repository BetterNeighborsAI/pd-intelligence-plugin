---
name: pd-intel-briefing
description: Use when asked for a daily briefing, weekly summary, status update, "what happened", "how are we doing", or any period-in-review of PD Intelligence social media data. Produces an evidence-based intelligence briefing from dashboard stats, daily summaries, leaderboards, and comment activity.
---

# PD Intelligence — Daily/Weekly Briefing

This answers in chat. When the user wants an artifact someone else reads — a
document, a deck, an interactive story — build the evidence here, then render it
with `pd-intel-report`.

Produce a briefing that a teammate can act on: what happened, what changed,
what's unusual, with links. Adapt the format to the request — there is no
mandatory template — but never pad with unverified claims.

## Prerequisites

- Call `list_datasets` first; confirm which dataset the briefing covers (ask
  if ambiguous). Pass its integer `id` to every tool.
- The `platforms` map from `get_dashboard_stats` shows which platforms the
  dataset actually carries. The key is `x_twitter`, not `twitter`.
- **Before comparing platforms or quoting an engagement rate:** where a platform
  does not publish a metric, PD Intelligence stores `0`, not null. Threads and
  Bluesky never publish view counts; Instagram publishes them on Reels only and
  publishes no share or save counts; comment text is not collected for
  X/Twitter. Those zeros are platform facts, never a data gap — and never
  average post-level `engagement_rate`, which is forced to `0.0` on every
  no-view post.

## Workflow

1. **Frame the period.** Daily → `comparison_days: 1`; weekly → `7`;
   monthly → `30`. Use the same window everywhere for consistency.
2. **KPIs**: `get_dashboard_stats` with that `comparison_days`. The deltas
   (`delta_label`) are your "what changed" backbone — including the
   per-platform post counts.
3. **Narrative**: `get_daily_summary` returns an AI-written overview with top
   posts/creators/accounts. It may legitimately say there was no activity —
   report that honestly rather than inventing highlights. For weekly
   briefings it only covers the latest day, so don't rely on it alone.
4. **Top content**: `search_posts` with `date_from`/`date_to` for the period,
   `sort_by: "views"` (and a second pass with `engagement_rate` if depth is
   wanted), small `page_size`. Cite `post_url`, author, and metrics.
5. **Who's driving it**: `get_leaderboard` with `entity_type: "creators"`
   (and `"accounts"` if useful). `mode: "needs_attention"` surfaces
   underperformers worth flagging on any entity type — it applies a 50-view
   floor and sorts engagement ascending, so it ranks only entities that
   reported views.
6. **Audience reaction**: `get_comment_summary` with `date_from`/`date_to`.
   The `timeline` reveals spikes — name the dates and find what caused them
   (its `top_posts` section, or `search_posts` on those dates). Remember
   its `platform_stats` shows which platforms have collected comment text —
   comment text is not collected for X/Twitter, so silence there means "not
   collected", not "no discussion".

## Analysis standards

- **Compare, don't just list.** "1.2M views" means little; "+17.8% vs the
  prior week, driven by two viral X posts" is a briefing.
- **Flag anomalies** with a hypothesis: a comment-timeline spike, a platform
  suddenly active, follower jumps. Check whether new accounts/creators were
  added to the dataset (`total_accounts` delta) before calling growth organic.
- **Quantify with totals** from search results (`total` field), not the page
  you happened to fetch. For a number describing the whole period rather than a
  page — a share of a total, a median, a distribution — use `run_analytics_sql`
  and pass the window as `date_from`/`date_to` arguments, not as SQL.
- **Don't report platform behavior as a data problem.** A zero view count on
  Threads or an Instagram photo means the platform doesn't publish that metric,
  not that the week was weak or the pipeline broke. Never average post-level
  `engagement_rate` — it is `0.0` on every no-view post, so the average
  penalizes creators for where they post.
- **Say median as well as mean** when a couple of viral posts carry the week,
  and name them separately.
- **Lead with the takeaway** (2-3 sentences), then sections: KPIs, top
  content, creators, audience reaction, anomalies/watch items.
- **Write it the way you'd say it.** Put the finding and its number in the
  first sentence. No throat-clearing, no abstract scene-setting before the
  point, no "not just X, but Y" constructions — that register reads as
  machine-written and makes a briefing harder to skim.
- Every claim about a specific post needs its `post_url`.
