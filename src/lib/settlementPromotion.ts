import { defaultNpcFrontmatter } from './noteTypes/npc'
import { defaultLocationFrontmatter } from './noteTypes/location'
import type { SettlementBuilding, SettlementResident } from './noteTypes/settlement'
import { relationLabel } from './settlementGenerator'

// Maps a background settlement record to the frontmatter/body of a real
// npc/location note — the "promote" action's actual content, kept as pure
// functions (no note creation, no IPC) so it's testable without a vault or
// Cloud Workspace. See SettlementPeopleTab.tsx/SettlementBuildingsTab.tsx
// for where the result gets handed to NoteRefApi.createNote.

export interface PromotedNote {
  frontmatter: Record<string, unknown>
  body: string
}

/** `districtName`/`wealthTierName` are looked up by the caller (the sheet already has the id->name maps) since a resident only stores ids. */
export function buildPromotedNpcFrontmatter(resident: SettlementResident, districtName: string, wealthTierName: string): PromotedNote {
  const base = defaultNpcFrontmatter()
  const frontmatter = {
    ...base,
    role: resident.notable ? 'Notable' : 'Resident',
    stats: resident.stats ?? base.stats
  }

  const facts = [
    `${resident.race || 'Unknown race'}, age ${resident.age}${resident.gender ? `, ${resident.gender}` : ''}.`,
    districtName ? `Lives in ${districtName}.` : '',
    wealthTierName ? `${wealthTierName} class.` : '',
    resident.jobTitle ? `${resident.jobTitle}.` : '',
    !resident.notable && resident.employmentStatus === 'unemployed' ? 'Unemployed.' : '',
    resident.homeless ? 'Homeless.' : '',
    resident.educated ? 'Educated.' : '',
    // A wiki-link, not plain text (confirmed with the user 2026-07-28) — when
    // resident.religion matches a real note (e.g. one added via the
    // settlement religion picker's "add from note"/"add from folder"
    // controls), that note gets a free backlink here, same mechanism
    // LanguageSheet.tsx's language-to-language sentences already use. A
    // religion with no matching note just renders as a dangling wiki-link,
    // same as anywhere else in the app.
    resident.religion ? `Follows [[${resident.religion}]].` : ''
  ]
    .filter(Boolean)
    .join(' ')

  const flavor = resident.notable
    ? [resident.personalityLine ? `${resident.personalityLine}.` : '', resident.goal ? `${resident.name} ${resident.goal}.` : '']
        .filter(Boolean)
        .join(' ')
    : resident.flavorTag

  const proficiencies = resident.proficiencies.length > 0 ? `Proficient in: ${resident.proficiencies.join(', ')}.` : ''
  const appearance = resident.appearance ? `## Appearance\n${resident.appearance}` : ''
  const family =
    (resident.relatives ?? []).length > 0
      ? `## Family\n${resident.relatives
          .map((r) => `- ${relationLabel(r.relation, resident.gender)} ${r.name} (${r.livingStatus === 'deceased' ? 'deceased' : r.age})`)
          .join('\n')}`
      : ''

  return { frontmatter, body: [facts, flavor, proficiencies, appearance, family].filter(Boolean).join('\n\n') }
}

export function buildPromotedLocationFrontmatter(
  building: SettlementBuilding,
  buildingTypeName: string,
  districtName: string,
  wealthTierName: string
): PromotedNote {
  const frontmatter = {
    ...defaultLocationFrontmatter(),
    locationType: 'location',
    summary: [buildingTypeName || 'Building', districtName ? `in ${districtName}` : ''].filter(Boolean).join(' ')
  }

  const tierLine = wealthTierName ? `${wealthTierName}-tier establishment.` : ''
  const inventory = building.inventory ?? []
  const inventoryLine = inventory.length > 0 ? `In stock: ${inventory.join(', ')}.` : ''

  return { frontmatter, body: [tierLine, inventoryLine].filter(Boolean).join('\n\n') }
}
