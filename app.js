const MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const DAYS = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
// วันหยุดราชการที่ตรงวันเดิมทุกปี (วันหยุดที่เปลี่ยนตามปี เช่น วันพระ ให้เพิ่มในหน้า "วันหยุดพิเศษ")
const FIXED = {"01-01":"วันขึ้นปีใหม่","04-06":"วันจักรี","04-13":"วันสงกรานต์","04-14":"วันสงกรานต์","04-15":"วันสงกรานต์","05-01":"วันแรงงานแห่งชาติ","05-04":"วันฉัตรมงคล","06-03":"วันเฉลิมพระชนมพรรษา สมเด็จพระราชินี","07-28":"วันเฉลิมพระชนมพรรษา ร.10","08-12":"วันแม่แห่งชาติ","10-13":"วันนวมินทรมหาราช","10-23":"วันปิยมหาราช","12-05":"วันพ่อแห่งชาติ","12-10":"วันรัฐธรรมนูญ","12-31":"วันสิ้นปี"};
const CFG = Object.assign({ owner:"", repo:"", branch:"main", path:"data/data.json" }, window.APP_CONFIG || {});

let db = { classes: [], students: [], holidays: {}, attendance: {} };
let token = localStorage.getItem("gh_token") || "";
let isAdmin = false, saveTimer = null, saving = false;
const S = { page: "home", date: "", classId: "", month: "", filter: "" };

