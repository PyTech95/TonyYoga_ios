import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Upload, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { inputCls } from "./shared";
import { contentImageUrl } from "@/components/ContentImageInput";

// Homepage art slots the admin can override. Empty value → the app falls back to a
// generic stock default baked into the site.
const SLOTS = [
  { key: "hero", label: "Homepage hero", hint: "Large portrait image on the landing page.", ratio: "aspect-[3/4]", w: "w-40" },
  { key: "story", label: "Story section", hint: "Portrait beside Tony's story on the homepage.", ratio: "aspect-[4/5]", w: "w-40" },
  { key: "teacher_training", label: "Teacher training", hint: "Homepage teacher-training image.", ratio: "aspect-[4/3]", w: "w-44" },
  { key: "app_cta", label: "App promo section", hint: "Image in the dark 'get the app' banner (replaces the feature list).", ratio: "aspect-[4/3]", w: "w-44" },
];

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
      const { data } = await api.post("/admin/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
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
        <p className="text-[13px] text-[#6B7269] mt-1 max-w-xl">Replace the built-in homepage artwork. Leave a slot empty to use the default stock photo.</p>
      </div>

      <div className="space-y-5">
        {SLOTS.map((slot) => (
          <div key={slot.key} className="rounded-3xl bg-white border border-[#E5E6DF] p-5 flex flex-col sm:flex-row gap-5" data-testid={`site-image-${slot.key}`}>
            <div className={`${slot.w} shrink-0`}>
              <div className={`${slot.ratio} rounded-2xl overflow-hidden bg-[#F2F2EC] border border-[#E5E6DF]`}>
                {images[slot.key]
                  ? <img src={contentImageUrl(images[slot.key])} alt={slot.label} className="h-full w-full object-cover" data-testid={`site-image-preview-${slot.key}`} />
                  : <div className="h-full w-full flex items-center justify-center text-[#B0B4AA]"><ImageIcon className="h-7 w-7" /></div>}
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
                    <RotateCcw className="h-4 w-4" /> Use default
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={save} disabled={saving} className="pill pill-primary disabled:opacity-60" data-testid="site-images-save">
        {saving ? "Saving…" : "Save site images"}
      </button>

      <div className="rounded-2xl bg-[#F2F2EC] border border-[#E5E6DF] p-4 text-[12.5px] text-[#545E56]" data-testid="site-images-note">
        <span className="font-semibold">Other images:</span> product photos are managed in <span className="font-semibold">Shop &amp; Printful</span>, and course/lesson covers in <span className="font-semibold">Courses &amp; Videos</span>.
      </div>
    </div>
  );
}
