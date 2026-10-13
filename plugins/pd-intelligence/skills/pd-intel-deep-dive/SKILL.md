---
name: pd-intel-deep-dive
description: Use when asked what people are saying about a post, topic, or person in PD Intelligence data — reaction analysis, sentiment, narratives, controversy, "how did X land", comment analysis, or finding who is driving a conversation. Chains post lookup in SQL, comment summaries, threads, and commenter profiles.
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

1. **Locate the subject.** `run_analytics_sql` over `posts` JOIN
   `post_metrics_latest` (`ON post_metrics_latest.post_id = posts.id`), with
   `post_text ILIKE '%keyword%'` (or `title`), `author_username`, or the
   platform's `post_id`. Pass the window and platforms as the
   `date_from`/`date_to`/`platform` **arguments**, not a `WHERE`. For a topic,
   run a `count(*)` first — that's the conversation's size — then fetch the
   top rows by views with `post_text` named explicitly. Patterns: the
   navigation skill's `references/analytics-sql.md`.
2. **Post facts**: the same join with `WHERE p.id = …` for the focal
   post(s) — metrics, `post_url`, `content_type` — plus their tags from
   `entity_tags` (`entity_type = 'post'`; `is_direct` separates direct tags
   from ones inherited from the account or creator).
3. **Reaction shape**: `get_comment_summary` with `post_id` for one post, or
   date-filtered for a topic/period. Gives volume, unique commenters,
   author-reply rate, timeline, and the most-discussed posts.
4. **Read actual comments**: `search_comments` with `post_id` (or `search`
   keywords), two passes:
   - `sort_by: "likes"` — what the audience endorses (top comments).
   - `sort_by: "comment_timestamp"` — how the reaction is evolving.
   Sample 25-50 before characterizing sentiment; quote 3-5 representative
   comments verbatim with their like counts.
5. **Threads, carefully**: `search_comments` with `root_comment_id` returns
   the root plus every reply, oldest first — but a popular comment can have
   hundreds of replies. Check `replies_count` first; only page through
   threads that are small or genuinely pivotal. `is_author_reply: true` in `search_comments` finds
   where the creator engaged.
6. **Who's driving it**: for recurring usernames, `list_commenters` with
   `commenter_id` (from the comment) gives their profile row and
   `total_comments`, and `search_comments` with the same `commenter_id` shows
   their history; `list_commenters` sorted by `total_comments` surfaces
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
  `list_commenters(commenter_id=…)` and `search_comments(commenter_id=…)`
  before treating them as organic sentiment.
- **State sample size**: "of the top 50 comments by likes…" — never imply
  you read a million comments.
- **State the denominator** before calling a theme common: how many comments
  you read, and how many carried it.
- **A missing metric is not a finding.** Threads publishes no view count and
  Instagram publishes none on photos or carousels, so a post's `0` views says
  nothing about how the post landed. Judge reach only on platforms that
  publish it, and never write a
  caveat about "missing data" for a metric a platform simply never publishes —
  that is method, not a limitation.
