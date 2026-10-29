const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { findBrowser } = require("../web/test/browser/runtime.cjs");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const directory = path.resolve(
    __dirname,
    "../../data",
    `desktop-icons-${randomUUID()}`,
  );
  const profile = path.join(directory, "profile");
  fs.mkdirSync(profile, { recursive: true });
  const browser = spawn(
    findBrowser(),
    [
      "--headless=new",
      "--disable-gpu",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  let socket;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
    const port = Number(fs.readFileSync(portFile, "utf8").split("\n")[0]);
    const targets = await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json();
    socket = new WebSocket(
      targets.find((target) => target.type === "page").webSocketDebuggerUrl,
    );
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let id = 0;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      message.error
        ? entry.reject(Error(message.error.message))
        : entry.resolve(message.result);
    });
    const call = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const next = ++id;
        const timer = setTimeout(() => {
          pending.delete(next);
          reject(Error(`Timed out: ${method}`));
        }, 10000);
        pending.set(next, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: next, method, params }));
      });
    await call("Page.enable");
    await call("Emulation.setDefaultBackgroundColorOverride", {
      color: { r: 0, g: 0, b: 0, a: 0 },
    });
    const svg = fs.readFileSync(
      path.join(__dirname, "assets/repocoach.svg"),
      "utf8",
    );
    const html = `<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`;
    await call("Page.navigate", {
      url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    });
    await delay(200);
    const frames = [];
    for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
      await call("Emulation.setDeviceMetricsOverride", {
        width: size,
        height: size,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const screenshot = await call("Page.captureScreenshot", {
        format: "png",
        clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
      });
      const bytes = Buffer.from(screenshot.data, "base64");
      if (size === 512)
        fs.writeFileSync(path.join(__dirname, "assets/repocoach.png"), bytes);
      else frames.push({ size, bytes });
    }
    const header = Buffer.alloc(6 + 16 * frames.length);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(frames.length, 4);
    let offset = header.length;
    frames.forEach(({ size, bytes }, index) => {
      const pos = 6 + index * 16;
      header[pos] = header[pos + 1] = size === 256 ? 0 : size;
      header.writeUInt16LE(1, pos + 4);
      header.writeUInt16LE(32, pos + 6);
      header.writeUInt32LE(bytes.length, pos + 8);
      header.writeUInt32LE(offset, pos + 12);
      offset += bytes.length;
    });
    fs.writeFileSync(
      path.join(__dirname, "assets/repocoach.ico"),
      Buffer.concat([header, ...frames.map((frame) => frame.bytes)]),
    );
    await call("Browser.close");
    console.log("Generated RepoCoach PNG and Windows icon at seven sizes.");
  } finally {
    socket?.close();
    browser.kill();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
