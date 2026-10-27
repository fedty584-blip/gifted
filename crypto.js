// เข้ารหัส/ถอดรหัสบัญชีแอดมิน (AES-GCM + PBKDF2) ใช้ร่วมกันระหว่าง setup.html และหน้าเว็บหลัก
const _enc = new TextEncoder(), _dec = new TextDecoder();
const _b64 = u => btoa(String.fromCharCode(...new Uint8Array(u)));
const _unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function _key(pw, salt) {
  const m = await crypto.subtle.importKey("raw", _enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" }, m, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function userKey(u) {
  const h = await crypto.subtle.digest("SHA-256", _enc.encode(u.trim().toLowerCase()));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function encryptCreds(pw, obj) {
  const s = crypto.getRandomValues(new Uint8Array(16)), i = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv: i }, await _key(pw, s), _enc.encode(JSON.stringify(obj)));
  return { s: _b64(s), i: _b64(i), c: _b64(c) };
}
async function decryptCreds(e, pw) {
  const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: _unb64(e.i) }, await _key(pw, _unb64(e.s)), _unb64(e.c));
  return JSON.parse(_dec.decode(p));
}
