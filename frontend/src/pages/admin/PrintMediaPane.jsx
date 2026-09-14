import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Truck, CheckCircle2, XCircle, RefreshCw, Link2, Unplug } from "lucide-react";
import { api } from "@/lib/api";
import { Field, inputCls, Toggle } from "./shared";
import { PrintfulSyncHistory } from "./PrintfulSyncHistory";

export default function PrintMediaPane() {
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadStatus = () => api.get("/admin/printful/status").then(({ data }) => setStatus(data)).catch(() => setStatus({ configured: false }));
  const loadPreview = () => api.get("/admin/printful/preview").then(({ data }) => setProducts(data.products || [])).catch(() => setProducts([]));
  const loadStores = () => api.get("/admin/printful/stores").then(({ data }) => {
    setStores(data.stores || []);
    const withProducts = (data.stores || []).filter((s) => (s.product_count || 0) > 0);
    const best = data.selected_store_id || (withProducts.sort((a, b) => (b.product_count || 0) - (a.product_count || 0))[0] || {}).id;
    if (best) setStoreId(String(best));
  }).catch(() => setStores([]));

  useEffect(() => { loadStatus(); loadPreview(); }, []);
  useEffect(() => { if (status?.configured) loadStores(); }, [status?.configured]);

  const connect = async () => {
    if (!token.trim()) { toast.error("Paste your Printful API token first"); return; }
    setConnecting(true);
    try {
      await api.post("/admin/printful/connect", { token: token.trim() });
      toast.success("Printful connected — importing products…");
      setToken("");
      await loadStatus();
      await autoSync();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not connect to Printful");
    } finally { setConnecting(false); }
  };

  const autoSync = async () => {
    setSyncing(true);
    try {
      const { data: storeData } = await api.get("/admin/printful/stores");
      const list = storeData.stores || [];
      setStores(list);
      const withProducts = list.filter((s) => (s.product_count || 0) > 0);
      const best = storeData.selected_store_id || (withProducts.sort((a, b) => (b.product_count || 0) - (a.product_count || 0))[0] || list[0] || {}).id;
      if (!best) { toast("Connected, but no store with products was found."); return; }
      setStoreId(String(best));
      const { data } = await api.post("/admin/printful/sync", { store_id: String(best) });
      toast.success(`Products imported — ${data.created} new, ${data.updated} updated`);
      await loadStatus(); await loadPreview();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Auto-sync failed — you can Sync manually below.");
    } finally { setSyncing(false); }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/printful/verify");
      if (data.ok) toast.success(`Connection OK — ${data.store_count} store(s) found`);
      else toast.error(data.error || "Verification failed");
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Printful? Your API token will be removed.")) return;
    setBusy(true);
    try { await api.post("/admin/printful/disconnect"); toast.success("Disconnected"); setStores([]); await loadStatus(); }
    finally { setBusy(false); }
  };

  const sync = async () => {
    if (!storeId) { toast.error("Pick a store to sync from"); return; }
    setSyncing(true);
    try {
      const { data } = await api.post("/admin/printful/sync", { store_id: storeId });
      toast.success(`Synced — ${data.created} new, ${data.updated} updated`);
      await loadStatus(); await loadPreview();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sync failed");
    } finally { setSyncing(false); }
  };

  const connected = !!status?.configured;

  return (
    <div className="space-y-6" data-testid="print-media-pane">
      <div>
        <div className="eyebrow mb-1">Print media</div>
        <h2 className="serif text-2xl sm:text-3xl">Printful integration</h2>
        <p className="text-[13px] text-[#6B7269] mt-1 max-w-xl">Connect your Printful account to pull print-on-demand products into your shop and fulfil paid orders automatically.</p>
      </div>

      {/* Connection card */}
      <div className="rounded-3xl bg-gradient-to-br from-[#1C221F] to-[#2A302B] text-[#FAFAF7] p-5 sm:p-6" data-testid="printful-connect-card">
        <div className="flex items-center gap-3">
          <Truck className="h-5 w-5 text-[#E0A38F]" />
          <div className="font-semibold">Connection</div>
          <span className={`ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-3 py-1 ${connected ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/60"}`} data-testid="printful-connection-status">
            {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {connected ? "Connected" : "Not connected"}
          </span>
        </div>

        {!connected ? (
          <div className="mt-4 space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-widest font-semibold text-white/50 mb-1.5">Printful API token</div>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your Printful private token"
                data-testid="printful-token-input"
                className="w-full rounded-2xl bg-white/10 border border-white/15 px-4 py-2.5 text-[14px] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#E0A38F]"
              />
              <div className="text-[11px] text-white/45 mt-1.5">
                Get it from <span className="text-[#E0A38F]">Printful → Settings → Developers → API tokens</span> (a private token with store access).
              </div>
            </div>
            <button onClick={connect} disabled={connecting} data-testid="printful-connect-btn" className="pill !bg-[#B25A45] !text-white disabled:opacity-60">
              <Link2 className="h-4 w-4" /> {connecting ? "Connecting…" : "Connect Printful"}
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button onClick={verify} disabled={busy} data-testid="printful-verify-btn" className="pill !bg-white/10 !text-white disabled:opacity-60">
              <RefreshCw className="h-4 w-4" /> Verify connection
            </button>
            <button onClick={disconnect} disabled={busy} data-testid="printful-disconnect-btn" className="pill !bg-white/5 !text-white/70 disabled:opacity-60">
              <Unplug className="h-4 w-4" /> Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Store + sync */}
      {connected && (
        <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5 sm:p-6 space-y-4" data-testid="printful-sync-card">
          <div className="font-semibold text-[#1C221F]">Sync products</div>
          <Field label="Store" hint="We auto-select the store with the most products.">
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} data-testid="printful-store-select" className={inputCls}>
              <option value="">Select a store…</option>
              {stores.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name} · {s.type}{s.product_count != null ? ` · ${s.product_count} products` : ""}</option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={sync} disabled={syncing || !storeId} data-testid="printful-sync-btn" className="pill pill-primary disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync now"}
            </button>
            <span className="text-[12px] text-[#6B7269]" data-testid="printful-synced-count">{status?.synced_products || 0} products synced</span>
            {status?.last_sync && <span className="text-[11px] text-[#9AA096]">Last: {new Date(status.last_sync).toLocaleString()}</span>}
          </div>
          <label className="flex items-center gap-2.5 text-[13px] text-[#545E56] cursor-pointer" data-testid="printful-fulfill-toggle">
            <Toggle
              checked={status?.fulfill_enabled !== false}
              onChange={async (v) => { await api.patch("/admin/settings", { printful_fulfill_enabled: v }); loadStatus(); }}
            />
            Auto-fulfil paid orders through Printful (only fires on live payments)
          </label>
          <label className="flex items-center gap-2.5 text-[13px] text-[#545E56] cursor-pointer" data-testid="printful-autosync-toggle">
            <Toggle
              checked={status?.auto_sync_enabled === true}
              onChange={async (v) => { await api.patch("/admin/settings", { printful_auto_sync_enabled: v }); toast.success(v ? "Nightly auto-sync on" : "Nightly auto-sync off"); loadStatus(); }}
            />
            Auto-refresh products &amp; prices nightly
          </label>
        </div>
      )}

      {/* Preview grid */}
      <PrintfulSyncHistory refreshKey={`${syncing}-${status?.last_sync || ""}`} />
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-[#1C221F]">Product preview</div>
          <button onClick={loadPreview} className="text-[12px] text-[#B25A45] font-semibold" data-testid="printful-preview-refresh">Refresh</button>
        </div>
        {products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D8D9D1] p-8 text-center text-[13px] text-[#6B7269]" data-testid="printful-preview-empty">
            No Printful products yet. Connect and sync to see them here.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="printful-preview-grid">
            {products.map((p) => (
              <div key={p.id} className="rounded-2xl border border-[#E5E6DF] overflow-hidden bg-white" data-testid={`printful-preview-${p.id}`}>
                <div className="aspect-square bg-[#F2F2EC]">
                  {p.images?.[0]
                    ? <img src={p.images[0]} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
                    : <div className="h-full w-full flex items-center justify-center text-[#B0B4AA]"><Truck className="h-6 w-6" /></div>}
                </div>
                <div className="p-3">
                  <div className="text-[13px] font-semibold text-[#1C221F] truncate">{p.title}</div>
                  <div className="text-[12px] text-[#6B7269]">{p.currency?.toUpperCase()} {Number(p.price || 0).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
