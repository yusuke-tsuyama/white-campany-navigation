// 検証用: 会社名から最新の有価証券報告書を探し、XBRL入りzipを _samples/ に保存する。
// 使い方（開発サーバー npm run dev を起動した状態で）:
//   node scripts/fetch-xbrl.mjs "日本マクドナルドホールディングス株式会社"
import fs from "node:fs";
import path from "node:path";

const name = process.argv[2];
if (!name) { console.error('使い方: node scripts/fetch-xbrl.mjs "企業名"'); process.exit(1); }

const env = fs.readFileSync(".env.local", "utf-8");
const key = (env.match(/^EDINET_API_KEY=(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (!key) { console.error(".env.local に EDINET_API_KEY がありません"); process.exit(1); }

const r = await fetch("http://localhost:3000/api/edinet-search", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyName: name }),
});
const j = await r.json();
const c = (j.candidates || [])[0];
if (!c) { console.error("候補が見つかりません", j); process.exit(1); }
console.log("対象:", c.filerName, c.docDescription, c.submitDateTime, c.docID);

const z = await fetch(`https://api.edinet-fsa.go.jp/api/v2/documents/${c.docID}?type=1&Subscription-Key=${key}`);
if (!z.ok) { console.error("ダウンロード失敗", z.status); process.exit(1); }
fs.mkdirSync("_samples", { recursive: true });
const out = path.join("_samples", `${name.replace(/[^\p{L}\p{N}]/gu, "")}_${c.docID}.zip`);
fs.writeFileSync(out, Buffer.from(await z.arrayBuffer()));
console.log("保存:", out);
