# PD Intelligence for ChatGPT and Codex

The public repository provides PD Intelligence skills and an OAuth MCP connector.
The connector uses the endpoint's OAuth discovery and dynamic client registration;
its portable MCP configuration contains only the transport and public URL.
Use your own [PD Intelligence](https://intel.publicdemocracy.io) account; your
existing dataset permissions and entitlements determine what you can access.
Installing a plugin does not grant access to data.

This is GitHub distribution. The plugin has not been submitted to OpenAI's public
directory. Custom MCP availability depends on your ChatGPT account and workspace
policies.

## ChatGPT web

1. Open [ChatGPT Plugins](https://chatgpt.com/plugins), select **+**, then
   **Add custom MCP server**.
2. Name it **PD Intelligence** and use this MCP server URL:
   `https://mcp.publicdemocracy.io/mcp`.
3. Choose **OAuth** authentication. The server supports discovery and dynamic
   client registration; you do not need a shared client secret or API key.
4. Review the connection warning, select **Create as a plugin**, and sign in with
   your own PD Intelligence account when prompted.
5. Select the plugin in a new chat and ask **"List the datasets I can access."**
   Check the result against your PD Intelligence account.

Workspace admins can also import the skills from GitHub:

| Import field | Value |
|---|---|
| Source | `https://github.com/BetterNeighborsAI/pd-intelligence-plugin` |
| Path | Leave empty |
| Branch | `main` |

Use **Admin > Plugins > Add > Import marketplace**, then review the import results
and make **pd-intelligence** available to the intended roles. Each member connects
their own PD Intelligence account. Select both the skills and your custom MCP
plugin when using the workflows.

The separately listed **pd-intelligence-connector** bundles the same remote MCP
endpoint. OpenAI currently marks repository-imported MCP configurations as
**Desktop only**, including HTTPS servers. Use the custom MCP flow above for web;
the skills package does not have that desktop restriction. The public repository
does not reuse Public Democracy's private workspace app or plugin IDs.

## ChatGPT desktop and Codex

Workspace admins can import the public marketplace using the fields above, then
enable **pd-intelligence** (skills) and **pd-intelligence-connector** (connection).
Authenticate the connector with your own PD Intelligence account.

For a local marketplace in Codex:

```bash
codex plugin marketplace add BetterNeighborsAI/pd-intelligence-plugin
```

Use the ChatGPT desktop Plugins Directory to install and test the skills and
connector from that source. Start a new chat, select the installed plugins, and
ask **"List the datasets I can access."**

The **pd-intel-code** `/pd` panel is a separate Claude Code mod. It is not part of
the OpenAI catalog and does not run in ChatGPT or Codex.

## Verify your connection

After checking dataset access, ask for a briefing for one of your accessible
datasets. Confirm the assistant uses the returned dataset ID and cites tool data.
Report publishing and sharing require your account's relevant permissions; review
the content and intended audience before authorizing a write.

If no datasets appear, check your account's MCP access and dataset grants. If
ChatGPT cannot connect, check the exact URL, OAuth sign-in and workspace policy.
After tool metadata changes, refresh the custom connection and test in a new chat.

GitHub marketplace updates sync through ChatGPT's marketplace settings. Connection
metadata refresh and marketplace sync are separate operations. A successful build
or sync does not prove that a particular user's OAuth or data access works.

## References

- [Connect a custom MCP server](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [GitHub marketplace import and desktop-only MCP rules](https://developers.openai.com/codex/enterprise/plugin-management)
- [Local marketplace setup](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli)
