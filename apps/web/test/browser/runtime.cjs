const fs = require("node:fs");
const http = require("node:http");
const { execFileSync } = require("node:child_process");

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
module.exports = { findBrowser, freePort };
