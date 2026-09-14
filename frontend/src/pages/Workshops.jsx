import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";

export default function Workshops() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api.get("/workshops").then(({ data }) => setRows(data)).catch(() => setRows([]));
  }, []);

  return (
    <div data-testid="workshops-page">
      <PageHeader eyebrow="Retreats" title="Workshops" testId="workshops-header" />

      <div className="mx-auto max-w-2xl px-5">
        {rows === null ? <Spinner /> : rows.length === 0 ? (
          <p className="text-sm text-[#6B7269] py-8 text-center">No workshops right now.</p>
        ) : (
          <ul className="space-y-5" data-testid="workshops-list">
            {rows.map((w) => (
              <li key={w.id}>
                <Link
                  to={`/workshops/${w.id}`}
                  data-testid={`workshop-${w.id}`}
                  className="block rounded-3xl overflow-hidden bg-white border border-[#E5E6DF] hover:border-[#B25A45] transition"
                >
                  {w.cover_image && (
                    <div className="aspect-[16/10] bg-[#F2F2EC] overflow-hidden">
                      <img src={w.cover_image} alt="" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="p-6">
                    <div className="eyebrow">{w.system}</div>
                    <div className="serif text-2xl mt-1 leading-tight">{w.title}</div>
                    <p className="text-sm text-[#6B7269] mt-2 leading-relaxed clamp-3">{w.description}</p>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#545E56]">
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-[#B25A45]" /> {new Date(w.start_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-[#B25A45]" /> {w.location}</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div>
                        <span className="serif text-2xl">€500</span>
                        <span className="text-xs text-[#6B7269] ml-1">deposit · €{Math.round(w.price_eur)} total</span>
                      </div>
                      <span className="text-sm text-[#B25A45] font-semibold">Reserve →</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
