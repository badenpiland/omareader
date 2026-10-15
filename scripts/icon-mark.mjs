// SPDX-License-Identifier: MIT

// Popup pause and play marks (.ico.pause / .ico.play in src/popup.css),
// measured in that 14px box. Pause is two 3x12 bars with a 3px gap.
// Play is the CSS triangle from border-width 6px 0 6px 10px: a 10x12
// triangle with its base on the left and its point on the right.

const BOX = 14;

export function overlayFill(size, kind) {
  const fill = new Uint8Array(size * size);
  const inside = kind === "pause" ? inPause : inPlay;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = ((x + 0.5) * BOX) / size;
      const dy = ((y + 0.5) * BOX) / size;
      if (inside(dx, dy)) {
        fill[y * size + x] = 1;
      }
    }
  }
  return fill;
}

function inPause(dx, dy) {
  const barW = 3;
  const gap = 3;
  const barH = 12;
  const x0 = (BOX - (barW * 2 + gap)) / 2;
  const y0 = (BOX - barH) / 2;
  const x = dx - x0;
  const y = dy - y0;
  if (y < 0 || y >= barH) {
    return false;
  }
  return (x >= 0 && x < barW) || (x >= barW + gap && x < barW * 2 + gap);
}

function inPlay(dx, dy) {
  const width = 10;
  const height = 12;
  const x0 = (BOX - width) / 2;
  const y0 = (BOX - height) / 2;
  const x = dx - x0;
  const y = dy - y0;
  if (x < 0 || y < 0 || y > height) {
    return false;
  }
  const mid = height / 2;
  const reach = y <= mid ? (y / mid) * width : ((height - y) / mid) * width;
  return x <= reach;
}
