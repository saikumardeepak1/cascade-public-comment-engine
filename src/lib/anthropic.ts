import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const baseURL = process.env.ANTHROPIC_BASE_URL;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local"
      );
    }
    _client = new Anthropic({ apiKey, baseURL });
  }
  return _client;
}

export const MODELS = {
  classifier: "claude-haiku-4-5-20251001",
  extractor: "claude-sonnet-4-6",
  synthesizer: "claude-opus-4-7",
} as const;
