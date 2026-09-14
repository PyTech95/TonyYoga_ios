// Backward-compatible `t()` helper, now backed by react-i18next (src/i18n).
// Existing call sites pass backend-emitted keys like "i18n:memb.plan.essential.name".
// Non-i18n strings pass through unchanged; unknown i18n: keys fall back to the
// human-readable suffix after the prefix.
import i18n from "@/i18n";

export const t = (key) => {
  if (typeof key !== "string") return key;
  if (key.startsWith("i18n:")) {
    const val = i18n.t(key);
    return val && val !== key ? val : key.slice(5);
  }
  return key;
};
