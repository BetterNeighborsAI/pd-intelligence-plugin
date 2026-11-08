---
name: pd-intel-navigation
description: Use whenever working with PD Intelligence data (the PD Intelligence MCP connector) — any question about tracked social media posts, accounts, creators, comments, datasets, tags, or metrics. Explains how the data is organized, which tool to use for what, what a zero or absent metric actually means on each platform, and the pitfalls that cause wrong numbers and wrong caveats in reports.
---

# PD Intelligence — Data Model & Tool Guide

PD Intelligence is Public Democracy's social media intelligence platform. The
MCP server exposes tools over tracked posts, accounts, creators, and comments
across platforms, plus global news coverage tools. Most reading goes through
one tool, `run_analytics_sql`; a small write surface covers tags, creators,
accounts, posts, and documents.

## Always start here

1. Call `list_datasets` first. Every dataset-scoped tool requires a
   `dataset_id` (integer `id` from the results). The exceptions are the
   news and podcast tools, which are global — see their rows below — and
   the email tools, which start from `list_email_places` instead.
2. Match the user's request to a dataset by name/description. If it's
   ambiguous which dataset they mean, ask — don't guess.
3. Datasets can be empty or newly created. If a query returns nothing,
   check `get_totals` before concluding "no activity" — the whole
   dataset may have no data yet.

## Data model

```
Dataset
├── Creators (people/orgs; aggregate stats across all their accounts)
│   └── Accounts (one per platform handle; linked via creator_id)
│       └── Posts (views, likes, comments, shares, engagement_rate)
│           └── Comments ──> Commenters (audience members, not creators)
└── Tags (label posts, accounts, creators, comments, commenters)
```

- **Creators vs accounts**: a creator is a person; their accounts are platform
  handles. Creator stats aggregate all linked accounts. Commenters are a
  separate population (the audience), not linked to creators.
- **Platform keys**: read the `platforms` map from `get_totals` to
  see which platforms a dataset actually carries — coverage grows over time
  and varies per dataset, so don't assume a fixed list. The one gotcha worth
  memorizing: the key is `x_twitter`, **not** `twitter`. Filters too:
  `platform: "twitter"` returns nothing, even where a tool's description uses
  it as the example.
- **Two kinds of ids on posts**: `id` (internal — the `post_id` every other
  tool accepts and returns) and `platform_post_id` (the platform's native id,
  as in the post URL; never a join key). Always pass the internal `id`.

## Before any number goes in a report

**A zero is a fact about the platform, not about the audience or our data.**
Each platform publishes a different subset of metrics; where one is not
published it is stored as `0`, not null. Threads and Bluesky never publish view
counts; Instagram publishes them on Reels only, and publishes no share or save
counts at all; comment text is not collected for X/Twitter.

Never write these zeros up as missing data, a coverage gap, or a "what the data
can't tell you" caveat — that is the most common defect in reports built on
this data. Explain instead which metric was used per platform and
why.

Two traps that produce wrong conclusions about specific people:

- **Post-level `engagement_rate` is forced to `0.0` when views are `0`.** Never
  average it yourself and never sort ascending to find underperformers — you
  will surface Threads and Instagram photos, not weak performers. Aggregate as
  `sum(engagements) / sum(views)` over posts that reported views, or use
  `get_leaderboard` with `mode: "needs_attention"`, which applies a views
  floor and the ascending sort for you.
- **Account and creator engagement rates are both views-matched** — each
  drops engagements from no-view posts out of its numerator, so the two grains
  are comparable and a creator's rate is the views-weighted aggregate of their
  accounts. Still say which grain you used; a creator-vs-account gap is a real
  mix effect across their handles, not a data error.

Read `references/metric-semantics.md` before writing a cross-platform
comparison, an engagement-rate claim, or any caveat about missing metrics. It
carries the per-platform table, the banned framings with their replacements,
and the queries that verify coverage in the actual dataset.

