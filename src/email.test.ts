import assert from "node:assert/strict";
import { test } from "node:test";
import { clean, sendMail } from "./email.ts";

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
