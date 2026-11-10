// ===== صفحة الطلاب =====

// تحويل الروابط القديمة (?p=1) للكود الجديد قبل أي شيء
(() => {
  const p = new URLSearchParams(location.search).get("p");
  if (!p || !LEGACY_LINKS[p]) return;
  try {
    const m = JSON.parse(localStorage.getItem("my_regs") || "{}");
    if (m[p] && !m[LEGACY_LINKS[p]]) {
      m[LEGACY_LINKS[p]] = m[p]; delete m[p];
      localStorage.setItem("my_regs", JSON.stringify(m));
    }
  } catch {}
  location.replace(location.pathname + "?p=" + encodeURIComponent(LEGACY_LINKS[p]));
})();

// معرّف ثابت لهذا الجهاز/المتصفح
function getDeviceId() {
  let id = null;
  try { id = localStorage.getItem("device_id"); } catch {}
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2));
    try { localStorage.setItem("device_id", id); } catch {}
  }
  return id;
}
const DEVICE_ID = getDeviceId();

// تسجيلات هذا الجهاز محفوظة محليًا لعرض "أنت" في القائمة
function getMine() {
  try { return JSON.parse(localStorage.getItem("my_regs") || "{}"); } catch { return {}; }
}
function saveMine(code, num) {
  const m = getMine(); m[code] = num;
  try { localStorage.setItem("my_regs", JSON.stringify(m)); } catch {}
}

const PRES_CODE = (new URLSearchParams(location.search).get("p") || "").trim().toLowerCase();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let current = null;      // العرض المحدد من الرابط
let selected = null;     // الرقم المختار

// إخفاء الصفوف المتاحة من القائمة (يُحفظ في المتصفح)
let hideEmpty = false;
try { hideEmpty = localStorage.getItem("hide_empty") === "1"; } catch {}
function updateToggleBtn() {
  $("toggleEmpty").textContent = hideEmpty ? "إظهار المتاح" : "إخفاء المتاح";
  $("toggleEmpty").classList.toggle("on", hideEmpty);
}
updateToggleBtn();
$("toggleEmpty").onclick = () => {
  hideEmpty = !hideEmpty;
  try { localStorage.setItem("hide_empty", hideEmpty ? "1" : "0"); } catch {}
  updateToggleBtn();
  loadRegistrations();
};

function showMsg(text, type) { $("msg").textContent = text; $("msg").className = "msg " + type; }
function clearMsg() { $("msg").className = "msg"; }

function showNotFound() {
  current = null;
  $("main").classList.add("hidden");
  $("noPres").classList.remove("hidden");
}

// يحمّل العرض المحدد بالكود في الرابط ?p=UUID فقط
async function loadPresentation() {
  if (!UUID_RE.test(PRES_CODE)) { showNotFound(); return; }
  const { data, error } = await db.rpc("get_presentation", { p_code: PRES_CODE });
  if (error || !data || !data.length) { showNotFound(); return; }
  current = data[0];
  document.title = current.title + " — تسجيل الترتيب";
  $("main").classList.remove("hidden");
  $("noPres").classList.add("hidden");
}

