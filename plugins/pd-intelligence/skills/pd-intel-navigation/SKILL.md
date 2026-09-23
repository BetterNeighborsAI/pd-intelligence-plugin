---
name: pd-intel-navigation
description: Use whenever working with PD Intelligence data (the PD Intelligence MCP connector) — any question about tracked social media posts, accounts, creators, comments, datasets, tags, or metrics. Explains how the data is organized, which tool to use for what, what a zero or absent metric actually means on each platform, and the pitfalls that cause wrong numbers and wrong caveats in reports.
---

# PD Intelligence — Data Model & Tool Guide

PD Intelligence is Public Democracy's social media intelligence platform. The
MCP server exposes tools over tracked posts, accounts, creators, and comments
across platforms, plus global news coverage tools. Most are read-only; a small
write surface covers tags, creators, and documents.

## Always start here

1. Call `list_datasets` first. Every dataset-scoped tool requires a
   `dataset_id` (integer `id` from the results). The exceptions are the
   news and podcast tools, which are global — see their rows below.
2. Match the user's request to a dataset by name/description. If it's
   ambiguous which dataset they mean, ask — don't guess.
3. Datasets can be empty or newly created. If a query returns nothing,
   check `get_dashboard_stats` before concluding "no activity" — the whole
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
- **Platform keys**: read the `platforms` map from `get_dashboard_stats` to
  see which platforms a dataset actually carries — coverage grows over time
  and varies per dataset, so don't assume a fixed list. The one gotcha worth
  memorizing: the key is `x_twitter`, **not** `twitter`.
- **Two kinds of ids on posts**: `id` (internal, use this with other tools)
  and `post_id` (the platform's native id). Always pass the internal `id`.

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
recognizing before you call it: the tag tools, the creator tools, and the
document tools. Writes touch shared org data — confirm with the user before a
bulk apply or any delete, and never write to explore what a tool does.

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
| KPIs with period-over-period deltas | `get_dashboard_stats` (`comparison_days`) |
| AI narrative of today's activity | `get_daily_summary` |
| Find/filter posts | `search_posts` (keyword, platform, dates, tags, sort) |
| Full post info | `get_post_detail` (needs internal post `id`) |
| Rankings (best / underperforming) | `get_leaderboard` (`entity_type`, `mode`) |
| Comment activity overview | `get_comment_summary` (dataset-wide or one post) |
| Find/filter comments | `search_comments` |
| Full reply thread of a comment | `get_comment_thread` (see pitfall below) |
| Audience members ranked by activity | `list_commenters` |
| One commenter + recent comments | `get_commenter_detail` |
| All accounts with stats | `list_accounts` / filtered: `search_accounts` |
| One account's profile | `get_account_detail` |
| All creators with aggregate stats | `list_creators` / filtered: `search_creators` |
| One creator's profile | `get_creator_detail` |
| Available labels | `list_tags` |
| Corpus-level stats: totals, medians, percentiles, distributions, cohorts, custom joins | `run_analytics_sql` — read-only DuckDB SQL over the whole dataset. See `references/analytics-sql.md`; pass windows as the `date_from`/`date_to`/`platform`/`tag_names` **arguments**, never as SQL `WHERE` clauses |
| Audience overlap between accounts | `get_cross_account_commenters` (reads the full table — do not reimplement in SQL) |
| Create/edit/delete tags, tag entities in bulk | `create_tag`, `update_tag`, `delete_tag`, `tag_entities` — **writes**; see the `pd-intel-tagging` skill |
| Add/edit/remove creators | `create_creator`, `update_creator`, `delete_creators` — **writes**, need `creators_manage`; see the `pd-intel-creators` skill |
| Find / re-read a document already published | `list_documents` (metadata, `query` substring match), `read_document` (body, paged), `get_document_download_url` (signed link for a shell fetch) — reads; drafts never appear |
| Publish / share / audit a document | `publish_document`, `begin_document_upload` / `append_document_chunk` / `finish_document_upload` (large bodies), `share_document`, `get_document_sharing` — **writes**; see the `pd-intel-documents` skill |
| News coverage, media framing, headline trends | `get_news_briefing`, `list_news_dates`, `get_news_outlet`, `get_news_roundup`, `get_news_trend`, `get_news_word_cloud` — **no `dataset_id`**; global, need the `news` entitlement, may be absent from your tools entirely; see the `pd-intel-news` skill |
| Podcast people, episodes, transcripts | `podiverse_search_people`, `podiverse_get_person_activity`, `podiverse_get_podcast_episodes`, `podiverse_get_episode_transcript` — **no `dataset_id`**; global, need the `Podiverse-MCP` entitlement, and are absent from your tool list entirely without it |

## Pitfalls (verified against live data)

- **Comment coverage varies by platform.** Posts carry a `comments` count for
  every platform, but comment *text* is only collected for some (historically
  not X/Twitter). Check `get_comment_summary`'s `platform_stats` to see which
  platforms have collected comments before reporting "no discussion" — the
  data may simply not be gathered for that platform.
- **`get_comment_thread` can be enormous** (a popular comment can have
  hundreds of replies). Check `replies_count` on the comment first; for large
  threads prefer `search_comments` with `post_id` + sorting instead.
- **Use leaderboard for rankings, search for filtering.** `get_leaderboard`
  answers "top/worst N"; `search_posts`/`search_accounts`/`search_creators`
  answer "find things matching X". `mode="needs_attention"` finds
  underperformers, consistently across posts, accounts and creators: a
  50-view floor, engagement ascending, capped to `limit`. Its scope is
  entities that reported views, so it is not a complete census — say so rather
  than implying nothing else underperformed.
- **Report totals, not page counts.** Search tools paginate (default 25,
  max 100 per page) and return `total` — cite the total, and page through
  only when you actually need more items.
- **Tags come in two kinds** (permanent and CLAI tags) and are scoped per
  dataset. Filter by `tag_names`/`clai_tag_names` — names resolve within the
  dataset. Account tag filters inherit from the parent creator.
- **Cite your sources**: include `post_url` and usernames when referencing
  specific posts so humans can verify.
