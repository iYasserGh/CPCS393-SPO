// ===== الإعدادات العامة (مشتركة بين صفحة الطلاب وصفحة المسؤول) =====
const SUPABASE_URL = "https://zrrrtcjcwbhzlxwmpwiq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Qm50drcQBVJraFsW36beig_1LKNuV6j";

// إيميل حساب المسؤول اللي أنشأته في Supabase → Authentication → Users
// (المسؤول يكتب كلمة السر فقط، والإيميل يُرسل تلقائيًا)
const ADMIN_EMAIL = "ya3sa6@gmail.com";

// كل كم ثانية تتحدث البيانات تلقائيًا
const AUTO_REFRESH_SECONDS = 10;

// روابط قديمة بأرقام تُحوَّل للكود الجديد، مثال:
// const LEGACY_LINKS = { "1": "uuid-code-here" };
const LEGACY_LINKS = {};
// =====================================================================

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
