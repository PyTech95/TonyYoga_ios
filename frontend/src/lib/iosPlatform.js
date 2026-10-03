// Runtime-only gate: query parameters can never turn App Store payment rules off.
export function isIOSApp() {
  if (typeof window === "undefined") return false;
  const cap = window.Capacitor;
  return !!cap?.isNativePlatform?.() && cap?.getPlatform?.() === "ios";
}
