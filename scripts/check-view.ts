import fs from "fs";
import { analyzeXbrlZip } from "../lib/xbrlFinancials";
import { buildFinancialView } from "../lib/financialView";
async function main() {
  for (const f of fs.readdirSync("_samples").filter((n) => n.endsWith(".zip"))) {
    const r = await analyzeXbrlZip(fs.readFileSync("_samples/" + f));
    const v = buildFinancialView(r);
    console.log("==", f);
    console.log("toCheck:", JSON.stringify(v.toCheck, null, 1));
    console.log("questions:", JSON.stringify(v.questions, null, 1));
    console.log(v.facts.slice(0,2).map((x) => x.text));
  }
}
main();
