type AiMessage = {
  role: "user" | "assistant";
  content: string;
};

type ProviderOptions = {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
};

type ProviderProtocol = "anthropic" | "openai";
type ReasoningEffort = "low" | "medium" | "high";

function isEnabled(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
}

function normalizeReasoningEffort(value: string | undefined): ReasoningEffort {
  const normalized = value?.toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
  return "high";
}

function getAiConfig() {
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 60_000);
  const thinkingBudgetTokens = Number(process.env.AI_THINKING_BUDGET_TOKENS ?? 1024);
  const provider = (process.env.AI_PROVIDER || process.env.AI_API_FORMAT || "").toLowerCase();
  const baseUrl = process.env.AI_BASE_URL || process.env.DASHSCOPE_BASE_URL || (process.env.DEEPSEEK_API_KEY ? "https://api.deepseek.com" : "");
  const protocol: ProviderProtocol =
    provider === "deepseek" || provider === "openai" || provider === "openai-compatible" || baseUrl.includes("deepseek.com") ? "openai" : "anthropic";

  return {
    protocol,
    baseUrl,
    apiKey: process.env.AI_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.DEEPSEEK_API_KEY || "",
    model: process.env.AI_MODEL || (protocol === "openai" ? "deepseek-v4-flash" : "qwen3.6-plus"),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
    thinkingEnabled: isEnabled(process.env.AI_THINKING_ENABLED),
    thinkingBudgetTokens: Number.isFinite(thinkingBudgetTokens) && thinkingBudgetTokens > 0 ? thinkingBudgetTokens : 1024,
    reasoningEffort: normalizeReasoningEffort(process.env.AI_REASONING_EFFORT),
  };
}

function providerUrl(baseUrl: string, protocol: ProviderProtocol) {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (protocol === "openai") {
    return new URL(trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`);
  }
  return new URL(trimmed.endsWith("/messages") ? trimmed : `${trimmed}/messages`);
}

async function postJson(url: URL, apiKey: string, payload: unknown, timeoutMs: number, protocol: ProviderProtocol): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(protocol === "anthropic" ? { "Anthropic-Version": "2023-06-01" } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`AI provider returned ${response.status}: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`AI provider returned non-JSON content: ${text.slice(0, 120)}`);
  }
}

function extractText(response: unknown) {
  const data = response as {
    content?: string | Array<{ type?: string; text?: string }>;
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> }; text?: string }>;
  };

  if (typeof data.content === "string") {
    return data.content.trim();
  }

  const content = data.content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n")
      .trim();
  }

  const choice = data.choices?.[0];
  const messageContent = choice?.message?.content;
  if (typeof messageContent === "string") return messageContent.trim();
  if (Array.isArray(messageContent)) {
    return messageContent
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n")
      .trim();
  }

  return (choice?.text ?? "").trim();
}

function buildOpenAiPayload(options: ProviderOptions, config: ReturnType<typeof getAiConfig>) {
  return {
    model: config.model,
    messages: [{ role: "system", content: options.system }, ...options.messages],
    stream: false,
    max_tokens: options.maxTokens ?? 1024,
    ...(config.thinkingEnabled ? { reasoning_effort: config.reasoningEffort, thinking: { type: "enabled" } } : {}),
  };
}

function buildAnthropicPayload(options: ProviderOptions, config: ReturnType<typeof getAiConfig>) {
  const maxTokens = options.maxTokens ?? 1024;
  const thinkingBudgetTokens = Math.min(config.thinkingBudgetTokens, Math.max(256, maxTokens - 128));
  return {
    model: config.model,
    max_tokens: config.thinkingEnabled ? Math.max(maxTokens, thinkingBudgetTokens + 128) : maxTokens,
    system: options.system,
    messages: options.messages,
    thinking: config.thinkingEnabled ? { type: "enabled", budget_tokens: thinkingBudgetTokens } : { type: "disabled" },
  };
}

export async function callAnthropicCompatible(options: ProviderOptions) {
  const config = getAiConfig();
  if (!config.baseUrl || !config.apiKey || config.apiKey.startsWith("your-")) {
    throw new Error("AI provider is not configured");
  }

  const url = providerUrl(config.baseUrl, config.protocol);
  const payload = config.protocol === "openai" ? buildOpenAiPayload(options, config) : buildAnthropicPayload(options, config);
  const response = await postJson(url, config.apiKey, payload, config.timeoutMs, config.protocol);
  const text = extractText(response);
  if (!text) {
    throw new Error("AI provider did not return text content");
  }

  return text;
}

export function hasAiProvider() {
  const config = getAiConfig();
  return Boolean(config.baseUrl && config.apiKey && !config.apiKey.startsWith("your-"));
}
