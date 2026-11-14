---
name: pd-intel-creators
description: Use when analyzing, comparing, or managing creators or accounts in PD Intelligence data — rankings, top performers, underperformers, follower growth, cross-platform presence, cohort or program tracking, "how is creator X doing", building creator shortlists, and also roster upkeep: adding a creator, editing a creator's profile or cohort, removing creators from a dataset, adding or tracking an account, linking an account to a creator, marking or finding a creator's main channel, starting, stopping or pausing collection for an account, erasing an account from a dataset, correcting an account's record, or adding a missing post by URL.
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
- **Main channel.** Each creator has at most one per dataset: the account
  their audience knows them by (the marked one, or their only account).
  `search_creators` returns it as `main_channel_account_id` (null when a
  creator with several accounts has none marked); `search_accounts` and the
  SQL `accounts` table carry `is_main_channel`. Use it when the user names a
  creator by a channel or asks for "their main channel". Main, not only: a
  question about the creator still covers every account.
- The platform key is `x_twitter`, not `twitter`. Read the `platforms` map
  from `get_totals` for what a dataset actually carries.
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

1. **Rankings first**: `search_creators` / `search_accounts` with `sort_by`
   (`total_views`, `engagement_rate`, `followers_count`, `last_post`, ...),
   `sort_order`, and `start_date`/`end_date` to window the metrics. They rank
   by any metric with the dashboard's account-math rules, and each row already
   carries `avg_views_per_post` and `avg_likes_per_post`. With a window, each
   post counts at its last daily snapshot on or before `end_date`, so posts
   from the window's final day or two read low; for current numbers use
   `run_analytics_sql` on `post_metrics_latest`. `get_leaderboard`
   has no date window, so use it for the post leaderboard and for
   `mode: "needs_attention"`, which finds underperformers on all three entity
   types — a 50-view floor, engagement ascending, capped to `limit` — so read
   it top-down. It covers all time, so dormant creators with one old post can
   top it: check each row's `last_post` and `total_posts` and set aside the
   dormant ones before calling anyone weak. It only ranks entities that
   reported views, so call it a shortlist, not a census.
2. **Find specific people**: `search_creators` — its keyword matches creator
   name, email, AND any linked account's username/display name, so searching
   a handle finds its owner. Filters include `tag_names`, plus
   `start_date`/`end_date` to window the metrics.
3. **Profile**: `search_creators` with `creator_id` (id from results) returns
   that one creator with the full profile — `phone`, `generation`, `cohort`,
   `management`, `is_org`, `state`/`country`, `notes`, `w9_received`,
   `nda_status`, `tags` — the contact fields the SQL `creators` table omits.
4. **Up or down?** `get_creator_overview` (`creator_id`, or `account_id` for
   one handle; optional `date_from`/`date_to`, default the last 30 days;
   `platform`, one name or comma-separated, limits a creator to those
   platforms' accounts) is the
   creator page's Overview: `trend.direction` (`up`/`down`/`steady`/`unknown`),
   per-platform `views_per_post` and `engagements_per_post` by week,
   `best_format`, `best_days`, and for a creator `totals` plus `rank` of
   `rank_of` (say "of 100+" when `rank_of_is_floor` is true). It judges per
   post inside the window, so a backfill cannot fake a rise. A week marked
   `maturing: true` is still collecting metrics, so do not read its drop as
   real; a window whose recent weeks are all maturing can come back `unknown`
   (end it a week earlier). A null `engagements_per_post` means not reported,
   not zero. Reach for it before hand-rolling two-window SQL.
5. **Break down by platform**: `search_accounts` with `creator_id` lists a
   creator's handles with per-account stats (`followers_count`,
   `engagement_rate`, `active_days`, `last_post`). Account tag filters
   inherit from the parent creator. Each row also says whether the dataset is
   collecting it now (`subscribed`, `subscription_started_at`,
   `subscription_ended_at`). `search_accounts` lists accounts with at least one
   post; for profile fields (`profile_url`, `verification_status`,
   `account_status`, `notes`), zero-post accounts, and the full tracking
   history, query the `accounts` and `subscriptions` tables with
   `run_analytics_sql` (pattern in the navigation skill's
   `references/analytics-sql.md`).
