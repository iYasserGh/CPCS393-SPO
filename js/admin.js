// ===== صفحة مسؤول العرض =====

let presentations = [];
let currentId = null;
let roster = [];
let busy = new Set();       // صفوف قيد الحفظ (ما نحدّثها أثناء الحفظ)
let refreshTimer = null;

try { currentId = Number(localStorage.getItem("admin_pres")) || null; } catch {}

// التاريخ والوقت بتوقيت الرياض وبالتقويم الميلادي
const timeFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  timeZone: "Asia/Riyadh",
  weekday: "long", day: "numeric", month: "long",
  hour: "numeric", minute: "2-digit"
});

function msg(el, text, type) { $(el).textContent = text; $(el).className = "msg " + type; }
function clear(el) { $(el).className = "msg"; }

// ---------- الدخول والخروج ----------

function showLogin() {
  stopRefresh();
  $("appView").classList.add("hidden");
  $("logout").classList.add("hidden");
  $("loginView").classList.remove("hidden");
  setTimeout(() => $("pw").focus(), 50);
}

async function showApp() {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("logout").classList.remove("hidden");
  $("headSub").classList.remove("hidden");
  await loadPresentations();
  await loadRoster();
  startRefresh();
}

// يتأكد إن المستخدم المسجّل موجود في جدول admins
async function verifyAdmin() {
  const { data, error } = await db.rpc("is_admin");
  return !error && data === true;
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const password = $("pw").value;
  if (!password) return;
  $("loginBtn").disabled = true;
  clear("loginMsg");

  const { error } = await db.auth.signInWithPassword({ email: ADMIN_EMAIL, password });
  if (error) {
    $("loginBtn").disabled = false;
    if (error.status === 429) msg("loginMsg", "محاولات كثيرة، انتظر قليلًا ثم حاول.", "err");
    else msg("loginMsg", "كلمة السر غير صحيحة.", "err");
    return;
  }

  if (!(await verifyAdmin())) {
    await db.auth.signOut();
    $("loginBtn").disabled = false;
    msg("loginMsg", "هذا الحساب ليس له صلاحية المسؤول.", "err");
    return;
  }

  $("pw").value = "";
  $("loginBtn").disabled = false;
  showApp();
});

$("logout").onclick = async () => {
  await db.auth.signOut();
  showLogin();
};

// ---------- العروض ----------

async function loadPresentations() {
  const { data, error } = await db
    .from("presentations")
    .select("id, title, max_slots, is_open, code")
    .order("created_at", { ascending: true });
  if (error) { msg("appMsg", "تعذّر تحميل العروض: " + error.message, "err"); return; }
  presentations = data;

  if (!presentations.length) {
    $("noPres").classList.remove("hidden");
    $("presCard").classList.add("hidden");
    $("tabs").innerHTML = "";
    currentId = null;
    return;
  }
  $("noPres").classList.add("hidden");
  $("presCard").classList.remove("hidden");

  if (!presentations.some(p => p.id === currentId)) currentId = presentations[0].id;
  renderTabs();
}

function renderTabs(scrollToActive = false) {
  // const tabs = $("tabs"); tabs.innerHTML = "";
  const tabs = $("tabs");
  const keepLeft = tabs.scrollLeft;
  tabs.innerHTML = "";
  presentations.forEach(p => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (p.id === currentId ? " active" : "");
    if (!p.is_open) {
      const dot = document.createElement("span"); dot.className = "closed-dot"; dot.title = "التسجيل مغلق";
      b.appendChild(dot);
    }
    b.append(document.createTextNode(p.title));
    b.onclick = () => {
      if (p.id === currentId) return;
      currentId = p.id;
      try { localStorage.setItem("admin_pres", String(p.id)); } catch {}
      roster = [];
      renderTabs(true); renderRoster(); loadRoster();
    };
    tabs.appendChild(b);
  });
  // const active = tabs.querySelector(".chip.active");
  // if (active) active.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (!scrollToActive) tabs.scrollLeft = keepLeft;
  const active = tabs.querySelector(".chip.active");
  if (active && scrollToActive) {
    const t = tabs.getBoundingClientRect(), a = active.getBoundingClientRect();
    if (a.left < t.left || a.right > t.right) {
      tabs.scrollBy({ left: a.left - t.left - 16, behavior: "smooth" });
    }
  }
}

function currentPres() { return presentations.find(p => p.id === currentId); }

// ---------- قائمة الطلاب ----------