(function detectRepo() {
  if (CFG.owner && CFG.repo) return;
  const saved = localStorage.getItem("gh_repo");
  if (saved && saved.includes("/")) { [CFG.owner, CFG.repo] = saved.split("/"); return; }
  const h = location.hostname;
  if (h.endsWith(".github.io")) {
    CFG.owner = h.split(".")[0];
    const seg = location.pathname.split("/")[1];
    CFG.repo = seg && !seg.includes(".") ? seg : h;
  }
})();

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const toDate = s => new Date(s + "T00:00:00");
const dmy = s => { const [y, m, d] = s.split("-"); return `${d}/${m}/${+y + 543}`; };
const thaiLong = s => { const d = toDate(s); return `วัน${DAYS[d.getDay()]}ที่ ${d.getDate()} ${MONTHS[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`; };
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const apiUrl = () => `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.path}`;
const headers = raw => ({ Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", ...(token ? { Authorization: "Bearer " + token } : {}) });
const isWeekend = s => [0, 6].includes(toDate(s).getDay());
const holidayName = s => db.holidays[s] || FIXED[s.slice(5)] || "";
const isOff = s => isWeekend(s) || !!holidayName(s);
const classStudents = cid => db.students.filter(s => s.classId === cid).sort((a, b) => a.no - b.no);
const className = cid => (db.classes.find(c => c.id === cid) || {}).name || "";
function monthDays(ym) {
  const [y, m] = ym.split("-").map(Number), out = [];
  for (let d = 1, n = new Date(y, m, 0).getDate(); d <= n; d++) out.push(`${y}-${pad(m)}-${pad(d)}`);
  return out;
}

// ---------- load / save ----------
function migrate(d) {
  if (d.classes) return d;
  const attendance = {};
  Object.entries(d.attendance || {}).forEach(([date, r]) => { attendance[date] = {}; (r.done || []).forEach(id => attendance[date]["s" + id] = true); });
  return { classes: [{ id: "c1", name: "3/11" }], students: (d.students || []).map((s, i) => ({ id: "s" + s.id, classId: "c1", no: i + 1, name: s.name })), holidays: d.holidays || {}, attendance };
}
async function loadData() {
  if (CFG.owner && CFG.repo) {
    try {
      const r = await fetch(`${apiUrl()}?ref=${CFG.branch}&t=${Date.now()}`, { headers: headers(true), cache: "no-store" });
      if (r.ok) { db = migrate(await r.json()); return; }
    } catch (e) {}
  }
  if (window.INLINE_DATA) { db = migrate(JSON.parse(JSON.stringify(window.INLINE_DATA))); return; }
  try {
    const r = await fetch("data/data.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw 0;
    db = migrate(await r.json());
  } catch (e) {
    $("main").innerHTML = `<div class="notice">โหลดข้อมูลไม่ได้ — ต้องเปิดผ่านเว็บ (GitHub Pages) หรือรัน <b>python3 -m http.server</b> ในโฟลเดอร์นี้ ไม่ใช่เปิดไฟล์ตรงๆ</div>`;
    throw e;
  }
}
function setStatus(msg, err) {
  const el = $("saveStatus");
  el.textContent = msg;
  el.className = "chip" + (err ? " err" : "");
}
function queueSave() {
  if (!isAdmin) return;
  setStatus("รอบันทึก...");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 1500);
}
async function saveNow() {
  if (!isAdmin) return;
  clearTimeout(saveTimer);
  if (saving) { saveTimer = setTimeout(saveNow, 1000); return; }
  saving = true;
  setStatus("กำลังบันทึกขึ้น GitHub...");
  try {
    const g = await fetch(`${apiUrl()}?ref=${CFG.branch}&t=${Date.now()}`, { headers: headers(false), cache: "no-store" });
    const sha = g.ok ? (await g.json()).sha : undefined;
    const p = await fetch(apiUrl(), {
      method: "PUT",
      headers: { ...headers(false), "Content-Type": "application/json" },
      body: JSON.stringify({ message: "update duty data " + new Date().toISOString(), content: b64(JSON.stringify(db, null, 1)), branch: CFG.branch, sha })
    });
    if (!p.ok) throw new Error((await p.json()).message || p.status);
    setStatus("บันทึกขึ้น GitHub แล้ว ✓");
  } catch (e) { setStatus("บันทึกไม่สำเร็จ: " + e.message, true); }
  finally { saving = false; }
}

// ---------- admin ----------
async function verifyToken(t, repoStr) {
  const [o, r] = repoStr.split("/");
  const res = await fetch(`https://api.github.com/repos/${o}/${r}`, { headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + t } });
  if (!res.ok) return false;
  const j = await res.json();
  return !!(j.permissions && j.permissions.push);
}
async function loginAdmin() {
  const u = $("userInput").value.trim(), pw = $("passInput").value, err = $("loginError");
  err.classList.add("hidden");
  const fail = m => { err.textContent = m; err.classList.remove("hidden"); };
  if (!u || !pw) return fail("กรอกชื่อผู้ใช้และรหัสผ่านให้ครบ");
  let auth;
  try { const r = await fetch("data/auth.json?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw 0; auth = await r.json(); }
  catch (e) { return fail("ยังไม่ได้ตั้งค่าบัญชี (ไม่พบ data/auth.json) — เปิดหน้า setup.html ตาม README"); }
  const entry = auth.users[await userKey(u)];
  let creds;
  try { creds = await decryptCreds(entry, pw); } catch (e) { return fail("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"); }
  let ok = false;
  try { ok = await verifyToken(creds.t, creds.r); } catch (e) {}
  if (!ok) return fail("Token ในระบบหมดอายุหรือไม่มีสิทธิ์ — สร้าง auth.json ใหม่ด้วย setup.html");
  token = creds.t; [CFG.owner, CFG.repo] = creds.r.split("/");
  localStorage.setItem("gh_token", token); localStorage.setItem("gh_repo", creds.r);
  $("passInput").value = "";
  setAdmin(true);
}
function logoutAdmin() { token = ""; localStorage.removeItem("gh_token"); setAdmin(false); }
function setAdmin(on) {
  isAdmin = on;
  $("adminLoginForm").classList.toggle("hidden", on);
  $("adminPanelContent").classList.toggle("hidden", !on);
  $("adminBtnText").textContent = on ? "แอดมิน ✓" : "แอดมิน";
  if (!on) $("saveStatus").classList.add("hidden");
  render();
}
function toggleAdminModal() { $("adminModal").classList.toggle("open"); }
function need() { if (!isAdmin) { alert("เข้าสู่ระบบแอดมินก่อนแก้ไขข้อมูล"); return false; } return true; }
function commit() { queueSave(); render(); }
function resetAttendance() {
  if (!confirm("ล้างข้อมูลการเช็คชื่อทั้งหมดใช่หรือไม่? (รายชื่อและวันหยุดจะไม่ถูกลบ)")) return;
  db.attendance = {}; commit();
}

// ---------- navigation ----------
function go(p) { S.page = p; render(); window.scrollTo(0, 0); }
function setS(k, v) { S[k] = v; render(); }
const lock = () => isAdmin ? "" : `<div class="notice">โหมดดูอย่างเดียว — เข้าสู่ระบบแอดมินเพื่อแก้ไขข้อมูล</div>`;
const classSelect = (val, fn, all) => `<select onchange="${fn}(this.value)">${all ? `<option value="">ทุกชั้นเรียน</option>` : ""}${db.classes.map(c => `<option value="${esc(c.id)}" ${c.id === val ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`;

function render() {
  if (!S.classId || !db.classes.some(c => c.id === S.classId)) S.classId = (db.classes[0] || {}).id || "";
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.page === S.page));
  $("main").innerHTML = { home, check, stats, manage, holidays }[S.page]();
}

// ---------- pages ----------
function home() {
  const vals = Object.values(db.attendance[S.date] || {});
  const done = vals.filter(v => v === true).length, not = vals.filter(v => v === false).length;
  const days = monthDays(S.date.slice(0, 7)), off = days.filter(isOff).length;
  const [y, m] = S.date.split("-").map(Number);
  const spCount = Object.keys(db.holidays).filter(k => k.startsWith(S.date.slice(0, 7))).length;
  return `<h2>ภาพรวมการทำเวร</h2><p class="sub">ติดตามข้อมูลนักเรียนและการทำเวรได้ในที่เดียว</p>
  <div class="grid2" style="margin-bottom:12px">
    <div class="card stat"><div class="ic"><i data-lucide="users"></i></div><div class="lbl">นักเรียนทั้งหมด</div><div class="num">${db.students.length}</div></div>
    <div class="card stat"><div class="ic"><i data-lucide="school"></i></div><div class="lbl">ชั้นเรียนทั้งหมด</div><div class="num">${db.classes.length}</div></div>
    <div class="card stat"><div class="ic"><i data-lucide="check-check"></i></div><div class="lbl" style="margin-bottom:6px">ทำเวรวันนี้</div>
      <input type="date" value="${S.date}" onchange="setS('date',this.value||todayStr())">
      <div class="small" style="margin-top:6px">${thaiLong(S.date)}</div><div class="big">ทำแล้ว ${done} คน</div><div class="small">บันทึกแล้ว ${done + not} รายการ · ไม่ทำเวร ${not} คน</div></div>
    <div class="card stat"><div class="ic"><i data-lucide="calendar-days"></i></div><div class="lbl">วันหยุดพิเศษ</div><div class="num">${Object.keys(db.holidays).length}</div></div>
  </div>
  <div class="card"><h3 style="margin:0">สรุปวันเรียนและวันหยุดประจำเดือน</h3><div class="small" style="margin-bottom:10px">${MONTHS[m - 1]} ${y + 543}</div>
    <div class="grid2"><div class="inner"><div class="small">วันเรียนในเดือนนี้</div><div class="big">${days.length - off} วัน</div></div>
    <div class="inner"><div class="small">วันหยุดในเดือนนี้</div><div class="big">${off} วัน</div><div class="small">${spCount ? `มีวันหยุดพิเศษ ${spCount} วัน` : "ไม่มีวันหยุดพิเศษในเดือนนี้"} · รวมเสาร์–อาทิตย์และวันหยุดราชการ</div></div></div></div>
  <div class="card"><h3>เริ่มต้นใช้งาน</h3><div class="small" style="font-size:13px">เพิ่มชั้นเรียนและรายชื่อนักเรียนก่อน จากนั้นเลือกวันที่และชั้นเรียนเพื่อบันทึกการทำเวร ดูผลรายเดือนได้จากหน้าสถิติ</div></div>
  <div class="card"><h3>บัญชีผู้ดูแลระบบ</h3>
    <div class="li"><span>ผู้ใช้ 1: g**</span><span class="small">ซ่อนชื่อผู้ใช้</span></div>
    <div class="li"><span>ผู้ใช้ 2: r**</span><span class="small">ซ่อนชื่อผู้ใช้</span></div>
    <div class="li" style="border:0"><span>ผู้ใช้ 3: y**</span><span class="small">ซ่อนชื่อผู้ใช้</span></div>
    <div class="small" style="margin-top:6px">รหัสผ่านไม่แสดงบนหน้าเว็บ — กดปุ่มแอดมินมุมขวาบนแล้วกรอกชื่อผู้ใช้/รหัสผ่าน</div></div>
  <div class="card"><h3>การเข้าถึงระบบ</h3>
    <div class="li"><span><b>โหมดดูอย่างเดียว:</b> สำหรับผู้ใช้ทั่วไป (ไม่สามารถแก้ไขได้)</span></div>
    <div class="li" style="border:0"><span><b>โหมดแอดมิน:</b> กดปุ่มมุมขวาบนเพื่อบันทึก/เช็คชื่อ</span></div></div>`;
}

function check() {
  const sts = classStudents(S.classId), rec = db.attendance[S.date] || {};
  const hol = isOff(S.date) ? `<div class="notice">วันนี้เป็นวันหยุด (${isWeekend(S.date) ? "เสาร์-อาทิตย์" : esc(holidayName(S.date))}) — สถิติจะไม่นับวันนี้</div>` : "";
  return `<h2>เช็คชื่อทำเวร</h2>${lock()}<div class="card">
    <div class="grid2" style="gap:12px"><div><label class="f">วันที่</label><input type="date" value="${S.date}" onchange="setS('date',this.value||todayStr())"></div>
    <div><label class="f">ชั้นเรียน</label>${classSelect(S.classId, "setS.bind(null,'classId')")}</div></div>
    <p class="hint">ติ๊กหรือเลิกติ๊กเพื่อบันทึกสถานะทันที</p>${hol}
    ${isAdmin ? `<div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn sm" onclick="markAll(true)">ติ๊กทั้งหมด</button><button class="btn ghost sm" onclick="markAll(false)">ยกเลิกทั้งหมด</button></div>` : ""}
    ${sts.length ? sts.map(s => `<label class="row"><input type="checkbox" ${rec[s.id] === true ? "checked" : ""} ${isAdmin ? "" : "disabled"} onchange="toggle('${esc(s.id)}',this.checked)"><span>เลขที่ ${s.no} · ${esc(s.name)}</span></label>`).join("") : `<div class="small">ยังไม่มีนักเรียนในชั้นนี้ — เพิ่มได้ที่หน้า "จัดการนักเรียน"</div>`}</div>`;
}
function toggle(id, v) { if (!need()) return render(); (db.attendance[S.date] ||= {})[id] = v; queueSave(); }
function markAll(v) { if (!need()) return; const r = (db.attendance[S.date] ||= {}); classStudents(S.classId).forEach(s => r[s.id] = v); commit(); }

function stats() {
  if (!S.month) S.month = todayStr().slice(0, 7);
  const sts = classStudents(S.classId), per = {}, rows = [];
  sts.forEach(s => per[s.id] = [0, 0]);
  let td = 0, tn = 0;
  monthDays(S.month).filter(d => !isOff(d)).forEach(d => {
    const r = db.attendance[d]; if (!r) return;
    let a = 0, b = 0;
    sts.forEach(s => { if (r[s.id] === true) { a++; per[s.id][0]++; } else if (r[s.id] === false) { b++; per[s.id][1]++; } });
    if (a + b) { rows.push([d, a, b]); td += a; tn += b; }
  });
  const now = new Date(), opts = [];
  for (let k = -12; k < 12; k++) { const d = new Date(now.getFullYear(), now.getMonth() + k, 1), v = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; opts.push(`<option value="${v}" ${v === S.month ? "selected" : ""}>${MONTHS[d.getMonth()]} ${d.getFullYear()}</option>`); }
  const pct = (a, b) => (a + b ? (a / (a + b) * 100).toFixed(1) : "0.0");
  return `<h2>สถิติและรายงานผล</h2><div class="card"><div class="grid2"><div><label class="f">เดือน</label><select onchange="setS('month',this.value)">${opts.join("")}</select></div><div><label class="f">ชั้นเรียน</label>${classSelect(S.classId, "setS.bind(null,'classId')")}</div></div>
    <p class="small" style="margin:12px 0">นับเฉพาะวันที่มีการบันทึกข้อมูล โดยไม่รวมเสาร์–อาทิตย์ วันหยุดพิเศษ และวันหยุดราชการไทยที่กำหนดไว้ในระบบ (วันหยุดที่เปลี่ยนตามปีอื่น ๆ เพิ่มได้ในหน้าวันหยุดพิเศษ)</p>
    <span class="chip">วันที่บันทึก ${rows.length} วัน · ทำเวร ${td} ครั้ง · ไม่ทำเวร ${tn} ครั้ง</span>
    <h3 style="margin:18px 0 8px">สรุปรายวัน</h3><div class="tw"><table><tr><th>วันที่</th><th>คนทำเวร</th><th>คนไม่ทำเวร</th><th>สัดส่วนทำเวร</th><th>สัดส่วนไม่ทำเวร</th></tr>
    ${rows.map(([d, a, b]) => `<tr><td>${dmy(d)}</td><td>${a} คน</td><td>${b} คน</td><td>${pct(a, b)}%</td><td>${pct(b, a)}%</td></tr>`).join("") || `<tr><td colspan="5" class="small">ยังไม่มีข้อมูลในเดือนนี้</td></tr>`}</table></div>
    <h3 style="margin:18px 0 8px">สรุปรายเดือนตามเลขที่</h3><div class="tw"><table><tr><th>เลขที่</th><th>ชื่อ-สกุล</th><th>ทำเวร</th><th>ไม่ทำเวร</th><th>สัดส่วนการทำเวร</th></tr>
    ${sts.map(s => { const [a, b] = per[s.id]; return `<tr><td>${s.no}</td><td>${esc(s.name)}</td><td>${a}</td><td>${b}</td><td><div class="bar"><i style="width:${pct(a, b)}%"></i></div></td></tr>`; }).join("")}</table></div></div>`;
}

function manage() {
  const list = db.students.filter(s => !S.filter || s.classId === S.filter).sort((a, b) => className(a.classId).localeCompare(className(b.classId), "th", { numeric: true }) || a.no - b.no);
  const del = (fn, id) => isAdmin ? `<button class="btn del" onclick="${fn}('${esc(id)}')">ลบ</button>` : "";
  return `<h2>เพิ่มและลบรายชื่อนักเรียน</h2>${lock()}
  <div class="card"><h3>จัดการชั้นเรียน</h3>${isAdmin ? `<label class="f">ชื่อชั้นเรียน</label><div class="form"><input type="text" id="newClass" placeholder="เช่น ม.4/8"><div><button class="btn" onclick="addClass()">เพิ่มชั้นเรียน</button></div></div>` : ""}
    <div style="margin-top:8px">${db.classes.map(c => `<div class="li"><span>${esc(c.name)}</span>${del("delClass", c.id)}</div>`).join("") || `<div class="small">ยังไม่มีชั้นเรียน</div>`}</div></div>
  ${isAdmin ? `<div class="card"><h3>เพิ่มนักเรียน</h3><div class="form"><div class="form2"><div><label class="f">เลขที่</label><input type="number" id="stNo" min="1"></div><div><label class="f">ชั้นเรียน</label>${classSelect(S.classId, "setS.bind(null,'classId')")}</div></div>
    <div><label class="f">ชื่อ-สกุล</label><input type="text" id="stName"></div><div><button class="btn" onclick="addStudent()">เพิ่มนักเรียน</button></div></div></div>` : ""}
  <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px"><h3 style="margin:0">รายชื่อนักเรียนปัจจุบัน</h3><div style="width:150px">${classSelect(S.filter, "setS.bind(null,'filter')", true)}</div></div>
    <div class="tw"><table><tr><th>ชั้นเรียน</th><th>เลขที่</th><th>ชื่อ-สกุล</th>${isAdmin ? "<th>จัดการ</th>" : ""}</tr>
    ${list.map(s => `<tr><td>${esc(className(s.classId))}</td><td>${s.no}</td><td>${esc(s.name)}</td>${isAdmin ? `<td>${del("delStudent", s.id)}</td>` : ""}</tr>`).join("")}</table></div></div>`;
}
function addClass() {
  if (!need()) return;
  const n = $("newClass").value.trim();
  if (!n) return;
  if (db.classes.some(c => c.name === n)) return alert("มีชั้นเรียนนี้อยู่แล้ว");
  const c = { id: uid("c"), name: n }; db.classes.push(c); S.classId = c.id; commit();
}
function delClass(id) {
  if (!need() || !confirm(`ลบชั้นเรียน ${className(id)} และนักเรียนทั้งหมดในชั้นนี้?`)) return;
  const gone = new Set(classStudents(id).map(s => s.id));
  db.students = db.students.filter(s => s.classId !== id); db.classes = db.classes.filter(c => c.id !== id);
  Object.values(db.attendance).forEach(r => gone.forEach(g => delete r[g]));
  S.filter = ""; commit();
}
function addStudent() {
  if (!need()) return;
  const name = $("stName").value.trim();
  if (!S.classId || !name) return alert("เลือกชั้นเรียนและกรอกชื่อ-สกุลให้ครบ");
  const sts = classStudents(S.classId), no = +$("stNo").value || (sts.length ? Math.max(...sts.map(s => s.no)) + 1 : 1);
  if (sts.some(s => s.no === no)) return alert(`เลขที่ ${no} มีในชั้นนี้แล้ว`);
  db.students.push({ id: uid("s"), classId: S.classId, no, name }); commit();
}
function delStudent(id) {
  const s = db.students.find(x => x.id === id);
  if (!need() || !s || !confirm(`ลบ ${s.name} ?`)) return;
  db.students = db.students.filter(x => x.id !== id);
  Object.values(db.attendance).forEach(r => delete r[id]); commit();
}

function holidays() {
  const keys = Object.keys(db.holidays).sort();
  return `<h2>วันหยุดพิเศษ</h2><p class="sub">เสาร์–อาทิตย์และวันหยุดราชการที่ตรงวันเดิมทุกปีมีในระบบแล้ว เพิ่มเฉพาะวันที่เปลี่ยนตามปี เช่น วันพระ หรือวันหยุดชดเชย</p>${lock()}
  ${isAdmin ? `<div class="card"><h3>เพิ่มวันหยุด</h3><div class="form"><div><label class="f">วันที่</label><input type="date" id="hDate"></div><div><label class="f">ชื่อวันหยุด</label><input type="text" id="hName"></div><div><button class="btn" onclick="addHoliday()">เพิ่มวันหยุด</button></div></div></div>` : ""}
  <div class="card"><h3>รายการวันหยุดพิเศษ</h3>${keys.map(k => `<div class="li"><span>${dmy(k)} · ${esc(db.holidays[k])}</span>${isAdmin ? `<button class="btn del" onclick="delHoliday('${esc(k)}')">ลบ</button>` : ""}</div>`).join("") || `<div class="small">ยังไม่มีวันหยุดพิเศษ</div>`}</div>`;
}
function addHoliday() {
  if (!need()) return;
  const d = $("hDate").value, n = $("hName").value.trim();
  if (!d || !n) return alert("กรอกวันที่และชื่อวันหยุดให้ครบ");
  db.holidays[d] = n; commit();
}
function delHoliday(k) { if (!need()) return; delete db.holidays[k]; commit(); }

// ---------- init ----------
document.addEventListener("DOMContentLoaded", async () => {
  S.date = todayStr(); S.month = S.date.slice(0, 7);
  await loadData();
  if (token && CFG.owner && CFG.repo) {
    try { if (await verifyToken(token, `${CFG.owner}/${CFG.repo}`)) { setAdmin(true); return; } } catch (e) {}
    token = ""; localStorage.removeItem("gh_token");
  }
  render();
});
