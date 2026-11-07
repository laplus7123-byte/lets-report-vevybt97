/* 記録の保存先。GitHub リポジトリの data ブランチにある data.json を読み書きする（data ブランチは Pages の公開元ではないので、保存のたびにサイトを作り直さない）。 */
const Store = (() => {
  const REPO = "laplus7123-byte/lets-report-vevybt97";
  const BRANCH = "data";
  const FILE = "data.json";
  const API = `https://api.github.com/repos/${REPO}/contents/${FILE}`;
  const TOKEN_KEY = "lets-kosu-token";

  const decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
  const encode = (text) => {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  const token = () => localStorage.getItem(TOKEN_KEY) || "";
  const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

  function headers(t) {
    const h = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  /* 先方ページ用：合鍵なしで読む */
  async function readPublic() {
    const res = await fetch(`${API}?ref=${BRANCH}&t=${Date.now()}`, { headers: { Accept: "application/vnd.github.raw+json" }, cache: "no-store" });
    if (!res.ok) throw new Error(res.status === 403 ? "アクセスが集中しています。少し時間をおいて再読み込みしてください。" : "読み込めませんでした");
    return res.json();
  }

  /* 入力ページ用：合鍵つきで読む（sha は上書き防止に使う） */
  async function read(t = token()) {
    const res = await fetch(`${API}?ref=${BRANCH}&t=${Date.now()}`, { headers: headers(t), cache: "no-store" });
    if (res.status === 401) throw Object.assign(new Error("合鍵が正しくないか、期限が切れています"), { auth: true });
    if (!res.ok) throw new Error(`読み込めませんでした（${res.status}）`);
    const body = await res.json();
    return { data: JSON.parse(decode(body.content)), sha: body.sha };
  }

  async function write(data, sha, message) {
    const res = await fetch(API, {
      method: "PUT",
      headers: { ...headers(token()), "Content-Type": "application/json" },
      body: JSON.stringify({ message, branch: BRANCH, sha, content: encode(JSON.stringify(data, null, 2) + "\n") }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 || res.status === 422) throw Object.assign(new Error("別の画面で更新されています。最新を読み込み直します。"), { conflict: true });
    if (res.status === 401 || res.status === 403 || res.status === 404) throw Object.assign(new Error("保存できません。合鍵（書き込み権限）を確認してください。"), { auth: true });
    if (!res.ok) throw new Error(body.message || `保存できませんでした（${res.status}）`);
    return body.content.sha;
  }

  return { REPO, read, readPublic, write, token, setToken };
})();