async function loadRoster() {
  if (!currentId) return;
  const id = currentId;
  const { data, error } = await db
    .from("registrations")
    .select("id, student_name, order_number, done_at")
    .eq("presentation_id", id)
    .order("order_number", { ascending: true });
  if (id !== currentId) return;   // تغيّر التبويب أثناء التحميل
  if (error) { msg("appMsg", "تعذّر تحميل الطلاب: " + error.message, "err"); return; }

  // نحتفظ بالحالة المحلية للصفوف اللي قيد الحفظ
  const local = new Map(roster.map(r => [r.id, r]));
  roster = data.map(r => busy.has(r.id) && local.has(r.id) ? local.get(r.id) : r);
  renderRoster();
}

function renderRoster() {
  const p = currentPres();
  if (!p) return;
  $("pTitle").textContent = p.title;

  const done = roster.filter(r => r.done_at).length;
  const stats = $("stats"); stats.innerHTML = "";
  [["المسجّلين", `${roster.length} / ${p.max_slots}`], ["تم العرض", done], ["المتبقي", roster.length - done]]
    .forEach(([label, val]) => {
      const s = document.createElement("span");
      s.append(label + ": ");
      const b = document.createElement("b"); b.textContent = val; s.appendChild(b);
      stats.appendChild(s);
    });
  if (!p.is_open) {
    const s = document.createElement("span"); s.style.color = "var(--err)"; s.textContent = "التسجيل مغلق";
    stats.appendChild(s);
  }
  $("barFill").style.width = (roster.length ? done / roster.length * 100 : 0) + "%";

  const list = $("roster"); list.innerHTML = "";
  if (!roster.length) {
    const li = document.createElement("li");
    li.className = "empty-state"; li.style.justifyContent = "center";
    li.textContent = "لا يوجد طلاب مسجّلين في هذا العرض بعد.";
    list.appendChild(li);
    return;
  }

  roster.forEach(r => {
    const li = document.createElement("li");
    if (r.done_at) li.className = "done";

    const n = document.createElement("span"); n.className = "num"; n.textContent = r.order_number;

    const info = document.createElement("div"); info.className = "info";
    const nm = document.createElement("span"); nm.className = "sname"; nm.textContent = r.student_name;
    const t = document.createElement("span");
    if (r.done_at) { t.className = "time"; t.textContent = "✓ " + timeFmt.format(new Date(r.done_at)); }
    else { t.className = "time pending"; t.textContent = "لم يعرض بعد"; }
    info.append(nm, t);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "check";
    btn.textContent = "✓";
    btn.setAttribute("aria-pressed", r.done_at ? "true" : "false");
    btn.setAttribute("aria-label", (r.done_at ? "التراجع عن عرض " : "تم عرض ") + r.student_name);
    btn.disabled = busy.has(r.id);
    btn.onclick = () => toggleDone(r);

    li.append(n, info, btn);
    list.appendChild(li);
  });
}

async function toggleDone(r) {
  if (busy.has(r.id)) return;
  const wasDone = !!r.done_at;
  busy.add(r.id);
  clear("appMsg");

  // تحديث فوري في الواجهة، والوقت الفعلي يرجع من الخادم
  r.done_at = wasDone ? null : new Date().toISOString();
  renderRoster();

  const { data, error } = await db
    .from("registrations")
    .update({ done_at: wasDone ? null : new Date().toISOString() })
    .eq("id", r.id)
    .select("done_at")
    .single();

  busy.delete(r.id);
  if (error) {
    r.done_at = wasDone ? new Date().toISOString() : null;
    msg("appMsg", "لم يتم الحفظ: " + (error.message || "تحقق من الاتصال والصلاحيات."), "err");
    await loadRoster();
    return;
  }
  r.done_at = data.done_at;   // وقت الخادم
  renderRoster();
}

// ---------- نسخ رابط الطلاب ----------

$("copyLink").onclick = async () => {
  const p = currentPres();
  if (!p) return;
  const url = new URL("../?p=" + p.code, location.href).href;
  const btn = $("copyLink");
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = "تم النسخ ✓"; btn.classList.add("copied");
  } catch {
    prompt("انسخ الرابط:", url);
  }
  setTimeout(() => { btn.textContent = "نسخ رابط الطلاب"; btn.classList.remove("copied"); }, 2000);
};

// ---------- التحديث التلقائي ----------

function startRefresh() {
  stopRefresh();
  refreshTimer = setInterval(async () => {
    if (document.hidden || busy.size) return;
    await loadPresentations();
    await loadRoster();
  }, AUTO_REFRESH_SECONDS * 1000);
}
function stopRefresh() { if (refreshTimer) clearInterval(refreshTimer); refreshTimer = null; }

// انتهاء الجلسة أو الخروج من تبويب آخر
db.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") showLogin();
});

// ---------- البداية ----------

(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (session && await verifyAdmin()) showApp();
  else {
    if (session) await db.auth.signOut();
    showLogin();
  }
})();
