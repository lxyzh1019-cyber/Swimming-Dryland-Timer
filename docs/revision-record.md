# Revision record (hz-change-guard)

Version: v35
Built on: v34
Owner: claude.ai chat "Swimming / Figure Skate Dryland Timer deep check" (2026-10-16)

The full feature list is `FEATURES.md`; this record names the features the revision gate checks by phrase.

## Features
F1 Still-tight card after recovery moves | Is anything still tight?; 😣 Still tight; TIGHT_MAX_EXTRA
F2 No extra round on a sore zone | soreToday; no extra round
F3 Grown-up Still tight list | Still tight after recovery
F4 Sunday Body Check is recovery | A quick body check before recovery
F5 App version stamp | App version on this device
F6 Shared core check in CI | Shared core is the same in both apps
F7 Back a move keeps done moves | Back a move keeps done moves
F8 Care / recovery day record | careComplete
F9 Coach's Quiz on the finish screen | sessionQuizOf

## Open problems
P1 Live site not checked from the chat — check the Grown-up version line after merge
P2 Real-device check (sound, screen lock) never run
P3 Firestore reads are public (owner decision) — revisit with sign-in

## Fixed
X1 Sunday Body Check promised "Full 3 rounds" — proof: core/test/tight.mjs §9
X2 Core drift unchecked — proof: CI step dry-run 2026-10-16
