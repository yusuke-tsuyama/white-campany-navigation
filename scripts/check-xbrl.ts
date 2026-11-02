// 検証用: 取得済みzipから財務数値とROAを計算して表示する
//   npx tsx scripts/check-xbrl.ts _samples/xxxx.zip
import fs from "node:fs";
import { analyzeXbrlZip, fmtMillion, fmtPct } from "../lib/xbrlFinancials";

const file = process.argv[2];
if (!file) { console.error("使い方: npx tsx scripts/check-xbrl.ts <zip>"); process.exit(1); }
async function main() {
const r = await analyzeXbrlZip(fs.readFileSync(file));
console.log("ok:", r.ok, r.reason ?? "");
console.log("会計基準:", r.accounting, "/ 範囲:", r.scope, "/ 利益:", r.netProfitLabel);
console.log("取れた決算期:", r.periodEnds.join(", "));
for (const p of r.roa) {
  console.log(
    `${p.periodLabel}: ROA ${fmtPct(p.roa)} = ${fmtMillion(p.netProfit)} ÷ 平均総資産 ${fmtMillion(p.assetsAvg)}`,
    `（期首 ${fmtMillion(p.assetsStart)} / 期末 ${fmtMillion(p.assetsEnd)}）`,
    p.netMargin !== null ? `純利益率 ${fmtPct(p.netMargin)} × 総資産回転率 ${p.assetTurnover!.toFixed(2)}回` : ""
  );
}
for (const c of r.changes) {
  console.log(`${c.label}: ${fmtMillion(c.previous)} → ${fmtMillion(c.current)} (${c.delta >= 0 ? "+" : ""}${fmtMillion(c.delta)}${c.pct !== null ? `, ${c.pct.toFixed(1)}%` : ""})`);
}
console.log("従業員:", JSON.stringify(r.employees));
  r.warnings.forEach((w) => console.log("警告:", w));
}
main();
