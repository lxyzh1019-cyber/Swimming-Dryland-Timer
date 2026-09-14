/* ============================================================
   SPORT — everything that says which app this is.

   The shared core under core/ never names a sport. Every name, storage key,
   collection, image path and line of copy it needs to be THIS app is defined
   here, once, and read through core/sport.js. The sibling app carries its own
   copy of this file with its own values; the core is byte-identical in both.
   ============================================================ */

export const APP_ID = "swimming";                       // stamped on every session row
export const APP_NAME = "Splash";                       // short name: passkey, home-screen title
export const APP_TITLE = "Splash — Swim Dryland Timer"; // passkey relying-party name
export const ATHLETE_DEFAULT = "Jess";                  // until a grown-up renames her
/* The name records were keyed by before athlete identity became an id — the
   default name at the time. Read by the identity migration, never changed. */
export const LEGACY_ATHLETE = "Jess";

export const SESSIONS_COLLECTION = "jess_swimming_sessions"; // this app's Firestore collection
export const BACKUP_APP = "splash-swim-dryland";        // stamped on a backup file; a restore checks it
export const BACKUP_FILE_PREFIX = "splash-backup-";
export const CSV_FILE_PREFIX = "swim-dryland-summary-";

/* localStorage keys. Frozen: a renamed key is a wiped history. */
export const STORAGE_KEYS = {
  settings:       "swimTrainingSettingsV2",
  progress:       "swimTrainingProgressV2",
  skipHistory:    "swimTrainingSkipHistoryV2",
  engage:         "swimEngagementPickV2",
  readiness:      "swim_readiness",
  readinessLog:   "swim_readiness_log_v1",
  dayProgress:    "swim_day_progress",
  learning:       "swim_learning_records",
  ladder:         "swim_ladder_rungs",
  quiz:           "swim_quiz_v1",
  gate:           "swim_gate_state",
  sessions:       "swim_sessions_v2",
  tracker:        "swim_tracker_v2",
  events:         "swim_events_v1",
  prLog:          "swim_pr_log",
  journey:        "swim_journey_v1",
  formCheck:      "swim_form_check_v1",
  profiles:       "swim_profiles_v1",
  grownupPin:     "swim_grownup_pin_v1",
  grownupPasskey: "swim_grownup_passkey_v1"
};

/* How the plan names its sport-specific parts. */
export const SKILL_BLOCK = "swimskill";         // the technique block that survives every light
export const TRANSFER_FIELD = "swimTransfer";   // on a move: the skill it builds
export const LORE_TRANSFER_FIELD = "swim";      // on a rank's lore: what the rank teaches
export const DAY_LOAD_FIELD = "poolLoad";       // on a day: "double" hides jump rope in the warm-up

/* Images the core places itself. The poses on the session and today screens
   come from POSES in js/data.js. */
export const IMAGES = {
  mascot:    "assets/swim-marlin.png",
  avatar:    "assets/swimmer-face.png",
  bodyFront: "assets/swimmer-front.png",
  bodyBack:  "assets/swimmer-back.png"
};

/* The lines of copy that say which sport this is. Everything else the core
   says is the same for every athlete. */
export const COPY = {
  weatherCaption:   "Pool day!",
  journeyMore:      "↑ MORE OF THE OCEAN AWAITS",
  summit:           "Top of the ladder 🏔️ swim for the love of it",
  greeting:         "Ready to make a splash?",
  readinessIntro:   "A few quick checks before we dive in",
  bodyMapAlt:       "swimmer body map",
  sessionQuizIntro: "How does today's work help you swim?",
  transferHeading:  "🏊 Swim transfer",
  transferBuilds:   "🏊 Builds:",
  transferMove:     "🏊 pool:",
  transferIcon:     "🏊",
  skillBlockLabel:  "Swim-Skill",
  storyTitle:       "Your ocean story",
  storyTagline:     "Every level is a new sea friend 🌊",
  storyLockedTease: "A new sea friend is waiting further along your journey…",
  rankQuizStory:    "What does that rank teach you about swimming?",
  rankQuizFact:     "Every sea friend comes with one true fact. Which one belongs to",
  firstMilestone:   "Your first splash is one GO away!",
  backupWrongFile:  "That file isn't a Splash backup."
};

/* Session mechanics that only one sport uses. Off here; the skate app turns
   on its landing check. */
export const FEATURES = {
  landingCheck: false
};
