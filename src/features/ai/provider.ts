type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

type ProviderOptions = {
  system: string;
  messages: AnthropicMessage[];
  maxTokens?: number;
};

function isEnabled(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
}

function getAiConfig() {
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 60_000);
  const thinkingBudgetTokens = Number(process.env.AI_THINKING_BUDGET_TOKENS ?? 1024);
  return {
    baseUrl: process.env.AI_BASE_URL || process.env.DASHSCOPE_BASE_URL || "",
    apiKey: process.env.AI_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.DEEPSEEK_API_KEY || "",
    model: process.env.AI_MODEL || "qwen3.6-plus",
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
    thinkingEnabled: isEnabled(process.env.AI_THINKING_ENABLED),
    thinkingBudgetTokens: Number.isFinite(thinkingBudgetTokens) && thinkingBudgetTokens > 0 ? thinkingBudgetTokens : 1024,
  };
}

async function postJson(url: URL, apiKey: string, payload: unknown, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Anthropic-Version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`AI 接口返回 ${response.status}: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`AI 接口返回了非 JSON 内容: ${text.slice(0, 120)}`);
  }
}

function extractText(response: unknown) {
  const data = response as {
    content?: string | Array<{ type?: string; text?: string }>;
    choices?: Array<{ message?: { content?: string }; text?: string }>;
  };

  if (typeof data.content === "string") {
    return data.content.trim();
  }

  const content = data.content;
  if (!Array.isArray(content)) {
    const choiceText = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? "";
    return choiceText.trim();
  }

  return content
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export async function callAnthropicCompatible(options: ProviderOptions) {
  const config = getAiConfig();
  if (!config.baseUrl || !config.apiKey || config.apiKey.startsWith("your-")) {
    throw new Error("AI 接口未配置");
  }

  const url = new URL(`${config.baseUrl.replace(/\/$/, "")}/messages`);
  const maxTokens = options.maxTokens ?? 1024;
  const thinkingBudgetTokens = Math.min(config.thinkingBudgetTokens, Math.max(256, maxTokens - 128));
  const payload = {
    model: config.model,
    max_tokens: config.thinkingEnabled ? Math.max(maxTokens, thinkingBudgetTokens + 128) : maxTokens,
    system: options.system,
    messages: options.messages,
    thinking: config.thinkingEnabled ? { type: "enabled", budget_tokens: thinkingBudgetTokens } : { type: "disabled" },
  };
  const response = await postJson(url, config.apiKey, payload, config.timeoutMs);
  const text = extractText(response);
  if (!text) {
    throw new Error("AI 接口未返回文本内容");
  }

  return text;
}

export function hasAiProvider() {
  const config = getAiConfig();
  return Boolean(config.baseUrl && config.apiKey && !config.apiKey.startsWith("your-"));
}
