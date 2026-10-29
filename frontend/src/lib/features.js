// Feature switches from Admin → Settings (public) and the extra areas the signed-in
// account can open (Teacher Hub, hotel partner portal). Shared across components.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isIOSApp } from "@/lib/iosPlatform";

let publicCache;
let publicInflight;
const subs = new Set();

function loadPublic() {
  if (publicCache !== undefined || publicInflight) return;
  publicInflight = api.get("/settings/public")
    .then(({ data }) => { publicCache = data || {}; })
    .catch(() => { publicCache = {}; })
    .finally(() => { publicInflight = null; subs.forEach((fn) => fn(publicCache)); });
}

/** { gifts, hotels, teachers, ready }. Gifts, hotel programmes and teachers' classes are
 *  sold outside Apple's in-app purchase, so they stay hidden inside the iPhone app. */
export function useFeatures() {
  const [data, setData] = useState(publicCache);
  useEffect(() => {
    subs.add(setData);
    if (publicCache !== undefined) setData(publicCache); else loadPublic();
    return () => subs.delete(setData);
  }, []);
  const ios = isIOSApp();
  return {
    ready: data !== undefined,
    gifts: !ios && data?.gifts_enabled !== false,
    hotels: !ios && !!data?.hotels_enabled,
    teachers: !ios && !!data?.teachers_enabled,
    teacherLabel: data?.teacher_certified_label || "Tony-Certified",
  };
}

/** { teacher: {status, slug} | null, partner: {id, name} | null, partner_pending } for the signed-in user. */
export function useMyRoles(user) {
  const [roles, setRoles] = useState(null);
  useEffect(() => {
    if (!user) { setRoles(null); return; }
    let live = true;
    api.get("/me/roles").then(({ data }) => { if (live) setRoles(data); }).catch(() => { if (live) setRoles({ teacher: null, partner: null }); });
    return () => { live = false; };
  }, [user]);
  return roles;
}
