# Format: written document

The default when someone will read it alone, forward it, skim it a month later,
or needs to check how a number was reached. A document is read, not presented,
so it carries more prose and fewer, denser exhibits than a deck. Where a deck
gives one idea a slide, a document gives one idea a paragraph and puts the
evidence beside it.

Produce a single self-contained HTML file with inline CSS. Publish as
`mime_type: "text/html"`.

## Structure

1. **Title and standfirst** — the thesis in one sentence, under the title,
   before anything else. A reader who stops here should still know what
   happened.
2. **Key numbers** — 4–8 KPIs as a compact band near the top, each with its
   delta and period. Not a grid of oversized cards.
3. **The finding, in sections** — each section opens with its conclusion, then
   the evidence for it. Never open with setup and build to a reveal; readers
   skim, and the ones who skim should still collect every conclusion.
4. **Exhibits inline** — put the chart or table immediately after the sentence
   that needs it, not in a gallery at the end.
5. **Watch items and recommendations** — what to do, tied to what was found.
6. **Method note** — dataset, period, and which metric was compared on which
   platform. One short paragraph.
7. **Evidence appendix** — the source table, for anyone retracing the claims.

## Typography and layout

- **Measure**: 60–75 characters. A full-width paragraph on a 27-inch monitor is
  unreadable, and this is the most common failure in generated documents.
  `max-width: 68ch; margin-inline: auto;` and stop worrying about it.
- **One typeface with real weight range** beats three families. System stacks
  are fine and load instantly: `ui-serif, Georgia, serif` for reading-heavy
  documents, `ui-sans-serif, system-ui, sans-serif` for dense analytical ones.
- **Size for reading**: 16–18px body, 1.5–1.65 line height. Headings step by a
  consistent ratio rather than arbitrary sizes.
- **Vertical rhythm carries structure.** Space above a heading should exceed
  space below it, so the heading binds to its own section.
- **Let exhibits break the measure.** Tables and charts may run wider than the
  text column — that contrast is what makes a document feel designed rather
  than typed.

## Tables

Dense is fine; cluttered is not.

- Right-align numbers, left-align labels, and use tabular figures
  (`font-variant-numeric: tabular-nums`) so digits line up in columns.
- Horizontal rules only, and only where they separate groups. Vertical grid
  lines add nothing.
- Every column header names its unit and period.
- Wrap wide tables so they scroll inside their own container rather than
  forcing the page sideways: `<div style="overflow-x:auto">`.
- Sort by the column that carries the argument, not alphabetically.

## Charts

Inline SVG, drawn directly. No chart library is needed for the shapes a report
uses, and hand-drawn SVG stays legible and small.

- Label axes with units and period. Annotate the two or three points that carry
  the argument directly on the chart — a reader should not need the caption.
- One accent colour for the series that matters, neutral greys for context.
  Never colour every series brightly.
- Where a platform does not publish a metric, leave a visible gap and say so in
  the axis label. Do not plot a zero as if it were a measurement.
- Give every chart a caption stating what it shows and over what period.

## Print and PDF

People print these, or "print to PDF" and email the result.

```css
@media print {
  body { max-width: none; }
  h2, h3 { break-after: avoid; }
  table, figure { break-inside: avoid; }
  a::after { content: " (" attr(href) ")"; font-size: 0.85em; }
}
```

That last rule matters twice over: printed links are useless without their
URL, and in PD Docs links do not open at all — so a URL that only exists inside
an `href` is invisible to every reader either way. Put source URLs in the text.

## Dark mode

PD Docs renders your HTML as-is. Either commit to a light document with an
explicit background and text colour, or define both and switch on
`prefers-color-scheme`. What you must not do is leave the background
transparent and the text dark — a reader in dark mode gets dark grey on near
black.
