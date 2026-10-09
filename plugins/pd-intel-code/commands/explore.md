---
description: Orient in a PD Intelligence dataset — what's tracked, what moved, where to dig
argument-hint: "[question or focus]"
---

Explore PD Intelligence data with me. Focus: $ARGUMENTS

1. Settle the dataset. If a dataset is pinned (see your system prompt), use it. Otherwise call
   `list_datasets`, show the ids and names, and ask which one — then suggest `/pd-dataset ID`
   so it sticks.
2. Load the `pd-intelligence:pd-intel-navigation` skill if it is available — it explains what a
   zero or missing metric means per platform; don't caveat numbers without it.
3. Get the lay of the land in a few calls: `get_dashboard_stats` (counts + deltas), the top of
   `get_leaderboard`, `list_tags`, and `get_daily_summary` for the latest day.
4. If I gave a focus, answer it with the narrowest tools that fit (`search_posts`,
   `search_comments`, `get_account_detail`, `run_analytics_sql` with its date/tag/platform
   arguments — never a date filter in the SQL alone).
5. Reply with a short orientation: what this dataset tracks, what changed recently, 3–5
   threads worth pulling (each with the one call that would start it). No report yet.
