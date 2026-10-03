// Pure policy helpers. Server repeats all payment classification/ownership checks.
export const DIGITAL_TYPES = new Set([
  "program", "bundle", "membership", "class_one_time", "class_subscription",
  "drop_in", "class_pack", "product"
]);
export const BLOCKED_LEGACY_ENDPOINTS = [
  /^\/paypal\/(create-order|capture)(?:\/|$)/,
  /^\/checkout\/(session|credit-release)(?:\/|$)/,
  /^\/gift-cards\/redeem(?:\/|$)/
];
export function isLegacyPaymentRequest(path = "") {
  const clean = String(path).split("?")[0].replace(/^https?:\/\/[^/]+\/api/, "");
  return BLOCKED_LEGACY_ENDPOINTS.some(re => re.test(clean));
}
export function isAmazonPrintURL(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const domains = ["amazon.com", "amazon.co.uk", "amazon.de", "amazon.fr", "amazon.es", "amazon.it", "amazon.in", "amazon.ca", "amazon.com.au", "amazon.co.jp", "amazon.nl", "amazon.se", "amazon.pl", "amazon.com.be"];
    return url.protocol === "https:" && !url.username && !url.password &&
      domains.some(d => host === d || host === `www.${d}`) &&
      /\/(dp|gp\/product)\//i.test(url.pathname) &&
      !/kindle|ebook|audible|digital/i.test(url.pathname + url.search);
  } catch { return false; }
}
export function paymentError(error) {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" ? detail : error?.message || "Unable to complete the purchase. Please try again.";
}
