import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Trash2, Eye, EyeOff, Save, ShoppingBag, Plus, CheckSquare, Square, Star, GripVertical } from "lucide-react";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";

function ProductsPane() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [stores, setStores] = useState(null);
  const [storeId, setStoreId] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const ic = "w-full rounded-lg border border-[#E5E6DF] bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#B25A45]";

  const load = () => api.get("/admin/products").then(({ data }) => { setRows(data); setSelected(new Set()); }).catch(() => setRows([]));
  const loadStatus = () => api.get("/admin/printful/status").then(({ data }) => setStatus(data)).catch(() => setStatus({ configured: false }));
  const loadStores = () => api.get("/admin/printful/stores").then(({ data }) => {
    const list = data.stores || [];
    setStores(list);
    const sel = list.find((s) => String(s.id) === String(data.selected_store_id));
    // Prefer the persisted store only if it has products; otherwise pick the fullest store.
    const best = [...list].sort((a, b) => (b.product_count || 0) - (a.product_count || 0))[0];
    const pick = sel && sel.product_count > 0 ? sel : (best || sel || list[0]);
    setStoreId(String(pick?.id || ""));
  }).catch(() => setStores([]));
  useEffect(() => { load(); loadStatus(); loadStores(); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/admin/printful/sync", { store_id: storeId });
      toast.success(`Synced — ${data.created} new, ${data.updated} updated`);
      load(); loadStatus();
    } catch (e) { toast.error(e?.response?.data?.detail || "Sync failed"); }
    finally { setSyncing(false); }
  };

  const set = (id, k, v) => setRows((rs) => rs.map((p) => (p.id === id ? { ...p, [k]: v } : p)));

  const save = async (p) => {
    try {
      await api.patch(`/admin/products/${p.id}`, {
        title: p.title, description: p.description, category: p.category,
        price: Number(p.price), currency: p.currency, stock_qty: Number(p.stock_qty),
        compare_at_price: p.compare_at_price === "" || p.compare_at_price == null ? 0 : Number(p.compare_at_price),
        visible: p.visible !== false,
        type: p.type || "physical",
        author: p.author ?? "",
        external_amazon_link: p.external_amazon_link ?? "",
        ebook_file_url: p.ebook_file_url ?? "",
        images: p.images || [],
      });
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
  };

  const uploadImage = async (p, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/admin/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const raw = data?.url || data?.path || "";
      const url = raw.startsWith("http") ? raw : `${process.env.REACT_APP_BACKEND_URL}${raw}`;
      set(p.id, "images", [url, ...(p.images || [])]);
      toast.success("Cover uploaded — click Save");
    } catch { toast.error("Upload failed"); }
  };

  const removeImage = (p, idx) => set(p.id, "images", (p.images || []).filter((_, i) => i !== idx));

  const uploadEbook = async (p, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/admin/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const raw = data?.url || data?.path || "";
      const url = raw.startsWith("http") ? raw : `${process.env.REACT_APP_BACKEND_URL}${raw}`;
      set(p.id, "ebook_file_url", url);
      toast.success("eBook file uploaded — click Save");
    } catch { toast.error("Upload failed"); }
  };

  const toggleVisible = async (p) => {
    const v = !(p.visible !== false);
    set(p.id, "visible", v);
    try { await api.patch(`/admin/products/${p.id}`, { visible: v }); } catch { toast.error("Failed"); }
  };

  const toggleFeatured = async (p) => {
    const v = !p.featured;
    set(p.id, "featured", v);
    try {
      await api.patch(`/admin/products/${p.id}`, { featured: v });
      toast.success(v ? "Pinned to top of shop" : "Unpinned");
    } catch { toast.error("Failed"); set(p.id, "featured", !v); }
  };

  const featuredList = (rows || []).filter((p) => p.featured)
    .sort((a, b) => ((a.featured_rank ?? 999) - (b.featured_rank ?? 999)));
  const onFeaturedDrop = async (toIdx) => {
    if (dragIdx == null || dragIdx === toIdx) { setDragIdx(null); return; }
    const arr = [...featuredList];
    const [moved] = arr.splice(dragIdx, 1);
    arr.splice(toIdx, 0, moved);
    const ids = arr.map((p) => p.id);
    setRows((rs) => rs.map((p) => { const i = ids.indexOf(p.id); return i >= 0 ? { ...p, featured_rank: i } : p; }));
    setDragIdx(null);
    try { await api.post("/admin/products/reorder-featured", { ids }); toast.success("Order saved"); }
    catch { toast.error("Reorder failed"); }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    try { await api.delete(`/admin/products/${p.id}`); load(); } catch { toast.error("Failed"); }
  };

  const toggleSelect = (id) => setSelected((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const allSelected = rows && rows.length > 0 && selected.size === rows.length;
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set((rows || []).map((p) => p.id)));

  const bulkVisibility = async (visible) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const { data } = await api.post("/admin/products/bulk-visibility", { ids, visible });
      toast.success(`${visible ? "Published" : "Hidden"} ${data.updated} product${data.updated === 1 ? "" : "s"}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
    finally { setBulkBusy(false); }
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected product${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      const { data } = await api.post("/admin/products/bulk-delete", { ids });
      toast.success(`Deleted ${data.deleted} product${data.deleted === 1 ? "" : "s"}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
    finally { setBulkBusy(false); }
  };

  const selectedStore = (stores || []).find((s) => String(s.id) === String(storeId));
  const notSynced = status?.configured && status?.synced_products === 0;

  return (
    <div className="space-y-4" data-testid="products-pane">
      {/* Printful connect + sync panel */}
      <div className="rounded-3xl bg-gradient-to-br from-[#1C221F] to-[#2A302B] text-[#FAFAF7] p-5 sm:p-6" data-testid="printful-card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="eyebrow !text-[#E0A38F] flex items-center gap-2"><ShoppingBag className="h-3.5 w-3.5" /> Printful print-on-demand</div>
            <h3 className="serif text-2xl mt-1">Import your store products</h3>
            <p className="text-[13px] text-[#B7BEB4] mt-1 max-w-xl">
              {status === null ? "Loading…" : status.configured
                ? "Your Printful account is connected. Pick the store your products live in, then Begin sync — they'll appear below, ready to price and publish."
                : "Not configured — add PRINTFUL_TOKEN in backend settings."}
            </p>
          </div>
          {status?.configured && (
            <span className="text-[11px] rounded-full bg-white/10 px-3 py-1.5 font-semibold" data-testid="printful-synced-count">
              {status.synced_products} product{status.synced_products === 1 ? "" : "s"} synced
            </span>
          )}
        </div>

        {status?.configured && stores && stores.length > 0 && (
          <div className="mt-5 rounded-2xl bg-white/5 border border-white/10 p-4">
            {/* Step 1 — Select store */}
            <label className="text-[11px] uppercase tracking-widest font-bold text-[#E0A38F] flex items-center gap-2">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#B25A45] text-white text-[10px]">1</span>
              Select your store
            </label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              data-testid="printful-store-select"
              className="mt-2 w-full rounded-xl border border-white/15 bg-[#12160F] text-[#FAFAF7] px-3.5 py-3 text-sm focus:outline-none focus:border-[#B25A45]"
            >
              {stores.map((s) => (
                <option key={s.id} value={String(s.id)} className="bg-[#12160F]">
                  {`${s.name} — ${s.type}${s.product_count != null ? ` (${s.product_count} products)` : ""}`}
                </option>
              ))}
            </select>
            {selectedStore != null && (
              <p className="text-[12px] text-[#B7BEB4] mt-1.5">
                {selectedStore.product_count > 0
                  ? `“${selectedStore.name}” has ${selectedStore.product_count} products ready to import.`
                  : `“${selectedStore.name}” is empty — choose the store that shows products.`}
              </p>
            )}

            {/* Step 2 — Begin sync */}
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-widest font-bold text-[#E0A38F] flex items-center gap-2">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#B25A45] text-white text-[10px]">2</span>
                Begin sync
              </span>
              <button
                onClick={sync}
                disabled={syncing || !status?.configured}
                data-testid="printful-sync-btn"
                className="pill !bg-[#B25A45] !text-white hover:!bg-[#9c4c39] ml-auto"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Begin sync"}
              </button>
            </div>
            {status.last_sync && (
              <p className="text-[11px] text-[#8A928A] mt-2">Last synced {new Date(status.last_sync).toLocaleString()}</p>
            )}
          </div>
        )}

        {notSynced && (
          <div className="mt-3 rounded-xl bg-[#B25A45]/15 border border-[#B25A45]/30 px-4 py-3 text-[12px] text-[#F0C9BC]" data-testid="printful-onboarding-tip">
            Nothing imported yet — pick the store above that shows a product count (your Squarespace / WooCommerce store), then press <b>Begin sync</b>.
          </div>
        )}

        {status?.configured && (
          <label className="mt-4 flex items-center gap-2.5 text-[13px] text-[#B7BEB4] cursor-pointer" data-testid="printful-fulfill-toggle">
            <input
              type="checkbox"
              checked={status.fulfill_enabled !== false}
              onChange={async (e) => {
                try {
                  await api.patch("/admin/settings", { printful_fulfill_enabled: e.target.checked });
                  loadStatus();
                  toast.success(e.target.checked ? "Auto-fulfillment on" : "Auto-fulfillment off");
                } catch { toast.error("Could not update"); }
              }}
              className="h-4 w-4 accent-[#B25A45]"
            />
            <span>
              Auto-send paid orders to Printful for printing &amp; shipping
              <span className="ml-1 text-xs text-[#8A928A]">
                {status.payments_live ? "· live payments active" : "· test mode — starts once live payments are on"}
              </span>
            </span>
          </label>
        )}
      </div>

      {featuredList.length > 0 && (
        <div className="rounded-2xl bg-white border border-[#E5E6DF] p-4" data-testid="featured-order-panel">
          <div className="eyebrow flex items-center gap-2"><Star className="h-3.5 w-3.5 fill-[#B25A45] text-[#B25A45]" /> Featured order — drag to arrange</div>
          <p className="text-xs text-[#6B7269] mt-1 mb-3">These show first in the shop, in this order.</p>
          <ul className="space-y-2">
            {featuredList.map((p, idx) => (
              <li
                key={p.id}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onFeaturedDrop(idx)}
                data-testid={`featured-item-${p.id}`}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 cursor-grab active:cursor-grabbing transition-colors ${dragIdx === idx ? "border-[#B25A45] bg-[#FBF6EC]" : "border-[#E5E6DF] bg-[#FAFAF7]"}`}
              >
                <GripVertical className="h-4 w-4 text-[#B7BEB4] shrink-0" />
                <span className="text-[11px] font-bold text-[#9AA096] w-5">{idx + 1}</span>
                <div className="h-9 w-9 rounded-md bg-[#F2F2EC] overflow-hidden shrink-0">
                  {p.images?.[0] && <img src={p.images[0]} alt="" className="h-full w-full object-cover" />}
                </div>
                <span className="text-sm text-[#1C221F] truncate flex-1">{p.title}</span>
                <button onClick={() => toggleFeatured(p)} className="text-[#B25A45] hover:opacity-70 text-xs font-semibold" data-testid={`featured-remove-${p.id}`}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="eyebrow">All products {rows?.length ? `(${rows.length})` : ""}</div>
        {rows?.length > 0 && (
          <div className="flex items-center gap-2" data-testid="products-bulk-bar">
            <button onClick={toggleSelectAll} data-testid="products-select-all" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#545E56] hover:text-[#1C221F]">
              {allSelected ? <CheckSquare className="h-4 w-4 text-[#B25A45]" /> : <Square className="h-4 w-4 text-[#9AA096]" />}
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <button
              onClick={() => bulkVisibility(false)}
              disabled={selected.size === 0 || bulkBusy}
              data-testid="products-bulk-hide"
              className="pill pill-ghost !py-1.5 !px-3 !text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <EyeOff className="h-3.5 w-3.5" /> Hide
            </button>
            <button
              onClick={() => bulkVisibility(true)}
              disabled={selected.size === 0 || bulkBusy}
              data-testid="products-bulk-show"
              className="pill pill-ghost !py-1.5 !px-3 !text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Eye className="h-3.5 w-3.5" /> Show
            </button>
            <button
              onClick={bulkDelete}
              disabled={selected.size === 0 || bulkBusy}
              data-testid="products-bulk-delete"
              className="pill !py-1.5 !px-3 !text-xs !bg-[#B25A45] !text-white hover:!bg-[#9c4c39] disabled:!bg-[#E5E6DF] disabled:!text-[#9AA096] disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3.5 w-3.5" /> {bulkBusy ? "Working…" : `Delete${selected.size ? ` (${selected.size})` : ""}`}
            </button>
          </div>
        )}
      </div>
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-[#6B7269] rounded-2xl bg-[#F2F2EC] p-5">No products yet. Sync from Printful or add manually.</p>
      ) : (
        <ul className="space-y-3" data-testid="products-list">
          {rows.map((p) => (
            <li key={p.id} className={`rounded-2xl bg-white border p-3 transition-colors ${selected.has(p.id) ? "border-[#B25A45] bg-[#FBF6EC]" : "border-[#E5E6DF]"}`} data-testid={`product-row-${p.id}`}>
              <div className="flex gap-3">
                <label className="flex items-center shrink-0 cursor-pointer pl-0.5" data-testid={`product-select-${p.id}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    className="h-4 w-4 accent-[#B25A45]"
                    data-testid={`product-checkbox-${p.id}`}
                  />
                </label>
                <div className="h-16 w-16 shrink-0 rounded-lg bg-[#F2F2EC] overflow-hidden">
                  {p.images?.[0] && <img src={p.images[0]} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <input className={ic} value={p.title || ""} onChange={(e) => set(p.id, "title", e.target.value)} data-testid={`product-title-${p.id}`} />
                    {p.source === "printful" && <span className="shrink-0 text-[9px] uppercase tracking-widest font-bold bg-[#F7ECE8] text-[#B25A45] rounded-full px-2 py-1">Printful</span>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input className={ic} type="number" value={p.price ?? 0} onChange={(e) => set(p.id, "price", e.target.value)} placeholder="Price" data-testid={`product-price-${p.id}`} />
                    <input className={ic} type="number" value={p.compare_at_price ?? ""} onChange={(e) => set(p.id, "compare_at_price", e.target.value)} placeholder="Was (sale)" data-testid={`product-compare-${p.id}`} />
                    <input className={ic} value={p.category || ""} onChange={(e) => set(p.id, "category", e.target.value)} placeholder="Category" />
                    <input className={ic} type="number" value={p.stock_qty ?? 0} onChange={(e) => set(p.id, "stock_qty", e.target.value)} placeholder="Stock" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => save(p)} data-testid={`product-save-${p.id}`} className="pill pill-primary !py-1.5 !px-3 !text-xs"><Save className="h-3.5 w-3.5" /> Save</button>
                    <button onClick={() => toggleVisible(p)} data-testid={`product-visible-${p.id}`} className="pill pill-ghost !py-1.5 !px-3 !text-xs">
                      {p.visible !== false ? <><Eye className="h-3.5 w-3.5" /> Visible</> : <><EyeOff className="h-3.5 w-3.5" /> Hidden</>}
                    </button>
                    <button onClick={() => toggleFeatured(p)} data-testid={`product-feature-${p.id}`} className={`pill !py-1.5 !px-3 !text-xs ${p.featured ? "!bg-[#F7ECE8] !text-[#B25A45] !border-[#E0C4BB]" : "pill-ghost"}`}>
                      <Star className={`h-3.5 w-3.5 ${p.featured ? "fill-[#B25A45]" : ""}`} /> {p.featured ? "Featured" : "Feature"}
                    </button>
                    <button onClick={() => remove(p)} data-testid={`product-delete-${p.id}`} className="ml-auto text-[#B25A45] hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
                  </div>

                  {(p.category === "books" || p.type === "book" || p.type === "ebook") && (
                    <div className="mt-1 rounded-xl bg-[#F7F2EC] border border-[#E7D9CB] p-3 space-y-2" data-testid={`book-options-${p.id}`}>
                      <div className="text-[10px] uppercase tracking-widest font-bold text-[#B25A45]">Book & digital options</div>
                      <div>
                        <div className="text-[11px] font-semibold text-[#6B7269] mb-1.5">Cover image</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {(p.images || []).map((img, i) => (
                            <div key={i} className="relative h-16 w-12 rounded-md overflow-hidden bg-white border border-[#E5E6DF]" data-testid={`product-image-${p.id}-${i}`}>
                              <img src={img} alt="" className="h-full w-full object-cover" />
                              <button onClick={() => removeImage(p, i)} data-testid={`product-image-remove-${p.id}-${i}`} className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-[#1C221F]/80 text-white text-[10px] leading-none flex items-center justify-center">×</button>
                            </div>
                          ))}
                          <label className="pill pill-ghost !py-1.5 !px-3 !text-xs cursor-pointer" data-testid={`product-image-upload-${p.id}`}>
                            <Plus className="h-3.5 w-3.5" /> Upload cover
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(p, e.target.files?.[0])} />
                          </label>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select className={ic} value={p.type || "physical"} onChange={(e) => set(p.id, "type", e.target.value)} data-testid={`product-type-${p.id}`}>
                          <option value="physical">Physical (add to cart)</option>
                          <option value="book">Print book (Amazon only)</option>
                          <option value="ebook">eBook (sold here, digital)</option>
                        </select>
                        <input className={ic} value={p.author || ""} onChange={(e) => set(p.id, "author", e.target.value)} placeholder="Author (e.g. Tony Sanchez)" data-testid={`product-author-${p.id}`} />
                      </div>
                      <input className={ic} value={p.external_amazon_link || ""} onChange={(e) => set(p.id, "external_amazon_link", e.target.value)} placeholder="Amazon link (https://...)" data-testid={`product-amazon-${p.id}`} />
                      {p.type === "ebook" && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <input className={`${ic} flex-1`} value={p.ebook_file_url || ""} onChange={(e) => set(p.id, "ebook_file_url", e.target.value)} placeholder="eBook file URL (PDF/EPUB)" data-testid={`product-ebook-url-${p.id}`} />
                          <label className="pill pill-ghost !py-1.5 !px-3 !text-xs cursor-pointer shrink-0" data-testid={`product-ebook-upload-${p.id}`}>
                            <Plus className="h-3.5 w-3.5" /> Upload
                            <input type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" className="hidden" onChange={(e) => uploadEbook(p, e.target.files?.[0])} />
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ProductsPane;
