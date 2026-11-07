/* 先方に見せる作業時間レポート。入力ページの中では入力中のデータを、単独で開いたときは保存先の最新を読む。 */
(async () => {
  const el = document.getElementById("report");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const { yen, hm, fmtDate } = Kosu;

  let data;
  try {
    data = window.parent !== window && window.parent.state?.data ? window.parent.state.data : await Store.readPublic();
  } catch (e) {
    el.innerHTML = `<p class="rp-loading">${esc(e.message)}</p>`;
    return;
  }
  if (!data.periods.length) {
    el.innerHTML = `<p class="rp-loading">期間が登録されていません。</p>`;
    return;
  }
  const today = Kosu.isoDate(new Date());
  const started = data.periods.filter((p) => p.start <= today);
  const periodId = new URLSearchParams(location.search).get("period")
    || (Kosu.periodFor(data, today) || started[started.length - 1] || data.periods[0]).id;
  draw(periodId);
  el.addEventListener("change", (ev) => {
    if (ev.target.id === "rpPeriod") draw(ev.target.value);
  });

  function draw(id) {
  const period = data.periods.find((p) => p.id === id) || data.periods[data.periods.length - 1];
  const picker = data.periods.length > 1
    ? `<select id="rpPeriod" class="rp-period" aria-label="表示する期間">${[...data.periods].reverse()
      .map((p) => `<option value="${esc(p.id)}"${p.id === period.id ? " selected" : ""}>${esc(p.label || p.start)}</option>`).join("")}</select>`
    : esc(period.label || "");
  const sum = Kosu.summarize(data, period);
  const s = sum.settings;
  const tax = s.taxNote ? `（${esc(s.taxNote)}）` : "";
  const range = `<span class="nowrap">${fmtDate(period.start, true)}</span> 〜 ${period.end ? `<span class="nowrap">${fmtDate(period.end, true)}</span>` : ""}`;
  const made = (data.updatedAt ? Kosu.isoDate(new Date(data.updatedAt)) : today).replace(/-/g, "/");
  const over = sum.balance < 0;
  const usedPct = Math.min(100, Math.round(sum.usedRate * 1000) / 10);

  const requestRows = sum.byRequest
    .map((g) => `<tr>
      <td data-label="ご依頼">${esc(g.name)}<span class="rp-sub">${esc(g.category || "")}</span></td>
      <td data-label="対応回数" class="num">${g.count}回</td>
      <td data-label="作業時間" class="num">${hm(g.minutes)}</td>
      <td data-label="枠" class="num">${g.units}枠</td>
      <td data-label="金額" class="num strong">${yen(g.cost)}</td>
    </tr>`)
    .join("");

  const detailRows = sum.rows
    .map((r) => `<tr>
      <td data-label="日付" class="nowrap">${fmtDate(r.date)}</td>
      <td data-label="ご依頼">${esc(r.request)}${r.detail ? `<span class="rp-sub">${esc(r.detail)}</span>` : ""}</td>
      <td data-label="作業時間" class="num">${hm(r.minutes)}</td>
      <td data-label="枠" class="num">${r.units}枠</td>
      <td data-label="金額" class="num">−${yen(r.cost)}</td>
      <td data-label="残高" class="num strong${r.balance < 0 ? " neg" : ""}">${yen(r.balance)}</td>
    </tr>`)
    .join("");

  el.innerHTML = `
    <header class="rp-head">
      <div>
        <p class="rp-to">${esc(s.client)} 様</p>
        <h1>作業時間のご報告</h1>
        <p class="rp-meta">${picker}　${range}</p>
      </div>
      <div class="rp-from">
        <p>最終更新 ${esc(made)}</p>
        <p>La plus 葛西</p>
      </div>
    </header>

    <section class="rp-hero">
      <div class="rp-balance">
        <span class="rp-label">${over ? "ご契約額を超えた分" : "残高"}</span>
        <b class="${over ? "neg" : ""}">${yen(over ? -sum.balance : sum.balance)}</b>
        <span class="rp-label">残り ${hm(sum.remainMinutes)}（${sum.remainUnits}枠）</span>
      </div>
      <dl class="rp-facts">
        <div><dt>ご契約額</dt><dd>${yen(period.budget)}</dd></div>
        <div><dt>ご利用額</dt><dd>${yen(sum.used)}</dd></div>
        <div><dt>作業時間</dt><dd>${hm(sum.totalMinutes)}</dd></div>
        <div><dt>対応件数</dt><dd>${sum.byRequest.length}件・${sum.rows.length}回</dd></div>
      </dl>
    </section>

    <div class="rp-bar" aria-label="ご利用 ${usedPct}%">
      <span style="width:${usedPct}%"></span>
    </div>
    <p class="rp-bar-cap">ご利用 ${usedPct}%　／　料金 ${s.unitMinutes}分 ${yen(s.unitPrice)}${tax}・全${sum.budgetUnits}枠（${hm(sum.budgetUnits * s.unitMinutes)}）</p>

    <section class="rp-sec">
      <h2>残高の推移</h2>
      <div class="rp-chart">${Kosu.balanceChart(sum, { width: Math.max(300, el.clientWidth - 2 * parseFloat(getComputedStyle(el).paddingLeft)), height: 220 })}</div>
    </section>

    <section class="rp-sec">
      <h2>ご依頼ごとの内訳</h2>
      ${sum.byRequest.length ? `<table class="fr-table rp-table">
        <thead><tr><th>ご依頼</th><th class="num">対応回数</th><th class="num">作業時間</th><th class="num">枠</th><th class="num">金額</th></tr></thead>
        <tbody>${requestRows}</tbody>
        <tfoot><tr><td>合計</td><td data-label="対応回数" class="num">${sum.rows.length}回</td><td data-label="作業時間" class="num">${hm(sum.totalMinutes)}</td><td data-label="枠" class="num">${sum.totalUnits}枠</td><td data-label="金額" class="num strong">${yen(sum.used)}</td></tr></tfoot>
      </table>` : `<p class="rp-empty">この期間の作業はまだありません。</p>`}
    </section>

    <section class="rp-sec">
      <h2>作業の明細</h2>
      ${sum.rows.length ? `<table class="fr-table rp-table rp-detail">
        <thead><tr><th>日付</th><th>ご依頼・内容</th><th class="num">作業時間</th><th class="num">枠</th><th class="num">金額</th><th class="num">残高</th></tr></thead>
        <tbody>
          <tr class="rp-start"><td data-label="日付" class="nowrap">${fmtDate(period.start)}</td><td data-label="ご依頼">ご契約額</td><td></td><td></td><td></td><td data-label="残高" class="num strong">${yen(period.budget)}</td></tr>
          ${detailRows}
        </tbody>
      </table>` : `<p class="rp-empty">この期間の作業はまだありません。</p>`}
    </section>

    <p class="rp-note">作業時間は1回の対応ごとに${s.unitMinutes}分単位で切り上げ、1枠 ${yen(s.unitPrice)}${tax}でご契約額から差し引いています。</p>
  `;
  document.title = `作業時間のご報告｜${s.client}様 ${period.label || ""}`;
  }
})();
