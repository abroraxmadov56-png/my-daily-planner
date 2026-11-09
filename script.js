import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAoafvTh_6PASv8SIerfroeSrkuZ4gt7ek",
  authDomain: "my-daily-planner-8e47e.firebaseapp.com",
  projectId: "my-daily-planner-8e47e",
  storageBucket: "my-daily-planner-8e47e.firebasestorage.app",
  messagingSenderId: "268827974787",
  appId: "1:268827974787:web:30b1331844ab0400c18fb6",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  db = getFirestore(app);
}

const MONTHS = ["yanvar","fevral","mart","aprel","may","iyun","iyul","avgust","sentabr","oktabr","noyabr","dekabr"];
const WEEKDAYS = ["Yakshanba","Dushanba","Seshanba","Chorshanba","Payshanba","Juma","Shanba"];
const SHORT = ["Yak","Dush","Sesh","Chor","Pay","Jum","Shan"];
const PRIO = { high: ["Yuqori", "var(--red)"], medium: ["O'rta", "var(--amber)"], low: ["Past", "var(--green)"] };
const REPEAT = { daily: "Har kuni", weekdays: "Ish kunlari", weekly: "Har hafta" };
const CAT = { work: ["Ish", "var(--blue)"], health: ["Sog'liq", "var(--ink)"], personal: ["Shaxsiy", "var(--pink)"] };
const ENERGY = { high: ["Yuqori energiya", "var(--purple)"], medium: ["O'rta energiya", "var(--cyan)"], low: ["Past energiya", "var(--muted)"] };