6. **Window comparisons**: `search_creators`/`search_accounts` accept
   `start_date`/`end_date` (with no other filters they page through everyone)
   — run two windows (e.g. this month vs last) to compare a roster, when
   `get_creator_overview` on one creator is not enough.
7. **Their content**: `run_analytics_sql` over `posts` JOIN
   `post_metrics_latest`, with the account ids from step 5 passed as the
   `account_ids` argument (not a `WHERE account_id` clause: the argument
   narrows the load before the row cap, a WHERE only filters what survived
   it), ordered by views — or by engagement rate computed over posts with
   views — shows what's working for them. Pass any window as the
   `date_from`/`date_to` arguments.
8. **Their audience**: `get_audience` (`creator_id` or `account_id`) gives
   the superfans (people who commented on `min_posts` or more of their posts),
   a bot-like share and `core_verdict` (`organic`/`orchestrated`/`too_few`),
   the words they use, and the posts that pulled them in. `list_superfans`
   pages the full list (`bot_like: "hide"` drops bot-like people). All the
   audience tools take the same `platform` filter as `get_creator_overview`
   for "their TikTok audience" questions. Both read
   the full comment tables; do not rebuild them in SQL. `get_audience` also
   returns a `ladder` (people by how many posts they commented on) and, where
   personas exist, `top_roles` and `top_topics`: `list_superfans_by_persona`
   filters the superfans by them (`role` = a `top_roles` key, `topic_ids` =
   comma-separated `top_topics` keys). `get_audience` also carries a short
   `shared_fandom` preview; `get_shared_fandom` gives the full list of where
   else they comment across the whole pool (both need the `global_audience`
   entitlement). Overlap across several of the dataset's
   accounts is `get_cross_account_commenters`, scoped by tag — not SQL.
9. **Labels**: `list_tags` (filter `entity_type: "creator"` or `"account"`)
   shows the dataset's labeling scheme — useful for cohort/category cuts.

## Managing the roster (write tools)

`create_creator`, `update_creator` and `delete_creators` change shared data and
all three need the `creators_manage` capability on the dataset. You cannot read
a user's capabilities from the tools — attempt the call and report a refusal
plainly rather than predicting it. Confirm with the user before creating,
editing, or deleting anything.

**Creating a creator makes the profile only.** A newly created creator has no
accounts, no posts, and no stats until you group accounts under it with
`set_account_creator` (see below) — that is expected, not a failure. Say so.

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

**More than a handful of creators or accounts: `start_batch_upload`**, not one
`create_creator` / `add_account` per row. `start_batch_upload(dataset_id,
kind="creators"|"accounts", rows)` takes the dashboard template's columns
(creators: `first_name`, `email`, `is_org` required, plus
`<platform>_url` / `<platform>_tracking_enabled`; accounts: one URL per row
under `creator_id` or `creator_name`) and checks every profile in the
background — a **paid** lookup per row, nothing saved yet. Poll
`get_batch_upload(upload_id)` until `status` is `"ready"`, show the user the
review (valid/invalid counts, slots needed, rows with errors), then
`approve_batch_upload` **only after their go-ahead** — saving subscribes the
valid accounts and starts paid collection — or `discard_batch_upload`.
Needs `creators_manage` or `accounts_manage`. A batch cannot mark a main
channel: for creators with several accounts, call `set_main_channel` after
approval.

**Older posts for accounts already collected: `start_backfill`** (one
platform per run, up to 100 accounts, `days` up to 120 or `posted_after` up to
365 days back). A **paid** scrape that needs `backfills_run` — get the
user's explicit yes first, then track it with `get_backfill(run_id)`.

