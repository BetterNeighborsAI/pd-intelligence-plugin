# PD Intelligence plugins for Claude, ChatGPT and Codex

Two plugins for working with [PD Intelligence](https://intel.publicdemocracy.io) social data:

- **`pd-intelligence`** (skills for Claude, ChatGPT and Codex): briefings, post and comment deep-dives,
  creator analysis, news coverage, bulk pulls, tagging, and reports rendered as documents,
  interactive data stories, or decks.
- **`pd-intel-code`** (**Claude Code only**): a `/pd` control panel for your datasets.
  See [below](#pd-intel-code-the-pd-panel-claude-code-only).
- **`pd-intelligence-connector`** (ChatGPT desktop / Codex): the public OAuth MCP
  connection, available through the OpenAI catalog.

You need your own PD Intelligence account and MCP connection. For Claude, set it
up from the **Connections** page in PD Intelligence. For ChatGPT and Codex, follow
the [public setup guide](chatgpt/README.md). Installing a plugin does not grant
dataset access.

## Install

**ChatGPT / Codex**

Follow the [ChatGPT and Codex setup guide](chatgpt/README.md) for the public
marketplace and OAuth connector. ChatGPT web uses **Add custom MCP server** with
`https://mcp.publicdemocracy.io/mcp`; the bundled connector is desktop-only under
OpenAI's current repository import rules. Each user signs in with their own PD
Intelligence account. This is GitHub distribution; OpenAI public directory
submission is still pending.

**Claude Code**

```
/plugin marketplace add BetterNeighborsAI/pd-intelligence-plugin
/plugin install pd-intelligence@better-neighbors
```

**Claude web / desktop**

Customize → Plugins → **+** → Add from a repository → paste
`https://github.com/BetterNeighborsAI/pd-intelligence-plugin`

This installs the skills. `pd-intel-code` needs Claude Code and does nothing here.

## `pd-intel-code`: the `/pd` panel (Claude Code only)

> **Claude Code only.** This is a Claude Code mod. It runs in Claude Code's terminal, the
> **Code** tab of the Claude desktop app, and Claude Code in your editor. It does **not**
> run in claude.ai chat, the desktop app's Chat tab, or ChatGPT; use the
> `pd-intelligence` skills there.

Type `/pd` for a live panel of your PD Intelligence dataset:

- **Today's numbers** with 14-day charts.
- **Posts by platform**, top posts this week, and accounts that need attention.
- **In-panel drill-downs** on posts and accounts.
- **One-click requests** to Claude, with the answers shown back in the panel.

It can sit in the chat or dock in the side panel.

```
/plugin marketplace add BetterNeighborsAI/pd-intelligence-plugin
/plugin install pd-intel-code@better-neighbors
```

Like the skills, it uses your PD Intelligence connector, so add that first from the
**Connections** page. It works with or without the `pd-intelligence` skills; install both
for the best answers.

**Auto mode:** Claude Code may block the lookups the panel makes on its own. If `/pd` says
so, allow the read-only PD Intelligence tools in your permission settings.
[The plugin's README](plugins/pd-intel-code/README.md) has the exact rule.

## Updates

This repository is published automatically from our internal skills repo on each
release, including ChatGPT package, icon and connection-setting updates. Please
don't open pull requests against `plugins/`, `chatgpt/`, or the marketplace
catalogs — send feedback to support@better-neighbors.ai instead.

## License

[CC BY-ND 4.0](LICENSE) — free to use and share unchanged, with attribution.
© BetterNeighborsAI / Public Democracy.
