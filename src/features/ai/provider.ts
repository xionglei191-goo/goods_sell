import https from "node:https";

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

type ProviderOptions = {
  system: string;
  messages: AnthropicMessage[];
  maxTokens?: number;
};

function getAiConfig() {
  return {
    baseUrl: process.env.AI_BASE_URL || process.env.DASHSCOPE_BASE_URL || "",
    apiKey: process.env.AI_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.DEEPSEEK_API_KEY || "",
    model: process.env.AI_MODEL || "qwen3.6-plus",
  };
}

function httpsPostJson(url: URL, apiKey: string, payload: unknown): Promise<unknown> {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        rejectUnauthorized: false,
        timeout: 20_000,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Anthropic-Version": "2023-06-01",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`AI 接口返回 ${res.statusCode}: ${text.slice(0, 200)}`));
            return;
          }

          try {
            resolve(JSON.parse(text));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("AI 接口超时"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function extractText(response: unknown) {
  const content = (response as { content?: Array<{ type?: string; text?: string }> }).content;
  if (!Array.isArray(content)) return "";
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
  const payload = {
    model: config.model,
    max_tokens: options.maxTokens ?? 1024,
    system: options.system,
    messages: options.messages,
  };
  const response = await httpsPostJson(url, config.apiKey, payload);
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
