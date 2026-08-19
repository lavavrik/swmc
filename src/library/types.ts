/**
 * Declarative component definitions.
 *
 * Every component in the library — all ~100 of them — is described by data,
 * never by bespoke React code. The renderer, the property panel, the picker,
 * the tick engine and the XML codec all read from this one shape, so adding a
 * component means adding a definition and nothing else.
 */
import type { NodeProperties } from '@/model/schema'
import type { ComponentTypeId, PropertyValue, SignalType } from '@/model/types'

export type Category =
  | 'arithmetic'
  | 'logic'
  | 'comparison'
  | 'composite'
  | 'video'
  | 'audio'
  | 'data'
  | 'property'
  | 'io'

export interface PortDef {
  /** Short label drawn next to the port, as in the game. */
  readonly label: string
  readonly signal: SignalType
}

export type PropertyDef =
  | {
      readonly kind: 'number'
      readonly key: string
      readonly label: string
      readonly default: number
    }
  | {
      readonly kind: 'text'
      readonly key: string
      readonly label: string
      readonly default: string
    }
  | {
      readonly kind: 'bool'
      readonly key: string
      readonly label: string
      readonly default: boolean
    }
  | {
      readonly kind: 'dropdown'
      readonly key: string
      readonly label: string
      readonly default: string
      readonly options: readonly { readonly value: string; readonly label: string }[]
    }
  | {
      readonly kind: 'slider'
      readonly key: string
      readonly label: string
      readonly default: number
      readonly min: number
      readonly max: number
      readonly step: number
    }

/** 32 numbers and 32 booleans travelling on one composite wire. */
export interface CompositeValue {
  readonly numbers: readonly number[]
  readonly bools: readonly boolean[]
}

/** Placeholder channel payloads. Filled in by the video/audio sub-projects. */
export interface VideoValue {
  readonly kind: 'video'
  readonly source: string | null
}
export interface AudioValue {
  readonly kind: 'audio'
  readonly left: number
  readonly right: number
}

export type SignalValue = number | boolean | CompositeValue | VideoValue | AudioValue

export interface EvalArgs<S = unknown> {
  /** One entry per input port; `undefined` where nothing is connected. */
  readonly inputs: readonly (SignalValue | undefined)[]
  readonly properties: Readonly<Record<string, PropertyValue>>
  /** This component instance's state from the previous tick, if it is stateful. */
  readonly state: S | undefined
}

export interface EvalResult<S = unknown> {
  readonly outputs: readonly (SignalValue | undefined)[]
  readonly state?: S
}

export type EvalFn<S = unknown> = (args: EvalArgs<S>) => EvalResult<S>

/**
 * A component's ports. Most components have a fixed shape, so a plain array is
 * the common case; the composite read/write components resolve their ports from
 * their channel-count property instead.
 */
export type PortSpec = readonly PortDef[] | ((properties: NodeProperties) => readonly PortDef[])

/**
 * `S` is the component's private state shape. It defaults to `any` so a
 * heterogeneous registry can hold components with different state types — the
 * slot is opaque to everything except the component's own eval function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ComponentDef<S = any> {
  readonly id: ComponentTypeId
  /**
   * The game's numeric component type in saved XML, or null where the mapping
   * is not yet established. The registry is the only place this is recorded.
   */
  readonly swType: number | null
  readonly category: Category
  readonly name: string
  /** Tooltip text, matching the game's wording. */
  readonly description: string
  readonly inputs: PortSpec
  readonly outputs: PortSpec
  readonly properties: readonly PropertyDef[]
  /** Optional size override in grid units; otherwise derived from the ports. */
  readonly size?: { readonly w: number; readonly h: number }
  readonly stateful?: boolean
  /** Kept for old creations; hidden from the component menu. */
  readonly deprecated?: boolean
  readonly eval: EvalFn<S>
}
