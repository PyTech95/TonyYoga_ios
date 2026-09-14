// Web Push helper - subscribe, unsubscribe, check state
import { api } from "./api";

const readyWorker = () => Promise.race([
  navigator.serviceWorker.ready,
  new Promise((_, reject) => setTimeout(() => reject(new Error('Notifications are not ready in this browser. Please try again later.')), 8000)),
]);

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export async function getPushState() {
  if (!pushSupported()) return { supported: false };
  const permission = Notification.permission;
  const reg = await readyWorker();
  const sub = await reg.pushManager.getSubscription();
  return { supported: true, permission, subscribed: !!sub };
}

export async function subscribePush() {
  if (!pushSupported()) throw new Error("Push not supported on this device");
  const { data } = await api.get("/push/public-key");
  if (!data?.enabled || !data?.public_key) throw new Error("Browser notifications are not enabled yet. In-app notifications are still available.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications blocked");

  const reg = await readyWorker();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.public_key),
    });
  }
  const json = sub.toJSON();
  await api.post("/push/subscribe", {
    endpoint: json.endpoint,
    keys: json.keys,
    user_agent: navigator.userAgent,
  });
  return true;
}

export async function unsubscribePush() {
  const reg = await readyWorker();
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api.post("/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => null);
    await sub.unsubscribe();
  }
  return true;
}
