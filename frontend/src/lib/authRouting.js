export const getAuthDestination = (user) => user?.active === false && user?.deletion_scheduled_at ? "/profile" : user?.role === "admin" ? "/admin" : "/home";

/** A same-site path from ?next= (never another site), or null. */
export const safeNext = (value) => {
  const v = String(value || "");
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") && !/^\/(login|register)\b/.test(v) ? v : null;
};

/** "/login?next=…" for a page that needs an account. */
export const loginPath = (next, page = "login") => `/${page}?next=${encodeURIComponent(next || "/home")}`;
