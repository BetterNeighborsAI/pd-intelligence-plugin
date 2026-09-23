---
name: pd-intel-news
description: Use for questions about news coverage and media framing in PD Intelligence — "what's the news today", the daily news briefing, "how did outlets cover X", "what did the left/right miss", media ecosystem comparison, coverage gaps, blindspots, spin, one outlet's front page, "what's trending in the news", how often a term shows up in headlines over time, the weekly news roundup, headline word clouds, which dates have a briefing, or comparing the news cycle with social media activity. Covers get_news_briefing, list_news_dates, get_news_outlet, get_news_roundup, get_news_trend and get_news_word_cloud. News is global, not dataset-scoped, and needs the `news` entitlement.
---

# PD Intelligence — News Coverage

Answer "how did the media cover this, who left it out, and what is rising"
from PD's news monitoring: the daily front pages of a fixed set of outlets,
grouped into media ecosystems, with an analysis of what each featured and how
it framed it.

## This is not the social data

Two habits from the rest of PD Intelligence are **wrong here**:

- **Do not call `list_datasets`, and do not pass a `dataset_id`.** News is
  global — not dataset-scoped. None of the news tools take a dataset,
  platform, tag, account, or creator filter, because news has no relationship
  to those entities. (The one exception is a news-vs-social comparison, where
  the *social* half needs a dataset — see the workflows.)
- **Do not confuse it with `get_daily_summary`.** That tool narrates a
  *dataset's* social activity for a day. The news tools cover *news outlets*.
  "What happened today" is ambiguous — if the user means tracked posts, use
  `get_daily_summary`; if they mean the press, use these. Ask if unclear.

## Access

All six tools need the user-global `news` entitlement, separate from MCP access
to any dataset. Being an admin does not grant it.

Two ways this shows up, and both mean the same thing:

- **The tools aren't in your available tools at all** — they're filtered out
  for users without the entitlement. This is the usual case.
- **Calling one errors** with `No MCP access to news (missing 'news'
  entitlement)`.

Either way: tell the user they need the `news` entitlement enabled and stop.
Don't retry, don't work around it, and don't substitute a web search while
implying the result came from PD.

## Which tool when

| Question | Tool |
|---|---|
| What's the news / how was an event covered on one day | `get_news_briefing(briefing_date?)` |
| Which days have a briefing | `list_news_dates(limit=30)` — newest first, `limit` 1–90 |
| Which outlets and ecosystems are monitored | `get_news_outlet()` with no `slug` |
| What one outlet put on its front page, and how | `get_news_outlet(slug, briefing_date?)` |
| The week in review | `get_news_roundup()` — no arguments, latest week only |
| What's rising in headlines, or how often a term appears day by day | `get_news_trend(terms?, days=14, briefing_date?, headlines="all")` |
| Which words a scope uses, or uses more than everyone else | `get_news_word_cloud(scope="all", method="frequency", days=1, briefing_date?, headlines="all")` |

Every date argument is `YYYY-MM-DD` and optional — omit it for the latest
briefing, which is almost always what you want.

## Shared vocabulary

- **Ecosystems.** Every news tool returns an `ecosystems` registry:
  `[{id, label, short_label, color, emoji}]`. Read names from it — never
  hardcode them — and use its `label` values in write-ups so your names match
  the product's. The `id`s are what `coverage`, `by_ecosystem` and
  `ecosystem_breakdown` are keyed on, and what `scope` accepts.
- **Outlets.** Get slugs from `get_news_outlet` with no `slug`; it returns
  `{briefing_date, ecosystems, outlets: [{slug, name, ecosystem_id, url,
  has_analysis, has_screenshot}]}`. Never guess a slug — an unknown one
  returns `{available: false}`, which is indistinguishable from "no analysis
  that day".
- **Briefing days, not calendar days.** `days` counts *briefing* days, and
  `list_news_dates` has gaps, so a 7-day window can span more than seven
  calendar days. Read the `dates` array in the response and report the window
  it actually covers.
- **`headlines: "primary"`** restricts to top-of-page stories; `"all"` (the
  default) includes everything on the front page. Use `primary` when the
  question is about what outlets led with.

## The tools in detail

### `get_news_briefing` — one day, event by event

