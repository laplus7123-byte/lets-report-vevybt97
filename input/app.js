/* Let's 工数カウンター 管理画面 */
const { yen, hm, fmtDate } = Kosu;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const today = () => Kosu.isoDate(new Date());
const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const SHARE_URL = "https://laplus7123-byte.github.io/lets-report-vevybt97/";
const state = { data: null, rev: "", page: "dash", periodId: null, filterCat: "all", q: "", editingId: null, saving: false };
window.state = state;
let tickTimer = null;

const PAGES = {
  dash: { title: "ダッシュボード", icon: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>' },
  log: { title: "依頼ログ", icon: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>' },
  report: { title: "先方ページ", icon: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>' },
  settings: { title: "期間・料金", icon: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>' },
};

/* ---------- データ ---------- */

async function load() {
  const { data, sha } = await Store.read();
  state.data = data;
  state.rev = sha;
  const ps = state.data.periods;
  if (!ps.find((p) => p.id === state.periodId)) {
    state.periodId = (Kosu.periodFor(state.data, today()) || ps[ps.length - 1] || {}).id || null;
  }
}

async function save(message) {
  if (state.saving) return false;
  state.saving = true;
  $("#saved").textContent = "保存中…";
  state.data.updatedAt = new Date().toISOString();
  try {
    state.rev = await Store.write(state.data, state.rev, message || "更新");
  } catch (e) {
    $("#saved").textContent = "";
    alert(e.message);
    if (e.conflict) { await load(); render(); }
    if (e.auth) showSetup(e.message);
    return false;
  } finally {
    state.saving = false;
  }
  const now = new Date();
  $("#saved").textContent = `保存 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (message) toast(message);
  return true;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.hidden = true), 2600);
}

function period() {
  return state.data.periods.find((p) => p.id === state.periodId) || null;
}

function settings() {
  return state.data.settings;
}

function pricePreview(minutes) {
  const s = settings();
  if (!(minutes > 0)) return "";
  const u = Kosu.units(minutes, s);
  return `${hm(minutes)} → ${u}枠 ${yen(u * s.unitPrice)}`;
}

/* ---------- 共通の部品 ---------- */

function timerHtml() {
  const t = state.data.timer;
  if (t) {
    return `<div class="timer on">
      <div class="timer-main">
        <span class="fr-pill info">計測中</span>
        <b class="timer-req">${esc(t.request)}</b>
        <span class="timer-cat">${esc(t.category || "")}</span>
      </div>
      <div class="timer-clock"><b id="timerClock">0:00:00</b><span id="timerCost"></span></div>
      <div class="timer-act">
        <button class="quiet" data-act="timer-cancel">取り消す</button>
        <button class="primary" data-act="timer-stop">停止して記録</button>
      </div>
    </div>`;
  }
  return `<form class="timer" id="timerForm">
    <div class="fr-field grow"><span class="fr-label">いま対応する依頼</span>
      <input name="request" list="reqList" placeholder="例：TCB糸リフトLP FV差し替え" required></div>
    <div class="fr-field"><span class="fr-label">区分</span>${categorySelect("category")}</div>
    <button class="primary" type="submit">計測を始める</button>
  </form>`;
}

function categorySelect(name, value = "") {
  const cats = settings().categories || [];
  const opts = cats.includes(value) || !value ? cats : [...cats, value];
  return `<select name="${name}">${opts.map((c) => `<option${c === value ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>`;
}

function requestDatalist() {
  const names = [...new Set([...state.data.entries].reverse().map((e) => e.request).filter(Boolean))];
  return `<datalist id="reqList">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>`;
}

function tick() {
  const t = state.data?.timer;
  const clock = $("#timerClock");
  if (!t || !clock) return;
  const sec = Math.max(0, Math.floor((Date.now() - new Date(t.startedAt)) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  clock.textContent = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  $("#timerCost").textContent = pricePreview(Math.max(1, Math.ceil(sec / 60)));
}

function noPeriodNotice() {
  return `<div class="fr-notice">期間がまだありません。<a href="#settings">期間・料金</a>で予算（30万円）の期間を登録してください。</div>`;
}

/* ---------- ダッシュボード ---------- */

function renderDash() {
  const p = period();
  if (!p) return noPeriodNotice();
  const sum = Kosu.summarize(state.data, p, today());
  const s = sum.settings;
  const pct = Math.min(100, Math.round(sum.usedRate * 1000) / 10);
  const over = sum.balance < 0;

  let notice = "";
  if (over) notice = `<div class="fr-notice err">予算を ${yen(-sum.balance)} 超えています。追加の予算か、翌期間への繰り越しを相談してください。</div>`;
  else if (sum.forecast && sum.forecast.beforeEnd && p.end) notice = `<div class="fr-notice warn">このペース（1日あたり ${yen(sum.forecast.perDay)}）だと、${fmtDate(sum.forecast.zeroDay)}ごろに残高がなくなります。期間の終わりは ${fmtDate(p.end)} です。</div>`;
  else if (sum.forecast) notice = `<div class="fr-notice">このペース（1日あたり ${yen(sum.forecast.perDay)}）なら、期間内に残高は残ります。</div>`;

  const catMax = Math.max(1, ...sum.byCategory.map((g) => g.cost));
  const catRows = sum.byCategory.length
    ? sum.byCategory.map((g) => `<div class="cat-row">
        <span class="cat-name">${esc(g.name)}</span>
        <span class="cat-bar"><span style="width:${(g.cost / catMax) * 100}%"></span></span>
        <span class="cat-val">${yen(g.cost)}<small>${hm(g.minutes)}</small></span>
      </div>`).join("")
    : `<p class="empty">まだ記録がありません。</p>`;

  const reqRows = sum.byRequest.map((g) => `<tr>
      <td data-label="依頼">${esc(g.name)}<span class="sub">${fmtDate(g.first)}${g.last !== g.first ? `〜${fmtDate(g.last)}` : ""}</span></td>
      <td data-label="区分"><span class="fr-pill">${esc(g.category || "")}</span></td>
      <td data-label="回数" class="num">${g.count}回</td>
      <td data-label="時間" class="num">${hm(g.minutes)}</td>
      <td data-label="枠" class="num">${g.units}枠</td>
      <td data-label="金額" class="num strong">${yen(g.cost)}</td>
      <td data-label="割合" class="num">${sum.used ? Math.round((g.cost / sum.used) * 100) : 0}%</td>
    </tr>`).join("");

  const recent = [...sum.rows].reverse().slice(0, 5).map((r) => `<tr>
      <td data-label="日付" class="nowrap">${fmtDate(r.date)}</td>
      <td data-label="依頼">${esc(r.request)}${r.detail ? `<span class="sub">${esc(r.detail)}</span>` : ""}</td>
      <td data-label="時間" class="num">${hm(r.minutes)}</td>
      <td data-label="金額" class="num">−${yen(r.cost)}</td>
      <td data-label="残高" class="num strong${r.balance < 0 ? " neg" : ""}">${yen(r.balance)}</td>
    </tr>`).join("");

  return `
    ${timerHtml()}
    <section class="hero">
      <div class="hero-main">
        <span class="hero-label">${over ? "予算超過" : "残高"}</span>
        <b class="${over ? "neg" : ""}">${yen(over ? -sum.balance : sum.balance)}</b>
        <span class="hero-label">予算 ${yen(p.budget)} から ${yen(sum.used)} 使用</span>
      </div>
      <div class="fr-kpis">
        <div class="fr-kpi"><b>${hm(sum.remainMinutes)}</b>残り時間（${sum.remainUnits}枠）</div>
        <div class="fr-kpi"><b>${hm(sum.totalMinutes)}</b>対応した時間（${sum.totalUnits}枠）</div>
        <div class="fr-kpi"><b>${sum.byRequest.length}件</b>依頼（${sum.rows.length}回）</div>
      </div>
    </section>
    <div class="bar"><span style="width:${pct}%"></span></div>
    <p class="bar-cap">使用 ${pct}%　／　${s.unitMinutes}分 ${yen(s.unitPrice)}${s.taxNote ? `（${esc(s.taxNote)}）` : ""}・全${sum.budgetUnits}枠</p>
    ${notice}

    <div class="grid2">
      <section class="panel">
        <h2>残高の推移</h2>
        ${Kosu.balanceChart(sum, { width: innerWidth < 900 ? Math.max(300, innerWidth - 60) : 560, height: 220 })}
      </section>
      <section class="panel">
        <h2>区分ごとの使用額</h2>
        ${catRows}
      </section>
    </div>

    <section class="sec">
      <div class="sec-head"><h2>依頼ごとの工数</h2></div>
      ${sum.byRequest.length ? `<table class="fr-table rtable">
        <thead><tr><th>依頼</th><th>区分</th><th class="num">回数</th><th class="num">時間</th><th class="num">枠</th><th class="num">金額</th><th class="num">割合</th></tr></thead>
        <tbody>${reqRows}</tbody></table>` : `<p class="empty">まだ記録がありません。上の「計測を始める」か、<a href="#log">依頼ログ</a>から記録してください。</p>`}
    </section>

    <section class="sec">
      <div class="sec-head"><h2>最近の記録</h2><a class="fr-btn go" href="#log">依頼ログ</a></div>
      ${recent ? `<table class="fr-table rtable"><thead><tr><th>日付</th><th>依頼</th><th class="num">時間</th><th class="num">金額</th><th class="num">残高</th></tr></thead><tbody>${recent}</tbody></table>` : `<p class="empty">まだ記録がありません。</p>`}
    </section>
    ${requestDatalist()}`;
}

/* ---------- 依頼ログ ---------- */

function entryForm() {
  const e = state.editingId ? state.data.entries.find((x) => x.id === state.editingId) : null;
  const v = e || { date: today(), request: "", category: (settings().categories || [])[0] || "", minutes: "", detail: "" };
  const quick = [20, 40, 60, 90, 120, 180];
  return `<form class="fr-filter entry" id="entryForm">
    <div class="fr-field"><span class="fr-label">日付</span><input type="date" name="date" value="${esc(v.date)}" required></div>
    <div class="fr-field grow"><span class="fr-label">依頼</span><input name="request" list="reqList" value="${esc(v.request)}" placeholder="例：バッテリーLP 料金表の修正" required></div>
    <div class="fr-field"><span class="fr-label">区分</span>${categorySelect("category", v.category)}</div>
    <div class="fr-field"><span class="fr-label">作業時間（分 または 1:30）</span>
      <div class="min-row"><input name="minutes" inputmode="numeric" value="${esc(v.minutes)}" placeholder="40" required class="min-input">
      <div class="fr-seg">${quick.map((m) => `<button type="button" data-min="${m}">${m < 60 ? m + "分" : m / 60 + "時間"}</button>`).join("")}</div></div>
    </div>
    <div class="fr-field grow"><span class="fr-label">内容メモ（先方レポートにも出ます）</span><input name="detail" value="${esc(v.detail)}" placeholder="例：FVの文言3か所を差し替え"></div>
    <div class="entry-end">
      <span class="preview" id="preview">${pricePreview(Number(v.minutes))}</span>
      ${e ? `<button type="button" class="quiet" data-act="edit-cancel">キャンセル</button><button class="primary" type="submit">更新する</button>` : `<button class="primary" type="submit">記録する</button>`}
    </div>
  </form>`;
}

function renderLog() {
  const p = period();
  if (!p) return noPeriodNotice();
  const sum = Kosu.summarize(state.data, p, today());
  const cats = ["all", ...new Set(sum.rows.map((r) => r.category).filter(Boolean))];
  const q = state.q.trim().toLowerCase();
  const rows = [...sum.rows].reverse().filter((r) =>
    (state.filterCat === "all" || r.category === state.filterCat) &&
    (!q || `${r.request} ${r.detail || ""}`.toLowerCase().includes(q)));
  const shownCost = rows.reduce((a, r) => a + r.cost, 0);
  const shownMin = rows.reduce((a, r) => a + r.minutes, 0);

  const body = rows.map((r) => `<tr class="${r.id === state.editingId ? "editing" : ""}">
      <td data-label="日付" class="nowrap">${fmtDate(r.date)}</td>
      <td data-label="依頼">${esc(r.request)}${r.detail ? `<span class="sub">${esc(r.detail)}</span>` : ""}</td>
      <td data-label="区分"><span class="fr-pill">${esc(r.category || "")}</span></td>
      <td data-label="時間" class="num">${hm(r.minutes)}</td>
      <td data-label="枠" class="num">${r.units}枠</td>
      <td data-label="金額" class="num">−${yen(r.cost)}</td>
      <td data-label="残高" class="num strong${r.balance < 0 ? " neg" : ""}">${yen(r.balance)}</td>
      <td class="ops"><button class="quiet" data-act="edit" data-id="${r.id}">編集</button><button class="quiet danger" data-act="del" data-id="${r.id}">削除</button></td>
    </tr>`).join("");

  return `
    ${timerHtml()}
    <h2 class="form-title">${state.editingId ? "記録を編集" : "対応した作業を記録"}</h2>
    ${entryForm()}
    <div class="log-filter">
      <div class="fr-seg">${cats.map((c) => `<button data-cat="${esc(c)}" class="${state.filterCat === c ? "on" : ""}">${c === "all" ? "すべて" : esc(c)}</button>`).join("")}</div>
      <input type="search" id="q" placeholder="依頼・メモで検索" value="${esc(state.q)}">
      <div class="fr-kpis log-kpis"><div class="fr-kpi"><b>${rows.length}</b>回</div><div class="fr-kpi"><b>${hm(shownMin)}</b>時間</div><div class="fr-kpi"><b>${yen(shownCost)}</b>金額</div></div>
    </div>
    ${rows.length ? `<table class="fr-table rtable">
      <thead><tr><th>日付</th><th>依頼・内容</th><th>区分</th><th class="num">時間</th><th class="num">枠</th><th class="num">金額</th><th class="num">残高</th><th></th></tr></thead>
      <tbody>${body}</tbody></table>` : `<p class="empty">この期間の記録はまだありません。</p>`}
    ${requestDatalist()}`;
}

/* ---------- 先方レポート ---------- */

function renderReport() {
  const p = period();
  if (!p) return noPeriodNotice();
  return `
    <div class="share">
      <div class="share-main">
        <span class="fr-label">先方と共有しているURL</span>
        <a href="${SHARE_URL}" target="_blank" rel="noopener" class="share-url">${SHARE_URL}</a>
        <span class="sub">記録すると、このURLの中身もすぐ最新になります（送り直し不要）。</span>
      </div>
      <button data-act="copy-url">URLをコピー</button><button data-act="copy-msg">送る文面をコピー</button>
    </div>
    <div class="fr-notice">URLを知っていれば誰でも見られます（検索には出ません）。PDFにしたいときは「別タブで開く」から印刷してPDFに保存してください。</div>
    <div class="frame-wrap"><iframe id="reportFrame" src="../index.html?period=${encodeURIComponent(p.id)}" title="先方ページ"></iframe></div>`;
}

/* ---------- 期間・料金 ---------- */

function renderSettings() {
  const s = settings();
  const rows = state.data.periods.map((p) => `<tr data-id="${p.id}">
      <td data-label="名前"><input name="label" value="${esc(p.label)}" placeholder="2026年11月"></td>
      <td data-label="開始日"><input type="date" name="start" value="${esc(p.start)}" required></td>
      <td data-label="終了日"><input type="date" name="end" value="${esc(p.end || "")}"></td>
      <td data-label="予算（円）"><input name="budget" inputmode="numeric" value="${p.budget}" class="num-input"></td>
      <td class="ops"><button type="button" class="quiet danger" data-act="period-del" data-id="${p.id}">削除</button></td>
    </tr>`).join("");
  return `
    <form id="settingsForm">
      <section class="sec">
        <div class="sec-head"><h2>期間と予算</h2><button type="button" data-act="period-add">＋次の期間を追加</button></div>
        <p class="help">記録は日付で期間に振り分けます。月ごとに30万円をリセットするなら月単位で、30万円を使い切るまで続けるなら終了日を空けてください。</p>
        ${state.data.periods.length ? `<table class="fr-table rtable settings-table"><thead><tr><th>名前</th><th>開始日</th><th>終了日（空なら無期限）</th><th>予算（円）</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">期間がありません。「＋次の期間を追加」で作ってください。</p>`}
      </section>
      <section class="sec">
        <h2>料金</h2>
        <div class="fr-filter">
          <div class="fr-field"><span class="fr-label">1枠の分数</span><input name="unitMinutes" inputmode="numeric" value="${s.unitMinutes}" class="num-input"></div>
          <div class="fr-field"><span class="fr-label">1枠の金額（円）</span><input name="unitPrice" inputmode="numeric" value="${s.unitPrice}" class="num-input"></div>
          <div class="fr-field"><span class="fr-label">税の表記</span><input name="taxNote" value="${esc(s.taxNote || "")}" placeholder="税抜"></div>
          <div class="fr-field"><span class="fr-label">先方名</span><input name="client" value="${esc(s.client)}"></div>
        </div>
        <p class="help">作業時間は1回の対応ごとに枠単位で切り上げます（例：25分 → 2枠）。</p>
      </section>
      <section class="sec">
        <h2>区分</h2>
        <textarea name="categories" rows="2" class="cats">${esc((s.categories || []).join("、"))}</textarea>
        <p class="help">「、」で区切って並べます。</p>
      </section>
      <div class="save-row"><button class="primary" type="submit">保存する</button></div>
    </form>
    <section class="sec">
      <h2>この端末の合鍵</h2>
      <p class="help">スマホでも記録するときは、設定リンクをコピーしてAirDropやメモでスマホに送り、スマホで開いてください（合鍵が入っているのでLINEなど人に見える場所には貼らない）。</p>
      <div class="device-row"><button type="button" data-act="copy-setup">スマホ用の設定リンクをコピー</button><button type="button" class="quiet danger" data-act="logout">この端末から消す</button></div>
    </section>`;
}

/* ---------- 描画 ---------- */

function render() {
  const page = PAGES[state.page] ? state.page : "dash";
  $$("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.page === page));
  $("#pageTitle").innerHTML = `<svg viewBox="0 0 24 24">${PAGES[page].icon}</svg>${PAGES[page].title}`;
  $("#clientTag").textContent = settings().client;

  const sel = $("#periodSel");
  sel.innerHTML = state.data.periods.map((p) => `<option value="${p.id}"${p.id === state.periodId ? " selected" : ""}>${esc(p.label || p.start)}</option>`).join("") || "<option>期間なし</option>";

  const end = $("#headEnd");
  end.innerHTML = page === "report"
    ? `<button data-act="open-report">別タブで開く</button>`
    : page === "dash" ? `<a class="fr-btn primary" href="#log">＋作業を記録</a>` : "";

  const main = $("#main");
  main.innerHTML = { dash: renderDash, log: renderLog, report: renderReport, settings: renderSettings }[page]();
  tick();
}

/* ---------- 操作 ---------- */

async function addEntry(entry) {
  state.data.entries.push({ id: newId("e"), createdAt: new Date().toISOString(), ...entry });
  const p = Kosu.periodFor(state.data, entry.date);
  if (p) state.periodId = p.id;
  return save(p ? `記録しました：${pricePreview(entry.minutes)}` : "記録しました（どの期間にも入らない日付です）");
}

document.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const fd = Object.fromEntries(new FormData(f));

  if (f.id === "timerForm") {
    state.data.timer = { request: fd.request.trim(), category: fd.category, startedAt: new Date().toISOString() };
    if (await save("計測を始めました")) render();
    return;
  }

  if (f.id === "entryForm") {
    const minutes = Kosu.parseMinutes(fd.minutes);
    if (!(minutes > 0)) { alert("作業時間を分（例：40）か 時:分（例：1:30）で入れてください"); return; }
    const entry = { date: fd.date, request: fd.request.trim(), category: fd.category, minutes, detail: fd.detail.trim() };
    if (state.editingId) {
      const e = state.data.entries.find((x) => x.id === state.editingId);
      Object.assign(e, entry);
      state.editingId = null;
      if (await save("更新しました")) render();
    } else if (await addEntry(entry)) render();
    return;
  }

  if (f.id === "settingsForm") {
    const s = settings();
    const unitMinutes = parseInt(fd.unitMinutes, 10);
    const unitPrice = parseInt(String(fd.unitPrice).replace(/[,¥円]/g, ""), 10);
    if (!(unitMinutes > 0) || !(unitPrice >= 0)) { alert("料金の数字を確認してください"); return; }
    Object.assign(s, {
      unitMinutes, unitPrice, taxNote: fd.taxNote.trim(), client: fd.client.trim() || s.client,
      categories: fd.categories.split(/[、,\n]/).map((c) => c.trim()).filter(Boolean),
    });
    for (const tr of $$(".settings-table tbody tr", f)) {
      const p = state.data.periods.find((x) => x.id === tr.dataset.id);
      const val = (n) => $(`[name=${n}]`, tr).value.trim();
      p.label = val("label");
      p.start = val("start");
      p.end = val("end") || null;
      p.budget = parseInt(val("budget").replace(/[,¥円]/g, ""), 10) || 0;
    }
    state.data.periods.sort((a, b) => a.start.localeCompare(b.start));
    if (await save("保存しました")) render();
  }
});

document.addEventListener("click", async (ev) => {
  const minBtn = ev.target.closest("[data-min]");
  if (minBtn) {
    const input = $("#entryForm [name=minutes]");
    input.value = minBtn.dataset.min;
    $("#preview").textContent = pricePreview(Number(minBtn.dataset.min));
    return;
  }
  const catBtn = ev.target.closest("[data-cat]");
  if (catBtn) { state.filterCat = catBtn.dataset.cat; render(); return; }

  const btn = ev.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  const t = state.data.timer;

  if (act === "timer-stop" && t) {
    const minutes = Math.max(1, Math.ceil((Date.now() - new Date(t.startedAt)) / 60000));
    state.data.timer = null;
    if (await addEntry({ date: today(), request: t.request, category: t.category, minutes, detail: "" })) render();
  } else if (act === "timer-cancel" && t) {
    if (!confirm("計測を取り消しますか？（記録は残りません）")) return;
    state.data.timer = null;
    if (await save("取り消しました")) render();
  } else if (act === "edit") {
    state.editingId = btn.dataset.id;
    render();
    $("#entryForm").scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (act === "edit-cancel") {
    state.editingId = null;
    render();
  } else if (act === "del") {
    const e = state.data.entries.find((x) => x.id === btn.dataset.id);
    if (!e || !confirm(`「${e.request}」（${hm(e.minutes)}）を削除しますか？`)) return;
    state.data.entries = state.data.entries.filter((x) => x.id !== e.id);
    if (state.editingId === e.id) state.editingId = null;
    if (await save("削除しました")) render();
  } else if (act === "period-add") {
    const ps = state.data.periods;
    const last = ps[ps.length - 1];
    let start = today().slice(0, 8) + "01";
    if (last) start = last.end ? Kosu.addDays(last.end, 1) : Kosu.addDays(last.start.slice(0, 8) + "01", 32).slice(0, 8) + "01";
    const [y, m] = start.split("-").map(Number);
    const end = Kosu.isoDate(new Date(y, m, 0));
    ps.push({ id: newId("p"), label: `${y}年${m}月`, start, end, budget: last ? last.budget : 300000 });
    state.periodId = ps[ps.length - 1].id;
    if (await save("期間を追加しました")) render();
  } else if (act === "period-del") {
    const p = state.data.periods.find((x) => x.id === btn.dataset.id);
    if (!p || !confirm(`期間「${p.label}」を削除しますか？（記録は消えません）`)) return;
    state.data.periods = state.data.periods.filter((x) => x.id !== p.id);
    if (await save("期間を削除しました")) { await load(); render(); }
  } else if (act === "open-report") {
    window.open(`${SHARE_URL}?period=${encodeURIComponent(state.periodId)}`, "_blank");
  } else if (act === "copy-url" || act === "copy-msg") {
    const text = act === "copy-url" ? SHARE_URL
      : `お世話になっております。La plus 葛西です。\n作業時間のご報告ページをご用意しました。ご依頼ごとの作業時間と、ご契約額からの残高をいつでもご確認いただけます（作業を記録するたびに自動で更新されます）。\n${SHARE_URL}`;
    await navigator.clipboard.writeText(text);
    toast(act === "copy-url" ? "URLをコピーしました" : "文面をコピーしました");
  } else if (act === "copy-setup") {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}#setup=${Store.token()}`);
    toast("設定リンクをコピーしました");
  } else if (act === "logout") {
    if (!confirm("この端末から合鍵を消しますか？")) return;
    Store.setToken("");
    showSetup();
  }
});

document.addEventListener("input", (ev) => {
  if (ev.target.matches("#entryForm [name=minutes]")) {
    $("#preview").textContent = pricePreview(Kosu.parseMinutes(ev.target.value));
  } else if (ev.target.id === "q") {
    state.q = ev.target.value;
    const pos = ev.target.selectionStart;
    render();
    const q = $("#q");
    q.focus();
    q.setSelectionRange(pos, pos);
  }
});

$("#periodSel").addEventListener("change", (ev) => {
  state.periodId = ev.target.value;
  state.editingId = null;
  render();
});

window.addEventListener("hashchange", () => {
  state.page = location.hash.slice(1) || "dash";
  state.editingId = null;
  if (state.data) render();
});

let lastWidth = innerWidth;
window.addEventListener("resize", () => {
  clearTimeout(window.__rz);
  window.__rz = setTimeout(() => {
    if (state.page === "dash" && Math.abs(innerWidth - lastWidth) > 40) { lastWidth = innerWidth; render(); }
  }, 200);
});

window.addEventListener("focus", async () => {
  if (!state.data || state.saving || state.editingId) return;
  try {
    const { sha } = await Store.read();
    if (sha !== state.rev) { await load(); render(); }
  } catch { /* 通信できないときは次の操作で知らせる */ }
});

/* ---------- 合鍵の設定 ---------- */

function showSetup(message = "") {
  $("#pageTitle").textContent = "はじめての設定";
  $("#headEnd").innerHTML = "";
  $("#main").innerHTML = `
    ${message ? `<div class="fr-notice err">${esc(message)}</div>` : ""}
    <div class="fr-notice">記録はGitHubに保存します。この端末で記録するために、書き込み用の「合鍵」を1回だけ登録してください。</div>
    <ol class="setup-steps">
      <li><a class="fr-btn go" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHubで合鍵を作る</a>（laplus7123-byte でログイン）</li>
      <li>Token name に「Let's工数」、Expiration は一番長い期間を選ぶ</li>
      <li>Repository access で「Only select repositories」→ <b>lets-report-vevybt97</b> を選ぶ</li>
      <li>Permissions の Repository permissions で <b>Contents</b> を「Read and write」にする</li>
      <li>「Generate token」を押し、出てきた文字（github_pat_…）をコピーして下に貼る</li>
    </ol>
    <form id="setupForm" class="fr-filter">
      <div class="fr-field grow"><span class="fr-label">合鍵</span><input name="token" autocomplete="off" placeholder="github_pat_…" required></div>
      <button class="primary" type="submit">登録する</button>
    </form>
    <p class="help">2台目（スマホなど）は、登録した端末の「期間・料金」→「スマホ用の設定リンクをコピー」で渡せます。</p>`;
}

async function useToken(t) {
  Store.setToken(t.trim());
  try {
    await load();
  } catch (e) {
    Store.setToken("");
    showSetup(e.message);
    return;
  }
  render();
  toast("この端末で記録できるようになりました");
}

document.addEventListener("submit", (ev) => {
  if (ev.target.id !== "setupForm") return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  useToken(new FormData(ev.target).get("token"));
}, true);

(async () => {
  const m = location.hash.match(/^#setup=(.+)$/);
  if (m) {
    history.replaceState(null, "", location.pathname + "#dash");
    await useToken(decodeURIComponent(m[1]));
  }
  state.page = location.hash.slice(1) || "dash";
  if (!Store.token()) { showSetup(); return; }
  if (!state.data) {
    try {
      await load();
    } catch (e) {
      if (e.auth) { showSetup(e.message); return; }
      $("#main").innerHTML = `<div class="fr-notice err">${esc(e.message)}　<a href="">再読み込み</a></div>`;
      return;
    }
    render();
  }
  tickTimer = setInterval(tick, 1000);
})();
