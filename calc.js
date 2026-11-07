/* 工数の計算（管理画面と先方レポートで共通）。1件ごとに枠（20分）単位で切り上げ、予算から順に引く。 */
const Kosu = (() => {
  const yen = (n) => (n < 0 ? "−" : "") + "¥" + Math.abs(Math.round(n)).toLocaleString("ja-JP");

  function hm(minutes) {
    const m = Math.max(0, Math.round(minutes));
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (!h) return `${r}分`;
    return r ? `${h}時間${r}分` : `${h}時間`;
  }

  function units(minutes, s) {
    return minutes > 0 ? Math.ceil(minutes / s.unitMinutes) : 0;
  }

  function inPeriod(e, p) {
    return e.date >= p.start && (!p.end || e.date <= p.end);
  }

  function addDays(iso, n) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return isoDate(d);
  }

  function isoDate(d) {
    const z = (v) => String(v).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  function daysBetween(a, b) {
    return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
  }

  function summarize(data, period, today = isoDate(new Date())) {
    const s = data.settings;
    const list = data.entries
      .filter((e) => inPeriod(e, period))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));

    let balance = period.budget;
    const rows = list.map((e) => {
      const u = units(e.minutes, s);
      const cost = u * s.unitPrice;
      balance -= cost;
      return { ...e, units: u, cost, balance };
    });

    const used = period.budget - balance;
    const totalMinutes = rows.reduce((a, r) => a + r.minutes, 0);
    const totalUnits = rows.reduce((a, r) => a + r.units, 0);
    const budgetUnits = s.unitPrice ? Math.floor(period.budget / s.unitPrice) : 0;
    const remainUnits = s.unitPrice ? Math.max(0, Math.floor(balance / s.unitPrice)) : 0;

    const group = (key) => {
      const map = new Map();
      for (const r of rows) {
        const k = r[key] || "（未入力）";
        const g = map.get(k) || { name: k, count: 0, minutes: 0, units: 0, cost: 0, first: r.date, last: r.date, category: r.category };
        g.count += 1;
        g.minutes += r.minutes;
        g.units += r.units;
        g.cost += r.cost;
        g.last = r.date;
        map.set(k, g);
      }
      return [...map.values()].sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name, "ja"));
    };

    // 残高の推移：開始日の予算から、記録のある日ごとに減らす
    const lastDay = period.end || (rows.length ? rows[rows.length - 1].date : today);
    const points = [{ date: period.start, balance: period.budget }];
    for (const r of rows) {
      if (points[points.length - 1].date === r.date) points[points.length - 1].balance = r.balance;
      else points.push({ date: r.date, balance: r.balance });
    }

    // このペースで使ったときに残高が0になる日
    let forecast = null;
    const through = period.end && today > period.end ? period.end : today;
    const elapsed = daysBetween(period.start, through) + 1;
    if (used > 0 && balance > 0 && elapsed > 0 && today >= period.start) {
      const perDay = used / elapsed;
      const zeroDay = addDays(through, Math.ceil(balance / perDay));
      forecast = { perDay, zeroDay, beforeEnd: period.end ? zeroDay <= period.end : true };
    }

    return {
      settings: s,
      period,
      rows,
      used,
      balance,
      totalMinutes,
      totalUnits,
      budgetUnits,
      remainUnits,
      remainMinutes: remainUnits * s.unitMinutes,
      usedRate: period.budget ? used / period.budget : 0,
      byRequest: group("request"),
      byCategory: group("category"),
      points,
      lastDay,
      forecast,
    };
  }

  function periodFor(data, iso) {
    return data.periods.find((p) => inPeriod({ date: iso }, p)) || null;
  }

  function parseMinutes(text) {
    const t = String(text || "").trim().replace(/[０-９：]/g, (c) => (c === "：" ? ":" : String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
    if (!t) return NaN;
    const m = t.match(/^(\d+):(\d{1,2})$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    const h = t.match(/^(\d+(?:\.\d+)?)\s*(h|時間)$/i);
    if (h) return Math.round(Number(h[1]) * 60);
    return /^\d+$/.test(t.replace(/分$/, "")) ? Number(t.replace(/分$/, "")) : NaN;
  }

  function fmtDate(iso, withYear = false) {
    const [y, m, d] = iso.split("-").map(Number);
    const w = "日月火水木金土"[new Date(y, m - 1, d).getDay()];
    return `${withYear ? y + "/" : ""}${m}/${d}（${w}）`;
  }

  /* 残高の推移グラフ（SVG）。線は1本、色は青だけ。 */
  function balanceChart(sum, { width = 640, height = 220 } = {}) {
    const pad = { l: 64, r: 16, t: 14, b: 28 };
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;
    const start = sum.period.start;
    const end = sum.lastDay > start ? sum.lastDay : addDays(start, 1);
    const span = Math.max(1, daysBetween(start, end));
    const max = Math.max(sum.period.budget, ...sum.points.map((p) => p.balance));
    const min = Math.min(0, ...sum.points.map((p) => p.balance));
    const x = (iso) => pad.l + (Math.min(span, Math.max(0, daysBetween(start, iso))) / span) * w;
    const y = (v) => pad.t + ((max - v) / (max - min || 1)) * h;

    let d = `M${x(sum.points[0].date)},${y(sum.points[0].balance)}`;
    for (let i = 1; i < sum.points.length; i++) {
      d += ` H${x(sum.points[i].date)} V${y(sum.points[i].balance)}`;
    }
    const lastPoint = sum.points[sum.points.length - 1];
    const today = isoDate(new Date());
    const lineEnd = sum.period.end && today < sum.period.end ? (today > lastPoint.date ? today : lastPoint.date) : end;
    d += ` H${x(lineEnd)}`;

    const ticks = [0, 0.5, 1].map((t) => min + (max - min) * t);
    const grid = ticks
      .map((v) => `<line x1="${pad.l}" x2="${pad.l + w}" y1="${y(v)}" y2="${y(v)}" stroke="#eceef2"/>` +
        `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#6b6f78">${yen(v)}</text>`)
      .join("");
    const xl = [start, end]
      .map((iso, i) => `<text x="${x(iso)}" y="${height - 8}" text-anchor="${i ? "end" : "start"}" font-size="11" fill="#6b6f78">${fmtDate(iso)}</text>`)
      .join("");
    const dots = sum.points.slice(1)
      .map((p) => `<circle cx="${x(p.date)}" cy="${y(p.balance)}" r="3" fill="#285bc6"><title>${fmtDate(p.date)} 残高 ${yen(p.balance)}</title></circle>`)
      .join("");
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="残高の推移">${grid}${xl}` +
      `<path d="${d}" fill="none" stroke="#285bc6" stroke-width="2"/>${dots}</svg>`;
  }

  return { yen, hm, units, summarize, periodFor, parseMinutes, fmtDate, isoDate, addDays, balanceChart };
})();
