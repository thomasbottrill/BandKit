export const MAX_PLAYLIST_ITEMS = 500;
export const MAX_SAVED_PLAYLISTS = 30;
export const MAX_SAVED_THEMES = 12;
export const PAPER_DEFAULTS = Object.freeze({
  paperTextureStrength: 100,
  paperFibreStrength: 70,
  paperMottleStrength: 20,
  paperGrainSize: 240
});
// This is a permanent completion sentinel, not a tour version. App updates must
// never reactivate onboarding for someone who has already completed or skipped it.
export const ONBOARDING_COMPLETE = 1;
export const FEEDBACK_FORM_URL = "https://picturesque-minute-159.notion.site/26e59205570e82919346017f46d04630?pvs=105";
export const FEEDBACK_LIST_URL = "https://picturesque-minute-159.notion.site/b2559205570e822baeb4014fae0d3f64?v=f8f59205570e82719f94084ecebb1869";
// Public release log, updated with every Chrome Web Store package (see AGENTS.md).
export const RELEASE_NOTES_URL = "https://picturesque-minute-159.notion.site/b2343291e09849ceaf9a383a698a1645?v=68c8ac09bd734b5a873fccca32ae2a86";
export const SUPPORT_PAYMENT_URL = "https://buy.stripe.com/28E00bgNT2se3GL1Vk3ZK00";
export const SUPPORT_CONTACT_EMAIL = "lantana.softworks@gmail.com";
export const MUSIC_BAR_WIDTHS = ["tight", "default", "wide", "full", "custom"];
export const MUSIC_BAR_STYLES = ["docked", "zune", "rounded"];
export const MUSIC_BAR_SCRUBBER_WIDTHS = ["small", "default", "full"];
export const SCRUBBER_HANDLE_SHAPES = ["pill", "circle", "diamond", "star-4", "star-5", "star-6", "butterfly", "lightning", "space-invader", "cat", "custom"];
export function normalizeHandleSize(value) {
  const size = Number(value);
  return value == null || value === "" || !Number.isFinite(size) ? 100 : Math.max(50, Math.min(200, Math.round(size / 5) * 5));
}
export const SCRUBBER_HANDLE_ICONS = Object.freeze({
  pill: "icon-scrub-pill.svg",
  circle: "icon-scrub-circle.svg",
  diamond: "icon-scrub-diamond.svg",
  "star-4": "icon-scrub-star-4.svg",
  "star-5": "icon-scrub-star-5.svg",
  "star-6": "icon-scrub-star-6.svg",
  butterfly: "icon-scrub-butterfly.svg",
  lightning: "icon-scrub-lightning.svg",
  "space-invader": "icon-scrub-space-invader.svg",
  cat: "icon-scrub-cat.svg"
});
export const ROUNDED_SCRUBBER_HANDLE_ICONS = Object.freeze({
  "star-4": "icon-scrub-star-4-rounded.svg",
  "star-5": "icon-scrub-star-5-rounded.svg",
  "star-6": "icon-scrub-star-6-rounded.svg"
});
export function scrubberHandleIconName(shape, rounded = false) {
  const safeShape = SCRUBBER_HANDLE_SHAPES.includes(shape) ? shape : "pill";
  return rounded && ROUNDED_SCRUBBER_HANDLE_ICONS[safeShape]
    ? ROUNDED_SCRUBBER_HANDLE_ICONS[safeShape]
    : SCRUBBER_HANDLE_ICONS[safeShape] || SCRUBBER_HANDLE_ICONS.pill;
}
export const MUSIC_BAR_VISUALIZER_TYPES = ["glow", "spectrum", "grass", "embers", "contours", "firefly", "pixels", "scanlines", "cross-stitch", "weave", "rain", "constellation", "terrain", "matrix", "fog", "warp", "dna", "glitch"];

