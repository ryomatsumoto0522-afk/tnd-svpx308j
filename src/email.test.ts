import assert from "node:assert/strict";
import { test } from "node:test";
import { clean, deliveryTime, sendMail } from "./email.ts";

test("clean: 前後の空白・改行・引用符を除く", () => {
  assert.equal(clean("  a@b.co\n"), "a@b.co");
  assert.equal(clean('"a@b.co"'), "a@b.co");
  assert.equal(clean(undefined), "");
});

test("sendMail: 形式が不正な宛先は、値を出さずに分かりやすいエラーにする", async () => {
  process.env.RESEND_API_KEY = "re_dummy";
  process.env.MAIL_TO = "not an address";
  await assert.rejects(sendMail({ subject: "s", text: "t" }), (e: Error) => {
    assert.match(e.message, /形式ではありません/);
    assert.ok(!e.message.includes("not an address"));
    return true;
  });
});

test("deliveryTime: 7 時前なら当日 7:00 JST、過ぎていたら undefined（すぐ送る）", () => {
  // 2026-10-04 05:17 JST = 10-03 20:17 UTC → 07:00 JST = 22:00 UTC
  assert.equal(deliveryTime(new Date("2026-10-03T20:17:00Z"))?.toISOString(), "2026-10-03T22:00:00.000Z");
  // 08:47 JST は過ぎている
  assert.equal(deliveryTime(new Date("2026-10-03T23:47:00Z")), undefined);
  // 06:59:30 JST は直前なので予約しない
  assert.equal(deliveryTime(new Date("2026-10-03T21:59:30Z")), undefined);
  // 日付をまたぐ（JST 0:30 は同じ日の 7:00 JST）
  assert.equal(deliveryTime(new Date("2026-10-03T15:30:00Z"))?.toISOString(), "2026-10-03T22:00:00.000Z");
  assert.equal(deliveryTime(new Date("2026-10-03T20:17:00Z"), 9)?.toISOString(), "2026-10-04T00:00:00.000Z");
});
