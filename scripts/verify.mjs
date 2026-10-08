import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir, homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const hostManifest = join(
  homedir(),
  ".config/chromium/NativeMessagingHosts/com.bhp.omareader.json",
);

const page = `<!doctype html>
<html>
<head><title>Omareader</title></head>
<body style="background:#ffffff;color:#000000">
<p id="sample">Omareader sample</p>
<img id="pic" alt="" width="8" height="8" src="/red.png">
<iframe id="frame" src="/frame.html"></iframe>
</body>
</html>`;

const frame = `<!doctype html>
<html><body style="background:#ffffff;color:#000000"><p>frame</p></body></html>`;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function png1x1() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
    "base64",
  );
}

function serve(port) {
  const server = createServer((request, response) => {
    if (request.url === "/frame.html") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(frame);
      return;
    }
    if (request.url === "/red.png") {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(png1x1());
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(page);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function cdp(url) {
  const socket = new WebSocket(url);
  let seq = 0;
  const pending = new Map();
  const logs = [];
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error(`CDP failed: ${url}`)));
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled") {
      logs.push(message.params.args.map((arg) => arg.value ?? arg.description).join(" "));
    }
    if (message.method === "Runtime.exceptionThrown") {
      logs.push(message.params.exceptionDetails?.text || "exception");
    }
    const waiter = pending.get(message.id);
    if (!waiter) {
      return;
    }
    pending.delete(message.id);
    if (message.error) {
      waiter.reject(new Error(message.error.message));
    } else {
      waiter.resolve(message.result);
    }
  });
  return {
    logs,
    ready,
    send(method, params = {}) {
      const id = ++seq;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    close() {
      socket.close();
    },
  };
}

async function waitForJson(port) {
  const deadline = Date.now() + 15000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        return response.json();
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`debugger never came up (${last})`);
}

function writeTheme(current, name, background, foreground, mode) {
  const staging = join(current, "next-theme");
  return mkdir(staging, { recursive: true }).then(async () => {
    await writeFile(
      join(staging, "colors.toml"),
      `mode = "${mode}"\nbackground = "${background}"\nforeground = "${foreground}"\nselection = "#334455"\n`,
    );
    const { rename, rm: remove } = await import("node:fs/promises");
    await remove(join(current, "theme"), { recursive: true, force: true });
    await rename(staging, join(current, "theme"));
    await writeFile(join(current, "theme.name"), `${name}\n`);
  });
}

const sampleExpression = `(() => {
  const html = document.documentElement;
  const body = getComputedStyle(document.body);
  const root = getComputedStyle(html);
  const picture = document.querySelector("#pic");
  const frame = document.querySelector("#frame");
  let frameMode = "";
  try {
    frameMode = frame.contentDocument?.documentElement?.getAttribute("data-darkreader-mode") || "";
  } catch (error) {
    frameMode = String(error);
  }
  return {
    mode: html.getAttribute("data-darkreader-mode"),
    scheme: html.getAttribute("data-darkreader-scheme"),
    neutral: root.getPropertyValue("--darkreader-neutral-background").trim(),
    background: body.backgroundColor,
    filter: picture ? getComputedStyle(picture).filter : "",
    frameMode,
  };
})()`;

