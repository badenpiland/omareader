// SPDX-License-Identifier: MIT
export const RECONNECT_MIN_MS = 1000;
export const RECONNECT_MAX_MS = 60_000;

// Returns the delay to wait now and the delay to use after the next failure.
export function nextDelay(current) {
  const delay = Math.min(Math.max(current, RECONNECT_MIN_MS), RECONNECT_MAX_MS);
  return { delay, next: Math.min(delay * 2, RECONNECT_MAX_MS) };
}
