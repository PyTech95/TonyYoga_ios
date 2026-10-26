import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Upload, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { inputCls } from "./shared";
import { contentImageUrl } from "@/components/ContentImageInput";
import { SLOT_DEFAULTS } from "@/lib/brandMedia";
import { invalidateSiteData } from "@/lib/siteData";

// Photo slots the admin can override. Empty value → the built-in photo of Tony
// (shown greyed with a "Built-in" tag so it's clear what visitors see).
const SLOTS = [
  { key: "hero", label: "Homepage hero photo", hint: "Big photo at the top of the website (also the video's first frame if you add a hero video).", ratio: "aspect-[3/4]", w: "w-40" },
  { key: "story", label: "Story section", hint: "Portrait beside Tony's story on the homepage.", ratio: "aspect-[4/5]", w: "w-40" },
  { key: "private_session", label: "Private sessions banner", hint: "Main photo in the homepage private-sessions banner.", ratio: "aspect-[4/3]", w: "w-44" },
  { key: "teacher_training", label: "Teacher training banner", hint: "Photo in the homepage teacher-training banner.", ratio: "aspect-[4/3]", w: "w-44" },
  { key: "app_cta", label: "App promo section", hint: "Image in the dark 'get the app' banner (replaces the feature list).", ratio: "aspect-[4/3]", w: "w-44" },
  { key: "app_home", label: "App home banner", hint: "Top photo on the member home screen in the iPhone/Android app (and /welcome).", ratio: "aspect-[4/3]", w: "w-44" },
  { key: "tony_portrait", label: "Tony portrait", hint: "Small photo of Tony in the corner of the private-sessions banner.", ratio: "aspect-[5/6]", w: "w-28" },
  { key: "tt_page_hero", label: "Teacher training page — main photo", hint: "Large photo at the top of the Teacher training page.", ratio: "aspect-[4/5]", w: "w-36" },
  { key: "tt_page_group", label: "Teacher training page — group photo", hint: "Second photo on the Teacher training page.", ratio: "aspect-video", w: "w-48" },
  { key: "library_1", label: "Homepage library collage — photo 1", hint: "Four small photos beside 'Explore the library' on the homepage (large screens).", ratio: "aspect-square", w: "w-28" },
  { key: "library_2", label: "Homepage library collage — photo 2", hint: "", ratio: "aspect-square", w: "w-28" },
  { key: "library_3", label: "Homepage library collage — photo 3", hint: "", ratio: "aspect-square", w: "w-28" },
  { key: "library_4", label: "Homepage library collage — photo 4", hint: "", ratio: "aspect-square", w: "w-28" },
];

function HeroVideoSlot({ value, onChange }) {
  const off = value === "off";
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/uploads", fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 600000 });
      onChange(data.url);
      toast.success("Video uploaded — remember to Save");
    } catch (e) {
      toast.error(typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "Upload failed");
    } finally { setBusy(false); }
  };
  const src = off ? "" : contentImageUrl(value) || "";
  return (
    <div className="rounded-3xl bg-white border border-[#E5E6DF] p-5 flex flex-col sm:flex-row gap-5" data-testid="site-image-hero_video">
      <div className="w-40 shrink-0">
        <div className="aspect-square rounded-2xl overflow-hidden bg-[#F2F2EC] border border-[#E5E6DF] relative">
          {src ? <video key={src} src={src} muted loop autoPlay playsInline className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-[11px] text-[#6B7269] p-3 text-center">No video — the hero photo is shown</div>}
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div>
          <div className="font-semibold text-[#1C221F]">Homepage hero video</div>
          <div className="text-[12px] text-[#6B7269]">Optional. Leave empty and the website shows the <span className="font-semibold">Homepage hero</span> photo below. If you add a video (a short silent MP4, a few MB), it plays at the top of the website instead; visitors who prefer reduced motion or save data still see the photo.</div>
        </div>
        <input type="text" value={off ? "" : value || ""} disabled={off} onChange={(e) => onChange(e.target.value)} placeholder="No video — paste an MP4 link, or upload one" data-testid="site-image-url-hero_video" className={inputCls} />
        <div className="flex flex-wrap gap-2.5">
          <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} data-testid="site-hero-video-file" />
          <button onClick={() => fileRef.current?.click()} disabled={busy || off} className="pill pill-ghost !py-2 !px-4 !text-[13px] disabled:opacity-50" data-testid="site-hero-video-upload">
            <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload video"}
          </button>
          {(value || off) && <button onClick={() => onChange("")} className="pill pill-ghost !py-2 !px-4 !text-[13px]" data-testid="site-hero-video-remove"><RotateCcw className="h-4 w-4" /> Remove video</button>}
        </div>
      </div>
    </div>
  );
}

