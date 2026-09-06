export const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
export const gmailPattern = /^[A-Za-z0-9](?:[A-Za-z0-9.]{0,28}[A-Za-z0-9])?@gmail\.com$/i;

const blockedDomains = new Set([
  "example.com",
  "example.net",
  "example.org",
  "localhost",
  "invalid",
  "test.com",
  "mailinator.com",
  "10minutemail.com",
  "tempmail.com",
  "yopmail.com",
]);

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function emailValidationError(value: string) {
  const email = normalizeEmail(value);
  const atIndex = email.lastIndexOf("@");
  const localPart = atIndex > 0 ? email.slice(0, atIndex) : "";
  const domain = atIndex > 0 ? email.slice(atIndex + 1) : "";

  if (
    email.length > 254 ||
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !emailPattern.test(email)
  ) {
    return "请输入有效邮箱地址，例如 name@gmail.com。";
  }

  if (!gmailPattern.test(email)) {
    return "目前仅支持 Gmail 邮箱，请使用 name@gmail.com。";
  }

  if (blockedDomains.has(domain) || domain.endsWith(".invalid")) {
    return "请使用常用邮箱地址，不要使用测试或临时邮箱。";
  }

  return null;
}
