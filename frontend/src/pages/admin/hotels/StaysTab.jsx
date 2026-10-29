import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, ExternalLink, FileText, Plus, X, Wand2, Star } from "lucide-react";
import { api } from "@/lib/api";
import { StatusChip, STATUS, fmtDate, fmtDateTime, fmtRange, money, errText, previewQuote } from "@/pages/hotels/hotelShared";
import { inputCls, smallBtn, primaryBtn, card, L, Sheet } from "./hotelAdminShared";

const FILTERS = [["open", "Open"], ["requested", "To quote"], ["quoted", "Quoted"], ["signed", "Deposit due"], ["deposit_paid", "Confirmed"], ["confirmed", "Paid in full"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["", "All"]];

export default function StaysTab({ data, reload }) {
  const [filter, setFilter] = useState("open");
  const [open, setOpen] = useState(null);
  const rows = data.stays.filter((s) => (filter === "open" ? !["completed", "cancelled"].includes(s.status) : !filter || s.status === filter));
  return (
    <div className="space-y-3" data-testid="hotels-stays">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <button key={k || "all"} onClick={() => setFilter(k)} data-testid={`hotels-stays-filter-${k || "all"}`}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${filter === k ? "bg-[#FBF1EE] border-[#B25A45] text-[#B25A45]" : "bg-white border-[#E5E6DF]"}`}>{label}</button>
        ))}
      </div>
      {!rows.length && <div className={`${card} text-[13px] text-[#6B7269]`}>No stays here.</div>}
      <ul className="space-y-2">
        {rows.map((s) => (
          <li key={s.id}>
            <button onClick={() => setOpen(s.id)} className={`${card} w-full text-left flex items-center gap-3 hover:border-[#B25A45]`} data-testid={`hotels-stay-${s.id}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold">{s.partner_name}</span><span className="text-[13px] text-[#545E56]">· {s.package_name}</span><StatusChip status={s.status} /></div>
                <div className="text-[12px] text-[#6B7269] mt-0.5">
                  {fmtRange(s.start_date, s.end_date)} · ~{s.guests_expected} guests{s.guests ? ` · ${s.guests} registered` : ""}
                  {s.quote ? ` · ${money(s.quote.total, s.quote.currency)}` : ""}{s.rating_avg ? ` · ★ ${s.rating_avg}` : ""}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[#C3C6BE]" />
            </button>
          </li>
        ))}
      </ul>
      {open && <StayAdmin stayId={open} data={data} onClose={() => setOpen(null)} reload={reload} />}
    </div>
  );
}

function StayAdmin({ stayId, data, onClose, reload }) {
  const [stay, setStay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [teacher, setTeacher] = useState("");
  const [note, setNote] = useState("");
  const [attended, setAttended] = useState(new Set());

  const load = useCallback(() => {
    api.get(`/partner/stays/${stayId}`).then(({ data: s }) => {
      setStay(s); setStatus(s.status); setTeacher(s.teacher_name || ""); setNote(s.admin_note || "");
      setAttended(new Set((s.guest_list || []).filter((g) => g.attended).map((g) => g.id)));
    }).catch((e) => toast.error(errText(e, "Could not load the stay")));
  }, [stayId]);
  useEffect(() => { load(); }, [load]);

  const patch = async (body, msg) => {
    setBusy(true);
    try {
      await api.patch(`/admin/hotel-stays/${stayId}`, body);
      toast.success(msg);
      load(); reload();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };

  return (
    <Sheet title={stay ? `${stay.partner_name} · ${stay.package_name}` : "Stay"} onClose={onClose} testId="hotels-stay-sheet" wide>
      {!stay ? <div className="h-40 rounded-2xl bg-[#F2F2EC] animate-pulse" /> : (
        <div className="space-y-4 text-[13px]">
          <div className={`${card} flex flex-wrap items-center gap-3`}>
            <StatusChip status={stay.status} testId="hotels-stay-status" />
            <span>{fmtRange(stay.start_date, stay.end_date)} · ~{stay.guests_expected} guests</span>
            {stay.languages?.length > 0 && <span className="text-[#6B7269]">Languages: {stay.languages.join(", ").toUpperCase()}</span>}
            {stay.guest_page && <a href={stay.guest_page} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 font-semibold text-[#B25A45]">Guest page <ExternalLink className="h-3 w-3" /></a>}
          </div>
          {stay.notes && <div className={`${card} whitespace-pre-wrap`}><span className="font-semibold">Hotel's notes: </span>{stay.notes}</div>}
          {stay.addons?.length > 0 && <div className="text-[#545E56]">Requested add-ons: {stay.addons.map((a) => `${a.name} × ${a.qty}`).join(", ")}</div>}
          {stay.agreement && <div className="text-[#3E7C57]">Signed by {stay.agreement.signed_name} ({stay.agreement.email}) on {fmtDateTime(stay.agreement.signed_at)}</div>}

          {["requested", "quoted"].includes(stay.status) && <QuoteForm stay={stay} data={data} onSaved={() => { load(); reload(); }} />}

          {stay.quote && !["requested", "quoted"].includes(stay.status) && (
            <div className={card} data-testid="hotels-stay-quote-summary">
              <div className="font-semibold">Quote {money(stay.quote.total, stay.quote.currency)}</div>
              <div className="text-[#6B7269]">Deposit {money(stay.quote.deposit, stay.quote.currency)} ({stay.quote.deposit_percent}%){stay.deposit_paid_at ? ` · paid ${fmtDate(stay.deposit_paid_at)}` : ""} · Balance {money(stay.quote.balance, stay.quote.currency)} by {fmtDate(stay.quote.balance_due)}{stay.balance_paid_at ? ` · paid ${fmtDate(stay.balance_paid_at)}` : ""}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={`/partner/invoice/${stay.id}/quote`} target="_blank" rel="noopener noreferrer" className={smallBtn}><FileText className="h-3.5 w-3.5" />Quote</a>
                {stay.deposit_paid_at && <a href={`/partner/invoice/${stay.id}/deposit`} target="_blank" rel="noopener noreferrer" className={smallBtn}><FileText className="h-3.5 w-3.5" />Deposit invoice</a>}
                {stay.balance_paid_at && <a href={`/partner/invoice/${stay.id}/balance`} target="_blank" rel="noopener noreferrer" className={smallBtn}><FileText className="h-3.5 w-3.5" />Balance invoice</a>}
              </div>
            </div>
          )}

          <div className={`${card} space-y-3`}>
            <div className="font-semibold">Manage</div>
            <div className="flex flex-wrap gap-2">
              {stay.status === "signed" && <button disabled={busy} onClick={() => patch({ mark_paid: "deposit" }, "Deposit marked as paid")} className={smallBtn} data-testid="hotels-mark-deposit">Deposit paid by bank transfer</button>}
              {stay.status === "deposit_paid" && <button disabled={busy} onClick={() => patch({ mark_paid: "balance" }, "Balance marked as paid")} className={smallBtn} data-testid="hotels-mark-balance">Balance paid by bank transfer</button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="Status (manual change)">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls} data-testid="hotels-stay-status-select">
                  {Object.keys(STATUS).filter((k) => ["requested", "quoted", "signed", "deposit_paid", "confirmed", "completed", "cancelled"].includes(k)).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
                </select>
              </L>
              <L label="Teacher"><input value={teacher} onChange={(e) => setTeacher(e.target.value)} className={inputCls} data-testid="hotels-stay-teacher" /></L>
            </div>
            <L label="Admin note (shown in the history)"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} data-testid="hotels-stay-note" /></L>
            <button disabled={busy} onClick={() => patch({ status: status !== stay.status ? status : undefined, teacher_name: teacher, admin_note: note }, "Stay updated")} className={primaryBtn} data-testid="hotels-stay-save">Save</button>
          </div>

          <div className={card} data-testid="hotels-stay-guests">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">Guests ({stay.guest_list?.length || 0}){stay.rating_avg ? <span className="ml-2 text-[#8A6D3B]"><Star className="inline h-3.5 w-3.5 fill-[#E0A93B] text-[#E0A93B]" /> {stay.rating_avg} ({stay.ratings})</span> : null}</div>
              {stay.guest_list?.length > 0 && <button disabled={busy} onClick={() => patch({ attended_guest_ids: [...attended] }, "Attendance saved")} className={smallBtn} data-testid="hotels-attendance-save">Save attendance</button>}
            </div>
            {!stay.guest_list?.length ? <div className="text-[#6B7269] mt-2">Nobody has registered yet.</div> : (
              <ul className="mt-2 divide-y divide-[#EFEFE9]">
                {stay.guest_list.map((g) => (
                  <li key={g.id} className="py-2 flex items-center gap-3">
                    <input type="checkbox" checked={attended.has(g.id)} onChange={() => setAttended((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })} className="h-4 w-4 accent-[#B25A45]" aria-label={`${g.name} attended`} data-testid="hotels-guest-attended" />
                    <div className="min-w-0 flex-1"><span className="font-medium">{g.name}</span> <span className="text-[#6B7269]">{g.email} · {(g.language || "").toUpperCase()} · waiver {fmtDateTime(g.waiver_accepted_at)}</span></div>
                    {g.rating ? <span title={g.comment || ""}>{"★".repeat(g.rating)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {stay.payments?.length > 0 && (
            <div className={card}>
              <div className="font-semibold mb-1">Payments</div>
              {stay.payments.map((p) => <div key={p.id} className="text-[#545E56]">{p.item_type === "hotel_deposit" ? "Deposit" : "Balance"} · {money(p.amount, p.currency)} · {p.provider || "stripe"} · {fmtDateTime(p.completed_at)} · {p.payment_status}</div>)}
            </div>
          )}

          {stay.history?.length > 0 && (
            <details className={card}>
              <summary className="font-semibold cursor-pointer">History</summary>
              <ul className="mt-2 space-y-1">{[...stay.history].reverse().map((h, i) => <li key={i} className="text-[#545E56]">{STATUS[h.status]?.label || h.status} · {fmtDateTime(h.at)} · {h.by}{h.note ? ` · ${h.note}` : ""}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </Sheet>
  );
}

function scheduleFromProgramme(pkg, days) {
  const rows = [];
  const daily = pkg?.daily?.length ? pkg.daily : ["Morning hot-yoga flow", "Evening yin and pranayama"];
  for (let d = 1; d <= days; d += 1) {
    daily.forEach((title, i) => rows.push({ day: d, time: i === 0 ? "08:00" : i === 1 ? "18:30" : "12:00", title }));
  }
  return rows;
}

function QuoteForm({ stay, data, onSaved }) {
  const pkg = data.packages.find((p) => p.id === stay.package_id) || null;
  const catalog = data.addons || [];
  const prev = stay.quote || {};
  const [f, setF] = useState(() => ({
    guests: prev.guests || stay.guests_expected || 10,
    programme_fee: prev.programme_fee ?? "",
    per_guest_fee: prev.per_guest_fee ?? "",
    currency: prev.currency || pkg?.currency || "eur",
    addons: catalog.map((c) => {
      const q = (prev.addons || []).find((a) => a.id === c.id) || (stay.addons || []).find((a) => a.id === c.id);
      return { id: c.id, qty: q?.qty || 0, price: q?.price ?? "" };
    }),
    extras: prev.extras?.length ? prev.extras.map((x) => ({ ...x })) : [],
    deposit_percent: prev.deposit_percent ?? "",
    balance_due: prev.balance_due || "",
    valid_days: 14,
    cancellation_terms: prev.cancellation_terms || "",
    teacher_name: stay.teacher_name || prev.teacher_name || "Tony Sanchez",
    schedule: stay.schedule?.length ? stay.schedule.map((r) => ({ ...r })) : [],
    note: prev.note || "",
    start_date: "",
  }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const effectivePkg = useMemo(() => pkg || { programme_fee: 0, per_guest_fee: 0, min_guests: 0, currency: f.currency }, [pkg, f.currency]);
  const preview = previewQuote(effectivePkg, f, catalog);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/admin/hotel-stays/${stay.id}/quote`, {
        guests: Number(f.guests),
        programme_fee: f.programme_fee === "" ? null : Number(f.programme_fee),
        per_guest_fee: f.per_guest_fee === "" ? null : Number(f.per_guest_fee),
        currency: f.currency,
        addons: f.addons.filter((a) => Number(a.qty) > 0).map((a) => ({ id: a.id, qty: Number(a.qty), ...(a.price !== "" ? { price: Number(a.price) } : {}) })),
        extras: f.extras.filter((x) => x.label && x.amount !== "").map((x) => ({ label: x.label, amount: Number(x.amount) })),
        deposit_percent: f.deposit_percent === "" ? null : Number(f.deposit_percent),
        balance_due: f.balance_due || null,
        valid_days: Number(f.valid_days) || 14,
        cancellation_terms: f.cancellation_terms || null,
        teacher_name: f.teacher_name || null,
        schedule: f.schedule.filter((r) => r.title).map((r) => ({ day: Number(r.day) || 1, time: r.time, title: r.title })),
        note: f.note || null,
        start_date: f.start_date || null,
      });
      toast.success(stay.status === "quoted" ? "Quote updated and emailed" : "Quote sent to the hotel");
      onSaved();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className={`${card} space-y-4`} data-testid="hotels-quote-form">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold">{stay.status === "quoted" ? "Update the quote" : "Prepare the quote"}</div>
        {pkg && <span className="text-[11px] text-[#6B7269]">{pkg.name}: {money(pkg.programme_fee, pkg.currency)} + {money(pkg.per_guest_fee, pkg.currency)} per guest above {pkg.min_guests}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <L label="Guests"><input type="number" min={1} value={f.guests} onChange={(e) => set("guests", e.target.value)} className={inputCls} data-testid="hotels-q-guests" /></L>
        <L label="Programme fee"><input type="number" min={0} step="0.01" value={f.programme_fee} placeholder={pkg ? String(pkg.programme_fee) : "required"} onChange={(e) => set("programme_fee", e.target.value)} className={inputCls} data-testid="hotels-q-fee" /></L>
        <L label="Per extra guest"><input type="number" min={0} step="0.01" value={f.per_guest_fee} placeholder={pkg ? String(pkg.per_guest_fee) : "0"} onChange={(e) => set("per_guest_fee", e.target.value)} className={inputCls} data-testid="hotels-q-perguest" /></L>
        <L label="Currency">
          <select value={f.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls} data-testid="hotels-q-currency">{["eur", "usd", "gbp"].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select>
        </L>
      </div>

      {catalog.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682] mb-1">Add-ons</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {f.addons.map((a, i) => {
              const c = catalog.find((x) => x.id === a.id);
              return (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate">{c?.name}</span>
                  <input type="number" min={0} value={a.qty} onChange={(e) => set("addons", f.addons.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className={`${inputCls} !w-16`} aria-label={`${c?.name} quantity`} data-testid={`hotels-q-addon-${a.id}`} />
                  <input type="number" min={0} step="0.01" value={a.price} placeholder={String(c?.price ?? "")} onChange={(e) => set("addons", f.addons.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} className={`${inputCls} !w-24`} aria-label={`${c?.name} price`} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682] mb-1">Extra lines (travel, materials…)</div>
        {f.extras.map((x, i) => (
          <div key={i} className="flex gap-2 mb-1.5">
            <input value={x.label} placeholder="Description" onChange={(e) => set("extras", f.extras.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} className={inputCls} data-testid={`hotels-q-extra-label-${i}`} />
            <input type="number" step="0.01" value={x.amount} placeholder="Amount" onChange={(e) => set("extras", f.extras.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} className={`${inputCls} !w-28`} data-testid={`hotels-q-extra-amount-${i}`} />
            <button type="button" onClick={() => set("extras", f.extras.filter((_, j) => j !== i))} className="px-2 text-[#B25A45]" aria-label="Remove"><X className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => set("extras", [...f.extras, { label: "", amount: "" }])} className={smallBtn} data-testid="hotels-q-extra-add"><Plus className="h-3.5 w-3.5" />Add line</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <L label="Deposit %" hint="Blank = setting"><input type="number" min={0} max={100} value={f.deposit_percent} onChange={(e) => set("deposit_percent", e.target.value)} className={inputCls} data-testid="hotels-q-deposit" /></L>
        <L label="Balance due" hint="Blank = setting"><input type="date" value={f.balance_due} onChange={(e) => set("balance_due", e.target.value)} className={inputCls} data-testid="hotels-q-balance-due" /></L>
        <L label="Valid for (days)"><input type="number" min={1} max={90} value={f.valid_days} onChange={(e) => set("valid_days", e.target.value)} className={inputCls} data-testid="hotels-q-valid" /></L>
        <L label="Move first day" hint={`Now ${fmtDate(stay.start_date)}`}><input type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputCls} data-testid="hotels-q-start" /></L>
      </div>
      <L label="Teacher"><input value={f.teacher_name} onChange={(e) => set("teacher_name", e.target.value)} className={inputCls} data-testid="hotels-q-teacher" /></L>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-[11px] uppercase tracking-widest font-semibold text-[#839682]">Schedule (shown on the guest page)</div>
          <button type="button" onClick={() => set("schedule", scheduleFromProgramme(pkg, stay.days || 3))} className={smallBtn} data-testid="hotels-q-schedule-fill"><Wand2 className="h-3.5 w-3.5" />Fill from programme</button>
        </div>
        {f.schedule.map((r, i) => (
          <div key={i} className="flex gap-2 mb-1.5">
            <input type="number" min={1} max={14} value={r.day} onChange={(e) => set("schedule", f.schedule.map((y, j) => (j === i ? { ...y, day: e.target.value } : y)))} className={`${inputCls} !w-16`} aria-label="Day" />
            <input type="time" value={r.time} onChange={(e) => set("schedule", f.schedule.map((y, j) => (j === i ? { ...y, time: e.target.value } : y)))} className={`${inputCls} !w-28`} aria-label="Time" />
            <input value={r.title} placeholder="Class" onChange={(e) => set("schedule", f.schedule.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} className={inputCls} aria-label="Class" />
            <button type="button" onClick={() => set("schedule", f.schedule.filter((_, j) => j !== i))} className="px-2 text-[#B25A45]" aria-label="Remove"><X className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => set("schedule", [...f.schedule, { day: 1, time: "08:00", title: "" }])} className={smallBtn} data-testid="hotels-q-schedule-add"><Plus className="h-3.5 w-3.5" />Add row</button>
      </div>

      <L label="Cancellation terms" hint="Blank = the default terms from Settings"><textarea rows={3} value={f.cancellation_terms} onChange={(e) => set("cancellation_terms", e.target.value)} className={inputCls} data-testid="hotels-q-terms" /></L>
      <L label="Note for the hotel"><textarea rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} className={inputCls} data-testid="hotels-q-note" /></L>

      <div className="rounded-2xl bg-[#F7F6F1] p-3 flex flex-wrap items-center gap-x-5 gap-y-1" data-testid="hotels-q-preview">
        <span>Programme {money(preview.fee, f.currency)}</span>
        {preview.extraGuests > 0 && <span>+ {preview.extraGuests} × {money(preview.perGuest, f.currency)}</span>}
        {preview.addons.map((a) => <span key={a.name}>+ {a.name} {money(a.total, f.currency)}</span>)}
        {preview.extras.map((x) => <span key={x.label}>+ {x.label} {money(x.amount, f.currency)}</span>)}
        <span className="font-semibold text-[15px] ml-auto" data-testid="hotels-q-total">Total {money(preview.total, f.currency)}{preview.deposit != null ? ` · deposit ${money(preview.deposit, f.currency)}` : ""}</span>
      </div>
      <button disabled={busy || preview.total <= 0} className={primaryBtn} data-testid="hotels-q-send">{busy ? "Sending…" : stay.status === "quoted" ? "Update and email quote" : "Send quote to the hotel"}</button>
    </form>
  );
}
