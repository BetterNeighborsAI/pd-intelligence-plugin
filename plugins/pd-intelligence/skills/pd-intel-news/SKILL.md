---
name: pd-intel-news
description: Use for questions about news coverage, media framing, or the daily news briefing in PD Intelligence — "what's the news briefing", "how did outlets cover X", "what did the left/right miss", media ecosystem comparison, coverage gaps, blindspots, spin, or what the press is saying today or on a given date. Distinct from social media post data; news is global, not dataset-scoped, and needs the `news` entitlement.
---

# PD Intelligence — News Briefing

Answer "how did the media cover this, and who left it out" using the daily
comparative news briefing — the PD news monitoring pipeline's read of how
outlets across several media ecosystems framed the day's events.

The whole surface is one tool: `get_news_briefing`.

## This is not the social data

Two habits from the rest of PD Intelligence are **wrong here**:

- **Do not call `list_datasets`, and do not pass a `dataset_id`.** News is
  global — not dataset-scoped. `get_news_briefing` takes exactly one optional
  argument, `briefing_date`. There is no dataset, platform, tag, account, or
  creator filter, because news has no relationship to those entities.
- **Do not confuse it with `get_daily_summary`.** That tool narrates a
  *dataset's* social activity for a day. This one covers *news outlets*.
  "What happened today" is ambiguous — if the user means tracked posts, use
  `get_daily_summary`; if they mean the press, use this. Ask if unclear.

## Access

News requires the user-global `news` entitlement, separate from MCP access to
any dataset. Being an admin does not grant it.

Two ways this shows up, and both mean the same thing:

- **The tool isn't in your available tools at all** — it's filtered out for
  users without the entitlement. This is the usual case.
- **Calling it errors** with `No MCP access to news (missing 'news'
  entitlement)`.

Either way: tell the user they need the `news` entitlement enabled and stop.
Don't retry, don't work around it, and don't substitute a web search for the
briefing while implying it came from PD.

## The one tool

```
get_news_briefing(briefing_date: str | None = None) -> dict
```

- `briefing_date` — `YYYY-MM-DD`. **Omit it to get the latest available
  briefing**, which is almost always what you want.

Returns:

| Field | What it is |
|---|---|
| `briefing_date` | The date actually resolved. Empty string if nothing exists |
| `available` | Whether a briefing exists for that date |
| `overall_summary` | The day's cross-ecosystem summary |
| `events` | `[{event_name, coverage: [...]}]` — the day's events |
| `gaps_and_overlaps` | The pipeline's own observations, as strings |
| `markdown` | Full human-readable briefing |
| `ecosystems` | `[{id, label, short_label, color, emoji}]` — the registry |

Each event's `coverage` has **one entry per ecosystem**, in the same order as
`ecosystems`: `{ecosystem_id, covered, text}`. When `covered` is false, `text`
is null.

Read ecosystem names and labels from the `ecosystems` array in the response —
never hardcode them, and use its `label` values when writing up findings so
your names match the product's.

## Workflow

1. **Get the briefing.** Omit `briefing_date` for the latest unless the user
   named a specific day. Check `available` before reading anything else.
2. **Lead with `overall_summary`** for "what's the news" — it's the answer to
   the plain question.
3. **For "how did X get covered", go to `events`.** Find the matching
   `event_name`, then walk its `coverage` array. Report per ecosystem: who
   covered it and how they framed it, quoting `text`.
4. **For gaps and blindspots, the asymmetry is the finding.** `covered: false`
   is *data* — it means that ecosystem did not feature the event, which is
   usually the most interesting thing in the briefing. An event covered by
   some ecosystems and not others is the story; say explicitly which side
   left it out.
5. **`gaps_and_overlaps` is the pipeline's own analysis.** Use it, but
   attribute it as the briefing's observation rather than passing it off as
   your own reading.
6. **When the user just wants to read it, hand them `markdown`.** It's the
   full briefing, already written for humans. Don't paraphrase it into
   something worse.

## `available: false` is ambiguous — disambiguate it

The service never errors. Every failure — no briefing that day, a date before
coverage began, a malformed date string, an upstream hiccup — degrades to the
same quiet `available: false`. There is **no date validation on this path**,
so `briefing_date: "07-15-2026"` or `"yesterday"` returns "no briefing"
rather than "bad date".

So when a specific date comes back unavailable, **call again with
`briefing_date` omitted**. If that returns a briefing, news is working and
that particular date genuinely has none — report the date it *did* return as
the latest available. If that's also unavailable, the pipeline has nothing at
all, which is a different (and more reportable) situation.

Never say "there was no news that day". Say "no briefing was published for
that date; the latest available is <date>". And check your date format is
`YYYY-MM-DD` before blaming the data.

There is also **no way to list available dates** through MCP. Omitting the
date to learn the latest one is the only discovery mechanism — use it to
anchor before guessing at dates.

## Analysis standards

- **Coverage is not sentiment.** The briefing describes *framing* — how an
  event was presented and by whom. Don't convert it into a sentiment score or
  claim to know what audiences felt.
- **Quote the framing, per ecosystem.** A claim that ecosystems diverged needs
  their actual `text` side by side, not your summary of the divergence.
- **One day is one day.** A single briefing is a snapshot. Don't generalize an
  outlet or ecosystem's overall posture from one day's events; if the user
  wants a trend, pull several dates and say how many you read.
- **Say which date you're reporting.** Always name `briefing_date` in the
  answer — "the latest briefing" is worthless in a document read next week.

## Pitfalls

- **The briefing is cached briefly upstream**, so a just-published briefing
  may take a few minutes to appear. If a user insists today's exists, that's
  the likely reason — not a bug worth chasing.
- **News does not join to posts, accounts, creators, or tags.** There's no
  linkage, no tag inheritance, no article-to-post mapping. If the user wants
  "how did news coverage compare to what our creators posted", that's two
  separate pulls lined up **by date**, and you must say that the connection is
  your own inference rather than a relationship in the data.
- **Only the daily briefing is exposed here.** Outlet-level analysis,
  screenshots, weekly roundups, and the list of briefing dates exist in the
  product but are not MCP tools. If a user asks for those, say they're
  available in the News page of the app rather than inventing them.
- **Don't bulk-pull news.** It's one small document per day with no
  pagination. For a multi-day trend, call it once per date — a handful of
  calls, no cache needed. `pd-intel-bulk-pull` is for post/comment pulls and
  has nothing to do with this.
