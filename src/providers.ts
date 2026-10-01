import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

export interface JsonRequest {
  model: string;
  system: string;
  user: string;
  /** 構造化出力に使う JSON スキーマ（enum などは制約として効く形で書く） */
  schema: Record<string, unknown>;
  maxTokens: number;
  /** 推論の深さを抑えたい場合（対応するモデルだけで効く） */
  lowEffort?: boolean;
}

export interface JsonResult {
  text: string;
  usage: { input: number; output: number };
  /** 安全性の判断で出力が拒否された場合の理由。拒否されていなければ null */
  blocked: string | null;
  /** 出力が長さの上限で打ち切られた */
  truncated: boolean;
}

export interface ModelNames {
  selection: string;
  summary: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly models: ModelNames;
  /** 同時に投げてよいリクエスト数（無料枠のレート制限に合わせる） */
  readonly concurrency: number;
  generateJson(req: JsonRequest): Promise<JsonResult>;
  /** 認証や権限の誤りなど、全記事で失敗するので実行全体を止めるべきエラーか */
  isFatal(e: unknown): boolean;
}

export const PROVIDER_NAMES = ["gemini", "anthropic"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly models: ModelNames = { selection: "claude-haiku-4-5", summary: "claude-sonnet-5-5" };
  readonly concurrency = 4;

  constructor(private readonly client: Anthropic = new Anthropic()) {}

  async generateJson(req: JsonRequest): Promise<JsonResult> {
    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      output_config: {
        ...(req.lowEffort ? { effort: "low" as const } : {}),
        format: { type: "json_schema", schema: req.schema },
      },
    });
    const block = response.content.find((b) => b.type === "text");
    return {
      text: block && block.type === "text" ? block.text : "",
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      blocked: response.stop_reason === "refusal" ? (response.stop_details?.category ?? "unknown") : null,
      truncated: response.stop_reason === "max_tokens",
    };
  }

  isFatal(e: unknown): boolean {
    return e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError;
  }
}

const BLOCKING_FINISH_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

/** 一時的なエラー（レート制限・過負荷）かどうか */
function isRetryable(e: unknown): boolean {
  const status = (e as { status?: number }).status;
  return status === 429 || status === 500 || status === 503 || status === 504;
}

/** 429 のメッセージにある「Please retry in 5.9s」「retryDelay: 5s」から待ち時間（ミリ秒）を読む */
export function retryDelayMs(e: unknown): number | null {
  const m = /retry in ([\d.]+)s|"retryDelay":\s*"([\d.]+)s"/i.exec(String((e as Error)?.message ?? ""));
  const sec = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(sec) ? Math.ceil(sec * 1000) : null;
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  // 無料枠の対象モデル。有料に切り替えなくても使える（ただし無料枠の入力は Google の製品改善に使われ得る）
  readonly models: ModelNames = { selection: "gemini-3.5-flash-lite", summary: "gemini-3.8-flash" };
  readonly concurrency = 2;

  /** モデルごとの、次にリクエストを始めてよい時刻 */
  private readonly nextSlot = new Map<string, number>();

  /**
   * 無料枠は 1 分あたり 5 リクエスト（gemini-3.8-flash）なので、
   * モデルごとに minIntervalMs（既定 13 秒）以上あけてリクエストを始める。
   */
  constructor(
    private readonly ai: Pick<GoogleGenAI, "models"> = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly minIntervalMs = 13_000,
  ) {}

  private async pace(model: string): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.nextSlot.get(model) ?? 0);
    // 待つ前に枠を確保するので、同時に呼ばれても順番に間隔があく
    this.nextSlot.set(model, at + this.minIntervalMs);
    if (at > now) await this.sleep(at - now);
  }

  async generateJson(req: JsonRequest): Promise<JsonResult> {
    const maxAttempts = 6;
    // 429（レート制限）と 5xx は待って再試行する。429 は API が示す待ち時間に従う
    for (let attempt = 1; ; attempt++) {
      await this.pace(req.model);
      try {
        return await this.once(req);
      } catch (e) {
        if (!isRetryable(e) || attempt >= maxAttempts) throw e;
        await this.sleep((retryDelayMs(e) ?? Math.min(2_000 * 2 ** attempt, 30_000)) + 1_000);
      }
    }
  }

  private async once(req: JsonRequest): Promise<JsonResult> {
    const response = await this.ai.models.generateContent({
      model: req.model,
      contents: req.user,
      config: {
        systemInstruction: req.system,
        responseMimeType: "application/json",
        responseJsonSchema: req.schema,
        maxOutputTokens: req.maxTokens,
      },
    });
    const candidate = response.candidates?.[0];
    const finish = candidate?.finishReason ? String(candidate.finishReason) : "";
    const blockReason = response.promptFeedback?.blockReason ? String(response.promptFeedback.blockReason) : null;
    const usage = response.usageMetadata;
    return {
      text: response.text ?? "",
      // 推論（thinking）に使ったトークンも出力として数える
      usage: {
        input: usage?.promptTokenCount ?? 0,
        output: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
      },
      blocked: blockReason ?? (BLOCKING_FINISH_REASONS.has(finish) ? finish : null),
      truncated: finish === "MAX_TOKENS",
    };
  }

  isFatal(e: unknown): boolean {
    const status = (e as { status?: number }).status;
    return status === 401 || status === 403 || (status === 400 && /api key/i.test(String((e as Error).message)));
  }
}

export function createProvider(name: string = process.env.LLM_PROVIDER ?? "gemini"): LlmProvider {
  if (name === "gemini") {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY が未設定です（LLM なしで確認するなら --offline）");
    return new GeminiProvider();
  }
  if (name === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が未設定です（LLM なしで確認するなら --offline）");
    return new AnthropicProvider();
  }
  throw new Error(`未対応の LLM_PROVIDER: ${name}（gemini か anthropic）`);
}
