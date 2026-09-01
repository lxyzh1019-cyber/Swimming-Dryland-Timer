/* ============================================================
   BACKUP — download / restore one athlete's data as JSON.
   The DOM side of store.js's exportProfileData / importProfileData.
   ============================================================ */

import { exportProfileData, importProfileData, settings } from "./store.js";
import { todayISODate } from "./util.js";

export function downloadBackup() {
  const payload = exportProfileData();
  const name = String(payload.profile.name || "athlete").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `splash-backup-${name}-${todayISODate()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return payload;
}

/* Reads a File chosen in the Grown-up Zone and merges it into the ACTIVE
   athlete. Resolves with a message for the UI; rejects with a readable one. */
export function restoreBackupFile(file, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error("No file chosen.")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file couldn't be read."));
    reader.onload = () => {
      let payload;
      try { payload = JSON.parse(reader.result); }
      catch { reject(new Error("That file isn't valid JSON.")); return; }
      let res;
      try { res = importProfileData(payload, opts); }
      catch (e) { reject(e); return; }
      const who = settings.athleteName || "this athlete";
      const bits = [];
      if (res.sessionsAdded) bits.push(res.sessionsAdded + " session" + (res.sessionsAdded === 1 ? "" : "s"));
      if (res.xpAdded) bits.push(res.xpAdded + " XP");
      if (res.filled.length) bits.push(res.filled.length + " other record" + (res.filled.length === 1 ? "" : "s"));
      resolve({
        ...res,
        message: bits.length
          ? `Restored into ${who}: ${bits.join(", ")}. Nothing already here was changed.`
          : `Nothing new to restore — ${who} already has everything in that file.`
      });
    };
    reader.readAsText(file);
  });
}
