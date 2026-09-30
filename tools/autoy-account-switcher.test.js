import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("tools/autoy-account-switcher.user.js", "utf8");
assert.match(source, /@version\s+1\.1\.1/);
const document = {
  readyState: "loading",
  addEventListener() {},
};
const context = {
  console,
  document,
  window: { document },
  globalThis: null,
  crypto: { randomUUID: () => "generated-id" },
  GM_getValue: async () => [],
  GM_setValue: async () => {},
  __AUTOY_ACCOUNT_SWITCHER_TEST__: true,
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "autoy-account-switcher.user.js" });

const { saveAccountEntry } = context.__AUTOY_ACCOUNT_SWITCHER_TEST_API__;
const existing = [{ id: "main-id", alias: "主帳號", username: "main@example.com" }];
const added = saveAccountEntry(existing, {
  selectedId: "main-id",
  alias: "小號",
  username: "alt@example.com",
  idFactory: () => "alt-id",
});
assert.deepEqual(JSON.parse(JSON.stringify(added.accounts)), [
  { id: "main-id", alias: "主帳號", username: "main@example.com" },
  { id: "alt-id", alias: "小號", username: "alt@example.com" },
]);
assert.equal(added.saved.id, "alt-id");

const updated = saveAccountEntry(added.accounts, {
  selectedId: "main-id",
  alias: "小號",
  username: "new-alt@example.com",
});
assert.deepEqual(JSON.parse(JSON.stringify(updated.accounts)), [
  { id: "main-id", alias: "主帳號", username: "main@example.com" },
  { id: "alt-id", alias: "小號", username: "new-alt@example.com" },
]);

console.log("account switcher multi-account persistence passes");
