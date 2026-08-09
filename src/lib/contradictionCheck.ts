// Ported verbatim from the Electron app's src/common/contradictionCheck.ts
// — a deterministic, mechanical sanity pass over data the app already has,
// NOT an AI critique of the world's content. Uses this repo's own
// src/lib/worldDate.ts (already ported/shared with /api/events) rather than
// re-porting those functions a second time.
import { parseWorldDateStart, compareWorldDates } from "./worldDate";

export interface BornDied {
  born: string | null;
  died: string | null;
}

/**
 * Builds a title -> {born, died} lookup from the same flat fact list
 * /api/events already produces across the whole workspace (extractHistoryFacts
 * + extractBornDiedFacts in worldTimeline.ts). Only ever reads facts whose
 * summary is exactly "Born"/"Died" or starts with "Born:"/"Died:".
 */
export function bornDiedByTitle(facts: { title: string; date: string; summary: string }[]): Map<string, BornDied> {
  const map = new Map<string, BornDied>();
  for (const fact of facts) {
    const isBorn = fact.summary === "Born" || fact.summary.startsWith("Born:");
    const isDied = fact.summary === "Died" || fact.summary.startsWith("Died:");
    if (!isBorn && !isDied) continue;

    const existing = map.get(fact.title) ?? { born: null, died: null };
    if (isBorn && existing.born === null) existing.born = fact.date;
    if (isDied && existing.died === null) existing.died = fact.date;
    map.set(fact.title, existing);
  }
  return map;
}

export interface Contradiction {
  message: string;
  noteATitle: string;
  noteBTitle: string;
}

function bothParse(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && parseWorldDateStart(a) !== null && parseWorldDateStart(b) !== null;
}

export interface EventForCheck {
  title: string;
  date: string;
  linkedTitles: string[];
}

/**
 * Flags an event that wiki-links a person marked Died: before the event's
 * own date.
 */
export function checkEventDeathContradictions(events: EventForCheck[], bornDied: Map<string, BornDied>): Contradiction[] {
  const contradictions: Contradiction[] = [];
  for (const event of events) {
    if (!event.date.trim()) continue;
    for (const linkedTitle of event.linkedTitles) {
      const died = bornDied.get(linkedTitle)?.died ?? null;
      if (!bothParse(died, event.date)) continue;
      if (compareWorldDates(died!, event.date) < 0) {
        contradictions.push({
          message: `${linkedTitle} is marked Died: ${died} — before "${event.title}"'s own date (${event.date}).`,
          noteATitle: event.title,
          noteBTitle: linkedTitle,
        });
      }
    }
  }
  return contradictions;
}

export interface ParentChildForCheck {
  parent: string;
  child: string;
  sourceTreeTitle: string;
}

/**
 * Flags a family tree's declared parent/child pair whose own Born:/Died:
 * facts contradict that pairing.
 */
export function checkFamilyTreeDateContradictions(
  edges: ParentChildForCheck[],
  bornDied: Map<string, BornDied>
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  for (const { parent, child, sourceTreeTitle } of edges) {
    const parentInfo = bornDied.get(parent);
    const childInfo = bornDied.get(child);

    const parentBorn = parentInfo?.born ?? null;
    const childBorn = childInfo?.born ?? null;
    if (bothParse(parentBorn, childBorn) && compareWorldDates(parentBorn!, childBorn!) >= 0) {
      contradictions.push({
        message: `In "${sourceTreeTitle}": ${child} is recorded Born: ${childBorn}, not after ${parent}'s own Born: ${parentBorn} — a parent should be born first.`,
        noteATitle: parent,
        noteBTitle: child,
      });
    }

    const parentDied = parentInfo?.died ?? null;
    if (bothParse(parentDied, childBorn) && compareWorldDates(parentDied!, childBorn!) < 0) {
      contradictions.push({
        message: `In "${sourceTreeTitle}": ${parent} is marked Died: ${parentDied} — before ${child}'s own Born: ${childBorn}.`,
        noteATitle: parent,
        noteBTitle: child,
      });
    }
  }
  return contradictions;
}
