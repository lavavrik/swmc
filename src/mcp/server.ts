/**
 * swmc as an MCP server, over stdio.
 *
 * Point Claude Code, Codex or any MCP client at it and ask for a
 * microcontroller: it builds recipes, ticks them, and saves the XML where the
 * editor opens it.
 *
 *     SWMC_TOKEN=swmc_…  node swmc-mcp.mjs     # the hosted editor's cloud library
 *     npm run --silent mcp                     # this checkout (microcontrollers/)
 *
 * SWMC_TOKEN      personal access token from the editor (account → Agent access)
 * SWMC_API_URL    library API; defaults to the hosted one
 * SWMC_URL        editor base for links; hosted with a token, localhost:5173 without
 * SWMC_DIR        folder mode root; defaults to the working directory
 *
 * stdout is the protocol. Anything else goes to stderr.
 */
import { argv, cwd, env, exit, stderr } from 'node:process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { INSTRUCTIONS } from './guide'
import { libraryFromEnv, type Library } from './library'
import {
  buildMicrocontroller,
  deleteMicrocontroller,
  exampleRecipe,
  getMicrocontroller,
  guide,
  listComponents,
  listMicrocontrollers,
  simulate,
  ToolError,
} from './tools'

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

async function reply(work: () => string | Promise<string>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: await work() }] }
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : String(cause)
    if (!(cause instanceof ToolError)) stderr.write(`swmc-mcp: ${text}\n`)
    return { content: [{ type: 'text', text }], isError: true }
  }
}

const recipePath = z
  .string()
  .optional()
  .describe(
    'Instead of recipe: a recipe file on this machine, read by the server (relative paths are from its working directory). Its script_file paths are relative to its folder.',
  )

const slug = z
  .string()
  .regex(/^[a-z0-9-]{1,64}$/)
  .describe('Library id: lowercase letters, digits, hyphens')

export function createServer(library: Library): McpServer {
  const server = new McpServer(
    { name: 'swmc', title: 'Stormworks Microcontrollers', version: '0.1.0' },
    { instructions: `${INSTRUCTIONS}\n\nSaves go to ${library.where}.` },
  )

  server.registerTool(
    'guide',
    {
      title: 'Recipe guide',
      description:
        'The recipe format, simulation rules and Stormworks vehicle I/O conventions. Read once before writing a recipe.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => reply(guide),
  )

  server.registerTool(
    'example_recipe',
    {
      title: 'Example recipe',
      description:
        'A complete, working recipe (YAML) to copy the shape of, with vehicle wiring notes where there are some. The guide lists the names.',
      inputSchema: {
        name: z.string().describe('throttle-limiter (tiny), hybrid-car, hybrid-full, diesel'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ name }) => reply(() => exampleRecipe(name)),
  )

  server.registerTool(
    'list_components',
    {
      title: 'Component catalogue',
      description:
        'Component type ids, port slugs (what wires name) and property keys (what nodes set). Filter by words or category; detail gives full JSON.',
      inputSchema: {
        query: z.string().optional().describe('Words that must all appear, e.g. "pid" or "switch"'),
        category: z
          .string()
          .optional()
          .describe('e.g. arithmetic, logic, composite, data, timers, av'),
        detail: z.boolean().optional().describe('Full JSON instead of one line per port list'),
      },
      annotations: { readOnlyHint: true },
    },
    (input) => reply(() => listComponents(input)),
  )

  server.registerTool(
    'build_microcontroller',
    {
      title: 'Build and save',
      description:
        'Build a recipe into Stormworks XML and save it with its recipe to the library. Returns the editor link, pins and warnings; on a mistake returns what to fix. Refuses to overwrite an existing slug unless replace is true. With Lua, it also ticks the script as written and minified (as the export writes it) and warns if they differ. A data.luaScript node can take script_file: path/to/script.lua instead of script; it is read in and saved inline.',
      inputSchema: {
        recipe: z.string().optional().describe('The recipe, YAML or JSON text'),
        recipe_path: recipePath,
        slug: slug.optional().describe('Library id. Defaults to the name, slugified'),
        replace: z.boolean().optional().describe('Overwrite an existing microcontroller'),
        save: z.boolean().optional().describe('false: validate only, save nothing'),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    (input) => reply(() => buildMicrocontroller(library, input)),
  )

  server.registerTool(
    'simulate',
    {
      title: 'Simulate',
      description:
        'Tick a recipe (or a saved microcontroller) at 60 Hz with pin values you choose, over one or more phases on the same simulation, and read every pin at the end of each phase. Lua onTick runs, as written and also minified as the export writes it; a warning says if the two differ. There is no vehicle model: sensor inputs are whatever you set.',
      inputSchema: {
        recipe: z.string().optional().describe('Recipe text to simulate without saving'),
        recipe_path: recipePath,
        slug: slug.optional().describe('Or a saved microcontroller'),
        minified: z
          .boolean()
          .optional()
          .describe('Report the run with the Lua minified, exactly as the game runs it'),
        phases: z
          .array(
            z.object({
              ticks: z.number().describe('Ticks to run (60 per second)'),
              set: z
                .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
                .optional()
                .describe('Input pins by id or label. on/off, numbers, composite as "2=0.5,13=20"'),
            }),
          )
          .min(1),
      },
      annotations: { readOnlyHint: true },
    },
    (input) => reply(() => simulate(library, input)),
  )

  server.registerTool(
    'list_microcontrollers',
    {
      title: 'List saved',
      description: 'Microcontrollers in the library, newest first.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => reply(() => listMicrocontrollers(library)),
  )

  server.registerTool(
    'get_microcontroller',
    {
      title: 'Get',
      description:
        'A saved microcontroller as a recipe to edit and rebuild. If it was made or changed in the editor, the recipe is read back from its XML. as: "xml" for the XML as saved, "export" for the XML the editor exports (Lua minified), which is what the game loads.',
      inputSchema: {
        slug,
        as: z.enum(['recipe', 'saved_recipe', 'xml', 'export']).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (input) => reply(() => getMicrocontroller(library, input)),
  )

  server.registerTool(
    'delete_microcontroller',
    {
      title: 'Delete',
      description: 'Delete a microcontroller from the library. Only when the user asks.',
      inputSchema: { slug },
      annotations: { destructiveHint: true },
    },
    ({ slug: id }) => reply(() => deleteMicrocontroller(library, id)),
  )

  return server
}

async function main(): Promise<void> {
  const library = libraryFromEnv(env, cwd())
  const server = createServer(library)
  await server.connect(new StdioServerTransport())
  stderr.write(`swmc-mcp ready; saving to ${library.where}\n`)
}

if (argv[1] && /server\.[cm]?[jt]s$|swmc-mcp\.m?js$/.test(argv[1])) {
  main().catch((cause: unknown) => {
    stderr.write(`swmc-mcp: ${String(cause)}\n`)
    exit(1)
  })
}
