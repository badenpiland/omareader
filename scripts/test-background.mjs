import assert from "node:assert/strict";
import { RECONNECT_MAX_MS, RECONNECT_MIN_MS, nextDelay } from "../src/reconnect-delay.js";

const seen = [];
let current = RECONNECT_MIN_MS;
for (let i = 0; i < 10; i += 1) {
  const step = nextDelay(current);
  seen.push(step.delay);
  current = step.next;
}

assert.deepEqual(seen.slice(0, 6), [1000, 2000, 4000, 8000, 16000, 32000]);
assert.equal(seen.at(-1), RECONNECT_MAX_MS);
assert.equal(nextDelay(RECONNECT_MAX_MS).next, RECONNECT_MAX_MS);
assert.equal(nextDelay(50).delay, RECONNECT_MIN_MS);
console.log(`reconnect delays ${seen.join(", ")}`);
