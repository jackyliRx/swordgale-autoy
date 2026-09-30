import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("app.js", "utf8").replace("init();", "globalThis.__AUTOY_TEST_API__ = { shouldRecordItemRecoveryIncident, classifyAbortedItemUse, shouldResumeAfterAbortedItemUse };");
const storage = new Map();
const context = {
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  window: { setTimeout() {}, confirm: () => false },
  crypto: { randomUUID: () => "test-id" },
  console,
  AbortController,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  fetch: async () => { throw new Error("not used in test"); },
  globalThis: null,
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "app.js" });

const { shouldRecordItemRecoveryIncident, classifyAbortedItemUse, shouldResumeAfterAbortedItemUse } = context.__AUTOY_TEST_API__;
assert.equal(shouldRecordItemRecoveryIncident({ itemRecoveryIncidentEnabled: false }), false);
assert.equal(shouldRecordItemRecoveryIncident({ itemRecoveryIncidentEnabled: true }), true);
assert.equal(classifyAbortedItemUse({ beforeQuantity: 5, verifiedQuantity: 4 }), "consumed");
assert.equal(classifyAbortedItemUse({ beforeQuantity: 5, verifiedQuantity: 5 }), "unconfirmed");
assert.equal(shouldResumeAfterAbortedItemUse("超過無動作提醒時間，已停止"), true);
assert.equal(shouldResumeAfterAbortedItemUse("已停止"), false);
console.log("item recovery incident setting gate passes");
