const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

function findBrowser() {
  const candidates = [process.env.BROWSER_EXECUTABLE];
  if (process.platform === "win32")
    candidates.push(
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    );
  else if (process.platform === "darwin")
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    );
    for (const command of ["google-chrome", "chromium"]) {
      try {
        candidates.push(
          execFileSync("which", [command], { encoding: "utf8" }).trim(),
        );
      } catch {
        /* check the next candidate */
      }
    }
  }
  const executable = candidates.find((file) => file && fs.existsSync(file));
  if (!executable)
    throw new Error(
      "Install Chrome/Edge or set BROWSER_EXECUTABLE to an existing Chromium browser. No browser is downloaded automatically.",
    );
  return executable;
}
async function freePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function waitForDevTools(browser, profile, timeoutMs = 30000) {
  const portFile = path.join(profile, "DevToolsActivePort");
  const deadline = Date.now() + timeoutMs;
  let launchError;
  const onError = (error) => {
    launchError = error;
  };
  browser.on("error", onError);
  try {
    while (Date.now() < deadline) {
      if (launchError)
        throw new Error(`Browser could not start: ${launchError.message}`);
      if (browser.exitCode !== null || browser.signalCode !== null)
        throw new Error(
          `Browser exited before DevTools was ready (exit ${browser.exitCode}, signal ${browser.signalCode}). Inspect browser-launch.log.`,
        );
      try {
        const [port, endpoint] = fs
          .readFileSync(portFile, "utf8")
          .trim()
          .split(/\r?\n/);
        if (
          /^\d+$/.test(port) &&
          Number(port) > 0 &&
          Number(port) <= 65535 &&
          endpoint?.startsWith("/devtools/browser/")
        )
          return Number(port);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await delay(100);
    }
    throw new Error(
      `Browser did not expose DevTools within ${timeoutMs} ms. Inspect browser-launch.log.`,
    );
  } finally {
    browser.off("error", onError);
  }
}
module.exports = { findBrowser, freePort, waitForDevTools };
