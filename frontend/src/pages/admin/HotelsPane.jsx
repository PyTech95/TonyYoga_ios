import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Hotel, CalendarDays, Package, CalendarOff, Settings, RefreshCw, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { Toggle } from "./shared";
import { money, errText } from "@/pages/hotels/hotelShared";
import PartnersTab from "./hotels/PartnersTab";
import StaysTab from "./hotels/StaysTab";
import ProgrammesTab from "./hotels/ProgrammesTab";
import DatesTab from "./hotels/DatesTab";
import HotelSettingsTab from "./hotels/HotelSettingsTab";

const TABS = [
  ["stays", "Stays", CalendarDays],
  ["partners", "Partners", Hotel],
  ["programmes", "Programmes & add-ons", Package],
  ["dates", "Blocked dates", CalendarOff],
  ["settings", "Settings", Settings],
];

/** Admin → Hotels & resorts: partners, stays and quotes, programmes, blocked dates, settings. */
export default function HotelsPane() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("view") || "stays");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/hotels").then(({ data }) => setData(data)).catch((e) => { toast.error(errText(e, "Could not load hotels")); setData((d) => d || { partners: [], stays: [], packages: [], addons: [], blackouts: [], revenue: {}, enabled: false }); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const setEnabled = async (on) => {
    setBusy(true);
    try {
      await api.patch("/admin/settings", { hotels_enabled: on });
      toast.success(on ? "Hotel programme is open: /hotels is live." : "Hotel programme is switched off.");
      load();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };

  if (!data) return <Spinner />;
  const applied = data.partners.filter((p) => p.status === "applied").length;
  const toQuote = data.stays.filter((s) => s.status === "requested").length;
  const revenue = Object.entries(data.revenue || {});

  return (
    <div className="space-y-4" data-testid="hotels-pane">
      <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <Toggle checked={!!data.enabled} onChange={(v) => !busy && setEnabled(v)} tid="hotels-enabled" />
          <div>
            <div className="text-[14px] font-semibold">{data.enabled ? "Programme open" : "Programme switched off"}</div>
            <div className="text-[12px] text-[#6B7269]">{data.enabled ? "Hotels can apply on /hotels and partners can request stays." : "Only admins can see /hotels and the partner portal."}</div>
          </div>
        </div>
        <a href="/hotels" target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-[#B25A45] inline-flex items-center gap-1">/hotels <ExternalLink className="h-3 w-3" /></a>
        <div className="ml-auto flex flex-wrap gap-4 text-[12px] text-[#545E56]">
          <span data-testid="hotels-kpi-partners"><span className="font-semibold text-[#1C221F]">{data.partners.filter((p) => p.status === "approved").length}</span> partners</span>
          <span><span className="font-semibold text-[#1C221F]">{data.stays.filter((s) => ["deposit_paid", "confirmed"].includes(s.status)).length}</span> confirmed stays</span>
          <span data-testid="hotels-kpi-revenue">Paid: <span className="font-semibold text-[#1C221F]">{revenue.length ? revenue.map(([c, v]) => money(v, c)).join(" · ") : "—"}</span></span>
          <button onClick={load} className="inline-flex items-center gap-1 font-semibold text-[#B25A45]" data-testid="hotels-refresh"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`hotels-tab-${k}`}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold border ${tab === k ? "bg-[#1C221F] text-white border-[#1C221F]" : "bg-white border-[#E5E6DF]"}`}>
            <Icon className="h-4 w-4" />{label}
            {k === "partners" && applied > 0 && <span className="ml-1 rounded-full bg-[#B25A45] text-white text-[10px] px-1.5">{applied}</span>}
            {k === "stays" && toQuote > 0 && <span className="ml-1 rounded-full bg-[#B25A45] text-white text-[10px] px-1.5">{toQuote}</span>}
          </button>
        ))}
      </div>

      {tab === "stays" && <StaysTab data={data} reload={load} />}
      {tab === "partners" && <PartnersTab data={data} reload={load} />}
      {tab === "programmes" && <ProgrammesTab data={data} reload={load} />}
      {tab === "dates" && <DatesTab data={data} reload={load} />}
      {tab === "settings" && <HotelSettingsTab />}
    </div>
  );
}
