import OpenAI from "openai";

import { getServerConfig } from "@/lib/config";

let cachedClient: OpenAI | null = null;

export function getOpenAIClient() {
  const { openAiApiKey } = getServerConfig();

  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY nao configurada.");
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: openAiApiKey });
  }

  return cachedClient;
}
