import fs from "fs";
import { parseCombatant } from "./src/lib/sim/schema";
import { runScenario, standardParty } from "./src/lib/sim/engine/scenario";

const raw = JSON.parse(fs.readFileSync("/tmp/pyrrha_lesser_draft.json", "utf8"));
const pyrrha = parseCombatant(raw);
console.log("parsed ok. ac", pyrrha.ac, "hp", pyrrha.maxHp, "pb", pyrrha.pb);

for (const lvl of [12, 13, 14]) {
  const mc = runScenario({ party: standardParty(lvl), enemies: ["pyrrha-lesser"], trials: 300, extraById: { "pyrrha-lesser": pyrrha } });
  console.log(`level ${lvl}: win=${(mc.partyWinRate*100).toFixed(0)}% tpk=${(mc.tpkRate*100).toFixed(0)}% rounds=${mc.avgRounds.toFixed(1)}`);
}
