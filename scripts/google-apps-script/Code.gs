const APP_SECRET = PropertiesService.getScriptProperties().getProperty("REPOCOACH_EMAIL_SECRET");

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json({ ok: true, service: "repocoach-email-bridge" });
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    if (!APP_SECRET || payload.secret !== APP_SECRET) {
      return json({ ok: false, error: "unauthorized" });
    }

    const to = String(payload.to || "").trim();
    const code = String(payload.code || "").trim();
    if (!/^[^\s@]+@gmail\.com$/i.test(to) || !/^\d{6}$/.test(code)) {
      return json({ ok: false, error: "invalid payload" });
    }

    GmailApp.sendEmail(to, "RepoCoach 邮箱验证码", `你的 RepoCoach 注册验证码是：${code}\n验证码 10 分钟内有效，请勿分享给他人。`, {
      htmlBody: `<p>你的 RepoCoach 注册验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>验证码 10 分钟内有效，请勿将验证码分享给他人。</p>`,
      name: "RepoCoach",
    });
    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: "send failed" });
  }
}
