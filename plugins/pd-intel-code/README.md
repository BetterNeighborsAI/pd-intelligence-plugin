# pd-intel-code — PD Intelligence for Claude Code

A Claude Code **mod** (a function-hooks plugin) for exploring PD Intelligence data and turning it
into reports, made for people who would rather press a button than type an id. Pairs with the
`pd-intelligence` skills plugin; works without it.

It uses the **PD Intelligence connector** you already have set up in claude.ai, recognised by its
tools whatever the connector is named. It ships no server of its own.

## Start here: `/pd`

Type `/pd` and the PD Intelligence panel appears right in the chat (terminal, desktop and mobile alike):

```
📈 Example Campaign        data as of Oct 9   [ Refresh ]
Dataset: [ 📈 Example Campaign ▾ ]

POSTS · per day          FOLLOWERS · change       ACCOUNTS POSTING · per day
79,986  +4,667           118.3M  +0.1%            112  -8
▃▅▂▄▆▄▅▇▃▂▆▆▅▅           ▁▁▂▂▃▃▃▄▄▅▅▆▆▇           ▅▆▆▅▆▇▆▅▅▆▆▅▄▄
Views 8B (+5.8%) · Accounts 163 · Creators 121

PLATFORM MIX · last 7 days
████████████████████████▓
X 98% · YouTube 2%

TOP POSTS THIS WEEK
1. @someone · X  "First words of the post…"  1.2M views  [ Why? ]

NEEDS ATTENTION
@quiet · Instagram · 53 posts · 2,245 views  [ Look into it ]

[ Explore ] [ Write a report ] [ Today's brief ] [ Sources used (4) ] [ Save results for charts: Off ]
```

- **Pick a dataset** from the dropdown (on the phone: press one in the list). It's remembered across
  sessions, shown in the status line (`PD Intelligence · 📈 Example Campaign`), and Claude uses it
  without asking.
- **Tiles** show each number, its change over 7 days and a 14-day chart. On the desktop and phone,
  hover a bar for its day and value; the terminal draws the same trend in bar characters. The
  followers chart shows followers gained or lost since the first day.
- **Why?**, **Look into it** and **Today's brief** send Claude a ready-written request as your own
  message, so you see exactly what was asked.
- **Data** is fetched once a day per dataset and saved, so `/pd` opens instantly; **Refresh** fetches
  it again now. A section that fails says so on its own line; the rest still shows.
- **Explore** — a plain-language tour: what's tracked, what changed, what's worth a look.
- **Write a report** — Claude asks topic, period and audience, then writes an evidence-backed
  report to `reports/` ending in a sources list.
- **Save results for charts** — saves each PD Intelligence result as JSON under
  `./pd-intel-evidence/` (git-ignored automatically) so charts are built from the real numbers.
- **Sources used** — every PD Intelligence call Claude made this session (tool, arguments, time),
  ready for a report's sources section. The panel's own fetches are not listed.

**Inside the panel** (nothing goes to the chat): **Today** shows PD's daily summary and that day's
top posts; **Details** on a post shows its numbers and, on request, a summary of the comments PD
collected (this can take a minute or two); **Details** on an account shows its followers, activity
and latest posts. **← Back** returns to the overview. They keep working while Claude is busy.

**Ask Claude** buttons hand the work to Claude in the chat. Each one appears under **Requests to
Claude**: *Sent*, *Claude is on it…*, then *Answered* with a preview and **Show answer**, which opens
the full answer in the panel. The **Ask Claude** card offers ready-made questions, and the datasets
you used most recently come first in the dataset list.

The panel stays live: press a dataset or a button and it updates in place. Type `/pd` again any time for a fresh one.

**Side panel or chat — your choice.** On a computer, press **Move to side panel** and the panel
docks beside the conversation; **Show it here instead** brings it back into the chat. The choice is
remembered, so `/pd` opens it where you left it.

**On mobile** the Claude app shows `/pd` as a text summary (the same numbers and dataset list,
without buttons). Switch datasets by just asking — *"work in Countercurrent"* — or with
`/pd-dataset` and the number.

**In auto mode**, Claude Code may refuse the lookups the panel makes by itself (there is no request
of yours behind them to judge), and `/pd` then says so. Allow the read-only tools the panel
uses in your permission settings, or switch out of auto mode. In `~/.claude/settings.json`, with
`SERVER` being your PD Intelligence connector's name as it appears in its tool names
(`mcp__SERVER__list_datasets`):

```json
"permissions": {
  "allow": [
    "mcp__SERVER__list_datasets",
    "mcp__SERVER__get_dashboard_stats",
    "mcp__SERVER__run_analytics_sql",
    "mcp__SERVER__get_leaderboard",
    "mcp__SERVER__get_daily_summary",
    "mcp__SERVER__search_posts",
    "mcp__SERVER__get_post_detail",
    "mcp__SERVER__get_comment_summary",
    "mcp__SERVER__search_accounts"
  ]
}
```

## Also

| | |
|---|---|
| "Work in …" | Ask Claude to switch datasets in plain words; it uses the mod's `choose_dataset` tool. |
| `/pd-dataset ID` / `/pd-dataset off` | Choose or clear the dataset by id. |
| `/pd-evidence [on \| off \| clear]` | The sources list and the save-for-charts switch, as commands. |
| `/pd-intel-code:explore`, `/pd-intel-code:report` | What the panel's two buttons run. |
| Write guard | `delete_tag`, `delete_creators` and `share_document` always ask first, even if a permission rule allows all PD tools. (Under bypass-permissions mode the mode still decides.) |

## Install

```
/plugin install pd-intel-code --marketplace BetterNeighborsAI/pd-intelligence-plugin
```

Inside BetterNeighborsAI it is also in the org marketplace: `/plugin install pd-intel-code@better-neighbors-ai`.

Function hooks are an early-access Claude Code feature; keep Claude Code up to date.

## Develop

```
claude plugin validate plugins/pd-intel-code   # manifest + hooks module
claude plugin test plugins/pd-intel-code       # hooks/register.test.tsx
```
