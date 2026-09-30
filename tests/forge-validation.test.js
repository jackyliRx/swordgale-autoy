import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("app.js", "utf8").replace("init();", "globalThis.__AUTOY_TEST_API__ = { forgeWorkshopsFromProfile, forgeEligibleHeroes, validateForgeDraft, shouldRecordForgeDebug }; ");
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

const { forgeWorkshopsFromProfile, forgeEligibleHeroes, validateForgeDraft, shouldRecordForgeDebug } = context.__AUTOY_TEST_API__;

assert.deepEqual(JSON.parse(JSON.stringify(forgeWorkshopsFromProfile({ forgeExpanded: 4 }))), [1, 2, 3, 4, 5]);
assert.deepEqual(JSON.parse(JSON.stringify(forgeWorkshopsFromProfile({ forgeExpanded: 6 }))), [1, 2, 3, 4, 5, 6, 7]);
assert.deepEqual(JSON.parse(JSON.stringify(forgeEligibleHeroes([
  { id: 1, hp: 20, actionState: 0, huntZone: 0, perished: false },
  { id: 2, hp: 20, actionState: 5, huntZone: 0, perished: false },
  { id: 3, hp: 0, actionState: 0, huntZone: 0, perished: false },
  { id: 4, hp: 20, actionState: 0, huntZone: 1, perished: false },
  { id: 5, hp: 20, actionState: 0, huntZone: 0, perished: true },
]))), [{ id: 1, hp: 20, actionState: 0, huntZone: 0, perished: false }]);

const types = [{ id: "katana", name: "太刀", limit: 20 }];
const mines = [{ id: 10, available: 17 }, { id: 11, available: 3 }];
const validDraft = JSON.parse(JSON.stringify(validateForgeDraft({ workshop: 1, heroId: 1, name: "測試裝備", type: "katana", selectedMines: [{ itemId: 10, quantity: 17 }, { itemId: 11, quantity: 3 }] }, { workshops: [1], heroes: [{ id: 1, hp: 20, actionState: 0, huntZone: 0, perished: false }], mines, types })));
assert.equal(validDraft.ok, true);
assert.equal(validDraft.materialTotal, 20);
assert.deepEqual(validDraft.type, types[0]);
assert.deepEqual(validDraft.selectedMines, [{ itemId: 10, quantity: 17 }, { itemId: 11, quantity: 3 }]);
assert.match(validateForgeDraft({ workshop: 1, heroId: 1, name: "測試裝備", type: "katana", selectedMines: [{ itemId: 10, quantity: 18 }] }, { workshops: [1], heroes: [{ id: 1, hp: 20, actionState: 0, huntZone: 0, perished: false }], mines, types }).error, /庫存/);
assert.match(validateForgeDraft({ workshop: 1, heroId: 1, name: "測試裝備", type: "katana", selectedMines: [{ itemId: 10, quantity: 20 }, { itemId: 11, quantity: 1 }] }, { workshops: [1], heroes: [{ id: 1, hp: 20, actionState: 0, huntZone: 0, perished: false }], mines, types }).error, /上限/);
assert.equal(shouldRecordForgeDebug({ forgeDebugEnabled: false }), false);
assert.equal(shouldRecordForgeDebug({ forgeDebugEnabled: true }), true);
console.log("forge validation and debug setting gate passes");