| Field | What it is |
|---|---|
| `briefing_date` | The date actually resolved. Empty string if nothing exists |
| `available` | Whether a briefing exists for that date |
| `overall_summary` | The day's cross-ecosystem summary |
| `events` | `[{event_name, coverage: [...]}]` — the day's events |
| `gaps_and_overlaps` | The pipeline's own observations, as strings |
| `markdown` | Full human-readable briefing |
| `ecosystems` | The registry |

Each event's `coverage` has **one entry per ecosystem**, in registry order:
`{ecosystem_id, covered, text}`. When `covered` is false, `text` is null.

### `get_news_outlet` — one front page

With a `slug`, returns the outlet's `headlines` (each with `text`,
`prominence` of `primary`/`secondary`/`tertiary`, `associated_imagery` and
`position_description`), `total_headline_count`, and an analysis of the page:
`overall_visual_impression`, `visual_analysis`, `agenda_setting` (including
`marginalized_or_absent_topics`), `dominant_narratives`, `emotional_valence`
and `target_audience_signals`.

The headlines are observations. **Everything after them is a model-generated
reading of the page** — attribute it ("the outlet analysis characterizes the
page as alarming") rather than stating it as fact.

`has_screenshot` means the product holds a screenshot; no MCP tool returns
it. Point the user to the News page in the app.

### `get_news_roundup` — the latest week

Takes no arguments and returns **only the latest week** — there is no way to
request an earlier one. Fields: `period_start`, `period_end`,
`days_with_data`, `total_headlines`, `total_outlets`, `week_in_one_sentence`,
`issues` (sorted by `total_prominence`, each with an `ecosystem_breakdown` and
`events` carrying `peak_date` and `days_covered`), `ecosystem_narratives`,
`most_divergent_event`, `strategic_memos`, and the registry.

- `ecosystem_breakdown` is **sparse**: an ecosystem that gave an issue no
  prominence is simply absent. Absent means zero — and that absence is often
  the finding.
- Some text fields — an event's `summary`, an ecosystem's `sentiment_summary`
  or `framing_patterns` — can come back as empty strings. Empty means the
  pipeline did not write one. Say nothing about it rather than filling it in.
- `strategic_memos` are the pipeline's own strategic recommendations —
  opinion, not measurement. Include them only when the user asks, and
  attribute them to the roundup.

For any week other than the latest, build it yourself from daily briefings:
`list_news_dates` for the range, then `get_news_briefing` per day.

### `get_news_trend` — the term × day matrix

Two modes:

- **Discovery** (omit `terms`): the `top` terms (default 20, max 25) that the
  newest `recent_days` (default 3) use more than the rest of the window,
  ranked by `trend_score` = count × log2 lift. Two-word phrases by default;
  `bigrams: false` for single words.
- **Tracking** (`terms`: up to 25 words or phrases): whole-word,
  case-insensitive match on headline text. `trend_score` is null.

Returns `{available, discovered, dates, total_headlines, terms, ecosystems}`.
`dates` runs oldest first, and every per-day list is aligned to it. Each term
row is `{term, trend_score, total, daily, by_ecosystem}`.

- **Normalize before comparing days.** Headline volume varies day to day.
  Divide `daily` by `total_headlines` for a share of the day's headlines.
- **`by_ecosystem` is sparse** — an ecosystem that never used the term is
  omitted, not listed with zeros.
- **Discovery surfaces noise too**: names from a single story, a phrase that
  appeared five times. Check `total` and read the underlying headlines
  (`get_news_outlet`, or the day's briefing) before calling it a trend.

### `get_news_word_cloud` — weighted headline words

`scope` is `"all"`, an ecosystem `id`, or an outlet `slug`. `method` is
`"frequency"` (most used) or `"distinctive"` (words this scope uses more than
every other outlet). `days` is `1` or `7` only. Returns
`{briefing_date, available, dates, scope: {id, label, color}, headline_count,
words: [{text, weight}]}`.

- `"distinctive"` with `scope: "all"` is an error — there is nothing to be
  distinctive against.
- Size by `weight`. Don't rely on a per-word `count` being present.
- Check `headline_count` before reading anything into a cloud. One day of
  `primary` headlines for a single ecosystem can rest on a handful of
  headlines; widen to `days: 7` or `headlines: "all"` if it does.
- To compare ecosystems, call once per ecosystem with `method: "distinctive"`
  and set the clouds side by side, each in its scope's `color`.
- Words come from everything on the front page, so non-news sections
  (horoscopes, sports, entertainment) show up. Outlets publishing in other
  languages produce words in those languages. Don't read either as a news
  finding.

## Workflows

1. **"What's the news?"** — `get_news_briefing` with no date. Check
   `available`, lead with `overall_summary`, and name the `briefing_date`.
   When the user just wants to read it, hand them `markdown` rather than
   paraphrasing it into something worse.
2. **"How was X covered?"** — find the matching `event_name` in the briefing's
   `events` and walk its `coverage` per ecosystem, quoting `text`. For depth,
   `get_news_outlet` on outlets in the ecosystems that matter shows placement
   and prominence. For how coverage moved over time, `get_news_trend` with the
   event's key terms.
3. **Gaps and blindspots** — the asymmetry is the finding. `covered: false` in
   a briefing, an ecosystem absent from a roundup's `ecosystem_breakdown`, and
   an outlet's `marginalized_or_absent_topics` are all data. Say explicitly
   which side left it out. `gaps_and_overlaps` is the pipeline's own analysis —
   use it, attributed as the briefing's observation.
4. **The week in review** — `get_news_roundup` for the latest week; for any
   other week, assemble it from daily briefings.
5. **"What's trending?"** — `get_news_trend` in discovery mode, then confirm
   the top terms against the actual headlines before presenting them.
6. **News vs social** — the news tools and the social data do not join, so
   line them up **by date**:
   1. `get_news_trend` with `terms` over the window — note the `dates`.
   2. `list_datasets`, then for the same terms and dates `search_posts` (one
      keyword per call — `search` is a substring match, not a boolean query)
      or `run_analytics_sql`, grouped by day, with the window passed as the
      `date_from`/`date_to` arguments.
   3. Compare timing: did headlines lead posts, or the reverse?

   Say that the connection is your inference from timing, not a relationship
   in the data. Headline matching is whole-word; post `search` is substring,
   so the two counts are not measured identically.

## Dates, and `available: false`

- **Find valid dates with `list_news_dates`** before asking for a specific
  day. Coverage has gaps, so a requested date may simply have no briefing.
- **Date validation is inconsistent across the tools.** `get_news_briefing`
  and `get_news_outlet` answer a malformed or missing date with a quiet
  `available: false`. **`get_news_trend` does worse**: given a malformed date
  it returns `available: true`, echoes the bad string back in `dates`, and
  reports zero for everything — a silent wrong answer. Always send
  `YYYY-MM-DD`, and check that `dates` holds real dates and `total_headlines`
  is not all zeros before quoting a trend.
- When a date comes back unavailable, check `list_news_dates` and report the
  nearest dates that do exist.

Never say "there was no news that day". Say "no briefing was published for
that date; the nearest available are …".

## Analysis standards

- **Coverage is not sentiment.** The tools describe *framing* — how an event
  was presented and by whom. Don't convert it into a sentiment score or claim
  to know what audiences felt.
- **Quote the framing, per ecosystem.** A claim that ecosystems diverged needs
  their actual `text` or headlines side by side, not your summary of the
  divergence.
- **Prominence is not volume.** One primary headline on a front page outweighs
  several tertiary ones. Say which you are counting.
- **Small counts are small.** A term that appears in five headlines across a
  week is a mention, not a trend. State totals and the denominator
  (`total_headlines`).
- **One day is one day.** Don't generalize an outlet's or ecosystem's posture
  from a single briefing; for a pattern, use a window and say how many days it
  covers.
- **Model-generated fields are readings, not facts.** Summaries, narratives,
  valence, audience signals and memos are all the pipeline's interpretation.
  Attribute them.
- **Say which date or window you're reporting.** "The latest briefing" is
  worthless in a document read next week.

## Pitfalls

- **Briefings are cached briefly upstream**, so a just-published briefing may
  take a few minutes to appear. If a user insists today's exists, that's the
  likely reason — not a bug worth chasing.
- **News does not join to posts, accounts, creators, or tags.** No linkage, no
  tag inheritance, no article-to-post mapping. Any comparison is two pulls
  lined up by date.
- **Don't bulk-pull news.** Responses are small and unpaginated.
  `pd-intel-bulk-pull` is for posts and comments and has nothing to do with
  this. Outlet pages are the heaviest responses, so for many outlets across
  many days, be selective — start from the briefing or the trend and pull only
  the outlets and days the question needs.
