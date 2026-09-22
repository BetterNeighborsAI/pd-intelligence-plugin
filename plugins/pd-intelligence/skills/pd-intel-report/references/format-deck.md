# Format: slide deck

For a deck someone presents live, or an audience that expects slides. Rendering
is done by **Frontend Slides**, an external skill/plugin:
`git@github.com:zarazhangrui/frontend-slides.git`.

- In Claude Code: `/plugin marketplace add https://github.com/zarazhangrui/frontend-slides`
  then `/plugin install frontend-slides@frontend-slides`, and call
  `/frontend-slides:frontend-slides` with the brief below.
- In another desktop agent: read `SKILL.md` from that repo and follow it
  directly, loading `STYLE_PRESETS.md`, `viewport-base.css`,
  `html-template.md` and `animation-patterns.md` only as needed.

Treat Frontend Slides as the rendering specialist and this skill as the
intelligence specialist. Do not ask the user for a visual style up front —
Frontend Slides runs its own style discovery and will show previews.

## Density

Decide this before writing a single slide, because it changes everything:

- **High density / reading-first** — the default for a deck that will be read
  asynchronously. Structured grids, dense but legible tables, annotated charts,
  an appendix.
- **Low density / speaker-led** — only when someone presents it live. More
  slides, fewer words each.

## The handoff brief

Give Frontend Slides a structured brief, not a vague instruction:

```markdown
# PD Intelligence Frontend Slides Brief

Audience:
Purpose:
Time window:
Dataset:
Density: High density / reading-first | Low density / speaker-led
Tone: authoritative, analytical, polished, not generic

Executive thesis:

Slide outline:
1. Title / headline finding
2. Executive summary
3. KPI scoreboard
4. Platform performance
5. Top content drivers
6. Audience reaction and comment themes
7. Creator/account leaderboard
8. Anomalies and watch items
9. Recommended actions
10. Evidence appendix

Data tables:
- KPI table
- Top posts table with source URLs as plain text
- Comment theme table
- Creator/account table
- Source notes

Chart needs:
- Trend or comparison over time where available
- Platform split
- Top posts ranking
- Comment theme volume or spike timeline

Verification requirements:
- Single self-contained HTML file, inline CSS/JS
- Fixed 1920x1080 stage scaled to the viewport
- No unsupported claims; post-specific claims carry their source URL as text
- No slide overflow or overlapping panels
- No localStorage, no fullscreen API, no target="_blank"
```

Adjust the outline to what was actually asked. A five-slide executive recap
should not carry a full appendix unless the user wants an auditable handout.

## Slide patterns that work

- **Signal slide** — one headline finding with 2–3 proof metrics.
- **KPI scoreboard** — value, delta, source, and what it means.
- **Platform split** — side-by-side cards, one takeaway each.
- **Top content wall** — ranked posts with source URLs visible as text.
- **Comment terrain** — topic clusters, paraphrases, spike dates, open questions.
- **Creator matrix** — reach against engagement quality, or leader against riser.
- **Action slide** — recommendation, rationale, owner if known.
- **Evidence appendix** — compact tables of claims, ids, URLs, periods.

## Before publishing to PD Docs

A generated deck is a self-contained HTML file, which makes it publishable — but
decks reach for exactly the APIs the sandbox denies. Check all four:

1. **`localStorage` / `sessionStorage`** — often used to remember the current
   slide. It throws in the sandbox and takes the whole deck down. Remove it, or
   wrap every access in `try/catch`.
2. **`requestFullscreen`** — a presenter affordance that silently fails.
3. **`target="_blank"`** on any cited link — blocked; the link does nothing.
4. **File size** — asset-heavy decks can pass 5 MB. Check before publishing and
   trim embedded images.

Then render it in a matching frame and click through every slide:

```html
<iframe sandbox="allow-scripts" srcdoc="..."></iframe>
```

Keyboard navigation still works — scripts are allowed. A blank frame means
something touched storage at load time.
