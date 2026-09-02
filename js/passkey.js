/* ============================================================
   THE PASSKEY — the adult proof behind the grown-up PIN.

   A WebAuthn platform authenticator: Face ID, Touch ID, or the device's own
   passcode. It replaces the arithmetic question that used to authorize both
   setting the first PIN and resetting a forgotten one — a two-digit
   multiplication a 10-year-old does in her head, which meant the PIN was worth
   exactly that sum however carefully it was stored.

   ---- What this is honestly worth ----

   TWO caveats, both real, both stated here rather than discovered later:

   1. There is NO SERVER. A WebAuthn assertion is meant to be verified by a
      relying party that holds the public key; this app has none, so nothing
      here verifies a signature. What it does is invoke the ceremony and check
      that the platform returned the credential id this device enrolled. The
      security is the platform's user-verification prompt — the parent's face or
      thumb or device passcode — not cryptography this file performs. Somebody
      with devtools open can defeat it. That is not the threat model.

   2. It is worth exactly what the DEVICE's enrolment is worth. If the child's
      own face or fingerprint is enrolled on the family iPad, the platform will
      accept her, and the passkey is then weaker than a PIN she does not know.
      The setup card says so, because a parent who does not know that cannot
      make a sensible choice about which to rely on.

   Neither the credential id nor anything derived from it is a secret worth
   protecting — but it is stored device-level and kept out of PROFILE_KEYS all
   the same, so a backup file never carries a hint about how this device is
   secured.
   ============================================================ */

import { readDeviceKey, writeDeviceKey, clearDeviceKey, LS_GROWNUP_PASSKEY } from "./store.js";

const RP_NAME = "Splash — Swim Dryland Timer";

export function passkeySupported() {
  return !!(typeof window !== "undefined" && window.PublicKeyCredential
            && typeof navigator !== "undefined" && navigator.credentials
            && navigator.credentials.create && navigator.credentials.get);
}

export function hasPasskey() {
  const rec = readDeviceKey(LS_GROWNUP_PASSKEY, null);
  return !!(rec && rec.id);
}

export function forgetPasskey() { return clearDeviceKey(LS_GROWNUP_PASSKEY); }

function randomBytes(n) {
  const a = new Uint8Array(n);
  (globalThis.crypto || {}).getRandomValues?.(a);
  return a;
}

function toBase64Url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf || []);
  let s = "";
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const pad = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - pad.length % 4) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* Enrol this device. Resolves false — never throws — when the browser has no
   platform authenticator, or the grown-up dismisses the prompt. */
export async function enrollPasskey(label = "Grown-up") {
  if (!passkeySupported()) return false;
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: RP_NAME },
        user: { id: randomBytes(16), name: String(label), displayName: String(label) },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
        attestation: "none"
      }
    });
    const id = cred && (cred.rawId ? toBase64Url(cred.rawId) : cred.id);
    if (!id) return false;
    return writeDeviceKey(LS_GROWNUP_PASSKEY, { id, enrolledAt: Date.now() });
  } catch { return false; }
}

/* Ask the platform to confirm the grown-up. Resolves true only when the
   ceremony succeeded AND returned the credential this device enrolled —
   see caveat 1 for what that does and does not establish. */
export async function verifyPasskey() {
  if (!passkeySupported() || !hasPasskey()) return false;
  const rec = readDeviceKey(LS_GROWNUP_PASSKEY, null);
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: "public-key", id: fromBase64Url(rec.id) }],
        userVerification: "required",
        timeout: 60000
      }
    });
    if (!assertion) return false;
    const got = assertion.rawId ? toBase64Url(assertion.rawId) : assertion.id;
    return got === rec.id;
  } catch { return false; }
}
