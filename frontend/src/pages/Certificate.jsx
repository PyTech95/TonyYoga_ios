import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Award, Share2, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import Logo from "@/components/Logo";

export default function Certificate() {
  const { code } = useParams();
  const [cert, setCert] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get(`/certificate/${code}`).then(({ data }) => setCert(data)).catch(() => setCert(false));
  }, [code]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: "Tony Yoga — Certificate", url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); toast.success("Share link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  if (cert === null) return <Spinner />;
  if (cert === false) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="serif text-2xl">Certificate not found</div>
      <Link to="/" className="pill pill-primary">Back home</Link>
    </div>
  );

  const issued = new Date(cert.issued_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <div data-testid="certificate-page" className="min-h-screen bg-[#0F1211] py-10 px-5">
      <div className="mx-auto max-w-2xl">
        <div className="relative rounded-[28px] bg-[#FAFAF7] p-8 sm:p-12 border-[6px] border-[#B25A45]/25 shadow-2xl overflow-hidden">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#B25A45]/8" />
          <div className="absolute -left-12 -bottom-12 h-48 w-48 rounded-full bg-[#839682]/10" />

          <div className="relative flex flex-col items-center text-center">
            <Logo className="h-16 w-16 mb-4" />
            <div className="eyebrow text-[#B25A45]">Tony Yoga · 50 years of practice</div>
            <div className="mt-6 h-12 w-12 rounded-full bg-[#1C221F] text-[#FAFAF7] flex items-center justify-center">
              <Award className="h-6 w-6" />
            </div>
            <h1 className="serif text-3xl sm:text-4xl mt-5 text-[#1C221F]">Certificate of Completion</h1>
            <p className="text-sm text-[#6B7269] mt-3">This certifies that</p>
            <div data-testid="certificate-name" className="serif text-2xl sm:text-3xl mt-2 text-[#B25A45]">{cert.user_name}</div>
            <p className="text-sm text-[#6B7269] mt-4 max-w-md">has successfully completed all {cert.lessons_count} lessons of</p>
            <div data-testid="certificate-program" className="serif text-xl sm:text-2xl mt-2 text-[#1C221F]">{cert.program_title}</div>

            <div className="mt-8 w-full flex items-end justify-between border-t border-[#E5E6DF] pt-5">
              <div className="text-left">
                <div className="text-[10px] uppercase tracking-widest text-[#9AA29B]">Issued</div>
                <div className="text-sm text-[#545E56]">{issued}</div>
              </div>
              <div className="text-right">
                <div className="serif text-lg text-[#1C221F] leading-none">Tony Sanchez</div>
                <div className="text-[10px] uppercase tracking-widest text-[#9AA29B] mt-1">Founder & teacher</div>
              </div>
            </div>
            <div className="mt-4 text-[10px] tracking-[0.2em] text-[#9AA29B]">CERTIFICATE ID · {cert.code}</div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={share} data-testid="certificate-share" className="pill pill-primary">
            {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Share2 className="h-4 w-4" /> Share</>}
          </button>
          <Link to="/home" className="pill pill-ghost !text-[#FAFAF7] !border-white/20">Back to app</Link>
        </div>
      </div>
    </div>
  );
}
