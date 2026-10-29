const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { waitForDevTools } = require("./browser/runtime.cjs");

function fixture(t, script) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "repocoach-browser-"));
  const browser = spawn(process.execPath, ["-e", script, profile], {
    windowsHide: true,
    stdio: "ignore",
  });
  t.after(async () => {
    if (browser.exitCode === null && browser.signalCode === null) {
      const closed = once(browser, "close");
      browser.kill();
      await closed;
    }
    fs.rmSync(profile, { recursive: true, force: true });
  });
  return { profile, browser };
}

test("browser startup reports early process failure instead of reading a missing port file", async (t) => {
  const { profile, browser } = fixture(t, "process.exit(17)");
  await assert.rejects(
    waitForDevTools(browser, profile, 5000),
    /Browser exited.*exit 17.*browser-launch\.log/,
  );
});

test("browser readiness waits for the complete DevTools endpoint", async (t) => {
  const { profile, browser } = fixture(
    t,
    `
    const fs=require('node:fs'),path=require('node:path');
    const file=path.join(process.argv[1],'DevToolsActivePort');
    fs.writeFileSync(file,'12345\\n');
    setTimeout(()=>fs.appendFileSync(file,'/devtools/browser/test\\n'),200);
    setInterval(()=>{},1000);
  `,
  );
  assert.equal(await waitForDevTools(browser, profile, 5000), 12345);
});

test("browser startup has a bounded deadline when no endpoint is published", async (t) => {
  const { profile, browser } = fixture(t, "setInterval(()=>{},1000)");
  await assert.rejects(
    waitForDevTools(browser, profile, 100),
    /within 100 ms.*browser-launch\.log/,
  );
});