## Reads and writes

Almost everything here is read-only. The write surface is small and worth
recognizing before you call it: the tag tools, the creator tools, the account
and post tools, batch uploads and backfills, the document tools, and the email
and broadcast tools. Writes touch shared org data — confirm
with the user before a bulk apply or any delete, and never write to explore
what a tool does.

Some writes cost money or cannot be undone. **Get an explicit yes from the user
before each of these calls**, naming the account or post and the consequence:

- `add_account` / `add_post` with `confirm=false` — a **paid** external lookup,
  even though nothing is written. With `confirm=true`, `add_account` **starts
  paid collection** (and may use one of the org's subscription slots);
  `add_post` saves the post.
- `set_collection(tracking=true)` spends collection budget; `tracking=false`
  stops collection for the dataset.
- `erase_account` — erases the account's whole history **from this dataset**;
  irreversible, and every past total changes. Pausing is `set_collection`.
- `update_account` — edits the **pooled** record, so the change reaches every
  dataset that collects the account (system admin only).
- `start_batch_upload` (**paid** lookups) and `approve_batch_upload` (starts
  **paid** collection); `start_backfill` (a **paid** scrape).
- `send_broadcast`, `retry_broadcast`, `send_email_edition` — real email that
  cannot be recalled. `update_email(is_enabled=true)` starts scheduled sends.
  `add_email_subscribers` needs `consent=true`, which only the user can vouch
  for. `delete_email` and `remove_email_subscriber` are deletes.

The account and post tools are covered in the `pd-intel-creators` skill.

**Retired tools.** If you remember a tool from older docs, it no longer exists:
`list_accounts` / `list_creators` → `search_accounts` / `search_creators` with
no filters; `search_posts`, `get_post_detail`, `get_account_detail` and
`get_daily_summary` → `run_analytics_sql`; `get_commenter_detail` →
`list_commenters(commenter_id=)` + `search_comments(commenter_id=)`;
`get_comment_thread` → `search_comments(root_comment_id=)`;
`get_dashboard_stats` → `get_totals(comparison_days=)`; `get_creator_detail`
→ `search_creators(creator_id=)`; `begin_document_upload` /
`append_document_chunk` / `finish_document_upload` /
`get_document_download_url` → `publish_document` and `read_document`, which
take and return the whole body. Paid-promotion fields
(`is_paid`, `amount_paid`, …) are no longer returned — PD records no payments.

## How these skills fit together

These skills are stages of one pipeline, not alternatives. More than one
loading at once is normal and correct — an artifact request needs the analysis
stage *and* the render stage.

| Stage | Skill | Loads when the user asks |
|---|---|---|
| **Foundation** | `pd-intel-navigation` | anything touching PD data — this skill |
| **Analysis** | `pd-intel-briefing` · `pd-intel-deep-dive` · `pd-intel-creators` | *a question*: what happened, what are people saying, how is X doing |
| **Render** | `pd-intel-report` | *an artifact*: a report, a document, a deck, an interactive story |
| **Distribute** | `pd-intel-documents` | *distribution*: publish, share, who can see this, revoke |

Analysis answers in chat and produces verified numbers. Render turns those into
something someone else reads, and asks which format if the request didn't say.
Distribute puts it in PD Docs. Curation (`pd-intel-tagging`), bulk extraction
(`pd-intel-bulk-pull`) and news (`pd-intel-news`) sit outside this pipeline.

## Which tool when

| Goal | Tool |
|------|------|
| See available datasets | `list_datasets` (always first) |
| Headline counts (all time or a window) | `get_totals` (`date_from`/`date_to`) |
| KPIs with period-over-period deltas | `get_totals` with `comparison_days` → `deltas` (`{value, delta, delta_label}` per metric, plus per platform). For the creator headcount quote `dataset.total_creators`; `deltas.total_creators.value` can be lower |
| The stored daily brief (AI narrative), today's or any past day's | `run_analytics_sql` on `daily_summaries` |
| Find/filter posts, one post by `id`, a day's top posts | `run_analytics_sql` — `posts` JOIN `post_metrics_latest`; keyword = `ILIKE` on `post_text`/`title` |
| Corpus-level stats: totals, medians, percentiles, distributions, cohorts, custom joins | `run_analytics_sql` — read-only DuckDB SQL, **the main read surface**. See `references/analytics-sql.md` for the lookup patterns; pass windows as the `date_from`/`date_to`/`platform`/`tag_names`/`account_ids` **arguments**, never as SQL `WHERE` clauses; name the text columns you need; aggregate in SQL (500-row result cap) |
| Top posts, or underperformers of any entity type | `get_leaderboard` (`entity_type`, `mode`) — no date window |
| Creators or accounts ranked by a chosen metric, optionally for a period | `search_creators` / `search_accounts` with `sort_by`, `sort_order`, `start_date`/`end_date` |
| Comment activity overview | `get_comment_summary` (dataset-wide or one post) |
| Find/filter comments | `search_comments` (reads the full comment tables) |
| Full reply thread of a comment | `search_comments(root_comment_id=…)` — root plus every reply, oldest first (see pitfall below) |
| Audience members ranked by activity | `list_commenters` |
| One commenter's profile + comments | `list_commenters(commenter_id=…)` + `search_comments(commenter_id=…)` |
| Accounts with stats + subscription state | `search_accounts` (no filters = every account with posts, paged) |
| One account's profile fields, full roster incl. zero-post accounts, tracking history | `run_analytics_sql` on `accounts` (+ `account_metrics_latest`, `subscriptions`) |
| Creators with aggregate stats | `search_creators` (no filters = every creator, paged) |
| One creator's profile (incl. contact fields) | `search_creators(creator_id=…)` — the one item carries `phone`, `generation`, `state`, `notes`, `w9_received`, `nda_status`, `cohort`, `is_org`, `tags` |
| Is a creator or account going up or down; best format and posting days | `get_creator_overview` (`creator_id` or `account_id`, optional dates/`platform`) — judged per post inside the window, so a backfill cannot fake a trend |
| A creator's or account's superfans and what they talk about | `get_audience` (one call), `list_superfans` (the full list, paged), `list_superfans_by_persona` and `get_shared_fandom` (need the `global_audience` entitlement) |
| What comments say more or less than the period before | `get_rising_terms` (`date_from`/`date_to`, tag and platform filters; computed in the warehouse) |
| Available labels | `list_tags` |
| Audience overlap between accounts | `get_cross_account_commenters` (reads the full table — do not reimplement in SQL) |
| Create/edit/delete tags, tag entities in bulk | `create_tag`, `update_tag`, `delete_tag`, `tag_entities` — **writes**; see the `pd-intel-tagging` skill |
| A tag that keeps applying a description (smart tag) | `create_smart_tag` (review with `confirm=false`, create with `confirm=true` after the user agrees), `get_smart_tag_status`, `explain_smart_tag_item`, `update_smart_tag`, `create_smart_subtags` — **writes**; see the `pd-intel-tagging` skill |
| Add/edit/remove creators | `create_creator`, `update_creator`, `delete_creators` — **writes**, need `creators_manage`; see the `pd-intel-creators` skill |
| Add many creators or accounts at once | `start_batch_upload` → `get_batch_upload` (poll until `ready`) → `approve_batch_upload` only after the user's go-ahead (**paid** lookups and collection); see the `pd-intel-creators` skill |
| Pull older posts for tracked accounts | `start_backfill` (**paid**, needs `backfills_run`, one platform per run, get the user's go-ahead) and `get_backfill` to track it |
| Add an account, group it under a creator, start/stop collection, erase it from the dataset | `add_account` (two-step, **paid**), `set_account_creator`, `set_collection`, `erase_account` (**irreversible**, OAuth only) — **writes**, need `accounts_manage`; `update_account` (pooled record, system admin). See the `pd-intel-creators` skill |
| Add a missing post by URL | `add_post` (two-step, **paid** check) — **write**, needs `content_edit`; see the `pd-intel-creators` skill |
| Find / re-read a document already published | `list_documents` (metadata, `query` substring match), `read_document` (the full body), `list_folders` — reads; drafts never appear |
| Publish / share / audit / file a document | `publish_document` (whole body, 5 MB cap), `share_document`, `get_document_sharing`, `create_folder`, `move_to_folder` — **writes**; see the `pd-intel-documents` skill |
| Custom emails | `list_email_places` **first**, then `list_emails`, `get_email`, `create_email` (always saved Off), `preview_email` (runs the AI writer, 2 per minute), `update_email` (`is_enabled: true` turns it On — show a preview and get a go-ahead first); organization emails also use `get_org_email_context`, `list_email_editions`, `get_email_edition`, `send_email_edition` (OAuth only). `send_*` tools send for real — never without an explicit yes |
| Broadcasts to PD users (no `list_email_places` step) | `create_broadcast_draft`, open `preview_url`, `send_broadcast_test`, then `send_broadcast` with `expected_recipients` = the draft's `reach` from `list_broadcasts`, only after an explicit yes; `list_broadcast_recipients` before `retry_broadcast` |
| News coverage, media framing, headline trends | `get_news_briefing`, `list_news_dates`, `get_news_outlet`, `get_news_roundup`, `get_news_trend`, `get_news_word_cloud` — **no `dataset_id`**; global, need the `news` entitlement, may be absent from your tools entirely; see the `pd-intel-news` skill |
| Podcast people, episodes, transcripts | `podiverse_search_people`, `podiverse_get_person_activity`, `podiverse_get_podcast_episodes`, `podiverse_get_episode_transcript` — **no `dataset_id`**; global, need the `Podiverse-MCP` entitlement, and are absent from your tool list entirely without it |

## Pitfalls (verified against live data)

- **Comment coverage varies by platform.** Posts carry a `comments` count for
  every platform, but comment *text* is only collected for some (historically
  not X/Twitter). Check `get_comment_summary`'s `platform_stats` to see which
  platforms have collected comments before reporting "no discussion" — the
  data may simply not be gathered for that platform.
- **A thread can be enormous** (a popular comment can have hundreds of
  replies). Check `replies_count` on the root first; `search_comments` with
  `root_comment_id` pages the thread (max 100 a page), so read only the pages
  you need, or sort a post's comments by `likes` instead.
- **Leaderboard for posts and underperformers, search for ranking people.**
  `get_leaderboard` answers "top N posts" and "worst N" of anything, all time;
  `search_accounts`/`search_creators` with `sort_by` rank accounts and
  creators by any metric, windowed with `start_date`/`end_date`;
  `run_analytics_sql` over `posts` answers "find things matching X". `mode="needs_attention"` finds
  underperformers, consistently across posts, accounts and creators: a
  50-view floor, engagement ascending, capped to `limit`. Its scope is
  entities that reported views, so it is not a complete census — say so rather
  than implying nothing else underperformed. On posts, hidden Instagram likes
  (`likes: -1`) sort first with a negative `engagement_rate`: drop those rows
  and ask for a bigger `limit` (max 50).
- **Report totals, not page counts.** Search tools paginate (default 25,
  max 100 per page) and return `total` — cite the total, and page through
  only when you actually need more items. In SQL, count with `count(*)` rather
  than counting returned rows; results stop at 500 rows.
- **Tags come in two kinds** (permanent and CLAI tags) and are scoped per
  dataset. Filter by `tag_names`/`clai_tag_names` — names resolve within the
  dataset. Account tag filters inherit from the parent creator.
- **Cite your sources**: include `post_url` and usernames when referencing
  specific posts so humans can verify.
