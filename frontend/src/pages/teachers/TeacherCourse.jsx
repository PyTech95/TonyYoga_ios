import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PlayCircle, ExternalLink, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { youTubeEmbed } from "@/lib/youtube";
import PageHeader from "@/components/PageHeader";
import { errText, fmtDate } from "./teacherShared";

/** Embeddable player URL for YouTube / Vimeo links; null for anything else (opened as a link). */
export function embedUrl(url) {
  const yt = youTubeEmbed(url);
  if (yt) return yt;
  const vm = String(url || "").match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

export default function TeacherCourse() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [c, setC] = useState(null);
  const [err, setErr] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    api.get(`/me/teacher-courses/${id}`).then(({ data }) => { setC(data); setActive(0); }).catch((e) => setErr(errText(e, t("teachers.course_error", "This course isn't open on your account."))));
  }, [id, t]);

  if (err) {
    return (
      <div data-testid="teacher-course-locked" className="pb-24">
        <PageHeader back title={t("teachers.course", "Course")} />
        <div className="mx-auto max-w-2xl px-5">
          <div className="rounded-3xl bg-white border border-[#E5E6DF] p-8 text-center">
            <Lock className="h-8 w-8 text-[#839682] mx-auto" />
            <p className="text-[15px] text-[#545E56] mt-3">{err}</p>
            <Link to="/my-yoga" className="pill pill-primary mt-4">{t("myyoga.title", "My Yoga")}</Link>
          </div>
        </div>
      </div>
    );
  }
  if (!c) return <div className="mx-auto max-w-2xl px-5 pt-24"><div className="aspect-video rounded-3xl bg-[#F2F2EC] animate-pulse" /></div>;

  const lesson = c.lessons?.[active];
  const src = lesson ? embedUrl(lesson.video_url) : null;

  return (
    <div data-testid="teacher-course" className="pb-24">
      <PageHeader back eyebrow={c.teacher?.name ? t("teachers.with", "With {{name}}", { name: c.teacher.name }) : null} title={c.title} testId="teacher-course-header" />
      <div className="mx-auto max-w-2xl px-5 space-y-5">
        {c.ends_at && <p className="text-[12px] text-[#6B7269] -mt-2">{t("teachers.access_until", "Your access lasts until {{date}}.", { date: fmtDate(c.ends_at) })}</p>}
        {lesson ? (
          <div className="space-y-3">
            {src ? (
              <div className="aspect-video rounded-3xl overflow-hidden bg-black">
                <iframe key={lesson.id} src={src} title={lesson.title} className="h-full w-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen data-testid="teacher-course-player" />
              </div>
            ) : (
              <a href={lesson.video_url} target="_blank" rel="noopener noreferrer" data-testid="teacher-course-link"
                className="flex aspect-video items-center justify-center gap-2 rounded-3xl bg-[#1C221F] text-white text-[15px] font-semibold">
                <ExternalLink className="h-5 w-5" />{t("teachers.open_video", "Open the video")}
              </a>
            )}
            <div>
              <div className="serif text-2xl leading-tight" data-testid="teacher-course-lesson-title">{lesson.title}</div>
              {lesson.description && <p className="text-[14px] text-[#545E56] mt-1 whitespace-pre-line">{lesson.description}</p>}
            </div>
          </div>
        ) : <p className="text-sm text-[#6B7269]">{t("teachers.no_lessons", "No lessons yet.")}</p>}
        {c.description && <p className="text-[14px] text-[#545E56] whitespace-pre-line">{c.description}</p>}
        <ol className="rounded-3xl bg-white border border-[#E5E6DF] divide-y divide-[#EFEFE9] overflow-hidden" data-testid="teacher-course-lessons">
          {(c.lessons || []).map((l, i) => (
            <li key={l.id || i}>
              <button type="button" onClick={() => setActive(i)} className={`w-full flex items-center gap-3 px-4 py-3 text-left ${i === active ? "bg-[#FBF1EE]" : "hover:bg-[#F7F6F1]"}`} data-testid={`teacher-course-lesson-${i}`}>
                <PlayCircle className={`h-5 w-5 shrink-0 ${i === active ? "text-[#B25A45]" : "text-[#9AA096]"}`} />
                <span className="min-w-0 flex-1 text-[14px] font-semibold truncate">{i + 1}. {l.title}</span>
                {l.duration_min ? <span className="text-[11px] text-[#9AA096] shrink-0">{l.duration_min} min</span> : null}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
