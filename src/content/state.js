export const MAX_PLAYLIST_ITEMS = 500;
export const MAX_SAVED_PLAYLISTS = 30;
export const MAX_SAVED_THEMES = 12;
export const FEEDBACK_FORM_URL = "https://fir-fruitadens-b76.notion.site/1ddbcd8a2d994a1c9e6f40906a34d5cd?pvs=105";
export const FEEDBACK_LIST_URL = "https://fir-fruitadens-b76.notion.site/9eb94149121d422e8068ffad2b67007b?v=92708ba1dd9a4ee1b86e449e4219650f";
export const SUPPORT_PAYMENT_URL = "https://buy.stripe.com/cNi00jgyeeifgIIdPU6Ri00";
export const MUSIC_BAR_WIDTHS = ["tight", "default", "wide", "full", "custom"];
export const THEME_COLOR_KEYS = ["accent", "surface", "card", "background", "pageSurface", "navbar", "text", "secondaryText"];
export const BUILT_IN_THEMES = [
  { id: "studio", label: "Studio", accent: "#1da0c3", surface: "#ffffff", background: "#eef2f4", pageSurface: "#ffffff", text: "#111827" },
  { id: "midnight", label: "Midnight", accent: "#8b7cff", surface: "#18181f", background: "#0d0d12", pageSurface: "#18181f", text: "#f8fafc" },
  { id: "warm", label: "Warm", accent: "#db6f3d", surface: "#fff7ed", background: "#f4eadf", pageSurface: "#fffaf4", text: "#29201a" },
  { id: "forest", label: "Forest", accent: "#45a36f", surface: "#17231d", background: "#0c1510", pageSurface: "#17231d", text: "#f2fbf5" },
  { id: "mono", label: "Mono", accent: "#6b7280", surface: "#f3f4f6", background: "#e5e7eb", pageSurface: "#f9fafb", text: "#111827" },
  { id: "plum", label: "Plum", accent: "#c061cb", surface: "#241827", background: "#160f18", pageSurface: "#241827", text: "#fff7ff" },
  { id: "ocean", label: "Ocean", accent: "#38bdf8", surface: "#0f2433", background: "#071721", pageSurface: "#0f2433", text: "#f0f9ff" }
];
export const defaultState = {
  open: false,
  activeTab: "playlist",
  layout: null,
  layoutMode: "floating",
  dockSide: "right",
  dockedWidth: 420,
  launcherPosition: null,
  openHomeToFeed: false,
  feedUrl: "",
  autoAnalyzeTracks: true,
  showTrackKeys: true,
  pageActionLabels: false,
  recordPlaylistMetadata: true,
  showMusicBarAnalysis: true,
  scrubberStyle: "waveform",
  musicBarSize: "standard",
  musicBarWidth: "default",
  musicBarCustomWidth: 900,
  appearance: {
    pageAware: true,
    applyToPage: false,
    modernReleasePages: true,
    hidePageCart: true,
    hideHeaderCart: true,
    hideBandcampPlayer: true,
    preset: "studio",
    customAccent: "#1da0c3",
    customScrubAccent: null,
    customSurface: "#ffffff",
    customPanelLinked: true,
    customCard: "#ffffff",
    customContentLinked: true,
    customPageBackground: "#eef2f4",
    customPageSurface: "#ffffff",
    customNavbar: "#ffffff",
    customText: "#111827",
    customSecondaryText: "#6b7280",
    savedThemes: []
  },
  dj: {
    open: false,
    rate: 1,
    range: 10,
    preservePitch: true,
    autoTempo: true,
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
  savedPlaylists: [],
  playlistView: "current",
  selectedSavedPlaylistId: null,
  backupIntroSeen: false,
  backupReminderDays: 7,
  backupReminderSnoozedAt: null,
  lastBackupAt: null,
  sectionPanelHeight: null,
  wishlistTrackKeys: [],
  activity: []
};
