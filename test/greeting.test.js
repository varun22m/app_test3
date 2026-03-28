const test = require("node:test");
const assert = require("node:assert/strict");
const { createGreeting } = require("../src/greeting");

test("createGreeting returns a greeting for a provided name", () => {
  assert.equal(createGreeting("Ralph"), "Hello from Ralph!");
});

test("createGreeting falls back to AI for empty input", () => {
  assert.equal(createGreeting("   "), "Hello from AI!");
});

test("createGreeting falls back to AI for non-string input", () => {
  assert.equal(createGreeting(null), "Hello from AI!");
});
