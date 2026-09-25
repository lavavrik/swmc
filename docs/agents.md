# Agents: building microcontrollers over MCP

swmc ships an [MCP](https://modelcontextprotocol.io) server. Connect Claude
Code, Codex or any other MCP client to it, then ask for a microcontroller in
plain words. The agent writes a recipe, builds it, simulates it, saves it to
your library, and gives you a link that opens it in the editor.

It works in two modes:

- **Hosted.** With `SWMC_TOKEN` set, it saves to your cloud library on the
  live editor (<https://swmc.example.com>): the same library the
  Open dialog lists when you are signed in. You don't need a checkout.
- **Local.** Without a token, it saves to a checkout of this repository:
  `microcontrollers/<slug>.xml` beside `recipes/<slug>.yaml`, which `npm run
dev` opens at `/?open=<slug>`. This is the old `npm run mc` workflow.

## Hosted: connect an agent to your cloud library

1. Open the editor, **Sign in**, then click your account (top right).
2. Under **Agent access**, name a token and click **Create token**. The dialog
   shows the commands below with your token filled in. The token is shown
   only once.
3. Download the server. It is one file and needs Node 20 or later:

   ```bash
   mkdir -p ~/.swmc && curl -fsSL -o ~/.swmc/swmc-mcp.mjs https://swmc.example.com/swmc-mcp.mjs
   ```

4. Register it with your agent:

   ```bash
   # Claude Code
   claude mcp add swmc --scope user -e SWMC_TOKEN=swmc_… -- node ~/.swmc/swmc-mcp.mjs
   # Codex
   codex mcp add swmc --env SWMC_TOKEN=swmc_… -- node ~/.swmc/swmc-mcp.mjs
   ```

   Other clients (Claude Desktop, Cursor, …) take the usual `mcpServers`
   JSON; the dialog prints it. Give `args` an absolute path, because most
   clients do not expand `~`.

5. Ask it for something, for example: "Make me a throttle limiter that clamps
   to 0.75 and doubles it". When it finishes it links to
   `https://swmc.example.com/?open=<slug>`. If you are signed out
   when you follow the link, the editor asks you to sign in and opens the
   microcontroller afterwards.

Revoke a token from the same dialog. A token can read and change everything
in your library, but it cannot create or revoke tokens. Re-download
`swmc-mcp.mjs` after a deploy to get new components and fixes.

## Local: in this repository

The repository's `.mcp.json` starts the server from source, so Claude Code
opened here picks it up without any setup:

```bash
npm install
npm run dev            # the editor, for the links it returns
claude                 # approve the "swmc" server when asked
```

It saves into this checkout. Export `SWMC_TOKEN` before starting Claude Code
to save to the cloud library instead. For other clients, run
`npm run --silent mcp` with this repository as the working directory.
`--silent` matters: stdout carries the protocol.

## Tools

| Tool                     | What it does                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `guide`                  | Recipe format, simulation rules, Stormworks vehicle conventions                            |
| `example_recipe`         | A complete recipe from `recipes/` (throttle-limiter, hybrid-car, hybrid-full, diesel)      |
| `list_components`        | Type ids, port slugs, property keys; filter by words or category                           |
| `build_microcontroller`  | Recipe → XML, saved with its recipe; returns the editor link. `replace: true` to overwrite |
| `simulate`               | Tick a recipe or saved slug through phases of pin values; Lua `onTick` runs                |
| `list_microcontrollers`  | The library, newest first                                                                  |
| `get_microcontroller`    | A saved one as a recipe to edit (its own recipe, or read back from the XML), or raw XML    |
| `delete_microcontroller` | Remove one                                                                                 |

### Updating a microcontroller

The library keeps the recipe an agent built from, next to the XML. The
agent's next edit starts from the same node names. If you change the
microcontroller in the editor afterwards, the saved recipe falls behind the
XML. `get_microcontroller` notices this and reads a fresh recipe back from
the XML. That recipe keeps every component, wire, property and position,
but the nodes get generic names (`clamp_1`). The same applies to anything
you built by hand in the editor, so agents can edit those too.

Build under the same slug with `replace: true`. The slug is the slugified
name, as when the editor saves. If the agent renames a microcontroller, the
editor saves it under the new name.

## Configuration

| Variable       | Default                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `SWMC_TOKEN`   | unset: local mode. Set: cloud library                                  |
| `SWMC_API_URL` | `https://api.swmc.example.com`                                |
| `SWMC_URL`     | editor for links: hosted with a token, `http://localhost:5173` without |
| `SWMC_DIR`     | local mode root: the working directory                                 |

Against a local library (`server/README.md`), set `SWMC_API_URL` to the
function (`http://localhost:8080`) and `SWMC_URL` to the dev server. The
Agent access dialog adds both when the editor is not the hosted one.

## How it fits together

```
agent ──stdio──▶ swmc-mcp.mjs ──Bearer swmc_…──▶ api (Go function) ──▶ Postgres
                 build, sim, Lua                 /microcontrollers   projects.xml
                                                 /…/recipe           projects.recipe
editor ──Bearer CloudHost──▶ same api      ?open=<slug> loads from here
```

- `src/mcp/`: the server (`server.ts`), tools (`tools.ts`), where saves go
  (`library.ts`), and the guide it hands agents (`guide.ts`).
- `src/recipe/decompile.ts`: XML → recipe. `src/recipe/lua.ts`: Lua under
  Node, for `simulate` and `mc sim`.
- `scripts/build-mcp.mjs`: bundles the server and the Lua WebAssembly into
  `dist/swmc-mcp.mjs`. `npm run build` runs it, and `make deploy` uploads the
  result next to `index.html`.
- `src/mcp/examples.generated.ts` copies `recipes/`. Run
  `npm run gen:mcp-examples` after you change a recipe; a test fails until
  you do.
- `server/tokens.go`: personal access tokens (only the hash is stored).
