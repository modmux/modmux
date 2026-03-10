/**
 * Default model alias map: friendly/legacy name → Copilot API model ID.
 *
 * User overrides in CocoConfig.modelMap are merged over this at runtime;
 * user entries win. Unknown names pass through unchanged.
 */
export const DEFAULT_MODEL_MAP: Record<string, string> = {
  // Anthropic aliases
  "claude-opus-4-5": "claude-opus-4-5",
  "claude-sonnet-4-5": "claude-sonnet-4-5",
  "claude-haiku-4-5": "claude-haiku-4-5",
  "claude-3-5-sonnet": "claude-3.5-sonnet",
  "claude-3-opus": "claude-3-opus",
  "claude-3-haiku": "claude-3-haiku",
  // OpenAI aliases
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt-4-turbo": "gpt-4-turbo",
  "gpt-4": "gpt-4",
  "gpt-3.5-turbo": "gpt-3.5-turbo",
  // Generic aliases
  "default": "gpt-4o",
};

/**
 * Resolve a requested model name to the Copilot model ID.
 *
 * Resolution order:
 * 1. userOverrides (from CocoConfig.modelMap)
 * 2. DEFAULT_MODEL_MAP
 * 3. Pass through unchanged (Copilot may accept the raw name)
 */
export function resolveModel(
  requested: string,
  userOverrides: Record<string, string> = {},
): string {
  const merged: Record<string, string> = { ...DEFAULT_MODEL_MAP, ...userOverrides };
  return merged[requested] ?? requested;
}