export default function SiteImagesPane() {
  const [images, setImages] = useState({});
  const [saving, setSaving] = useState(false);
  const fileRefs = useRef({});

  const load = () => api.get("/admin/settings").then(({ data }) => setImages(data.site_images || {})).catch(() => setImages({}));
  useEffect(() => { load(); }, []);

  const setSlot = (key, url) => setImages((prev) => ({ ...prev, [key]: url }));

  const upload = async (key, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/admin/uploads", fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 600000 });
      // Store the portable API path; resolve it only when displaying the image.
      setSlot(key, data.url);
      toast.success("Image uploaded — remember to Save");
    } catch {
      toast.error("Upload failed");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/admin/settings", { site_images: images });
      invalidateSiteData();
      toast.success("Site images saved");
    } catch {
      toast.error("Could not save");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6" data-testid="site-images-pane">
      <div>
        <div className="eyebrow mb-1">Appearance</div>
        <h2 className="serif text-2xl sm:text-3xl">Site images</h2>
        <p className="text-[13px] text-[#6B7269] mt-1 max-w-xl">Every photo of Tony on the website and in the app comes from here. Upload a picture or paste a link, then press <span className="font-semibold">Save site images</span>. An empty slot shows nothing on the site. Course, product, retreat, meditation and pose pictures are changed in their own sections.</p>
      </div>

      <div className="space-y-5">
        <HeroVideoSlot value={images.hero_video || ""} onChange={(v) => setSlot("hero_video", v)} />
        {SLOTS.map((slot) => (
          <div key={slot.key} className="rounded-3xl bg-white border border-[#E5E6DF] p-5 flex flex-col sm:flex-row gap-5" data-testid={`site-image-${slot.key}`}>
            <div className={`${slot.w} shrink-0`}>
              <div className={`${slot.ratio} rounded-2xl overflow-hidden bg-[#F2F2EC] border border-[#E5E6DF]`}>
                {images[slot.key]
                  ? <img src={contentImageUrl(images[slot.key])} alt={slot.label} className="h-full w-full object-cover" data-testid={`site-image-preview-${slot.key}`} />
                  : <div className="h-full w-full flex flex-col items-center justify-center gap-1 text-[#B0B4AA] p-2 text-center" data-testid={`site-image-empty-${slot.key}`}><ImageIcon className="h-7 w-7" /><span className="text-[10px] font-semibold">Empty — nothing shows</span></div>}
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <div className="font-semibold text-[#1C221F]">{slot.label}</div>
                <div className="text-[12px] text-[#6B7269]">{slot.hint}</div>
              </div>
              <input
                type="text"
                value={images[slot.key] || ""}
                onChange={(e) => setSlot(slot.key, e.target.value)}
                placeholder="Paste an image URL, or upload below"
                data-testid={`site-image-url-${slot.key}`}
                className={inputCls}
              />
              <div className="flex flex-wrap gap-2.5">
                <input
                  ref={(el) => (fileRefs.current[slot.key] = el)}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => upload(slot.key, e.target.files?.[0])}
                  data-testid={`site-image-file-${slot.key}`}
                />
                <button onClick={() => fileRefs.current[slot.key]?.click()} className="pill pill-ghost !py-2 !px-4 !text-[13px]" data-testid={`site-image-upload-${slot.key}`}>
                  <Upload className="h-4 w-4" /> Upload
                </button>
                {images[slot.key] && (
                  <button onClick={() => setSlot(slot.key, "")} className="pill pill-ghost !py-2 !px-4 !text-[13px]" data-testid={`site-image-reset-${slot.key}`}>
                    <RotateCcw className="h-4 w-4" /> Remove
                  </button>
                )}
                {SLOT_DEFAULTS[slot.key] && images[slot.key] !== SLOT_DEFAULTS[slot.key] && (
                  <button onClick={() => setSlot(slot.key, SLOT_DEFAULTS[slot.key])} className="pill pill-ghost !py-2 !px-4 !text-[13px]" data-testid={`site-image-builtin-${slot.key}`}>
                    <ImageIcon className="h-4 w-4" /> Use Tony's photo from the site
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="sticky bottom-3 z-10 flex justify-end">
        <button onClick={save} disabled={saving} className="pill pill-primary shadow-lg disabled:opacity-60" data-testid="site-images-save">
          {saving ? "Saving…" : "Save site images"}
        </button>
      </div>

      <div className="rounded-2xl bg-[#F2F2EC] border border-[#E5E6DF] p-4 text-[12.5px] text-[#545E56]" data-testid="site-images-note">
        <span className="font-semibold">Other images:</span> product photos in <span className="font-semibold">Shop &amp; products</span>, course and lesson covers in <span className="font-semibold">Courses &amp; videos</span>, retreat photos in <span className="font-semibold">Retreats</span>, Tony's class photo in <span className="font-semibold">Instructors</span>, and any picture on a website page with the <span className="font-semibold">live editor</span>.
      </div>
    </div>
  );
}