To label creators as a cohort or program rather than editing profiles one by
one, use the tagging tools — see the `pd-intel-tagging` skill. A creator tag
inherits down to their accounts and posts, so it is almost always the cheaper
and more durable move.

## Managing accounts and posts (write tools)

Accounts are **pooled**: one account record is shared by every dataset that
collects it. Adding an account subscribes this dataset to it; erasing drops
only this dataset's claim. Nothing here deletes a pooled account, and no tool
edits or deletes a post. All account tools except `update_account` need
`accounts_manage`; `add_post` needs `content_edit`. As with creators, attempt
the call and report a refusal plainly.

**Several of these spend money or cannot be undone. Get an explicit yes before
each such call**, naming the account and the consequence.

- `add_account(dataset_id, platform, profile_url, ..., confirm=false)` — two
  steps. Pass `profile_url`; a `username` alone is refused. `confirm=false`
  only **reviews**: a **paid** external profile lookup that writes nothing —
  read `review.status`, `review.errors` and `review.warnings`. Show the review
  to the user, then call again with `confirm=true` to subscribe, which
  **starts paid collection** and, on an organization's own dataset, uses a
  subscription slot. `tracking_enabled=false` adds the account without
  collecting. `creator_id` groups it on the way in — and on an account the
  dataset already tracks, a different `creator_id` moves it and drops its
  main-channel mark. Check
  `search_accounts` or the `accounts` table first: the account may already be
  in the dataset.
- `set_account_creator(dataset_id, account_id, creator_id)` — groups an
  account under a creator of this dataset; `creator_id=null` ungroups it
  (history intact) and drops its main-channel mark. An account grouped under
  a different creator is refused — ungroup first, then regroup.
- `set_main_channel(dataset_id, account_id, is_main_channel=true)` — marks
  the account as its creator's main channel, moving the mark off whichever
  account held it; `false` removes it. The account must be grouped under a
  creator, and a creator-derived dataset refuses it. Confirm with the user
  first, then read it back from `search_creators`
  (`main_channel_account_id`).
- `set_collection(dataset_id, tracking, account_ids=[…] | creator_id=…)` —
  pass exactly one of the two. `tracking=false` **pauses**: nothing is
  deleted, history stays, and a restart opens a fresh period (the gap stays a
  gap). `tracking=true` spends collection budget, and restarts only accounts
  this dataset has held before — a new account goes through `add_account`.
  Results are per account (`started`, `already_tracking`, `stopped`,
  `not_tracking`, `refused`); report `changed_count` and any refusals rather
  than "done". By `creator_id`, a resume is all-or-nothing on slots.
- `erase_account(dataset_id, account_id, confirm_username)` — erases the
  account and **its whole history from this dataset**: every collection
  period, its creator grouping and the dataset's tags on it, and every past
  total is recomputed without it. **Irreversible.** It is not pausing — if the
  user wants to stop collecting, that is `set_collection(tracking=false)`;
  ask which they mean. The handle must be typed back as `confirm_username`.
  Works only from an OAuth-connected client; an API key is refused, so point
  the user to the dashboard if it is.
- `update_account(dataset_id, account_id, ...)` — corrects the **pooled**
  record (handle, display name, profile URL, statuses, notes), so the edit
  reaches every dataset collecting the account. System admin only; say that
  scope out loud before calling it.
- `add_post(dataset_id, account_id, post_url, confirm=false)` — adds a post
  the collector missed, for an account this dataset holds. `confirm=false`
  is a **paid** check (scrapes the post) that returns its caption, publish
  time, metrics and a `verification_token`; nothing is written. Confirm with
  `confirm=true` **and the `verification_token`** — without it the post is
  checked again, a second paid lookup. The check's `post_id` is the
  platform's; the confirmed result's `id` is PD's.

## Analysis standards

- **Normalize before comparing**: raw views favor prolific posters and big
  platforms. Use the per-post averages the search tools return
  (`avg_views_per_post`, `avg_likes_per_post`) and follower-relative
  measures, and say which you used.
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
