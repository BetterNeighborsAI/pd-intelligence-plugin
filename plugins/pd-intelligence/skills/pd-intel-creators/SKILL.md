---
name: pd-intel-creators
description: Use when analyzing, comparing, or managing creators or accounts in PD Intelligence data — rankings, top performers, underperformers, follower growth, cross-platform presence, cohort or program tracking, "how is creator X doing", building creator shortlists, and also roster upkeep: adding a creator, editing a creator's profile or cohort, or removing creators from a dataset.
---

# PD Intelligence — Creator & Account Analysis

This answers in chat. When the user wants an artifact someone else reads — a
document, a deck, an interactive story — gather the evidence here, then render
it with `pd-intel-report`.

Compare people and handles on evidence: aggregate stats, per-platform
breakdowns, and time-windowed metrics.

## Prerequisites

- Call `list_datasets` first; pass the dataset's integer `id` everywhere.
- **Creators aggregate their linked accounts.** A creator (person/org) can
  have several accounts across platforms (`accounts_count`,
  `platforms_count`); account metrics roll up to the creator. Commenters are
  the audience — a separate population entirely.
- The platform key is `x_twitter`, not `twitter`. Read the `platforms` map
  from `get_dashboard_stats` for what a dataset actually carries.
- **Engagement metrics are not comparable across platforms as-is, and the
  default ways of ranking creators punish the wrong people.** Where a platform
  does not publish a metric it is stored as `0` — Threads and Bluesky publish no
  view counts, Instagram publishes them on Reels only. So never average
  post-level `engagement_rate` and never sort it ascending to find
  underperformers: you will surface Threads posts and Instagram photos, not weak
  creators. Aggregate `sum(engagements) / sum(views)` over posts that reported
  views, or use `get_leaderboard` with `mode: "needs_attention"`, which applies
  the views floor for you.

## Workflow

1. **Rankings first**: `get_leaderboard` with `entity_type: "creators"` or
   `"accounts"` answers top-N instantly. `mode: "needs_attention"` finds
   underperformers on all three entity types — a 50-view floor, engagement
   ascending, capped to `limit` — so read it top-down and trust it. It only
   ranks creators that reported views, so call it a shortlist, not a census.
2. **Find specific people**: `search_creators` — its keyword matches creator
   name, email, AND any linked account's username/display name, so searching
   a handle finds its owner. Filters include `tag_names`, plus
   `start_date`/`end_date` to window the metrics.
3. **Profile**: `get_creator_detail` (id from results) adds program fields —
   `cohort`, `management`, `is_org`, `state`/`country`, `notes`.
4. **Break down by platform**: `search_accounts` with `creator_id` lists a
   creator's handles with per-account stats (`followers_count`,
   `engagement_rate`, `active_days`, `last_post`). Account tag filters
   inherit from the parent creator. `get_account_detail` adds
   `verification_status`, `account_status`, and `tracking_enabled`.
5. **Window comparisons**: `list_creators`/`list_accounts`/`search_*` accept
   `start_date`/`end_date` — run two windows (e.g. this month vs last) to
   measure growth instead of eyeballing lifetime totals.
6. **Their content**: `search_posts` with `search: "<username>"` and
   `sort_by: "views"` or `"engagement_rate"` shows what's working for them.
7. **Labels**: `list_tags` (filter `entity_type: "creator"` or `"account"`)
   shows the dataset's labeling scheme — useful for cohort/category cuts.

## Managing the roster (write tools)

`create_creator`, `update_creator` and `delete_creators` change shared data and
all three need the `creators_manage` capability on the dataset. You cannot read
a user's capabilities from the tools — attempt the call and report a refusal
plainly rather than predicting it. Confirm with the user before creating,
editing, or deleting anything.

**Creating a creator makes the profile only — linking accounts to it is a
dashboard action.** A newly created creator therefore has no accounts, no
posts, and no stats, and that is expected, not a failure. Say so, and point the
user to the dashboard to attach handles.

- `create_creator(dataset_id, first_name, ...)` — only `first_name` is
  required; `country` defaults to `"USA"`. `email` doubles as the duplicate
  key, so a creator sharing an email with a live creator in the dataset is
  refused rather than duplicated. Search with `search_creators` before creating
  to avoid a near-duplicate under a different spelling.
- `update_creator(dataset_id, creator_id, ...)` — only the fields you pass
  change. **There is no way to clear a field through this tool**: an omitted
  field and an explicit null are the same request. Clearing a value is a
  dashboard action. Check the returned `fields` list to see what was actually
  written.
- `delete_creators(dataset_id, creator_ids)` — a **soft delete** that removes
  this dataset's grouping of the creator's accounts. It never deletes an
  account and never stops collection: the accounts remain in the dataset as
  orphans, with all their history, just no longer grouped under a creator. Say
  this when confirming — "delete creator" sounds far more destructive than it
  is, and the reverse is also true: it does not clean up any post data.
  Ids that are already deleted or belong to another dataset are **skipped
  silently**, so compare `deleted_count` against how many you asked for and
  report the difference instead of assuming it all worked.

To label creators as a cohort or program rather than editing profiles one by
one, use the tagging tools — see the `pd-intel-tagging` skill. A creator tag
inherits down to their accounts and posts, so it is almost always the cheaper
and more durable move.

## Analysis standards

- **Normalize before comparing**: raw views favor prolific posters and big
  platforms. Use per-post averages (views ÷ `total_posts`) and
  follower-relative measures, and say which you used.
- **Handle `engagement_rate` carefully — it is the main way creator rankings
  go wrong.** It is `(likes + comments + shares) * 100 / views`, forced to
  `0.0` whenever views are `0`. Threads and Bluesky never publish views,
  Instagram publishes them on Reels only, and Facebook on some post types —
  so a creator working those surfaces collects hard zeros that have nothing to
  do with performance. Never average post-level rates and never sort them
  ascending to find underperformers (use `get_leaderboard` with
  `mode: "needs_attention"`, which applies the floor for you). Where you need
  a rate over a set of posts,
  aggregate `sum(engagements) / sum(views)` over posts that reported views.
- **Account and creator rates are both views-matched**, so they are
  comparable: each drops engagements from no-view posts out of its numerator
  while leaving `total_views` alone. A creator's rate is the views-weighted
  aggregate of their handles, so a creator-vs-account gap is a real mix effect
  across their accounts, not a methodology difference. Still name the grain you
  are reporting.
- **Mind the platform mix before calling anyone weak.** A creator who posts on
  Instagram contributes no share or save counts at all, so any
  likes+comments+shares measure understates them against a TikTok creator.
  Compare like-for-like or compare on likes per post.
- **Check recency**: `last_post` and `active_days` distinguish a strong
  creator from a formerly-strong one. Flag tracked-but-dormant accounts.
- **Mind dataset scope**: stats cover tracked accounts in this dataset only —
  a creator's total reach may be larger. Say "within this dataset" when it
  matters.
- **Comparing N creators**: a compact table (posts, views, followers,
  engagement rate, platforms, last post) plus 2-3 sentences of
  interpretation beats prose stat-dumps.
