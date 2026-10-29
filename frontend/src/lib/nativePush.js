// Phone notifications inside the Android / iPhone app (Capacitor PushNotifications plugin).
// Dormant until (1) the app build contains the plugin and (2) Admin → Settings → Phone app
// notifications is set up for that platform — so older app builds and the website are unaffected.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { api } from "./api";

const PushNotifications = registerPlugin("PushNotifications");
let started = false;

export async function setupNativePush(navigate) {
  try {
    if (started || !Capacitor?.isNativePlatform?.()) return;
    if (!Capacitor.isPluginAvailable?.("PushNotifications")) return;
    const platform = Capacitor.getPlatform();
    const { data } = await api.get("/push/native-config");
    if (!data?.[platform]) return;
    started = true;
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;
    await PushNotifications.addListener("registration", ({ value }) => {
      api.post("/push/device", { token: value, platform }).catch(() => {});
    });
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = action?.notification?.data?.url;
      if (url && url.startsWith("/")) navigate(url);
    });
    await PushNotifications.register();
  } catch {
    started = false; // never block the app because of notifications
  }
}
