---
name: pd-intel-report
description: Use when the deliverable is an artifact someone else will read, built on PD Intelligence data — an executive report, board update, campaign recap, one-pager, memo, written report document, HTML slides or a presentation deck, an interactive or explorable data story, a scrollytelling piece, or a D3 / three.js visualization. Triggers on "make a report", "build a deck", "turn this into slides", "write this up as a document", "make it interactive", "add a visualization", "an explorable explainer", "something I can send the board". Chooses the format with the user, shapes verified evidence into a story, renders it, and hands it to PD Docs for publishing. For an answer in chat rather than an artifact, use pd-intel-briefing or pd-intel-deep-dive instead.
---

# PD Intelligence — Rendering Reports

This skill turns findings into something a person reads on their own, without
you in the room. It is the render stage: analysis produces verified numbers,
this produces the artifact, `pd-intel-documents` publishes it.

## First: which format

**Ask, unless the request already said.** "Build a deck" names the format and
skips the question. "Make me a report on last week" does not — and guessing is
how a team that wanted a two-page memo receives fourteen slides.

| Format | Reference | Reach for it when |
|---|---|---|
| Written document | `references/format-doc.md` | it will be read alone, forwarded, skimmed later, or needs an audit trail |
| Interactive document | `references/format-interactive.md` | the reader should explore — filter, hover, compare, or see something 3D |
| Slide deck | `references/format-deck.md` | someone will present it live, or the audience expects slides |

Load **one**. They are alternatives, not layers.

If the user has no view, show them `references/inspiration.md` and let them
point at something. Choosing an aesthetic from real examples is far easier than
answering "what visual style would you like?".

## Second: the story spine

Every format renders the same underlying thing. Build it before you open a
format reference — the spine is what survives a format change.

- **Thesis** — one sentence: what changed, and why it matters. If you cannot
  write it, you do not have a report yet; you have a data dump.
- **KPI spine** — 4–8 metrics, each with its value, its comparison delta, and
  the period they cover.
- **Evidence** — the specific posts, creators, accounts, dates and quotes that
  prove the thesis, each carrying its source URL.
- **Reaction** — what the audience did with it: volume, themes, spikes, and
  what caused them.
- **Watch items** — anomalies, risks, opportunities, and what to do next.
- **Method note** — one line naming dataset, period, and which metric was
  compared on which platform.

Where the numbers come from: `pd-intel-briefing` for a period in review,
`pd-intel-deep-dive` for reaction to a post or topic, `pd-intel-creators` for
people and accounts. If you are starting cold, run that analysis first — a
report rendered on unverified numbers is worse than no report, because it looks
finished.

## Third: check the numbers before they become exhibits

This is where reports go wrong most often. Run this over every figure that made
it into the spine, whatever format you are about to render.

- **A zero is a fact about the platform, not a gap in the data.** Where a
  platform does not publish a metric, PD Intelligence stores `0`. Threads and
  Bluesky never publish view counts; Instagram publishes them on Reels only and
  publishes no share or save counts; comment text is not collected for
  X/Twitter.
- **Never build a "limitations" or "what the data can't tell you" section out of
  those zeros.** The test: if the caveat would still
  be true on a perfectly ingested dataset, it is not a caveat — it is method.
  One line in the method note, not a panel.
- **Never average post-level `engagement_rate`.** It is forced to `0.0`
  whenever views are `0`, so averaging punishes creators for posting where views
  are not published. Aggregate `sum(engagements) / sum(views)` over posts that
  reported views, or compare on likes per post.
- **Every cross-platform comparison needs a common metric.** With Instagram or
  Threads in scope, likes per post is usually the only honest one. Label a views
  chart as reach on the view-reporting subset.
- **Report median alongside mean** wherever a few viral posts carry the period,
  and name those outliers separately. An outlier-skewed average presented as
  typical is the most expensive mistake a report can make.
