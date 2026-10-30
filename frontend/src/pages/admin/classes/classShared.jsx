// Shared pieces for Admin → Class manager (and the instructor roster view).
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const COMMON_ZONES = [
  "Europe/Madrid", "Europe/London", "Europe/Lisbon", "Europe/Paris", "Europe/Rome", "Europe/Berlin", "Europe/Amsterdam",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Mexico_City", "America/Sao_Paulo",
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "UTC",
];

export function browserZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

export function timeZones() {
  const mine = browserZone();
  return COMMON_ZONES.includes(mine) ? COMMON_ZONES : [mine, ...COMMON_ZONES];
}

export const errText = (e, fallback = "Something went wrong") => {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ");
  return d || fallback;
};

export function fmtTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function fmtDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function fmtWhen(iso) {
  if (!iso) return "—";
  return `${fmtDay(iso)} · ${fmtTime(iso)}`;
}

/** Local YYYY-MM-DD for a Date. */
export function localDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Value for <input type="datetime-local"> from an ISO string (viewer's local time). */
export function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO (UTC, with Z) from a datetime-local value typed in the viewer's time zone. */
export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - wd);
  return x;
}

export async function downloadBlob(path, filename) {
  const { data } = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const CHIP = {
  green: "bg-[#E4F0E8] text-[#3E7C57]", amber: "bg-[#F3E7C9] text-[#8A6D3B]", grey: "bg-[#F2F2EC] text-[#6B7269]",
  red: "bg-[#FBEFEA] text-[#B25A45]", dark: "bg-[#1C221F] text-white",
};

export function Chip({ tone = "grey", children, tid }) {
  return <span data-testid={tid} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${CHIP[tone] || CHIP.grey}`}>{children}</span>;
}

/** Simple centred dialog used for confirmations and small forms. */
export function Modal({ title, onClose, children, tid, wide = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" data-testid={tid}>
      <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-2xl`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="serif text-2xl leading-tight">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="h-9 w-9 rounded-full hover:bg-[#F2F2EC] flex items-center justify-center shrink-0"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

let instructorCache = null;
/** Teachers who can run classes (admins and instructors). */
export function useInstructors() {
  const [list, setList] = useState(instructorCache || []);
  useEffect(() => {
    if (instructorCache) return undefined;
    let live = true;
    api.get("/admin/classes/calendar?days=1").then(({ data }) => {
      instructorCache = data?.instructors || [];
      if (live) setList(instructorCache);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  return list;
}

export function rememberInstructors(list) {
  if (Array.isArray(list) && list.length) instructorCache = list;
}

export function FillBar({ booked, capacity }) {
  const pct = capacity ? Math.min(100, Math.round((booked * 100) / capacity)) : 0;
  return (
    <div className="h-1.5 rounded-full bg-[#EEF1EC] overflow-hidden">
      <div className={`h-full ${pct >= 100 ? "bg-[#B25A45]" : "bg-[#839682]"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
