# PD Intelligence plugin for Claude

Skills that teach Claude to work with [PD Intelligence](https://intel.publicdemocracy.io)
social data: briefings, post and comment deep-dives, creator analysis, news coverage,
bulk pulls, tagging, and reports rendered as documents, interactive data stories, or decks.

The skills drive the PD Intelligence MCP connector, so you need a PD Intelligence
account with the connector added to Claude. Set it up from the **Connections** page in
PD Intelligence.

## Install

**Claude Code**

```
/plugin marketplace add BetterNeighborsAI/pd-intelligence-plugin
/plugin install pd-intelligence@better-neighbors
```

**Claude web / desktop**

Customize → Plugins → **+** → Add from a repository → paste
`https://github.com/BetterNeighborsAI/pd-intelligence-plugin`

## Updates

This repository is published automatically from our internal skills repo on each
release. Please don't open pull requests against `plugins/` — send feedback to
support@better-neighbors.ai instead.

## License

[CC BY-ND 4.0](LICENSE) — free to use and share unchanged, with attribution.
© BetterNeighborsAI / Public Democracy.