- **Label the grain on every rate**, and **state the denominator** behind every
  "most", "many", or "typical".
- **Cite the source URL** for every claim about a specific post.

## Fourth: render

Open the one format reference you chose and follow it.

Whatever the format, the artifact ends up in PD Docs, which renders it in an
iframe permitted exactly one thing: `allow-scripts`. Design for that from the
start — it is far cheaper than discovering it after the document is written.

| Capability | Works? | Consequence |
|---|---|---|
| Scripts, CDN libraries, WebGL | **yes** | D3 and three.js are viable |
| `localStorage`, `sessionStorage`, IndexedDB | **no — they throw** | the origin is opaque; an unguarded read blanks the whole document. Keep state in memory |
| `<form>` | no | build inputs as scripted controls |
| `window.open`, `target="_blank"` | blocked | a cited link opens nothing |
| plain `<a href>` | navigates the frame itself | the reader loses your document with no back button |
| Body size | 5 MB UTF-8 | check before publishing |

The rule that follows from those two link rows, and the one most worth
remembering:
**source URLs go in as visible, copyable text, never as bare anchors.** An
anchor reading "source" looks clickable, does nothing when clicked, and hides
the URL it replaced. Write it out — `@handle · 2026-08-14 ·
intel.example/p/123` — so a reader can select and copy it.

Verify before publishing by rendering into a matching frame:

```html
<iframe sandbox="allow-scripts" srcdoc="..."></iframe>
```

A blank frame usually means something touched storage on load.

## Fifth: QA

- Every number in the artifact matches the tool output it came from.
- Every source URL is present, complete, and readable as text.
- Chart labels name the period, the units, and the platform subset.
- Visual emphasis matches the evidence — a minor metric is not the biggest
  thing on the page.
- Comments appear as themes, not verbatim quotes, unless the user asked for
  quotes and each one is short, attributable, and relevant.
- It renders in a `sandbox="allow-scripts"` iframe without going blank.

## Sixth: publish to PD Docs

Offer it every time — an artifact sitting in a local file is not delivered.

1. `publish_document` with `mime_type: "text/html"` for a rendered document or
   deck (`text/markdown` for a plain writeup), the dataset it covers as
   `dataset_id` for provenance, and a one-line `description` naming the period
   and audience. Mind the 5 MB body cap. A rendered deck is already a file on
   disk, so when you can run a shell, publish it with the upload flow instead
   (`begin_document_upload` → `curl` PUT → `finish_document_upload`, see
   `pd-intel-documents` § Large documents) — it costs no tokens for the body.
2. **Keep the returned `id`.** Re-rendering later updates the same document via
   `document_id`; publishing the same title again just creates a duplicate.
3. Ask who should see it, then `share_document`.
4. Hand back the right link — `reader_url` for named recipients, `public_url`
   for a public share.

**If the audience includes anyone outside the org, say so out loud.** Granting
access never emails anyone, and a guest has no app to be notified in — so the
share succeeds, the audience list looks right, and nobody opens it until
someone delivers the link. Hand back `reader_url`, and say it can either be
sent on directly or mailed from the dashboard's **Send email** action in the
share dialog.

Follow `pd-intel-documents` for the sharing rules and their failure modes.

## Standards

- Lead with the conclusion, not a data inventory.
- Keep every claim falsifiable: name the period, dataset, platform, and metric.
- "Views rose 18% week over week, driven by two TikTok posts" beats
  "performance improved."
- Recommendations trace back to a pattern in the data, or they are cut.
- If the evidence is thin, show that. Do not stretch one active post into a
  trend — say it is one post.
- **Write like a person.** Machine-sounding prose is worst in openings and
  section intros. Put the finding and its number in the
  first sentence, in the words a colleague would use. Cut throat-clearing ("it's
  worth noting", "this suggests that"), abstract scene-setting, and
  paired-clause constructions ("not just X, but Y"). If a sentence would survive
  being deleted, delete it.
