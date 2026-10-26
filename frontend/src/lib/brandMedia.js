// Built-in photos and video of Tony (files in public/brand/tony). Each one can be
// replaced in Admin → Site images; these are what shows when a slot is left empty.
const B = "/brand/tony";

export const TONY = {
  heroVideo: `${B}/hero-tony.mp4`,
  heroPoster: `${B}/hero-poster.jpg`,
  portrait: `${B}/tony-portrait.jpg`,
  story: `${B}/tony-story.jpg`,
  face: `${B}/tony-face.jpg`,
  seated: `${B}/tony-seated.jpg`,
  privateSession: `${B}/private-session.jpg`,
  ttHero: `${B}/tt-hero.jpg`,
  group: `${B}/group.jpg`,
  groupWide: `${B}/group-wide.jpg`,
  library: [`${B}/pose-backbend.jpg`, `${B}/pose-forward-fold.jpg`, `${B}/pose-kneel-fold.jpg`, `${B}/tony-seated.jpg`],
  share: `${B}/og-tony.jpg`,
  studioClips: [
    { src: `${B}/studio-class-1.mp4`, poster: `${B}/studio-class-1.jpg` },
    { src: `${B}/studio-class-2.mp4`, poster: `${B}/studio-class-2.jpg` },
  ],
};

/** Default photo for each Admin → Site images slot. */
export const SLOT_DEFAULTS = {
  hero: TONY.heroPoster,
  story: TONY.story,
  teacher_training: TONY.group,
  app_cta: "",
  app_home: TONY.portrait,
  tony_portrait: TONY.face,
  private_session: TONY.privateSession,
  tt_page_hero: TONY.ttHero,
  tt_page_group: TONY.groupWide,
  library_1: TONY.library[0],
  library_2: TONY.library[1],
  library_3: TONY.library[2],
  library_4: TONY.library[3],
};

/** True when the visitor asked for less motion or less data — skip autoplay video then. */
export function preferStill() {
  if (typeof window === "undefined") return true;
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
    if (navigator.connection?.saveData) return true;
  } catch { /* ignore */ }
  return false;
}