async function loadRegistrations() {
  if (!current) return;
  const { data, error } = await db.rpc("get_registrations", { p_code: PRES_CODE });
  if (error) { showMsg("تعذّر تحميل التسجيلات: " + error.message, "err"); return; }

  const taken = new Map(data.map(r => [r.order_number, r]));
  const cur = current.current_order || 0;         // آخر دور تم عرضه
  const myNum = getMine()[PRES_CODE];
  const alreadyMine = myNum && taken.has(myNum);
  if (taken.has(selected) || (selected && selected <= cur)) selected = null;

  $("presTitle").textContent = current.title;
  $("presSub").textContent = current.is_open
    ? `${data.length} من ${current.max_slots} مسجّلين`
    : "التسجيل في هذا العرض مغلق";

  // ملاحظة الدور الحالي
  const note = $("turnNote");
  if (cur > 0 && cur < current.max_slots) {
    note.textContent = `العرض وصل للدور ${cur}، اختر رقمًا من ${cur + 1} فما فوق.`;
    note.classList.remove("hidden");
  } else if (cur >= current.max_slots) {
    note.textContent = "انتهت كل الأدوار في هذا العرض.";
    note.classList.remove("hidden");
  } else {
    note.classList.add("hidden");
  }

  // شبكة الأرقام
  const grid = $("grid"); grid.innerHTML = "";
  const locked = !current.is_open || alreadyMine;
  for (let i = 1; i <= current.max_slots; i++) {
    const s = document.createElement("div");
    s.textContent = i;
    const isTaken = taken.has(i);
    const isPassed = !isTaken && i <= cur;
    let cls = "slot";
    if (alreadyMine && i === myNum) cls += " mine";
    else if (isTaken) cls += " taken";
    else if (isPassed) cls += " passed";
    else if (i === selected) cls += " selected";
    s.className = cls;
    if (isTaken) s.title = taken.get(i).student_name;
    else if (isPassed) s.title = "هذا الدور فات";
    if (!isTaken && !isPassed && !locked) s.onclick = () => { selected = i; loadRegistrations(); };
    grid.appendChild(s);
  }

  // حالة النموذج
  $("btn").disabled = locked;
  $("name").disabled = locked;
  if (alreadyMine) showMsg(`سجّلت من هذا الجهاز برقم ${myNum} في هذا العرض.`, "info");
  else if (!current.is_open) showMsg("التسجيل مغلق لهذا العرض.", "info");
  else if ($("msg").classList.contains("info")) clearMsg();

  // القائمة مرتبة من الأول للأخير
  const list = $("list"); list.innerHTML = "";
  for (let i = 1; i <= current.max_slots; i++) {
    const r = taken.get(i);
    if (hideEmpty && !r) continue;   // إخفاء المتاح مع بقاء الأرقام الأصلية

    const li = document.createElement("li");
    const n = document.createElement("span"); n.className = "num"; n.textContent = i;
    const nm = document.createElement("span"); nm.className = "sname";
    const extras = [];

    if (r) {
      nm.textContent = r.student_name;   // textContent يمنع حقن HTML
      const classes = [];
      if (r.done) {
        classes.push("done");
        const b = document.createElement("span"); b.className = "done-badge"; b.textContent = "✓ عرض";
        extras.push(b);
      }
      if (alreadyMine && i === myNum) {
        classes.push("me");
        const tg = document.createElement("span"); tg.className = "tag"; tg.textContent = "أنت";
        extras.push(tg);
      }
      li.className = classes.join(" ");
    } else if (i <= cur) {
      li.className = "empty passed"; nm.textContent = "فات";
    } else {
      li.className = "empty"; nm.textContent = "متاح";
    }
    li.append(n, nm, ...extras);
    list.appendChild(li);
  }

  if (!list.children.length) {
    const li = document.createElement("li"); li.className = "empty";
    li.textContent = "لا يوجد مسجّلين بعد";
    list.appendChild(li);
  }

  $("progress").textContent = `${data.length} / ${current.max_slots}`;
  $("barFill").style.width = (data.length / current.max_slots * 100) + "%";
}

$("form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("name").value.trim().replace(/\s+/g, " ");
  if (!name) return showMsg("اكتب اسمك.", "err");
  if (!selected) return showMsg("اختر رقم ترتيب.", "err");

  const num = selected;
  $("btn").disabled = true;
  const { error } = await db.rpc("register", {
    p_code: PRES_CODE,
    p_name: name,
    p_order: num,
    p_device: DEVICE_ID
  });

  if (error) {
    $("btn").disabled = false;
    const m = error.message || "";
    if (error.code === "23505") {
      if (m.includes("uniq_device")) showMsg("هذا الجهاز سجّل مسبقًا في هذا العرض.", "err");
      else if (m.includes("uniq_name")) showMsg("هذا الاسم مسجّل مسبقًا في هذا العرض.", "err");
      else showMsg(`الرقم ${num} انحجز للتو، اختر رقمًا آخر.`, "err");
    } else if (m.includes("passed")) {
      showMsg(`الدور ${num} فات، اختر رقمًا أكبر.`, "err");
    } else if (m.includes("closed")) {
      showMsg("التسجيل مغلق لهذا العرض.", "err");
    } else if (m.includes("out_of_range")) {
      showMsg("رقم الترتيب خارج النطاق.", "err");
    } else if (m.includes("bad_name")) {
      showMsg("الاسم غير صالح.", "err");
    } else if (m.includes("not_found")) {
      showMsg("العرض غير موجود.", "err");
    } else {
      showMsg("حدث خطأ: " + m, "err");
    }
    await loadPresentation();
    await loadRegistrations();
    return;
  }

  saveMine(PRES_CODE, num);
  $("form").reset();
  selected = null;
  await loadRegistrations();
  showMsg(`تم تسجيل ${name} برقم ${num} ✔`, "ok");
});

$("refresh").onclick = async () => { await loadPresentation(); loadRegistrations(); };

(async () => {
  await loadPresentation();
  if (!current) return;
  await loadRegistrations();
  setInterval(async () => {
    if (document.hidden) return;
    await loadPresentation(); loadRegistrations();
  }, AUTO_REFRESH_SECONDS * 1000);
})();
