---
description: Build an evidence-backed PD Intelligence report (briefing, deep-dive, creator review)
argument-hint: "[topic, period and audience]"
---

Build a PD Intelligence report: $ARGUMENTS

1. Settle the dataset (the pinned one in your system prompt, else `list_datasets` and ask),
   the period, and the audience. Ask once if the request leaves any of them open.
2. Pick the analysis skill that fits and load it if available: `pd-intelligence:pd-intel-briefing`
   (period in review), `pd-intelligence:pd-intel-deep-dive` (reaction to a post, topic or person),
   `pd-intelligence:pd-intel-creators` (creator/account comparison). Load
   `pd-intelligence:pd-intel-navigation` for metric semantics.
3. Gather evidence before writing. Every number in the report must come from a tool result in
   this session. If evidence capture is on (system prompt), build charts and tables from the
   saved JSON files rather than re-querying; if it is off and the report needs charts, tell me
   `/pd-evidence on` would save the raw results.
4. Write the report as Markdown in the working directory (`reports/` unless I say otherwise):
   headline findings first, then evidence, then caveats. End with a **Sources** section listing
   each PD Intelligence call used — tool, arguments, time — in the order made; I can run
   `/pd-evidence` to get that list.
5. If I want it rendered (document, interactive story, deck) or published to PD Docs, use
   `pd-intelligence:pd-intel-report` / `pd-intelligence:pd-intel-documents` if available. Never
   publish or share without my say-so.
