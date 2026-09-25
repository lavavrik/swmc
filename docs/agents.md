# Using swmc with an AI agent (MCP)

<!-- The editor shows this file under AI agents (src/ui/HelpDialog.tsx). -->

swmc includes an [MCP](https://modelcontextprotocol.io) server. MCP is the
standard way to give an AI agent extra tools. Once Claude Code, Codex, Claude
Desktop, Cursor or another MCP client is connected to it, you can ask for a
microcontroller in plain words:

> Make me a throttle limiter for a car: seat W/S in, clamp the throttle to
> 0.75, brake output from S.

The agent designs it, checks it in a simulation, saves it to your swmc
library, and replies with a link that opens it in the editor. From the
editor you export the XML into Stormworks as usual.

- [Before you start](#before-you-start)
- [Install: hosted editor](#install-hosted-editor)
- [Using it](#using-it)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Tokens and security](#tokens-and-security)
- [Reference](#reference)

## Before you start

You need:

- **Node.js 20 or later.** Check with `node --version`. Get it from
  <https://nodejs.org>.
- **An MCP client.** Any of Claude Code, Codex, Claude Desktop, Cursor, or
  another client that can run a local (stdio) MCP server.
- **For the hosted editor, an CloudHost account** to sign in to
  <https://swmc.example.com>.

## Install: hosted editor

This saves what the agent builds to your cloud library, the same library
the editor's Open dialog shows when you are signed in. You don't need to
clone anything.

### 1. Create a token

1. Open <https://swmc.example.com> and click **Sign in** (top
   right).
2. Click your account (top right) to open **Agent access**.
3. Name the token after the tool that will use it, such as "Claude Code on my
   laptop", and click **Create token**.

The dialog then shows every command below with your token already filled
in. Copy them from there. **The token is shown only once.** If you lose
it, revoke it and create a new one.

### 2. Download the server

The server is one file, `swmc-mcp.mjs`, served by the editor.

macOS and Linux:

```bash
mkdir -p ~/.swmc && curl -fsSL -o ~/.swmc/swmc-mcp.mjs https://swmc.example.com/swmc-mcp.mjs
```

Windows (PowerShell):

```powershell
mkdir "$HOME\.swmc" -Force; curl.exe -fsSL -o "$HOME\.swmc\swmc-mcp.mjs" https://swmc.example.com/swmc-mcp.mjs
```

### 3. Register it with your agent

Replace `swmc_…` with your token. On Windows, replace
`~/.swmc/swmc-mcp.mjs` with the full path, such as
`C:\Users\you\.swmc\swmc-mcp.mjs`.

**Claude Code**

```bash
claude mcp add swmc --scope user -e SWMC_TOKEN=swmc_… -- node ~/.swmc/swmc-mcp.mjs
```

`--scope user` makes it available in every project. Check it with
`claude mcp list`, or run `/mcp` inside Claude Code.

**Codex**

```bash
codex mcp add swmc --env SWMC_TOKEN=swmc_… -- node ~/.swmc/swmc-mcp.mjs
```

Or add it to `~/.codex/config.toml` by hand:

```toml
[mcp_servers.swmc]
command = "node"
args = ["/home/you/.swmc/swmc-mcp.mjs"]
env = { SWMC_TOKEN = "swmc_…" }
```

**Claude Desktop, Cursor and other clients** take an `mcpServers` block.
The Agent access dialog prints it.

```json
{
  "mcpServers": {
    "swmc": {
      "command": "node",
      "args": ["/home/you/.swmc/swmc-mcp.mjs"],
      "env": { "SWMC_TOKEN": "swmc_…" }
    }
  }
}
```

| Client         | Config file                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Claude Desktop | macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor         | `~/.cursor/mcp.json`                                                                                                           |

Use an absolute path in `args`: most clients don't expand `~`. Restart the
client after editing its config.

### 4. Try it

Ask your agent: _"Using swmc, build a throttle limiter that clamps to 0.75
and doubles it."_ It should answer with a link like
`https://swmc.example.com/?open=throttle-limiter`. Open the
link. If you are signed out, the editor asks you to sign in, then opens the
microcontroller.

### Updating the server

`swmc-mcp.mjs` is a snapshot. After swmc gains new components or fixes,
run the download command from step 2 again. Your token and agent config
stay the same.

## Using it

Talk to the agent about the vehicle, not about the tools. Good requests say
what goes in and what comes out:

- _"A cruise control: seat composite in, physics sensor in, throttle out.
  Tap a button to hold the current speed, brake cancels."_
- _"Add a reverse gear output to my diesel microcontroller."_
- _"Why does the hybrid-full MCU not start the engine when the battery is at
  0.2? Simulate it."_
- _"List my microcontrollers."_

Things the agent can do:

- **Create** a new microcontroller and give you its link.
- **Change** an existing one: anything in your library, including
  microcontrollers you built by hand in the editor. It won't overwrite
  anything unless it means to, and it says so.
- **Simulate** one at 60 ticks per second: set the pins it reads (throttle,
  engine RPS, battery…) and read every output. Lua scripts run too.
- **List** and **delete** microcontrollers. It deletes only when you ask.

Things it can't do:

- **Drive a vehicle.** The simulation is the microcontroller alone. Engine
  RPS, battery charge and wheel speed are values the agent chooses, not a
  physics model.
- **Draw monitors.** Lua `onDraw` doesn't run in the simulation. Check
  displays in the editor.
- **Put the microcontroller in the game.** In the editor, export the XML and
  place it in `Stormworks/data/microprocessors`.

You can keep editing in the editor after the agent is done, then ask the
agent for more changes. It picks up your edits (see
[Editing after the editor](#editing-after-the-editor)).

## How it works

```
 you ──▶ agent (Claude Code, Codex…)
            │  MCP over stdio
            ▼
       swmc-mcp.mjs  ── runs on your machine ─────────────────────────────┐
       · checks and builds recipes into Stormworks XML                    │
       · simulates them (Lua included)                                    │
            │  HTTPS, Authorization: Bearer swmc_…                        │
            ▼                                                             │
       swmc library API ──▶ Postgres: your microcontrollers + recipes     │
            ▲                                                             │
            │  HTTPS, signed in with CloudHost                             │
       swmc editor in your browser  ◀── link ?open=<slug> ────────────────┘
```

**Recipes, not XML.** The agent never writes Stormworks XML. It writes a
_recipe_: a short YAML description that lists the pins, names each
component and its settings, and lists wires as `from: node.port, to:
node.port`. The server checks every type, port and property against the
same component catalogue the editor uses. It lays the graph out and produces
the XML. Mistakes come back as plain messages ("clamp has no input
'foo'"), and the agent fixes them and tries again.

**A typical session:**

1. The agent reads `guide`: the recipe format, plus Stormworks rules such as
   "clutches take 0..1" and "gearboxes need power to switch".
2. It looks up components with `list_components`, and can copy a complete
   example with `example_recipe`.
3. `build_microcontroller` checks the recipe, saves the XML and the recipe
   to your library, and returns the link and the pin list.
4. `simulate` runs it through stages. For example, "ignition on, engine at
   0 RPS for 1 s", then "engine at 8 RPS for 2 s". The agent reads the
   outputs and adjusts the recipe if something is wrong.

**The library.** In hosted mode everything goes through the swmc library
API, which holds your microcontrollers in Postgres under your account. The
token identifies you, so the agent sees exactly what you see in the Open
dialog.

### Editing after the editor

The library stores the recipe the agent built from, next to the XML. When
the agent comes back to a microcontroller, it starts from that recipe with
the same node names.

When you save a change in the editor, the stored recipe no longer matches
the XML. The agent notices and reads a new recipe back from the XML. That
recipe keeps every component, wire, setting and position, but the
components get generic names like `clamp_1`. This is also how the agent
edits microcontrollers you built entirely by hand.

The editor names saved microcontrollers after their title
(`Throttle Limiter` → `throttle-limiter`), and the agent follows the same
rule. If the agent renames a microcontroller, it gets a new entry in the
library, as it would in the editor.

## Troubleshooting

| Symptom                                                               | Cause and fix                                                                                                                                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The agent doesn't list any swmc tools                                 | Run `claude mcp list` or `codex mcp list`. Check that `node --version` is 20+ and that the path to `swmc-mcp.mjs` is absolute and exists. Restart the client after changing its config. |
| "the swmc library refused SWMC_TOKEN"                                 | The token was revoked or mistyped. Create a new one in Agent access and update the agent config.                                                                                        |
| The first request takes a second or two                               | The library sleeps when idle and wakes on the first request. This is normal.                                                                                                            |
| The link says "sign in to open … from your cloud library"             | You are signed out in this browser. Sign in; the microcontroller opens afterwards.                                                                                                      |
| The link says "no microcontroller called … in your library"           | The browser is signed in to a different CloudHost account from the one that made the token.                                                                                              |
| "… already exists … call again with replace: true"                    | The agent tried to create something that exists. Tell it whether to update that one or save a copy under a new name.                                                                    |
| An agent edit lost changes you made in the editor                     | Save in the editor before asking the agent. It only sees what is saved in the library.                                                                                                  |

## Tokens and security

- A token can read, change and delete everything in your library. It can't
  see or manage other tokens, and it can't do anything outside swmc.
- The library stores only a hash of each token. Nobody can read a token back,
  including you; the dialog shows it once.
- Agent access lists each token with when it was created and last used.
  **Revoke** stops it immediately.
- Your agent keeps the token in its own config (for Claude Code,
  `~/.claude.json`). Keep that file out of repositories and shared folders.
- Use one token per machine or tool, so you can revoke one without breaking
  the others.

## Reference

### Tools

| Tool                     | What it does                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `guide`                  | Recipe format, simulation rules, Stormworks vehicle conventions                                                     |
| `example_recipe`         | A complete recipe: throttle-limiter, hybrid-car, hybrid-full, diesel                                                |
| `list_components`        | Type ids, port slugs, property keys; filter by words or category                                                    |
| `build_microcontroller`  | Recipe → XML, saved with its recipe; returns the editor link. `replace: true` overwrites, `save: false` only checks |
| `simulate`               | Tick a recipe or a saved microcontroller through stages of pin values; Lua `onTick` runs                            |
| `list_microcontrollers`  | The library, newest first                                                                                           |
| `get_microcontroller`    | A saved one as a recipe to edit (its own, or read back from the XML), or as raw XML                                 |
| `delete_microcontroller` | Remove one                                                                                                          |

### Environment variables

| Variable       | Meaning                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `SWMC_TOKEN`   | Set: save to the cloud library. Unset: save to a folder                                              |
| `SWMC_API_URL` | Library API. Default `https://api.swmc.example.com`                                         |
| `SWMC_URL`     | Editor that links point to. Default: the hosted editor with a token, `http://localhost:5173` without |
