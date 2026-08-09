// Ported verbatim from the Electron app's src/common/noteTypes/language.ts.
import { z } from "zod";

export const languageFrontmatterSchema = z
  .object({
    type: z.literal("language"),
    tags: z.array(z.string()).catch([]),
    summary: z.string().catch(""),
  })
  .passthrough();

export type LanguageFrontmatter = z.infer<typeof languageFrontmatterSchema>;

export function defaultLanguageFrontmatter(): LanguageFrontmatter {
  return languageFrontmatterSchema.parse({ type: "language" });
}

export interface WordEntry {
  word: string;
  meaning: string | null;
  partOfSpeech: string | null;
  gender: string | null;
  content: string;
}

export interface GrammarRule {
  name: string;
  content: string;
}

const HEADING_RE = /^##\s*(.*)$/gim;
const WORD_HEADING_TEXT_RE = /^Word:?\s*(.+)$/i;
const GRAMMAR_HEADING_TEXT_RE = /^Grammar:\s*(.+)$/i;

const MEANING_LINE_RE = /^Meaning:\s*(.+)$/im;
const POS_LINE_RE = /^(?:POS|Part of Speech):\s*(.+)$/im;
const GENDER_LINE_RE = /^Gender:\s*(.+)$/im;

interface Heading {
  index: number;
  lineEnd: number;
  word: string | null;
  grammar: string | null;
}

function findHeadings(body: string): Heading[] {
  return [...body.matchAll(HEADING_RE)].map((m) => {
    const text = m[1].trim();
    const wordMatch = text.match(WORD_HEADING_TEXT_RE);
    const grammarMatch = text.match(GRAMMAR_HEADING_TEXT_RE);
    return {
      index: m.index!,
      lineEnd: m.index! + m[0].length,
      word: wordMatch ? wordMatch[1].trim() : null,
      grammar: grammarMatch ? grammarMatch[1].trim() : null,
    };
  });
}

export function parseWordEntries(body: string): WordEntry[] {
  const headings = findHeadings(body);
  const entries: WordEntry[] = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    if (heading.word === null || !heading.word) continue;
    const end = i + 1 < headings.length ? headings[i + 1].index : body.length;
    const raw = body.slice(heading.lineEnd, end).trim();

    const meaningMatch = raw.match(MEANING_LINE_RE);
    const posMatch = raw.match(POS_LINE_RE);
    const genderMatch = raw.match(GENDER_LINE_RE);
    const content = raw
      .replace(MEANING_LINE_RE, "")
      .replace(POS_LINE_RE, "")
      .replace(GENDER_LINE_RE, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    entries.push({
      word: heading.word,
      meaning: meaningMatch ? meaningMatch[1].trim() : null,
      partOfSpeech: posMatch ? posMatch[1].trim() : null,
      gender: genderMatch ? genderMatch[1].trim() : null,
      content,
    });
  }

  return entries.sort((a, b) => a.word.localeCompare(b.word));
}

export function parseGrammarRules(body: string): GrammarRule[] {
  const headings = findHeadings(body);
  const rules: GrammarRule[] = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    if (heading.grammar === null || !heading.grammar) continue;
    const end = i + 1 < headings.length ? headings[i + 1].index : body.length;
    rules.push({ name: heading.grammar, content: body.slice(heading.lineEnd, end).trim() });
  }

  return rules;
}

export function stripStructuredSections(body: string): string {
  const headings = findHeadings(body);
  let result = "";
  let cursor = 0;

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    if ((heading.word === null || !heading.word) && (heading.grammar === null || !heading.grammar)) continue;
    result += body.slice(cursor, heading.index);
    cursor = i + 1 < headings.length ? headings[i + 1].index : body.length;
  }
  result += body.slice(cursor);
  return result;
}
