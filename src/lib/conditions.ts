// Ported verbatim from the Electron app's src/common/conditions.ts.
export interface ConditionReference {
  name: string;
  description: string;
}

export const DEFAULT_CONDITIONS: ConditionReference[] = [
  { name: "Blinded", description: "Can't see, auto-fails sight-based checks. Attacks against it: advantage; its attacks: disadvantage." },
  { name: "Charmed", description: "Can't attack the charmer or target them with harmful effects. Charmer has advantage on social checks against it." },
  { name: "Deafened", description: "Can't hear, auto-fails hearing-based checks." },
  { name: "Frightened", description: "Disadvantage on ability checks and attacks while the fear source is in sight; can't move closer to it." },
  { name: "Grappled", description: "Speed 0, no speed bonuses. Ends if the grappler is incapacitated or the creature is removed from its reach." },
  { name: "Incapacitated", description: "Can't take actions or reactions." },
  { name: "Invisible", description: "Can't be seen without magic. Attacks against it: disadvantage; its attacks: advantage." },
  { name: "Paralyzed", description: "Incapacitated, can't move or speak. Auto-fails STR/DEX saves. Attacks against it: advantage, and are critical hits within 5 ft." },
  { name: "Petrified", description: "Turned to stone, incapacitated, unaware of surroundings. Auto-fails STR/DEX saves. Resistant to all damage; immune to poison/disease." },
  { name: "Poisoned", description: "Disadvantage on attack rolls and ability checks." },
  { name: "Prone", description: "Can only crawl unless it stands. Disadvantage on attacks. Attacks against it: advantage within 5 ft, disadvantage beyond." },
  { name: "Restrained", description: "Speed 0, no speed bonuses. Attacks against it: advantage; its attacks: disadvantage. Disadvantage on DEX saves." },
  { name: "Stunned", description: "Incapacitated, can't move, speaks only falteringly. Auto-fails STR/DEX saves. Attacks against it: advantage." },
  { name: "Unconscious", description: "Incapacitated, can't move or speak, unaware of surroundings, drops items and falls prone. Auto-fails STR/DEX saves. Attacks against it: advantage, and are critical hits within 5 ft." },
  { name: "Exhaustion 1", description: "Disadvantage on ability checks." },
  { name: "Exhaustion 2", description: "Level 1 effect, plus speed halved." },
  { name: "Exhaustion 3", description: "Level 1-2 effects, plus disadvantage on attack rolls and saving throws." },
  { name: "Exhaustion 4", description: "Level 1-3 effects, plus hit point maximum halved." },
  { name: "Exhaustion 5", description: "Level 1-4 effects, plus speed reduced to 0." },
  { name: "Exhaustion 6", description: "Death." },
];
