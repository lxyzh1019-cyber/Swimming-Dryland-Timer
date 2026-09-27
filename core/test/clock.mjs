/* THE TEST CLOCK. Loaded by the runner (`--import`) before every suite.

   The suites ask the app what "today" is, and one day a week — Sunday in
   Edmonton — is the recovery day, when there is no session to run. So on a
   Sunday half the suites failed while the app was fine: the calendar, not the
   code, decided the result. That is the Monday-only assertion from the
   runner's history all over again. The real date must never decide a test's
   outcome, so every suite starts on the same ordinary training day:
   Wednesday 2026-09-23, 12:00 in Edmonton.

   The clock is shifted, not frozen: time still runs forward from there,
   because sessions measure elapsed time. `new Date()` and `Date.now()` read
   the shifted clock; `new Date(anything)`, Date.parse and Date.UTC behave
   exactly as native, and every date is still `instanceof Date`. A suite that
   pins its own clock still wins. */
const RealDate = Date;
const offset = RealDate.parse("2026-09-23T18:00:00Z") - RealDate.now();

class TestDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [RealDate.now() + offset])); }
  static now() { return RealDate.now() + offset; }
}
globalThis.Date = TestDate;
