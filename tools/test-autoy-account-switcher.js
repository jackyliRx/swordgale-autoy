import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("tools/autoy-account-switcher.user.js", "utf8");
const context = { __AUTOY_ACCOUNT_SWITCHER_TEST__: true };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: "autoy-account-switcher.user.js" });

const { normalizeAccounts } = context.__AUTOY_ACCOUNT_SWITCHER_TEST_API__;
assert.deepEqual(
  JSON.parse(JSON.stringify(normalizeAccounts([
    { id: "a", alias: " 主帳號 ", username: " user@example.com " },
    { id: "b", alias: "主帳號", username: "duplicate@example.com" },
    { id: "c", alias: "", username: "missing-alias@example.com" },
    { id: "d", alias: "副帳號", username: "second@example.com" },
  ]))),
  [
    { id: "a", alias: "主帳號", username: "user@example.com" },
    { id: "d", alias: "副帳號", username: "second@example.com" },
  ],
);
assert.deepEqual(JSON.parse(JSON.stringify(normalizeAccounts("not-an-array"))), []);
console.log("PASS autoy account switcher persistence helpers");