async function pollSample(client, ready) {
  const deadline = Date.now() + 8000;
  let last = null;
  while (Date.now() < deadline) {
    const evaluated = await client.send("Runtime.evaluate", {
      expression: sampleExpression,
      returnByValue: true,
    });
    last = evaluated.result?.value;
    if (last && ready(last)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for theme\n${JSON.stringify(last)}\n${client.logs.join("\n")}`);
}

async function main() {
  if (!(await readFile(join(root, "key.pem")).then(() => true).catch(() => false))) {
    execFileSync("openssl", ["genrsa", "-out", join(root, "key.pem"), "2048"]);
  }
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  const extensionId = (await readFile(join(root, "extension-id"), "utf8")).trim();
  const state = await mkdtemp(join(tmpdir(), "omareader-state-"));
  const profile = await mkdtemp(join(tmpdir(), "omareader-profile-"));
  const wrapperPath = join(state, "host-wrapper");
  const current = join(state, "current");
  await mkdir(current, { recursive: true });
  await writeTheme(current, "paper", "#f6e7a1", "#2a2118", "light");
  await writeFile(
    wrapperPath,
    `#!/bin/sh\nexport OMAREADER_STATE_DIR=${JSON.stringify(state)}\nexec ${JSON.stringify(join(root, "host/omareader-host"))}\n`,
  );
  await chmod(wrapperPath, 0o755);

  let previousManifest = null;
  try {
    previousManifest = await readFile(hostManifest);
  } catch {
    previousManifest = null;
  }
  await mkdir(dirname(hostManifest), { recursive: true });
  const hostManifestBody = `${JSON.stringify({
    name: "com.bhp.omareader",
    description: "Omareader test host",
    path: wrapperPath,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`],
  }, null, 2)}\n`;
  await writeFile(hostManifest, hostManifestBody);
  const profileHosts = join(profile, "NativeMessagingHosts");
  await mkdir(profileHosts, { recursive: true });
  await writeFile(join(profileHosts, "com.bhp.omareader.json"), hostManifestBody);

  const httpPort = await freePort();
  const debugPort = await freePort();
  const server = await serve(httpPort);
  const chromeLog = [];
  const chrome = spawn(
    "chromium",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${debugPort}`,
      "--remote-allow-origins=*",
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  chrome.stdout.on("data", (chunk) => chromeLog.push(chunk.toString()));
  chrome.stderr.on("data", (chunk) => chromeLog.push(chunk.toString()));

  let client;
  try {
    const targets = await waitForJson(debugPort);
    const pageTarget = targets.find((target) => target.type === "page");
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error(`no page target\n${chromeLog.join("").slice(-2000)}`);
    }
    client = cdp(pageTarget.webSocketDebuggerUrl);
    await client.ready;
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: `http://127.0.0.1:${httpPort}/` });
    const light = await pollSample(client, (sample) => sample.mode === "dynamic" && sample.scheme === "dimmed");
    if (light.frameMode !== "dynamic") {
      throw new Error(`iframe was not themed: ${JSON.stringify(light)}`);
    }
    if (light.filter && light.filter !== "none") {
      throw new Error(`image was filtered: ${light.filter}`);
    }
    await writeTheme(current, "ink", "#102a43", "#d6e2ea", "dark");
    const dark = await pollSample(
      client,
      (sample) => sample.scheme === "dark" && sample.neutral !== light.neutral,
    );
    if (dark.background === light.background) {
      throw new Error(`background did not change\n${JSON.stringify({ light, dark })}`);
    }
    process.stdout.write(`${JSON.stringify({ light, dark }, null, 2)}\n`);
  } catch (error) {
    const tail = chromeLog.join("").slice(-2500);
    if (tail) {
      process.stderr.write(`${tail}\n`);
    }
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      process.stderr.write(`${JSON.stringify(targets.map((target) => ({ type: target.type, url: target.url, title: target.title })), null, 2)}\n`);
      const worker = targets.find((target) => target.type === "service_worker");
      if (worker?.webSocketDebuggerUrl) {
        const probe = cdp(worker.webSocketDebuggerUrl);
        await probe.ready;
        const state = await probe.send("Runtime.evaluate", {
          expression: "globalThis.omareaderSnapshot ? globalThis.omareaderSnapshot() : 'no snapshot'",
          returnByValue: true,
          awaitPromise: true,
        });
        process.stderr.write(`worker ${JSON.stringify(state.result?.value)}\n`);
        if (probe.logs.length) {
          process.stderr.write(`worker logs ${probe.logs.join("\n")}\n`);
        }
        probe.close();
      }
    } catch (probeError) {
      process.stderr.write(`probe failed ${probeError}\n`);
    }
    throw error;
  } finally {
    client?.close();
    chrome.kill("SIGTERM");
    await new Promise((resolve) => chrome.once("exit", resolve));
    server.close();
    if (previousManifest) {
      await writeFile(hostManifest, previousManifest);
    } else {
      await rm(hostManifest, { force: true });
    }
    await rm(state, { recursive: true, force: true });
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
