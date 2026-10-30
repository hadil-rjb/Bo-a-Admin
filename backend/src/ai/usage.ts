import { AsyncLocalStorage } from "async_hooks";

/** The brand a request works for (the studio sends x-brand-id), so each Claude call can be billed to it */
export const usageScope = new AsyncLocalStorage<{ brandId?: string }>();

export type ClaudeUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export type UsageEntry = {
  brandId: string | null; feature: string; model: string;
  input: number; output: number; cacheWrite: number; cacheRead: number;
  cost: number; priced: boolean; at: Date;
};

/**
 * Anthropic first-party prices in $ per million tokens (October 2026). Cache writes (5 min) cost 1.25× input;
 * cache reads 0.1× input unless the model has its own rate. Longest prefix wins, so dated ids match too.
 */
const PRICES: [prefix: string, input: number, output: number, cacheRead?: number][] = [
  ["claude-fable-5-1", 10, 50, 0.25],
  ["claude-mythos-5-1", 10, 50, 0.25],
  ["claude-fable-5", 10, 50],
  ["claude-opus-5-5", 4, 20, 0.2],
  ["claude-opus-5", 5, 25],
  ["claude-opus-4-8", 5, 25],
  ["claude-opus-4-7", 5, 25],
  ["claude-opus-4-6", 5, 25],
  ["claude-sonnet-5-5", 2, 10, 0.2],
  ["claude-sonnet-5", 2, 10],
  ["claude-sonnet-4-6", 3, 15],
  ["claude-haiku-5-5", 0.1, 0.5],
  ["claude-haiku-4-5", 1, 5],
].sort((a, b) => (b[0] as string).length - (a[0] as string).length) as any;

const n = (v: number | null | undefined) => (Number.isFinite(v) ? Number(v) : 0);

/** Cost in $ of one response; priced is false for a model missing from the table (tokens still count) */
export function claudeCost(model: string, u: ClaudeUsage) {
  const p = PRICES.find(([k]) => model.startsWith(k));
  if (!p) return { cost: 0, priced: false };
  let [k, inp, out, read] = p;
  const prompt = n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens);
  // Haiku 5.5 bills prompts above 100K tokens at $0.50 / $2.50
  if (k === "claude-haiku-5-5" && prompt > 100_000) { inp = 0.5; out = 2.5; }
  const cost = (n(u.input_tokens) * inp + n(u.output_tokens) * out + n(u.cache_creation_input_tokens) * inp * 1.25 + n(u.cache_read_input_tokens) * (read ?? inp * 0.1)) / 1e6;
  return { cost, priced: true };
}

let sink: ((e: UsageEntry) => void) | null = null;
export const setUsageSink = (fn: (e: UsageEntry) => void) => { sink = fn; };

/** Records one Claude response's tokens and cost for the brand of the current request (null: Blog Admin / no brand) */
export function trackClaude(feature: string, model: string, usage: ClaudeUsage | null | undefined, brandId?: string) {
  if (!usage || !sink) return;
  const { cost, priced } = claudeCost(model, usage);
  sink({
    brandId: brandId ?? usageScope.getStore()?.brandId ?? null, feature, model,
    input: n(usage.input_tokens), output: n(usage.output_tokens), cacheWrite: n(usage.cache_creation_input_tokens), cacheRead: n(usage.cache_read_input_tokens),
    cost, priced, at: new Date(),
  });
}
