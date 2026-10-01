import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider, createProvider, GeminiProvider, retryDelayMs } from "./providers.ts";

const req = { model: "m", system: "sys", user: "usr", schema: { type: "object" }, maxTokens: 100 };
const noSleep = async () => {};

function fakeGemini(responses: (object | Error)[]) {
  const calls: any[] = [];
  const ai = {
    models: {
      generateContent: async (arg: any) => {
        calls.push(arg);
        const r = responses.shift();
        if (r instanceof Error) throw r;
        return r;
      },
    },
  } as any;
  return { ai, calls };
}

test("Gemini: JSON スキーマと system をそのまま渡し、思考トークンを出力に数える", async () => {
  const { ai, calls } = fakeGemini([
    {
      text: '{"a":1}',
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30 },
    },
  ]);
  const r = await new GeminiProvider(ai, noSleep, 0).generateJson(req);
  assert.deepEqual(r, { text: '{"a":1}', usage: { input: 100, output: 50 }, blocked: null, truncated: false });
  assert.equal(calls[0].config.responseMimeType, "application/json");
  assert.deepEqual(calls[0].config.responseJsonSchema, { type: "object" });
  assert.equal(calls[0].config.systemInstruction, "sys");
});

test("Gemini: 安全性による停止と打ち切りを区別する", async () => {
  const blocked = fakeGemini([{ text: "", candidates: [{ finishReason: "SAFETY" }] }]);
  assert.equal((await new GeminiProvider(blocked.ai, noSleep, 0).generateJson(req)).blocked, "SAFETY");
  const promptBlocked = fakeGemini([{ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }]);
  assert.equal((await new GeminiProvider(promptBlocked.ai, noSleep, 0).generateJson(req)).blocked, "PROHIBITED_CONTENT");
  const cut = fakeGemini([{ text: "{", candidates: [{ finishReason: "MAX_TOKENS" }] }]);
  assert.equal((await new GeminiProvider(cut.ai, noSleep, 0).generateJson(req)).truncated, true);
});

test("Gemini: 429 は待って再試行し、400 などはすぐ失敗する", async () => {
  const rateLimited = Object.assign(new Error("quota"), { status: 429 });
  const ok = { text: "{}", candidates: [{ finishReason: "STOP" }], usageMetadata: {} };
  const retry = fakeGemini([rateLimited, rateLimited, ok]);
  const r = await new GeminiProvider(retry.ai, noSleep, 0).generateJson(req);
  assert.equal(r.text, "{}");
  assert.equal(retry.calls.length, 3);

  const bad = fakeGemini([Object.assign(new Error("bad"), { status: 400 }), ok]);
  await assert.rejects(new GeminiProvider(bad.ai, noSleep, 0).generateJson(req), /bad/);
  assert.equal(bad.calls.length, 1);
});

test("Gemini: 認証エラーは致命的、レート制限は致命的ではない", () => {
  const p = new GeminiProvider({ models: {} } as any, noSleep, 0);
  assert.equal(p.isFatal(Object.assign(new Error("x"), { status: 403 })), true);
  assert.equal(p.isFatal(Object.assign(new Error("API key not valid"), { status: 400 })), true);
  assert.equal(p.isFatal(Object.assign(new Error("quota"), { status: 429 })), false);
});

test("Anthropic: スキーマを output_config.format に渡し、拒否を blocked にする", async () => {
  let sent: any;
  const client = {
    messages: {
      create: async (arg: any) => {
        sent = arg;
        return {
          content: [{ type: "text", text: "{}" }],
          stop_reason: "refusal",
          stop_details: { type: "refusal", category: "cyber" },
          usage: { input_tokens: 10, output_tokens: 5 },
        };
      },
    },
  } as unknown as Anthropic;
  const r = await new AnthropicProvider(client).generateJson({ ...req, lowEffort: true });
  assert.equal(r.blocked, "cyber");
  assert.deepEqual(r.usage, { input: 10, output: 5 });
  assert.deepEqual(sent.output_config, { effort: "low", format: { type: "json_schema", schema: { type: "object" } } });
});

test("createProvider: キー未設定や未知の名前は明確なエラーにする", () => {
  const saved = { g: process.env.GEMINI_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.throws(() => createProvider("gemini"), /GEMINI_API_KEY/);
    assert.throws(() => createProvider("anthropic"), /ANTHROPIC_API_KEY/);
    assert.throws(() => createProvider("foo"), /未対応/);
    process.env.GEMINI_API_KEY = "dummy";
    assert.equal(createProvider("gemini").name, "gemini");
  } finally {
    if (saved.g) process.env.GEMINI_API_KEY = saved.g; else delete process.env.GEMINI_API_KEY;
    if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;
  }
});

test("Gemini: 429 のメッセージにある待ち時間に従い、リクエストの間隔をあける", async () => {
  assert.equal(retryDelayMs(new Error("... Please retry in 5.936523841s.")), 5_937);
  assert.equal(retryDelayMs(new Error('{"retryDelay":"5s"}')), 5_000);
  assert.equal(retryDelayMs(new Error("other")), null);

  // 429 のあと、API が示した 5 秒 + 1 秒を待つ
  const waits: number[] = [];
  const rateLimited = Object.assign(new Error("quota. Please retry in 5s."), { status: 429 });
  const ok = { text: "{}", candidates: [{ finishReason: "STOP" }], usageMetadata: {} };
  const { ai } = fakeGemini([rateLimited, ok]);
  await new GeminiProvider(ai, async (ms) => void waits.push(ms), 0).generateJson(req);
  assert.deepEqual(waits, [6_000]);

  // 同じモデルへの連続リクエストは、最低間隔をあけて始まる（別モデルは独立）
  const spaced: number[] = [];
  const { ai: ai2 } = fakeGemini([ok, ok, ok]);
  const p = new GeminiProvider(ai2, async (ms) => void spaced.push(ms), 13_000);
  await Promise.all([p.generateJson(req), p.generateJson(req), p.generateJson({ ...req, model: "other" })]);
  assert.equal(spaced.length, 1);
  assert.ok(spaced[0]! > 12_000 && spaced[0]! <= 13_000);
});