const S = (p) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>";
const ICONS = {
  check: S('<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  cal: S('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  left: S('<path d="m15 18-6-6 6-6"/>'),
  right: S('<path d="m9 18 6-6-6-6"/>'),
  clock: S('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  trend: S('<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>'),
  bolt: S('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'),
  sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: S('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>'),
  bell: S('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  out: S('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'),
};

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function icon(name) { const s = el("span"); s.innerHTML = ICONS[name]; return s.firstChild; }

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}

let user = null;
let authReady = false;
let tasks = [];
let unsub = null;
let view = "today";
let sel = midnight(new Date());
let weekRef = midnight(new Date());
let statRef = midnight(new Date());
let editId = null;

const taskRef = (id) => doc(db, "users", user.uid, "tasks", id);
function saveTask(t) {
  const { id, ...data } = t;
  setDoc(taskRef(id), data).catch((e) => toast("Saqlab bo'lmadi: " + (e.code || e.message)));
}
function removeTask(id) {
  deleteDoc(taskRef(id)).catch((e) => toast("O'chirib bo'lmadi: " + (e.code || e.message)));
}

function migrateLocal(snap) {
  const flag = "planner.migrated." + user.uid;
  try {
    if (localStorage.getItem(flag)) return;
    localStorage.setItem(flag, "1");
    if (!snap.empty) return;
    const old = JSON.parse(localStorage.getItem("planner.v3") || "[]");
    const mine = (Array.isArray(old) ? old : []).filter((t) => Number(t.id) > 3);
    if (!mine.length) return;
    const batch = writeBatch(db);
    mine.forEach((t) => {
      const { id, ...data } = t;
      batch.set(taskRef(newId()), data);
    });
    batch.commit().then(() => toast(mine.length + " ta eski vazifa bulutga ko'chirildi."));
  } catch (e) {}
}

function listen() {
  let first = true;
  unsub = onSnapshot(
    collection(db, "users", user.uid, "tasks"),
    (snap) => {
      tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (first && !snap.metadata.fromCache) { first = false; migrateLocal(snap); }
      render();
    },
    (e) => toast("Ma'lumotlarni o'qib bo'lmadi: " + (e.code || e.message))
  );
}

onAuthStateChanged(auth, (u) => {
  if (unsub) { unsub(); unsub = null; }
  user = u;
  authReady = true;
  tasks = [];
  if (u) listen();
  $("logout").title = u ? "Chiqish (" + (u.email || "") + ")" : "Chiqish";
  render();
});

$("loginBtn").onclick = async () => {
  $("loginErr").hidden = true;
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    const msgs = {
      "auth/popup-blocked": "Brauzer oynani blokladi. Ruxsat bering va qayta urinib ko'ring.",
      "auth/unauthorized-domain": "Bu sayt manzili Firebase'da ruxsat etilmagan.",
      "auth/network-request-failed": "Internet bilan aloqa yo'q.",
    };
    $("loginErr").textContent = msgs[e.code] || "Kirishda xatolik: " + e.code;
    $("loginErr").hidden = false;
  }
};
$("logout").onclick = () => { if (confirm("Hisobdan chiqasizmi?")) signOut(auth); };

const isRep = (t) => !!t.repeat && t.repeat !== "none";
function occursOn(t, d) {
  const k = keyOf(d);
  if (!isRep(t)) return t.date === k;
  if (k < t.date) return false;
  if (t.until && k > t.until) return false;
  if (t.skip && t.skip.includes(k)) return false;
  if (t.repeat === "daily") return true;
  if (t.repeat === "weekdays") return d.getDay() >= 1 && d.getDay() <= 5;
  if (t.repeat === "weekly") return d.getDay() === parse(t.date).getDay();
  return false;
}
const forDay = (d) => {
  const k = keyOf(d);
  return tasks
    .filter((t) => occursOn(t, d))
    .map((t) => (isRep(t) ? { ...t, done: (t.doneDates || []).includes(k), occ: k, src: t } : t))
    .sort((a, b) => a.start.localeCompare(b.start));
};
function toggleDone(t) {
  if (t.src) {
    const s = t.src, dd = s.doneDates || [];
    s.doneDates = dd.includes(t.occ) ? dd.filter((x) => x !== t.occ) : [...dd, t.occ];
    saveTask(s);
  } else {
    t.done = !t.done;
    saveTask(t);
  }
  render();
}
const dayLabel = (d) => d.getDate() + "-" + MONTHS[d.getMonth()];

function tag(text, color, cls) {
  const s = el("span", "tag" + (cls ? " " + cls : ""), text);
  if (color) s.style.setProperty("--c", color);
  return s;
}
function tagsFor(t, withPrio) {
  const w = el("div", "tags");
  if (withPrio) w.append(tag(PRIO[t.prio][0], PRIO[t.prio][1]));
  w.append(tag(CAT[t.cat][0], CAT[t.cat][1]));
  if (withPrio) w.append(tag(ENERGY[t.energy][0], ENERGY[t.energy][1]));
  if (isRep(t) && REPEAT[t.repeat]) w.append(tag("↻ " + REPEAT[t.repeat], "var(--cyan)"));
  return w;
}
function timeTag(t) {
  const s = tag("", null, "time");
  s.append(icon("clock"), t.start + " - " + t.end);
  return s;
}

function searchTasks(q) {
  const todayD = midnight(new Date());
  const out = [];
  tasks.forEach((t) => {
    if (!(t.title || "").toLowerCase().includes(q)) return;
    if (!isRep(t)) { out.push(t); return; }
    // takrorlanuvchi vazifa: bugundan keyingi eng yaqin kuni (topilmasa, boshlangan kuni)
    let d = parse(t.date) > todayD ? parse(t.date) : todayD;
    let found = null;
    for (let i = 0; i < 400; i++) {
      if (occursOn(t, d)) { found = d; break; }
      d = addDays(d, 1);
    }
    const k = found ? keyOf(found) : t.date;
    out.push({ ...t, done: (t.doneDates || []).includes(k), occ: k, src: t });
  });
  return out.sort((a, b) => {
    const ka = a.occ || a.date, kb = b.occ || b.date;
    return ka === kb ? a.start.localeCompare(b.start) : kb.localeCompare(ka);
  });
}

function renderToday() {
  const isToday = keyOf(sel) === keyOf(new Date());
  $("tTitle").textContent = isToday ? "Bugungi fokus" : "Kun rejasi";
  $("tDate").textContent = WEEKDAYS[sel.getDay()] + ", " + dayLabel(sel) + ", " + sel.getFullYear();

  const list = forDay(sel);
  const stats = [
    ["Yuqori muhimlik", list.filter((t) => t.prio === "high").length, "trend", "var(--red)"],
    ["Jami vazifalar", list.length, "clock", "var(--cyan)"],
    ["Yuqori energiya", list.filter((t) => t.energy === "high").length, "bolt", "var(--purple)"],
  ];
  const box = $("stats");
  box.innerHTML = "";
  stats.forEach(([label, n, ic, c]) => {
    const card = el("div", "stat");
    card.style.setProperty("--c", c);
    const top = el("div", "top");
    const i = el("span", "ic");
    i.append(icon(ic));
    top.append(i, label);
    card.append(top, el("b", "", String(n)));
    box.append(card);
  });

  const query = $("q").value.trim().toLowerCase();
  $("stats").hidden = !!query;
  $("listTitle").textContent = query ? "Qidiruv natijalari" : "Sizning vazifalaringiz";
  const shown = query ? searchTasks(query) : list;
  const ul = $("list");
  ul.innerHTML = "";
  if (!shown.length) ul.append(el("div", "empty", query ? "Hech narsa topilmadi." : "Bu kunga vazifa yo'q. «Vazifa qo'shish» tugmasini bosing."));
  shown.forEach((t) => {
    const row = el("div", "task" + (t.done ? " done" : ""));
    const cb = el("button", "box");
    cb.type = "button";
    cb.setAttribute("aria-label", t.done ? "Bajarilmagan deb belgilash" : "Bajarildi deb belgilash");
    if (t.done) cb.append(icon("check"));
    cb.onclick = (e) => { e.stopPropagation(); toggleDone(t); };
    const body = el("div", "tbody");
    const tags = tagsFor(t, true);
    tags.append(timeTag(t));
    if (query) {
      const dd = parse(t.occ || t.date);
      tags.append(tag(dayLabel(dd) + " " + dd.getFullYear(), null, "time"));
    }
    body.append(el("p", "ttl", t.title), tags);
    const del = el("button", "del", "×");
    del.type = "button";
    del.setAttribute("aria-label", "O'chirish");
    del.onclick = (e) => {
      e.stopPropagation();
      if (t.src) {
        const s = t.src;
        if (confirm("Faqat shu kundagi vazifani o'chirasizmi?\n(Bekor qilsangiz, butun takrorlanuvchi vazifani o'chirish taklif qilinadi.)")) {
          s.skip = [...(s.skip || []), t.occ];
          saveTask(s);
          render();
        } else if (confirm("Butun takrorlanuvchi vazifani barcha kunlardan o'chirasizmi?")) {
          tasks = tasks.filter((x) => x.id !== s.id);
          removeTask(s.id);
          render();
        }
      } else if (confirm("Bu vazifani o'chirasizmi?")) {
        tasks = tasks.filter((x) => x.id !== t.id);
        removeTask(t.id);
        render();
      }
    };
    row.onclick = () => openForm(t);
    row.append(cb, body, del);
    ul.append(row);
  });
}

function renderCal() {
  const start = addDays(weekRef, -((weekRef.getDay() + 6) % 7));
  const end = addDays(start, 6);
  $("range").textContent = start.getMonth() === end.getMonth()
    ? start.getDate() + " - " + dayLabel(end) + ", " + end.getFullYear()
    : dayLabel(start) + " - " + dayLabel(end) + ", " + end.getFullYear();

  const wk = $("week");
  wk.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const col = el("div", "col" + (keyOf(d) === keyOf(new Date()) ? " today" : ""));
    const dh = el("button", "dh");
    dh.type = "button";
    dh.append(el("small", "", SHORT[d.getDay()]), el("b", "", String(d.getDate())));
    dh.onclick = () => { sel = d; setView("today"); };
    const items = el("div", "items");
    const list = forDay(d);
    if (!list.length) items.append(el("p", "none", "Reja yo'q"));
    list.forEach((t) => {
      const m = el("div", "mini" + (t.done ? " done" : ""));
      const p = el("p");
      const dot = el("span", "dot");
      dot.style.setProperty("--c", PRIO[t.prio][1]);
      p.append(dot, t.title);
      m.append(p, el("p", "t", t.start + " - " + t.end), tagsFor(t, false));
      m.onclick = () => openForm(t);
      items.append(m);
    });
    col.append(dh, items);
    wk.append(col);
  }
}

