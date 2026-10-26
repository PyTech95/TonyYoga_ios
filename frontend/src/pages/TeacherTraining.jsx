import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Check, MapPin, GraduationCap, Leaf, HeartPulse, BookOpen, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import PaymentButtons from "@/components/PaymentButtons";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import { TONY } from "@/lib/brandMedia";
import { useSiteImages, siteImage } from "@/lib/siteData";

const PILLARS = [
  { icon: Leaf, title: "Philosophy & history", body: "The roots of the Ghosh lineage, texts and the why behind the practice." },
  { icon: HeartPulse, title: "Anatomy & safe movement", body: "Movement in the planes, anatomy and physiology for sustainable teaching." },
  { icon: BookOpen, title: "Principles of practice", body: "Sequencing, adjustments and the craft of holding a room." },
  { icon: GraduationCap, title: "Real teaching hours", body: "Supervised internship so you graduate ready to teach with confidence." },
];

export default function TeacherTraining() {
  const images = useSiteImages();
  const HERO_IMG = siteImage(images, "tt_page_hero", TONY.ttHero);
  const GRP_IMG = siteImage(images, "tt_page_group", TONY.groupWide);
  const [tiers, setTiers] = useState(null);
  const bookRef = useRef(null);

  useEffect(() => {
    api.get("/teacher-training").then(({ data }) => setTiers(data)).catch(() => setTiers([]));
  }, []);

  const scrollToBook = () => bookRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="bg-[#FAFAF7]" data-testid="teacher-training-page">
      <PageHeader back testId="tt-header" />
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="eyebrow !text-[#B25A45]">Tony Yoga · Ghosh lineage · since 1986</div>
            <h1 className="serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] mt-3 text-[#1C221F]">
              Yoga Teacher <span className="text-[#B25A45]">Training</span>
            </h1>
            <p className="text-[15px] sm:text-base text-[#545E56] mt-4 max-w-lg leading-relaxed">
              For advanced students and teachers ready to take their practice higher. We cover yoga
              philosophy, history, principles of practice and movement in the planes — for safe,
              sustainable practice and teaching. Live in Málaga, Spain.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <button onClick={scrollToBook} data-testid="tt-hero-cta" className="pill pill-primary">
                See trainings & dates <ArrowRight className="h-4 w-4" />
              </button>
              <a href="mailto:tonyoga.online@gmail.com?subject=Teacher Training question" className="pill pill-ghost" data-testid="tt-hero-ask">
                Ask a question
              </a>
            </div>
          </div>
          <div className="relative">
            <img src={HERO_IMG} alt="Tony Sanchez teaching in the studio" className="rounded-3xl w-full aspect-[4/5] object-cover shadow-xl" />
            <div className="absolute -bottom-4 -left-2 sm:left-4 bg-[#1C221F] text-white rounded-2xl px-4 py-3 shadow-lg">
              <div className="eyebrow !text-[#E0A38F]">Certified paths</div>
              <div className="serif text-lg">200 · 300 · 500 hours</div>
            </div>
          </div>
        </div>
      </section>

      {/* Mentor */}
      <section className="bg-white border-y border-[#E5E6DF]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16 grid lg:grid-cols-2 gap-10 items-center">
          <img src={GRP_IMG} alt="Tony Sanchez with a group of students" className="rounded-3xl w-full aspect-video object-cover shadow-md order-2 lg:order-1" />
          <div className="order-1 lg:order-2">
            <div className="eyebrow !text-[#B25A45]">Your mentor</div>
            <h2 className="serif text-3xl sm:text-4xl mt-2 text-[#1C221F]">More than just a mentor</h2>
            <p className="text-[15px] text-[#545E56] mt-4 leading-relaxed">
              Fifty years on the mat with Tony Sanchez. You'll train with a lineage holder who has
              devoted his life to this practice — learning not only the postures, but the philosophy,
              discipline and care it takes to guide others. Small groups, personal attention, and a
              standard of teaching you can build a career on.
            </p>
            <ul className="grid sm:grid-cols-2 gap-3 mt-6">
              {PILLARS.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="h-10 w-10 rounded-full bg-[#FBF1EE] flex items-center justify-center shrink-0">
                    <p.icon className="h-5 w-5 text-[#B25A45]" />
                  </span>
                  <span>
                    <span className="block font-semibold text-[#1C221F] text-[15px]">{p.title}</span>
                    <span className="block text-sm text-[#6B7269] leading-snug">{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Trainings / pricing */}
      <section ref={bookRef} className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
        <div className="text-center max-w-2xl mx-auto">
          <div className="eyebrow !text-[#B25A45]">Teacher training program</div>
          <h2 className="serif text-3xl sm:text-4xl mt-2 text-[#1C221F]">Choose your training</h2>
          <p className="text-[15px] text-[#545E56] mt-3">Residential intensives at Villa San Pedro, Málaga. Price includes 6 nights and 3 daily meals.</p>
        </div>

        {tiers === null ? <div className="py-16"><Spinner /></div> : (
          <div className="grid md:grid-cols-3 gap-5 mt-10 items-start">
            {tiers.map((t, i) => (
              <div key={t.id} data-testid={`tt-card-${t.id}`}
                className={`rounded-3xl border p-6 flex flex-col ${i === 1 ? "border-[#B25A45] bg-white shadow-xl ring-1 ring-[#B25A45]/20" : "border-[#E5E6DF] bg-white"}`}>
                {i === 1 && <div className="self-start eyebrow !text-white bg-[#B25A45] rounded-full px-3 py-1 -mt-9 mb-3">Most chosen</div>}
                <div className="eyebrow !text-[#839682]">{t.hours}-hour path</div>
                <h3 className="serif text-2xl mt-1 text-[#1C221F]">{t.name.split(" · ")[0]}</h3>
                <div className="mt-3 flex items-end gap-1">
                  <span className="serif text-4xl text-[#1C221F]">€{Number(t.price).toLocaleString()}</span>
                </div>
                <div className="text-sm font-semibold text-[#B25A45] mt-1">{t.dates}</div>
                <ul className="mt-4 space-y-2 flex-1">
                  {t.includes.map((line, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-[#545E56]">
                      <Check className="h-4 w-4 text-[#839682] shrink-0 mt-0.5" /> {line}
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <PaymentButtons itemType="teacher_training" itemId={t.id} stripeLabel="Pay with card" testIdPrefix={`tt-book-${t.id}`} />
                  <p className="text-[11px] text-[#6B7269] text-center mt-2">Secure payment · questions? tonyoga.online@gmail.com</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Join / who it's for */}
      <section className="bg-[#1C221F] text-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-14 sm:py-20 text-center">
          <div className="eyebrow !text-[#E0A38F]">Join us</div>
          <h2 className="serif text-3xl sm:text-4xl mt-2">Become the teacher you'd want to learn from</h2>
          <p className="text-white/70 mt-4 max-w-2xl mx-auto leading-relaxed">
            This training is for dedicated practitioners who want to deepen their practice and teach
            with authority — whether you're stepping into teaching for the first time or refining a
            craft you already love.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-7 text-sm">
            {["Deepen your own practice", "Earn a recognised certification", "Teach with confidence", "Live & train in Spain"].map((c) => (
              <span key={c} className="rounded-full bg-white/10 border border-white/15 px-4 py-2">{c}</span>
            ))}
          </div>
          <button onClick={scrollToBook} data-testid="tt-join-cta" className="pill pill-primary mt-8">
            Reserve your place <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Villa San Pedro */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
        <div className="text-center">
          <div className="eyebrow !text-[#B25A45]">Where you'll stay</div>
          <h2 className="serif text-3xl sm:text-4xl mt-2 text-[#1C221F]">Villa San Pedro</h2>
          <p className="text-[15px] text-[#545E56] mt-3 max-w-2xl mx-auto">
            A peaceful retreat house in the hills near Málaga — your home for the training. Six nights
            of accommodation and three fresh meals a day are included in every path.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mt-8">
          <div className="rounded-3xl bg-[#F2F2EC] border border-[#E5E6DF] p-6">
            <MapPin className="h-6 w-6 text-[#B25A45]" />
            <div className="serif text-lg mt-3 text-[#1C221F]">Málaga, Andalusia</div>
            <p className="text-sm text-[#6B7269] mt-1">Sun, quiet and space to focus — the ideal setting to immerse in practice.</p>
            <a href="https://maps.google.com/?q=Villa+San+Pedro+Malaga" target="_blank" rel="noreferrer"
               data-testid="tt-villa-map" className="text-sm font-semibold text-[#B25A45] hover:underline mt-3 inline-block">Open in Maps →</a>
          </div>
          <div className="rounded-3xl bg-[#F2F2EC] border border-[#E5E6DF] p-6 sm:col-span-2 flex flex-col justify-center">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><div className="serif text-2xl text-[#1C221F]">6</div><div className="text-xs text-[#6B7269]">nights included</div></div>
              <div><div className="serif text-2xl text-[#1C221F]">3</div><div className="text-xs text-[#6B7269]">meals a day</div></div>
              <div><div className="serif text-2xl text-[#1C221F]">∞</div><div className="text-xs text-[#6B7269]">community</div></div>
            </div>
          </div>
        </div>
        <div className="text-center mt-10">
          <Link to="/support" className="text-sm text-[#B25A45] hover:underline">Have a question before you book? Contact us →</Link>
        </div>
      </section>
    </div>
  );
}
