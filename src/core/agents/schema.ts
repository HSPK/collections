import { AgentValidationError, requireRule } from './errors';

export type JsonSchema =
  | { type: 'object'; properties: Record<string, JsonSchema>; required: string[]; additionalProperties: false }
  | { type: 'array'; items: JsonSchema; minItems?: number; maxItems?: number }
  | { type: 'string'; enum?: readonly string[] }
  | { type: 'integer' | 'number'; minimum?: number; maximum?: number }
  | { type: 'boolean' };

export type ObjectSchema = Extract<JsonSchema, { type: 'object' }>;

export const schema = {
  object(properties: Record<string, JsonSchema>): ObjectSchema {
    return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
  },
  array(items: JsonSchema, minItems = 0, maxItems = 12): JsonSchema {
    return { type: 'array', items, minItems, maxItems };
  },
  string(): JsonSchema { return { type: 'string' }; },
  enum(values: readonly string[]): JsonSchema { return { type: 'string', enum: values }; },
  integer(minimum: number, maximum: number): JsonSchema { return { type: 'integer', minimum, maximum }; },
  number(minimum: number, maximum: number): JsonSchema { return { type: 'number', minimum, maximum }; },
  boolean(): JsonSchema { return { type: 'boolean' }; },
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function object(value: unknown, keys: readonly string[], label = 'Action'): Record<string, unknown> {
  requireRule(isRecord(value), `${label} must be an object.`);
  const own = Object.keys(value);
  requireRule(own.length === keys.length && own.every(key => keys.includes(key)) &&
    keys.every(key => Object.hasOwn(value, key)), `${label} has missing or unexpected fields.`);
  return value;
}

export function text(value: unknown, label: string, maximum = 240, minimum = 1): string {
  requireRule(typeof value === 'string', `${label} must be text.`);
  const result = value.trim();
  requireRule(result.length >= minimum && result.length <= maximum, `${label} must contain ${minimum}-${maximum} characters.`);
  requireRule(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result), `${label} contains control characters.`);
  return result;
}

export function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  requireRule(typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= minimum && value <= maximum, `${label} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

export function number(value: unknown, label: string, minimum: number, maximum: number): number {
  requireRule(typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum,
    `${label} must be a number from ${minimum} to ${maximum}.`);
  return value;
}

export function choice<T extends string>(value: unknown, values: readonly T[], label: string): T {
  const found = values.find(item => item === value);
  if (found === undefined) throw new AgentValidationError(`${label} must be one of: ${values.join(', ')}.`);
  return found;
}

export function boolean(value: unknown, label: string): boolean {
  requireRule(typeof value === 'boolean', `${label} must be true or false.`);
  return value;
}

export function array<T>(
  value: unknown,
  parse: (entry: unknown, index: number) => T,
  label: string,
  minimum = 0,
  maximum = 12,
): T[] {
  requireRule(Array.isArray(value) && value.length >= minimum && value.length <= maximum,
    `${label} must contain ${minimum}-${maximum} entries.`);
  return value.map(parse);
}

export interface AgentTool<T> {
  name: string;
  description: string;
  parameters: ObjectSchema;
  parse(value: unknown): T;
  summarize(plan: T): string;
}

export function defineTool<T>(tool: AgentTool<T>): AgentTool<T> {
  requireRule(/^[a-z][a-z0-9_]{0,63}$/.test(tool.name), 'Tool names must be short lowercase identifiers.');
  requireRule(tool.description.length > 0 && tool.description.length <= 2000, 'Tools need a bounded description.');
  return tool;
}
