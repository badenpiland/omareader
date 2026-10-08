import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

// The Omarchy mark, one cell per character, plus glasses on the same grid.
// Rims sit one cell inside the inner wall. Col 7 is the lens gap except for
// the bridge at row 6. Stems are the cells (3,6) and (11,6).
const MARK = [
  "###############",
  "#......#......#",
  "#.######...##.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "###.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.###########.#",
  "#......#......#",
  "########.######",
];
const FRAME = new Set();
for (const y of [5, 8]) {
  for (const x of [4, 5, 6, 8, 9, 10]) {
    FRAME.add(`${x},${y}`);
  }
}
for (const y of [6, 7]) {
  for (const x of [4, 6, 8, 10]) {
    FRAME.add(`${x},${y}`);
  }
}
FRAME.add("7,6");
FRAME.add("3,6");
FRAME.add("11,6");
const LENS = new Set(["5,6", "5,7", "9,6", "9,7"]);

function rgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

const ICON_COLORS = {
  dark: { plate: rgb("#12141C"), mark: rgb("#9ECE6A"), lens: rgb("#3A6E30") },
  light: { plate: rgb("#F6F3EA"), mark: rgb("#4A7228"), lens: null },
};

function paintIcon(size, colors) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    const gy = Math.min(14, Math.floor((y * 15) / size));
    for (let x = 0; x < size; x += 1) {
      const gx = Math.min(14, Math.floor((x * 15) / size));
      const key = `${gx},${gy}`;
      let color = colors.plate;
      if (MARK[gy][gx] === "#" || FRAME.has(key)) {
        color = colors.mark;
      } else if (colors.lens && LENS.has(key)) {
        color = colors.lens;
      }
      const offset = row + 1 + x * 4;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = 255;
    }
  }
  return raw;
}

function png(size, colors) {
  const raw = paintIcon(size, colors);
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) {
      c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (tag, data) => {
    const body = Buffer.concat([Buffer.from(tag), data]);
    const out = Buffer.alloc(8 + body.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 4 + body.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function idFromDer(der) {
  return createHash("sha256")
    .update(der)
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) =>
      String.fromCharCode("a".charCodeAt(0) + Number.parseInt(digit, 16)),
    );
}

function extensionKey() {
  const pem = join(root, "key.pem");
  try {
    const der = execFileSync("openssl", [
      "rsa",
      "-in",
      pem,
      "-pubout",
      "-outform",
      "DER",
    ]);
    return { key: der.toString("base64"), id: idFromDer(der) };
  } catch {
    return null;
  }
}

mkdirSync(dist, { recursive: true });
await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/content.js"],
  bundle: true,
  format: "iife",
  outfile: "dist/content.js",
  target: "chrome120",
  legalComments: "none",
});

const contentPath = join(dist, "content.js");
const banner = `/*!
 * Omareader includes Dark Reader (https://darkreader.org/), MIT License.
 * Copyright (c) 2026 Dark Reader Ltd.
 * The full license is LICENSES/darkreader-MIT.txt in this extension.
 */
`;
writeFileSync(contentPath, banner + readFileSync(contentPath));
mkdirSync(join(dist, "LICENSES"), { recursive: true });
copyFileSync(join(root, "LICENSE"), join(dist, "LICENSE"));
copyFileSync(
  join(root, "LICENSES", "darkreader-MIT.txt"),
  join(dist, "LICENSES", "darkreader-MIT.txt"),
);

for (const file of ["background.js", "popup.js", "popup.html", "popup.css"]) {
  copyFileSync(join(root, "src", file), join(dist, file));
}
for (const mode of ["dark", "light"]) {
  for (const size of [16, 32, 48, 128]) {
    writeFileSync(join(dist, `icon-${mode}-${size}.png`), png(size, ICON_COLORS[mode]));
  }
}

const manifest = JSON.parse(readFileSync(join(root, "src/manifest.json"), "utf8"));
const pinned = extensionKey();
if (pinned && manifest.key && manifest.key !== pinned.key) {
  process.stderr.write("key.pem does not match the public key in src/manifest.json\n");
  process.exit(1);
}
if (pinned && !manifest.key) {
  manifest.key = pinned.key;
}
if (!manifest.key) {
  process.stderr.write("src/manifest.json has no public key, so the extension id is not pinned\n");
  process.exit(1);
}
const id = idFromDer(Buffer.from(manifest.key, "base64"));
writeFileSync(join(root, "extension-id"), `${id}\n`);
writeFileSync(join(dist, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${id}\n`);