function barRows(box, defs, field, items) {
  box.innerHTML = "";
  Object.entries(defs).forEach(([key, [label, color]]) => {
    const group = items.filter((t) => t[field] === key);
    const done = group.filter((t) => t.done).length;
    const row = el("div", "brow");
    row.style.setProperty("--c", color);
    const track = el("div", "btk");
    const fill = el("i");
    fill.style.width = group.length ? Math.round((done * 100) / group.length) + "%" : "0%";
    track.append(fill);
    row.append(el("span", "", label), track, el("span", "", done + "/" + group.length));
    box.append(row);
  });
}

function renderStats() {
  const start = addDays(statRef, -((statRef.getDay() + 6) % 7));
  const end = addDays(start, 6);
  $("sRange").textContent = start.getMonth() === end.getMonth()
    ? start.getDate() + " - " + dayLabel(end) + ", " + end.getFullYear()
    : dayLabel(start) + " - " + dayLabel(end) + ", " + end.getFullYear();

  const days = [];
  for (let i = 0; i < 7; i++) { const d = addDays(start, i); days.push({ d, list: forDay(d) }); }
  const all = days.flatMap((x) => x.list);
  const done = all.filter((t) => t.done).length;
  const pct = all.length ? Math.round((done * 100) / all.length) : 0;

  const cards = $("sCards");
  cards.innerHTML = "";
  [
    ["Jami vazifalar", String(all.length), "clock", "var(--cyan)"],
    ["Bajarilgan", String(done), "check", "var(--green)"],
    ["Natija", pct + "%", "trend", "var(--purple)"],
  ].forEach(([label, val, ic, c]) => {
    const card = el("div", "stat");
    card.style.setProperty("--c", c);
    const top = el("div", "top");
    const i = el("span", "ic");
    i.append(icon(ic));
    top.append(i, label);
    card.append(top, el("b", "", val));
    cards.append(card);
  });

  const chart = $("sChart");
  chart.innerHTML = "";
  const max = Math.max(1, ...days.map((x) => x.list.length));
  days.forEach(({ d, list }) => {
    const dn = list.filter((t) => t.done).length;
    const col = el("button", "bcol" + (keyOf(d) === keyOf(new Date()) ? " today" : ""));
    col.type = "button";
    col.setAttribute("aria-label", dayLabel(d) + ": " + dn + "/" + list.length);
    const track = el("div", "btrack");
    const bar = el("div", "bar");
    bar.style.height = list.length ? Math.max(6, (list.length / max) * 100) + "%" : "4px";
    const fill = el("i");
    fill.style.height = list.length ? Math.round((dn * 100) / list.length) + "%" : "0%";
    bar.append(fill);
    track.append(bar);
    col.append(track, el("span", "cnt", dn + "/" + list.length), el("b", "", String(d.getDate())), el("small", "", SHORT[d.getDay()]));
    col.onclick = () => { sel = d; setView("today"); };
    chart.append(col);
  });

  barRows($("sCat"), CAT, "cat", all);
  barRows($("sPrio"), PRIO, "prio", all);
}

