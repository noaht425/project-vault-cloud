"use client";

import { useState } from "react";
import { rollDice, type DiceRollResult } from "@/lib/dice";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];
const HISTORY_KEY = "diceHistory";
const REROLL_LOW_KEY = "diceRerollLowRolls";
const MAX_HISTORY = 50;
// Great Weapon Fighting-style reroll: any die at or below this face gets
// rerolled once, keeping whatever it lands on next. Same threshold as the
// Electron app's dice roller.
const REROLL_THRESHOLD = 2;

function loadHistory(): DiceRollResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as DiceRollResult[]) : [];
  } catch {
    return [];
  }
}

function loadRerollLowRolls(): boolean {
  try {
    return localStorage.getItem(REROLL_LOW_KEY) === "true";
  } catch {
    return false;
  }
}

function formatBreakdown(result: DiceRollResult): string {
  const groupParts = result.groups.map((g) => {
    const rollsText = `[${g.rolls
      .map((r, i) => (g.rerolledFrom?.[i] !== undefined ? `${g.rerolledFrom[i]}→${r}` : `${r}`))
      .join(", ")}]`;
    const keepText = g.kept.length !== g.rolls.length ? ` keep ${g.kept.join(", ")}` : "";
    return `${g.sign < 0 ? "-" : ""}${rollsText}${keepText}`;
  });
  if (result.modifier !== 0) {
    groupParts.push(`${result.modifier > 0 ? "+" : ""}${result.modifier}`);
  }
  return groupParts.join(" ");
}

// Mirrors the Electron app's DiceRoller.tsx, adapted from a hover popover
// (desktop) to a BottomSheet (touch-appropriate). History/reroll-toggle
// persistence is plain localStorage here rather than a Zustand store —
// this repo doesn't otherwise use Zustand, and a single global instance
// (mounted once in Shell) doesn't need shared cross-component state.
export function DiceRoller() {
  const [open, setOpen] = useState(false);
  const [notation, setNotation] = useState("");
  const [error, setError] = useState(false);
  const [history, setHistory] = useState<DiceRollResult[]>(() =>
    typeof window === "undefined" ? [] : loadHistory()
  );
  const [rerollLowRolls, setRerollLowRolls] = useState(() =>
    typeof window === "undefined" ? false : loadRerollLowRolls()
  );

  const doRoll = (n: string): void => {
    const options = rerollLowRolls ? { rerollAtOrBelow: REROLL_THRESHOLD } : {};
    const result = rollDice(n, undefined, options);
    setError(result === null);
    if (!result) return;
    setHistory((prev) => {
      const next = [result, ...prev].slice(0, MAX_HISTORY);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // localStorage can throw in restrictive environments — the roll
        // still shows for the rest of the session, it just won't persist.
      }
      return next;
    });
  };

  const clearHistory = (): void => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // Same as above — non-fatal if this throws.
    }
  };

  const toggleRerollLowRolls = (): void => {
    setRerollLowRolls((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(REROLL_LOW_KEY, String(next));
      } catch {
        // Non-fatal — the toggle still works for the rest of the session.
      }
      return next;
    });
  };

  return (
    <>
      <Button variant="ghost" aria-label="Dice roller" onClick={() => setOpen(true)}>
        🎲
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_DICE.map((sides) => (
              <Button key={sides} className="flex-1 min-w-[50px]" onClick={() => doRoll(`1d${sides}`)}>
                d{sides}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => doRoll("2d20kh1")}>
              Advantage
            </Button>
            <Button className="flex-1" onClick={() => doRoll("2d20kl1")}>
              Disadvantage
            </Button>
          </div>
          <Button
            variant={rerollLowRolls ? "primary" : "default"}
            title="While on, every 1 or 2 rolled gets rerolled once and the new result is kept"
            onClick={toggleRerollLowRolls}
          >
            Reroll 1s &amp; 2s
          </Button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (notation.trim()) doRoll(notation);
            }}
          >
            <TextField
              label="Custom roll"
              className="flex-1"
              value={notation}
              onChange={(e) => {
                setNotation(e.target.value);
                setError(false);
              }}
              placeholder="2d6+3"
            />
            <Button type="submit" variant="primary" className="self-end">
              Roll
            </Button>
          </form>
          {error && <p className="text-sm text-danger">Couldn&apos;t parse that — try something like 2d6+3.</p>}

          <div className="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-sm text-muted">No rolls yet.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">History</span>
                  <Button variant="ghost" className="text-sm" onClick={clearHistory}>
                    Clear
                  </Button>
                </div>
                {history.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 text-sm border-t border-border pt-1.5">
                    <span className="font-mono">{r.notation}</span>
                    <span className="text-muted flex-1 truncate">{formatBreakdown(r)}</span>
                    <span className="font-semibold">{r.total}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
