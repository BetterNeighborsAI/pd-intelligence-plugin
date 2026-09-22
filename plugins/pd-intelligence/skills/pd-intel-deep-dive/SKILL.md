---
name: pd-intel-deep-dive
description: Use when asked what people are saying about a post, topic, or person in PD Intelligence data — reaction analysis, sentiment, narratives, controversy, "how did X land", comment analysis, or finding who is driving a conversation. Chains post search, comment summaries, threads, and commenter profiles.
---

# PD Intelligence — Post & Comment Deep-Dive

This answers in chat. When the user wants an artifact someone else reads — a
document, a deck, an interactive story — gather the evidence here, then render
it with `pd-intel-report`.

Answer "what are people saying and who is saying it" with evidence: actual
quotes, counts, and ids — not vibes.

## Prerequisites

- Call `list_datasets` first; pass the dataset's integer `id` everywhere.
- **Comment text is not collected for every platform** (historically not
  X/Twitter, even though posts there show a `comments` count). Check
  `get_comment_summary`'s `platform_stats` for actual coverage, and say
  "comments aren't collected for this platform" instead of "no discussion".
- Posts have two ids: internal `id` (use this) and platform `post_id`.

## Workflow

1. **Locate the subject.** `search_posts` with `search` keywords (matches
   username, post text, or platform post id), plus `platform`/date filters.
   For a topic, note the result `total` — that's the conversation's size.
2. **Post facts**: `get_post_detail` for the focal post(s) — metrics,
   `post_url`, paid status (`is_paid`/`amount_paid`), tags.
3. **Reaction shape**: `get_comment_summary` with `post_id` for one post, or
   date-filtered for a topic/period. Gives volume, unique commenters,
   author-reply rate, timeline, and the most-discussed posts.
4. **Read actual comments**: `search_comments` with `post_id` (or `search`
   keywords), two passes:
   - `sort_by: "likes"` — what the audience endorses (top comments).
   - `sort_by: "comment_timestamp"` — how the reaction is evolving.
   Sample 25-50 before characterizing sentiment; quote 3-5 representative
   comments verbatim with their like counts.
5. **Threads, carefully**: `get_comment_thread` reconstructs a full reply
   chain — but a popular comment can have hundreds of replies and the result
   can be huge. Check `replies_count` first; only pull threads that are small
   or genuinely pivotal. `is_author_reply: true` in `search_comments` finds
   where the creator engaged.
6. **Who's driving it**: for recurring usernames, `get_commenter_detail`
   (id from the comment's `commenter_id`) shows their history and
   `total_comments`; `list_commenters` sorted by `total_comments` surfaces
   the dataset's loudest voices. Note `platforms_active` — cross-platform
   commenters are notable amplifiers.

## Analysis standards

- **Separate volume from valence**: report how many commented, then what
  they said. High likes on critical comments ≠ overall negativity — weigh
  like counts, not just comment counts.
- **Name narratives, then prove them**: each claimed theme needs at least
  two quoted examples with comment ids or usernames.
- **Watch for coordinated/repeat voices**: same commenter across many posts,
  near-identical text, or single-issue accounts — check with
  `get_commenter_detail` before treating them as organic sentiment.
- **State sample size**: "of the top 50 comments by likes…" — never imply
  you read a million comments.
- **State the denominator** before calling a theme common: how many comments
  you read, and how many carried it.
- **A missing metric is not a finding.** Threads publishes no view count and
  Instagram publishes none on photos or carousels, so a post's `0` views says
  nothing about how the post landed. Judge reach only on platforms that
  publish it. Judge reach only on platforms that publish it, and never write a
  caveat about "missing data" for a metric a platform simply never publishes —
  that is method, not a limitation.
