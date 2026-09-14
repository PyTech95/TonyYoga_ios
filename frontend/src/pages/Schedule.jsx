import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { MapPin, Video, Users } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "online", label: "Online" },
  { key: "in-person", label: "Studio" },
];

function groupByDay(rows) {
  const map = new Map();
  for (const r of rows) {
    const d = new Date(r.start_time);
    const key = d.toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return Array.from(map.entries());
}

export default function Schedule() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api.get("/class-instances?upcoming=true").then(({ data }) => setRows(data)).catch(() => setRows([]));
  }, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    if (filter === "all") return rows;
    return rows.filter((r) => r.location_type === filter);
  }, [rows, filter]);

  const grouped = useMemo(() => groupByDay(visible), [visible]);

  return (
    <div data-testid="schedule-page">
      <PageHeader eyebrow="Live" title="Schedule" testId="schedule-header" />

      <div className="mx-auto max-w-2xl px-5">
        <div className="flex gap-2 mb-6" data-testid="schedule-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              data-testid={`schedule-filter-${f.key}`}
              className={`pill !py-2 !px-4 !text-[13px] ${
                filter === f.key ? "pill-primary" : "pill-ghost"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {rows === null ? <Spinner /> : grouped.length === 0 ? (
          <p className="text-sm text-[#6B7269] py-10 text-center">No classes match.</p>
        ) : (
          <div className="space-y-8" data-testid="schedule-list">
            {grouped.map(([day, list]) => (
              <div key={day}>
                <div className="eyebrow mb-3">{new Date(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
                <ul className="space-y-2">
                  {list.map((c) => {
                    const time = new Date(c.start_time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                    const spotsLeft = Math.max(0, (c.capacity || 0) - (c.bookings_count || 0));
                    return (
                      <li key={c.id}>
                        <Link
                          to={`/schedule/${c.id}`}
                          data-testid={`schedule-class-${c.id}`}
                          className="block rounded-2xl bg-white border border-[#E5E6DF] p-4 hover:border-[#B25A45] transition"
                        >
                          <div className="flex gap-4">
                            <div className="w-16 shrink-0">
                              <div className="serif text-xl leading-none">{time}</div>
                              <div className="text-[10px] text-[#6B7269] mt-1">{c.duration_minutes}m</div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[15px] font-semibold text-[#1C221F]">{c.title}</div>
                              <div className="text-xs text-[#6B7269] mt-0.5">{c.style} · {c.level}</div>
                              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#545E56]">
                                <span className="inline-flex items-center gap-1">
                                  {c.location_type === "online" ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                                  {c.location_detail || (c.location_type === "online" ? "Online" : "Studio")}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Users className="h-3 w-3" /> {spotsLeft} left
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
