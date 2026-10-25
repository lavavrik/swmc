/**
 * Recipes on disk, for the command line and the MCP server.
 *
 * A Lua Script node can name its script with `script_file` instead of carrying
 * it inline, so a large script lives in its own `.lua` file. The path is
 * relative to the recipe's folder. It is read here, before parsing, so the
 * rest of the recipe code never touches the file system.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { err, ok, type Result } from '@/model/result'
import { formatFromPath, recipeFromUnknown } from './parse'
import type { Recipe } from './types'

export interface LoadedRecipe {
  readonly recipe: Recipe
  /**
   * The recipe as text with every `script_file` read in, which is what gets
   * saved: the editor cannot reach the agent's files. The original text when
   * there was nothing to read in.
   */
  readonly text: string
}

/** Parses recipe text, reading each `script_file` relative to `baseDir`. */
export function loadRecipeText(
  text: string,
  format: 'json' | 'yaml',
  baseDir: string,
): Result<LoadedRecipe> {
  let raw: unknown
  try {
    raw = format === 'json' ? JSON.parse(text) : parseYaml(text)
  } catch (cause) {
    return err(`could not parse ${format}: ${String(cause)}`)
  }

  const inlined = inlineScriptFiles(raw, baseDir)
  if (!inlined.ok) return inlined
  const recipe = recipeFromUnknown(raw)
  if (!recipe.ok) return recipe
  if (!inlined.value) return ok({ recipe: recipe.value, text })
  const saved = format === 'json' ? JSON.stringify(raw, null, 2) : stringifyYaml(raw)
  return ok({ recipe: recipe.value, text: saved })
}

/** Reads a recipe file; its `script_file`s are relative to its folder. */
export function loadRecipeFile(path: string): Result<LoadedRecipe> {
  const full = resolve(path)
  let text: string
  try {
    text = readFileSync(full, 'utf8')
  } catch (cause) {
    return err(`could not read ${path}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  return loadRecipeText(text, formatFromPath(full), dirname(full))
}

/** Replaces `script_file` with `script` on every node, in place. Whether any did. */
function inlineScriptFiles(raw: unknown, baseDir: string): Result<boolean> {
  if (!isRecord(raw) || !Array.isArray(raw.nodes)) return ok(false)
  let any = false
  for (const node of raw.nodes) {
    if (!isRecord(node) || node.script_file === undefined) continue
    const where = `node "${String(node.id)}"`
    if (node.type !== 'data.luaScript') return err(`${where}: script_file is for data.luaScript`)
    if (typeof node.script_file !== 'string') return err(`${where}: script_file must be a path`)
    const props = isRecord(node.properties) ? node.properties : {}
    if (node.script !== undefined || props.script !== undefined) {
      return err(`${where}: give script or script_file, not both`)
    }
    const path = resolve(baseDir, node.script_file)
    try {
      node.script = readFileSync(path, 'utf8')
    } catch (cause) {
      const why = cause instanceof Error ? cause.message : String(cause)
      return err(`${where}: could not read script_file ${node.script_file}: ${why}`)
    }
    delete node.script_file
    any = true
  }
  return ok(any)
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
}
