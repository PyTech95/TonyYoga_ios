import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, CalendarCheck, UserX, Clock, HelpCircle } from "lucide-react";
import { api } from "@/lib/api";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** One student's learning and attendance (Admin → Students → a student). Props: { userId }. */
export default function MemberLearning({ userId }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    setD(null);
    api.get(`/admin/members/${userId}/learning`).then(({ data }) => { if (live) setD(data); }).catch(() => { if (live) setD(false); });
    return () => { live = false; };
  }, [userId]);
  if (d === null) return <div className="h-24 rounded-2xl bg-[#F2F2EC] animate-pulse" />;
  if (d === false) return <p className="text-xs text-[#B25A45]">Couldn't load learning progress.</p>;
  return (
    <div className="space-y-3" data-testid="member-learning">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-[#F7F7F2] border border-[#EFEFE9] p-3" data-testid="member-learning-attended">
          <CalendarCheck className="h-4 w-4 text-[#B25A45]" /><div className="serif text-xl mt-1">{d.classes_attended}</div><div className="text-[11px] text-[#6B7269]">classes attended</div>
        </div>
        <div className="rounded-2xl bg-[#F7F7F2] border border-[#EFEFE9] p-3" data-testid="member-learning-noshows">
          <UserX className="h-4 w-4 text-[#B25A45]" /><div className="serif text-xl mt-1">{d.no_shows}</div><div className="text-[11px] text-[#6B7269]">no-shows</div>
        </div>
        <div className="rounded-2xl bg-[#F7F7F2] border border-[#EFEFE9] p-3">
          <Clock className="h-4 w-4 text-[#B25A45]" /><div className="text-[13px] font-semibold mt-1.5">{fmtDate(d.last_class)}</div><div className="text-[11px] text-[#6B7269]">last class</div>
        </div>
      </div>
      {d.courses.length === 0 ? <p className="text-xs text-[#6B7269]">No courses with progress yet.</p> : (
        <ul className="space-y-2" data-testid="member-learning-courses">
          {d.courses.map((c) => (
            <li key={c.program_id} className="rounded-2xl bg-white border border-[#E5E6DF] p-3">
              <div className="flex items-center justify-between gap-3">
                <Link to={`/programs/${c.program_id}`} className="text-[13px] font-semibold truncate hover:text-[#B25A45]">{c.title}</Link>
                <span className="text-[12px] text-[#6B7269] shrink-0">{c.done}/{c.total} · {c.percent}%{c.certificate ? " · " : ""}{c.certificate && <Award className="inline h-3.5 w-3.5 text-[#3E7C57]" />}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-[#EEF1EC] overflow-hidden"><div className="h-full bg-[#B25A45]" style={{ width: `${c.percent}%` }} /></div>
              {c.quizzes?.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-[#6B7269]">
                  {c.quizzes.map((q, i) => <span key={i} className="inline-flex items-center gap-1"><HelpCircle className="h-3 w-3" /> {q.lesson}: <span className={q.passed ? "text-[#3E7C57] font-semibold" : "text-[#B25A45] font-semibold"}>{q.score}%</span></span>)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {d.certificates.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="member-learning-certs">
          {d.certificates.map((c) => (
            <a key={c.code} href={`/certificate/${c.code}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#E4F0E8] px-3 py-1 text-[11px] font-semibold text-[#3E7C57]">
              <Award className="h-3.5 w-3.5" /> {c.program_title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
