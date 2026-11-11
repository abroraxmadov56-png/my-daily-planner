import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch,
} from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { AdMob, BannerAdSize, BannerAdPosition } from "@capacitor-community/admob";

const firebaseConfig = {
  apiKey: "AIzaSyAoafvTh_6PASv8SIerfroeSrkuZ4gt7ek",
  authDomain: "://firebaseapp.com",
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

// Android uchun ovozli bildirishnoma belgilash
async function scheduleAndroidNotification(t) {
  if (!Capacitor.isNativePlatform() || t.done) return;
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;

    const [y, m, d] = t.date.split('-').map(Number);
    const [hh, mm] = t.start.split(':').map(Number);
    
    const notifyDate = new Date(y, m - 1, d, hh, mm - 10, 0);
    const exactDate = new Date(y, m - 1, d, hh, mm, 0);
    const baseId = Math.abs(t.id.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)) % 100000;

    const notifs = [];
    if (notifyDate > new Date()) {
      notifs.push({
        title: "10 daqiqadan keyin vazifa!",
        body: `${t.title} (${t.start} - ${t.end})`,
        id: baseId,
        schedule: { at: notifyDate },
        sound: 'default'
      });
    }
    if (exactDate > new Date()) {
      notifs.push({
        title: "Vazifa vaqti keldi!",
        body: `${t.title} (${t.start} - ${t.end})`,
        id: baseId + 1,
        schedule: { at: exactDate },
        sound: 'default'
      });
    }
    if (notifs.length) {
      await LocalNotifications.schedule({ notifications: notifs });
    }
  } catch (err) {
    console.error("Notification xatosi:", err);
  }
}

const taskRef = (id) => doc(db, "users", user.uid, "tasks", id);
function saveTask(t) {
  const { id, ...data } = t;
  setDoc(taskRef(id), data).catch((e) => toast("Saqlab bo'lmadi: " + (e.code || e.message)));
  scheduleAndroidNotification(t);
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

getRedirectResult(auth).catch((e) => {
  $("loginErr").textContent = "Kirishda xatolik: " + e.message;
  $("loginErr").hidden = false;
});

$("loginBtn").onclick = async () => {
  $("loginErr").hidden = true;
  try {
    if (Capacitor.isNativePlatform()) {
      await signInWithRedirect(auth, new GoogleAuthProvider());
    } else {
      await signInWithPopup(auth, new GoogleAuthProvider());
    }
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
  if (withPrio && PRIO[t.prio]) w.append(tag(PRIO[t.prio][0], PRIO[t.prio][1]));
  if (CAT[t.cat]) w.append(tag(CAT[t.cat][0], CAT[t.cat][1]));
  if (withPrio && ENERGY[t.energy]) w.append(tag(ENERGY[t.energy][0], ENERGY[t.energy][1]));
  if (isRep(t) && REPEAT[t.repeat]) w.append(tag("↻ " + REPEAT[t.repeat], "var(--cyan)"));
  return w;
}
function timeTag(t) {
  const s = tag("", null, "time");
  s.append(icon("clock"), t.start + " - " + t.end);
  return s;
}

function searchTasks(q) {}