export function normalizeVisualizerType(type, legacyType) {
  if (["lava", "rorschach"].includes(type) || (!type && ["lava", "rorschach"].includes(legacyType))) return "glow";
  const replacements = { filaments: "grass", bars: "firefly", ripples: "scanlines", prism: "cross-stitch", vortex: "scanlines", lightning: "cross-stitch", orbitals: "warp", jellyfish: "dna", springs: "pixels", kaleidoscope: "glitch", bubbles: "contours", shards: "matrix", ink: "embers", ferrofluid: "embers", tendrils: "grass", circuit: "matrix", eclipse: "contours", dominoes: "pixels", aurora: "fog", comets: "warp" };
  if (Object.hasOwn(replacements, type)) return replacements[type];
  if (type === "ribbons") return "contours";
  if (MUSIC_BAR_VISUALIZER_TYPES.includes(type)) return type;
  if (Object.hasOwn(replacements, legacyType)) return replacements[legacyType];
  if (legacyType === "ribbons") return "contours";
  return MUSIC_BAR_VISUALIZER_TYPES.includes(legacyType) ? legacyType : "glow";
}
export const VISUALIZER_BLEND_MODES = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light", "difference",
  "exclusion", "hue", "saturation", "color", "luminosity", "plus-lighter"
];
export const PLAYER_BLEND_MODES = VISUALIZER_BLEND_MODES.filter((mode) => mode !== "auto");
export const THEME_COLOR_KEYS = ["accent", "surface", "card", "background", "pageSurface", "navbar", "text", "secondaryText"];
export const BUILT_IN_THEMES = [
  { id: "studio", label: "Studio", group: "light", accent: "#06748d", scrubAccent: "#0e91ad", surface: "#ffffff", card: "#f7fafb", background: "#e8eff2", pageSurface: "#ffffff", navbar: "#edf5f7", text: "#111827", secondaryText: "#53616b" },
  { id: "warm", label: "Warm", group: "light", accent: "#a34420", scrubAccent: "#cf6335", surface: "#fffaf5", card: "#f8eadf", background: "#efe0d2", pageSurface: "#fff8f0", navbar: "#f7e7d8", text: "#291b16", secondaryText: "#76574a" },
  { id: "mono", label: "Mono", group: "light", accent: "#475569", scrubAccent: "#64748b", surface: "#f8fafc", card: "#eef1f4", background: "#e2e6ea", pageSurface: "#f5f7f9", navbar: "#eceff2", text: "#161b22", secondaryText: "#59636f" },
  { id: "daybreak", label: "Daybreak", group: "light", accent: "#ad2450", scrubAccent: "#df4774", surface: "#fff8fa", card: "#fdebf0", background: "#f6dfe6", pageSurface: "#fff5f7", navbar: "#fce8ed", text: "#30171f", secondaryText: "#795360" },
  { id: "sage", label: "Sage", group: "light", accent: "#276a50", scrubAccent: "#408b6b", surface: "#f7fbf7", card: "#e9f2ea", background: "#dce9dd", pageSurface: "#f4f9f4", navbar: "#e4eee5", text: "#14231a", secondaryText: "#506557" },
  { id: "lilac", label: "Lilac", group: "light", accent: "#65409a", scrubAccent: "#8760bd", surface: "#fbf8ff", card: "#f0e9f8", background: "#e5dcf0", pageSurface: "#f8f4fc", navbar: "#ede5f5", text: "#261b31", secondaryText: "#695979" },
  { id: "lagoon", label: "Lagoon", group: "light", accent: "#096b70", scrubAccent: "#168b90", surface: "#f5fbfb", card: "#e4f2f1", background: "#d5e9e8", pageSurface: "#f0f8f8", navbar: "#deeeee", text: "#102829", secondaryText: "#4d6869" },
  { id: "sunroom", label: "Sunroom", group: "light", accent: "#805700", scrubAccent: "#ad7900", surface: "#fffaf0", card: "#f8edcf", background: "#ede0b9", pageSurface: "#fff7e5", navbar: "#f5e8c7", text: "#2b220f", secondaryText: "#70603b" },
  { id: "midnight", label: "Midnight", group: "dark", accent: "#a89cff", scrubAccent: "#c0b8ff", surface: "#18181f", card: "#23232d", background: "#0d0d12", pageSurface: "#18181f", navbar: "#111118", text: "#f8fafc", secondaryText: "#b8bdca" },
  { id: "forest", label: "Forest", group: "dark", accent: "#6ed59b", scrubAccent: "#8ce5ae", surface: "#17231d", card: "#213128", background: "#0c1510", pageSurface: "#17231d", navbar: "#111c16", text: "#f2fbf5", secondaryText: "#a9c7b5" },
  { id: "plum", label: "Plum", group: "dark", accent: "#e38aef", scrubAccent: "#f0a9f7", surface: "#241827", card: "#332037", background: "#160f18", pageSurface: "#241827", navbar: "#1b111e", text: "#fff7ff", secondaryText: "#ceb6d1" },
  { id: "ocean", label: "Ocean", group: "dark", accent: "#67d2ff", scrubAccent: "#8adeff", surface: "#0f2433", card: "#183649", background: "#071721", pageSurface: "#0f2433", navbar: "#0a1c28", text: "#f0f9ff", secondaryText: "#abc5d4" },
  { id: "graphite", label: "Graphite", group: "dark", accent: "#d7dce2", scrubAccent: "#f2f4f7", surface: "#1d2025", card: "#292d33", background: "#111317", pageSurface: "#1d2025", navbar: "#17191e", text: "#f7f8fa", secondaryText: "#b9bec6" },
  { id: "ember", label: "Ember", group: "dark", accent: "#ff9a66", scrubAccent: "#ffb08a", surface: "#2a1b17", card: "#3a2520", background: "#160e0b", pageSurface: "#2a1b17", navbar: "#201310", text: "#fff7f2", secondaryText: "#d4b4a7" },
  { id: "cobalt", label: "Cobalt", group: "dark", accent: "#82aaff", scrubAccent: "#a5c1ff", surface: "#151d33", card: "#202b48", background: "#0a1020", pageSurface: "#151d33", navbar: "#0e1629", text: "#f4f7ff", secondaryText: "#aebbd8" },
  { id: "rosewood", label: "Rosewood", group: "dark", accent: "#ff94ae", scrubAccent: "#ffb2c4", surface: "#2b171e", card: "#3a2029", background: "#170b10", pageSurface: "#2b171e", navbar: "#211016", text: "#fff5f7", secondaryText: "#d3adb8" },
  { id: "acid-signal", label: "Acid Signal", group: "electric", accent: "#b8ff38", scrubAccent: "#d4ff7a", surface: "#111810", card: "#182216", background: "#090d08", pageSurface: "#111810", navbar: "#0c120b", text: "#f4ffe9", secondaryText: "#b5cba5" },
  { id: "ultraviolet", label: "Ultraviolet", group: "electric", accent: "#ef9cff", scrubAccent: "#f6bdff", surface: "#1a1035", card: "#27164a", background: "#100824", pageSurface: "#1a1035", navbar: "#140b2b", text: "#fcf4ff", secondaryText: "#cbb4dc" },
  { id: "laser-cyan", label: "Laser Cyan", group: "electric", accent: "#56f5ff", scrubAccent: "#9bfaff", surface: "#082126", card: "#0d3037", background: "#031418", pageSurface: "#082126", navbar: "#051a1f", text: "#efffff", secondaryText: "#a5d2d6" },
  { id: "toxic-candy", label: "Toxic Candy", group: "electric", accent: "#5dff9b", scrubAccent: "#9dffc0", surface: "#271027", card: "#381638", background: "#160818", pageSurface: "#271027", navbar: "#1d0b1f", text: "#fff5fb", secondaryText: "#deb7d2" },
  { id: "arcade-gold", label: "Arcade Gold", group: "electric", accent: "#ffd338", scrubAccent: "#ffe475", surface: "#1a1933", card: "#26254a", background: "#111022", pageSurface: "#1a1933", navbar: "#15142a", text: "#fff8dc", secondaryText: "#c9c0a0" },
  { id: "plasma-mint", label: "Plasma Mint", group: "electric", accent: "#63f7d5", scrubAccent: "#9cffea", surface: "#2a0f17", card: "#3d1722", background: "#18070c", pageSurface: "#2a0f17", navbar: "#210a11", text: "#fff7f9", secondaryText: "#d9b1bc" },
  { id: "cyberpink", label: "Cyberpink", group: "electric", accent: "#ff8fd8", scrubAccent: "#ffb7e6", surface: "#0d1d30", card: "#142a43", background: "#07101c", pageSurface: "#0d1d30", navbar: "#091625", text: "#f7fbff", secondaryText: "#adc2d6" },
  { id: "infrared", label: "Infrared", group: "electric", accent: "#ffbe3d", scrubAccent: "#ffd477", surface: "#291208", card: "#3a1b0d", background: "#170a04", pageSurface: "#291208", navbar: "#200d05", text: "#fff8f0", secondaryText: "#d8bca8" },
  { id: "risograph", label: "Risograph", group: "print", accent: "#7c2d64", scrubAccent: "#a04487", surface: "#fff1ec", card: "#f6d8d4", background: "#f0c8c9", pageSurface: "#fff6f2", navbar: "#efc6bd", text: "#35191b", secondaryText: "#70484b" },
  { id: "newsprint", label: "Newsprint", group: "print", accent: "#284f47", scrubAccent: "#3f7166", surface: "#f7f1df", card: "#ebe4d0", background: "#ded8c8", pageSurface: "#faf5e7", navbar: "#e4ddca", text: "#211f1a", secondaryText: "#5f5b4f" },
  { id: "blueprint", label: "Blueprint", group: "print", accent: "#ffd34e", scrubAccent: "#ffe27f", surface: "#0b2d50", card: "#10406f", background: "#071f3a", pageSurface: "#0b2d50", navbar: "#082642", text: "#f3f8ff", secondaryText: "#b6cce0" },
  { id: "pulp", label: "Pulp", group: "print", accent: "#704191", scrubAccent: "#9262b1", surface: "#fff4c8", card: "#f3e2aa", background: "#e8d28e", pageSurface: "#fff8da", navbar: "#efdb9f", text: "#2c2412", secondaryText: "#6a5a31" },
  { id: "bauhaus", label: "Bauhaus", group: "print", accent: "#a82626", scrubAccent: "#ce4141", surface: "#fff8e8", card: "#efe4ce", background: "#e6ddc9", pageSurface: "#fffaf0", navbar: "#eadfc8", text: "#26221b", secondaryText: "#625c4f" },
  { id: "candy-wrapper", label: "Candy Wrapper", group: "print", accent: "#6842a0", scrubAccent: "#8962bd", surface: "#f2fff8", card: "#dfefe7", background: "#cde8dc", pageSurface: "#f7fff9", navbar: "#d7ece2", text: "#16251f", secondaryText: "#4f685e" },
  { id: "halftone", label: "Halftone", group: "print", accent: "#ffcf52", scrubAccent: "#ffe18a", surface: "#261833", card: "#382448", background: "#160f21", pageSurface: "#261833", navbar: "#1d1428", text: "#fff7e8", secondaryText: "#d0bfc8" },
  { id: "thermal", label: "Thermal", group: "print", accent: "#9a3412", scrubAccent: "#c24e21", surface: "#f5fbf9", card: "#e7f0ee", background: "#d5e2e0", pageSurface: "#f8fcfb", navbar: "#ddeae7", text: "#152422", secondaryText: "#4f6461" },
  { id: "pickle-disco", label: "Pickle Disco", group: "wacky", accent: "#f4ff3b", scrubAccent: "#ff8bd7", surface: "#242036", card: "#17352f", background: "#171526", pageSurface: "#2c2231", navbar: "#342515", text: "#fffdf2", secondaryText: "#cfd4c2" },
  { id: "bubblegum-rust", label: "Bubblegum Rust", group: "wacky", accent: "#8b174e", scrubAccent: "#245fb2", surface: "#eafff5", card: "#ffe3d5", background: "#e8e0ff", pageSurface: "#fff3aa", navbar: "#d8f0ff", text: "#19172b", secondaryText: "#555166" },
  { id: "wrong-aquarium", label: "Wrong Aquarium", group: "wacky", accent: "#ffea63", scrubAccent: "#ff8f70", surface: "#0d3440", card: "#35214b", background: "#29230f", pageSurface: "#1d3130", navbar: "#421e2d", text: "#fff9e6", secondaryText: "#c9d2c4" },
  { id: "dentists-office", label: "Dentist's Office", group: "wacky", accent: "#9b123c", scrubAccent: "#275caa", surface: "#e8fbff", card: "#e8ffe5", background: "#ffe9ef", pageSurface: "#f7f9ff", navbar: "#fff1cf", text: "#151d2b", secondaryText: "#53606a" },
  { id: "traffic-jam", label: "Traffic Jam", group: "wacky", accent: "#ffd83d", scrubAccent: "#5ef0ff", surface: "#12243d", card: "#421d25", background: "#112d20", pageSurface: "#28231a", navbar: "#252525", text: "#fffaf0", secondaryText: "#c7c8bf" },
  { id: "birthday-carpet", label: "Birthday Carpet", group: "wacky", accent: "#67217f", scrubAccent: "#006b5a", surface: "#fff0cb", card: "#ddf6ef", background: "#f3dff9", pageSurface: "#e9f0ff", navbar: "#ffdfe7", text: "#21152b", secondaryText: "#62536a" },
  { id: "haunted-yogurt", label: "Haunted Yogurt", group: "wacky", accent: "#a9ffd4", scrubAccent: "#ffe769", surface: "#28232e", card: "#203329", background: "#171a28", pageSurface: "#2e261d", navbar: "#341d24", text: "#fff7fb", secondaryText: "#c9bbc4" },
  { id: "office-party", label: "Office Party", group: "wacky", accent: "#7a2138", scrubAccent: "#165d71", surface: "#f0f0e8", card: "#dcead3", background: "#e3e6f4", pageSurface: "#f8e7d1", navbar: "#d9edf2", text: "#1e2024", secondaryText: "#5b5e62" },
  { id: "wormhole-picnic", label: "Wormhole Picnic", group: "wacky", accent: "#ff9de2", scrubAccent: "#9eff65", surface: "#15273d", card: "#352149", background: "#102d24", pageSurface: "#2d1f22", navbar: "#261b3d", text: "#fff8ff", secondaryText: "#d0bfd3" },
  { id: "wet-cement-cake", label: "Wet Cement Cake", group: "wacky", accent: "#075e66", scrubAccent: "#7d254e", surface: "#ecebea", card: "#ffe3eb", background: "#e8e1c7", pageSurface: "#dff1e5", navbar: "#e1e4ef", text: "#1d2225", secondaryText: "#596167" }
];
export const defaultState = {
  open: false,
  activeTab: "playlist",
  onboardingCompletedVersion: 0,
  onboardingStep: 0,
  settingsDrawers: {},
  settingsView: "index",
  settingsSubView: "index",
  layout: null,
  layoutMode: "floating",
  dockSide: "right",
  dockedWidth: 420,
  launcherPosition: null,
  openHomeToFeed: false,
  feedUrl: "",
  autoAnalyzeTracks: true,
  djToolsEnabled: true,
  cartEnabled: true,
  playlistsEnabled: true,
  activityEnabled: true,
  showTrackKeys: true,
  showCamelotNotation: false,
  recordPlaylistMetadata: true,
  showMusicBarAnalysis: true,
  keepMusicBarAnalysisVisible: false,
  scrubberStyle: "waveform",
  scrubberHandleShape: "pill",
  customScrubberHandle: null,
  customTimeline: null,
  customPlayerButtons: {},
  musicBarTimelineColor: null,
  musicBarHandleColor: null,
  musicBarControlsColor: null,
  musicBarPlayerColor: null,
  retainTimelineColors: true,
  scrubberHandleSize: 100,
  retainSvgHandleColors: false,
  retainPngHandleColors: true,
  musicBarScrubberWidth: "full",
  musicBarStyle: "zune",
  musicBarDynamicColor: true,
  musicBarPlayerDynamicColor: true,
  musicBarPanelDynamicColor: true,
  musicBarBlendMode: "normal",
  musicBarPanelButtons: "compact",
  musicBarRecentPanel: "playlist",
  musicBarSize: "standard",
  musicBarVisualizer: "glow",
  musicBarVisualizerType: "glow",
  musicBarVisualizerOpacity: 100,
  musicBarVisualizerWidth: "auto",
  musicBarVisualizerHeight: "auto",
  musicBarVisualizerBlendMode: "normal",
  musicBarWidth: "default",
  musicBarCustomWidth: 900,
  musicBarBottomOffset: 0,
  dockChevronGap: 0,
  appearance: {
    pageAware: true,
    applyToPage: false,
    modernReleasePages: true,
    frostedGlass: false,
    paperTexture: false,
    ...PAPER_DEFAULTS,
    glassTransparency: 20,
    glassBlur: 20,
    cornerStyle: "rounded",
    customCornerRadius: 12,
    hidePageCart: true,
    hideHeaderCart: true,
    hideBandcampPlayer: true,
    preset: "studio",
    customThemeEditorMode: "simple",
    customAccent: "#1da0c3",
    customScrubAccent: null,
    visualizerColourSource: "theme",
    customVisualizerColor1: null,
    customVisualizerColor2: null,
    customVisualizerColor3: null,
    customSurface: "#ffffff",
    customPanelLinked: true,
    customCard: "#ffffff",
    customContentLinked: true,
    customPageBackground: "#eef2f4",
    customPageSurface: "#ffffff",
    customNavbar: "#ffffff",
    customText: "#111827",
    customSecondaryText: "#6b7280",
    savedThemes: [],
    visualThemes: [],
    visualThemeId: "dynamic"
  },
  dj: {
    open: false,
    rate: 1,
    range: 10,
    preservePitch: true,
    autoTempo: true,
    tapBpm: null,
    tapTrackKey: "",
    filterValue: 0,
    gainDb: 0,
    eqLowDb: 0,
    eqMidDb: 0,
    eqHighDb: 0,
    jogAdjust: 0.5,
    vinylSpeedAdjust: 0.35,
    loopSize: 4,
    loopPage: 1,
    knobMode: "both",
    pageOpen: false
  },
  cartSavedAt: null,
  cart: [],
  cartSummary: null,
  savedCarts: [],
  cartView: "current",
  selectedSavedCartId: null,
  playlist: [],
  playlistMode: "browse",
  playlistShuffleEnabled: false,
  playlistShuffleOrder: [],
  savedPlaylists: [],
  playlistView: "current",
  selectedSavedPlaylistId: null,
  backupIntroSeen: false,
  backupReminderDays: 7,
  backupReminderSnoozedAt: null,
  lastBackupAt: null,
  sectionPanelHeight: null,
  wishlistTrackKeys: [],
  activityCartEventsRepaired: true,
  activity: []
};
