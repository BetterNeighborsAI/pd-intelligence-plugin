# pd-intel-code — PD Intelligence for Claude Code

A Claude Code **mod** (a function-hooks plugin) for exploring PD Intelligence data and turning it
into reports, made for people who would rather press a button than type an id. Pairs with the
`pd-intelligence` skills plugin; works without it.

It uses the **PD Intelligence connector** you already have set up in claude.ai, recognised by its
tools whatever the connector is named. It ships no server of its own.

## Start here: `/pd`

Type `/pd` and the PD Intelligence panel appears right in the chat (terminal, desktop and mobile alike):

```
Working in
📈 Example Campaign

Change over the last 7 days
Posts       79,986    +4,667
Views       8B        +5.8%
Followers   118.3M    +0.1%
Accounts    163       +1
Posting     112       -8
Creators    121       +1
X 75.2K · Facebook 1,541 · Instagram 1,245 · TikTok 1,114 · YouTube 921

[ Explore this dataset ] [ Write a report ]
[ Save results for charts: Off ] [ Sources used (4) ] [ Refresh ]

Your datasets (5): press one to work in it
● 📈 Example Campaign #7
○ 🌱 Another Dataset #3
…
```

- **Press a dataset** to work in it. It's remembered across sessions, shown in the status line
  (`PD Intelligence · 📈 Example Campaign`), and Claude uses it without asking.
- **Explore this dataset** — a plain-language tour: what's tracked, what changed, what's worth a look.
- **Write a report** — Claude asks topic, period and audience, then writes an evidence-backed
  report to `reports/` ending in a sources list.
- **Save results for charts** — saves each PD Intelligence result as JSON under
  `./pd-intel-evidence/` (git-ignored automatically) so charts are built from the real numbers.
- **Sources used** — every PD Intelligence call this session (tool, arguments, time), ready for a
  report's sources section.

The panel stays live: press a dataset or a button and it updates in place. Type `/pd` again any time for a fresh one.

**Side panel or chat — your choice.** On a computer, press **Move to side panel** and the panel
docks beside the conversation; **Show it here instead** brings it back into the chat. The choice is
remembered, so `/pd` opens it where you left it.

**On mobile** the Claude app shows `/pd` as a text summary (the same numbers and dataset list,
without buttons). Switch datasets by just asking — *"work in Countercurrent"* — or with
`/pd-dataset` and the number.

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