function render() {
  const inn = !!user;
  $("vLogin").hidden = !(authReady && !inn);
  document.querySelector(".tabs").hidden = !inn;
  $("logout").hidden = !inn;
  $("bell").hidden = !inn || !("Notification" in window);
  $("vToday").hidden = !inn || view !== "today";
  $("vCal").hidden = !inn || view !== "cal";
  $("vStats").hidden = !inn || view !== "stats";
  document.querySelectorAll(".tab").forEach((b) => {
    if (b.dataset.view === view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  if (!inn) return;
  if (view === "today") renderToday(); else if (view === "cal") renderCal(); else renderStats();
}
function setView(v) { view = v; render(); window.scrollTo(0, 0); }

const dlg = $("dlg");
function openForm(occ) {
  const t = occ ? (occ.src || occ) : null;
  editId = t ? t.id : null;
  $("dlgTitle").textContent = t ? "Vazifani tahrirlash" : "Yangi vazifa";
  $("fTitle").value = t ? t.title : "";
  $("fDate").value = t ? t.date : keyOf(view === "today" ? sel : new Date());
  $("fStart").value = t ? t.start : "09:00";
  $("fEnd").value = t ? t.end : "10:00";
  $("fPrio").value = t ? t.prio : "medium";
  $("fCat").value = t ? t.cat : "work";
  $("fEnergy").value = t ? t.energy : "medium";
  $("fRepeat").value = t && isRep(t) ? t.repeat : "none";
  $("fUntil").value = t && t.until ? t.until : "";
  $("fErr").hidden = true;
  syncRepeat();
  dlg.showModal();
  $("fTitle").focus();
}
function syncRepeat() { $("lUntil").hidden = $("fRepeat").value === "none"; }
$("fRepeat").onchange = syncRepeat;
$("addBtn").onclick = () => openForm(null);
$("fCancel").onclick = () => dlg.close();
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

$("form").onsubmit = (e) => {
  e.preventDefault();
  const title = $("fTitle").value.trim();
  if (!title) return;
  if ($("fEnd").value <= $("fStart").value) {
    $("fErr").textContent = "Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak.";
    $("fErr").hidden = false;
    return;
  }
  const rep = $("fRepeat").value;
  if (rep !== "none" && $("fUntil").value && $("fUntil").value < $("fDate").value) {
    $("fErr").textContent = "Tugash sanasi boshlanish sanasidan oldin bo'lmasligi kerak.";
    $("fErr").hidden = false;
    return;
  }
  const data = {
    repeat: rep, until: rep === "none" ? "" : $("fUntil").value,
    title, date: $("fDate").value, start: $("fStart").value, end: $("fEnd").value,
    prio: $("fPrio").value, cat: $("fCat").value, energy: $("fEnergy").value,
  };
  let t = editId ? tasks.find((x) => x.id === editId) : null;
  if (t) Object.assign(t, data);
  else { t = { id: newId(), done: false, ...data }; tasks.push(t); }
  saveTask(t);
  dlg.close();
  sel = parse(data.date);
  weekRef = sel;
  render();
};

document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$("q").oninput = () => render();
$("goToday").onclick = () => { weekRef = midnight(new Date()); render(); };
$("sToday").onclick = () => { statRef = midnight(new Date()); render(); };
$("sprev").onclick = () => { statRef = addDays(statRef, -7); render(); };
$("snext").onclick = () => { statRef = addDays(statRef, 7); render(); };
$("cprev").onclick = () => { weekRef = addDays(weekRef, -7); render(); };
$("cnext").onclick = () => { weekRef = addDays(weekRef, 7); render(); };

document.querySelectorAll("[data-i]").forEach((n) => { n.innerHTML = ICONS[n.dataset.i] + n.innerHTML; });

// ===== Eslatmalar =====
const LEAD = 10; // vazifadan necha daqiqa oldin eslatish
let fired = {};
try { fired = JSON.parse(localStorage.getItem("planner.fired") || "{}"); } catch (e) {}
function markFired(k) {
  fired[k] = Date.now();
  const cut = Date.now() - 2 * 86400000;
  Object.keys(fired).forEach((x) => { if (fired[x] < cut) delete fired[x]; });
  try { localStorage.setItem("planner.fired", JSON.stringify(fired)); } catch (e) {}
}
const notifOk = () => "Notification" in window && Notification.permission === "granted";
function updateBell() {
  const b = $("bell");
  b.classList.toggle("off", !notifOk());
  b.title = notifOk() ? "Eslatmalar yoqilgan" : "Eslatmalarni yoqish";
}
async function notify(title, body, tag) {
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) { await reg.showNotification(title, { body, tag, icon: "icon-192.png", badge: "icon-192.png" }); return; }
  } catch (e) {}
  try { new Notification(title, { body, tag, icon: "icon-192.png" }); } catch (e) {}
}
function checkReminders() {
  if (!user || !notifOk()) return;
  const now = new Date();
  const today = keyOf(now);
  const mins = now.getHours() * 60 + now.getMinutes();
  forDay(now).forEach((t) => {
    if (t.done || !t.start) return;
    const [h, m] = t.start.split(":").map(Number);
    const st = h * 60 + m;
    const kPre = t.id + ":" + today + ":pre";
    const kNow = t.id + ":" + today + ":now";
    if (mins >= st && mins < st + 5 && !fired[kNow]) {
      markFired(kNow); markFired(kPre);
      notify("Vazifa vaqti keldi", t.title + " (" + t.start + " - " + t.end + ")", kNow);
    } else if (mins >= st - LEAD && mins < st && !fired[kPre]) {
      markFired(kPre);
      notify(LEAD + " daqiqadan keyin", t.title + " (" + t.start + ")", kPre);
    }
  });
}
$("bell").onclick = async () => {
  if (!("Notification" in window)) return;
  if (Notification.permission === "denied") {
    toast("Bildirishnoma bloklangan. Brauzer yoki telefon sozlamalaridan ruxsat bering.");
    return;
  }
  if (!notifOk()) {
    const p = await Notification.requestPermission();
    updateBell();
    if (p === "granted") notify("Eslatmalar yoqildi", "Vazifadan " + LEAD + " daqiqa oldin va boshlanganda xabar olasiz.", "welcome");
    return;
  }
  toast("Eslatmalar yoqilgan.");
};
setInterval(checkReminders, 20000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkReminders(); });
updateBell();

const root = document.documentElement;
let theme = "dark";
try { theme = localStorage.getItem("planner.theme") || "dark"; } catch (e) {}
function applyTheme() {
  root.dataset.theme = theme;
  $("theme").innerHTML = ICONS[theme === "dark" ? "sun" : "moon"];
}
$("theme").onclick = () => {
  theme = theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("planner.theme", theme); } catch (e) {}
  applyTheme();
};
applyTheme();
render();