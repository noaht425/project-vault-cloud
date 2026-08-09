import type { CustomRaceDef } from './noteTypes/settlement'

// Generation content for the Settlement Populator — see settlementGenerator.ts
// for how these are combined. Everything here is generic/placeholder, same
// "mechanism not content" spirit as noteTypes/map.ts's defaultTerrainTypes()
// or travelModes.ts's DEFAULT_TRAVEL_MODES: small seed pools meant to be
// edited, extended, or replaced per campaign, not hand-authored to any one
// world. This is flagged separately from those because it's the first
// feature where the app originates actual text content (names, personality
// lines) rather than just a mechanism the user fills in — confirmed with the
// user before building (see feedback_project_vault_no_campaign_content).

export interface WeightedName {
  name: string
  // Relative frequency vs other names in the same pool — see pickWeighted.
  // Not a percent; only meaningful relative to the other weights nearby.
  weight: number
}

export interface NameBank {
  id: string
  name: string
  firstNamesMale: WeightedName[]
  firstNamesFemale: WeightedName[]
  // Usable by ANY resident regardless of picked gender — see genderPool.
  firstNamesNeutral: WeightedName[]
  lastNames: WeightedName[]
}

export const BASELINE_RACES = [
  'human',
  'elf',
  'tiefling',
  'dwarf',
  'halfling',
  'dragonborn',
  'orc',
  'goliath'
] as const
export type BaselineRace = (typeof BASELINE_RACES)[number]

const common = (name: string): WeightedName => ({ name, weight: 3 })
const normal = (name: string): WeightedName => ({ name, weight: 1 })
const rare = (name: string): WeightedName => ({ name, weight: 0.4 })

/** Weighted pick — higher `.weight` means more likely, but nothing is ever impossible as long as weight > 0. */
function pickWeighted<T extends { weight: number }>(items: T[], rng: () => number): T | null {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0)
  if (items.length === 0 || total <= 0) return items[items.length - 1] ?? null
  let roll = rng() * total
  for (const item of items) {
    roll -= Math.max(0, item.weight)
    if (roll <= 0) return item
  }
  return items[items.length - 1]
}

// Human is deliberately NOT a single Western-European bank — a human
// population is meant to stand in for real-world human diversity, so this
// pool draws a few names each from ~16 world naming traditions (grouped by
// comment below for readability/editability, though at generation time it's
// just one flat pool per gender). Every Human name is weight 1 (uniform):
// weighting any region above another would reintroduce exactly the "one
// culture dominates" problem this list exists to avoid — unlike the other 7
// races below (each a single invented fantasy culture, where "some names
// are more common than others within that culture" is just flavor).
export const BASELINE_NAME_BANKS: NameBank[] = [
  {
    id: 'human',
    name: 'Human',
    firstNamesMale: [
      // English
      normal('Edmund'), normal('Gareth'), normal('Rowan'),
      // French
      normal('Étienne'), normal('Théo'), normal('Julien'),
      // Germanic
      normal('Klaus'), normal('Friedrich'), normal('Otto'),
      // Scandinavian
      normal('Sven'), normal('Bjorn'), normal('Magnus'),
      // Slavic
      normal('Dmitri'), normal('Ivan'), normal('Tomasz'),
      // Italian
      normal('Marco'), normal('Luca'), normal('Enzo'),
      // Spanish / Latin American
      normal('Carlos'), normal('Diego'), normal('Mateo'),
      // Arabic
      normal('Omar'), normal('Yusuf'), normal('Tariq'),
      // West Asian (Turkish / Persian / Armenian / Georgian / Azerbaijani / Kurdish / Hebrew)
      normal('Mehmet'), normal('Darius'), normal('Ari'),
      // West African
      normal('Kwame'), normal('Chidi'), normal('Kofi'),
      // East African
      normal('Amare'), normal('Tewodros'), normal('Juma'),
      // South Asian
      normal('Arjun'), normal('Ravi'), normal('Aarav'),
      // East Asian
      normal('Haruto'), normal('Wei'), normal('Min-jun'),
      // Southeast Asian / Pacific
      normal('Minh'), normal('Koa'), normal('Tavita'),
      // Hawaiian
      normal('Ikaika'), normal('Noa'), normal('Haku'),
      // Māori
      normal('Tāne'), normal('Ariki'), normal('Manu'),
      // Contributed
      normal('Noah'), normal('Ben')
    ],
    firstNamesFemale: [
      // English
      normal('Eleanor'), normal('Beatrice'), normal('Matilda'),
      // French
      normal('Camille'), normal('Margaux'), normal('Odette'),
      // Germanic
      normal('Greta'), normal('Hedwig'), normal('Adelheid'),
      // Scandinavian
      normal('Ingrid'), normal('Astrid'), normal('Freya'),
      // Slavic
      normal('Olga'), normal('Katarina'), normal('Nadia'),
      // Italian
      normal('Giulia'), normal('Alessia'), normal('Chiara'),
      // Spanish / Latin American
      normal('Sofia'), normal('Valentina'), normal('Camila'),
      // Arabic
      normal('Fatima'), normal('Layla'), normal('Amira'),
      // West Asian (Turkish / Persian / Armenian / Georgian / Azerbaijani / Kurdish / Hebrew)
      normal('Elif'), normal('Roxana'), normal('Maya'),
      // West African
      normal('Amara'), normal('Ama'), normal('Adaeze'),
      // East African
      normal('Amina'), normal('Zola'), normal('Almaz'),
      // South Asian
      normal('Aditi'), normal('Priya'), normal('Ananya'),
      // East Asian
      normal('Yuki'), normal('Mei'), normal('Seo-yeon'),
      // Southeast Asian / Pacific
      normal('Linh'), normal('Leilani'), normal('Malia'),
      // Hawaiian
      normal('Pua'), normal('Maile'), normal('Nani'),
      // Māori
      normal('Aroha'), normal('Kahurangi'), normal('Hine'),
      // Contributed
      normal('Annalee'), normal('Isabelle'), normal('Loretta'), normal('Alyssa'), normal('Violet')
    ],
    firstNamesNeutral: [
      normal('Avery'), // English
      normal('Noel'), // French
      normal('Kai'), // Germanic/Hawaiian/Japanese crossover
      normal('Eli'), // Scandinavian
      normal('Sasha'), // Slavic
      normal('Andrea'), // Italian (traditionally male in Italy, female elsewhere)
      normal('Guadalupe'), // Spanish
      normal('Nour'), // Arabic
      normal('Tal'), // West Asian (Turkish / Persian / Armenian / Georgian / Azerbaijani / Kurdish / Hebrew)
      normal('Ade'), // West African
      normal('Amani'), // East African (Swahili)
      normal('Kiran'), // South Asian
      normal('Ren'), // East Asian
      normal('Lani'), // Hawaiian
      normal('Rangi'), // Māori
      normal('Khai'), // Contributed
      normal('Sydney'), // Contributed
      normal('Xiaowei'), // Contributed
      normal('Sam'), // Contributed
      normal('Alder'), // Contributed
      normal('Charlie'), // Contributed
      normal('Robin') // Contributed
    ],
    lastNames: [
      // English
      normal('Ashford'), normal('Hollis'), normal('Blackwell'),
      // French
      normal('Beaumont'), normal('Lavigne'), normal('Rousseau'),
      // Germanic
      normal('Schmidt'), normal('Weber'), normal('Baumann'),
      // Scandinavian
      normal('Larsen'), normal('Nilsson'), normal('Berg'),
      // Slavic
      normal('Volkov'), normal('Nowak'), normal('Kowalski'),
      // Italian
      normal('Rossi'), normal('Bianchi'), normal('Moretti'),
      // Spanish / Latin American
      normal('Reyes'), normal('Morales'), normal('Castillo'),
      // Arabic
      normal('Haddad'), normal('Farouk'), normal('Khalil'),
      // West Asian (Turkish / Persian / Armenian / Georgian / Azerbaijani / Kurdish / Hebrew)
      normal('Yilmaz'), normal('Hosseini'), normal('Cohen'),
      // West African
      normal('Adeyemi'), normal('Mensah'), normal('Okafor'),
      // East African
      normal('Abebe'), normal('Haile'), normal('Mwangi'),
      // South Asian
      normal('Sharma'), normal('Patel'), normal('Rao'),
      // East Asian
      normal('Tanaka'), normal('Wang'), normal('Kim'),
      // Southeast Asian / Pacific
      normal('Tran'), normal('Santos'), normal('Kealoha'),
      // Hawaiian
      normal('Leilani'), normal('Pualani'), normal('Wailani'),
      // Māori
      normal('Hinemoana'), normal('Hineitīweka'), normal('Hinekaikōmako')
    ]
  },
  {
    id: 'elf',
    name: 'Elf',
    firstNamesMale: [
      common('Faelar'), normal('Galinor'), normal('Halithir'), common('Keldrin'),
      normal('Orindel'), normal('Pelathir'), normal('Talarion'), normal('Doryen'),
      rare('Berenil'), normal('Ithlyn'), normal('Maevir'), common('Silvaen')
    ],
    firstNamesFemale: [
      common('Elowen'), normal('Caelynn'), common('Lysera'), normal('Rialenne'),
      normal('Aelith'), normal('Vaelora'), normal('Nyeliss'), normal('Ithrielle'),
      normal('Saevina'), common('Miriel'), normal('Aerwen'), rare('Calithra')
    ],
    firstNamesNeutral: [common('Sael'), normal('Ren'), normal('Fyrn'), normal('Lio'), rare('Vell')],
    lastNames: [
      common('Duskwhisper'), normal('Emberfall'), normal('Frostwillow'), common('Greyleaf'),
      normal('Hollowbrook'), normal('Ironvale'), normal('Lightward'), common('Moonbriar'),
      normal('Nightshade'), common('Silverbough'), normal('Starfallen'), normal('Swiftwind'),
      normal('Thornveil'), normal('Wintershade'), rare('Duskmere'), normal('Willowmere'),
      normal('Fernhollow'), normal('Brightwood'), rare('Shadewillow'), normal('Dawnbrook')
    ]
  },
  {
    id: 'tiefling',
    name: 'Tiefling',
    firstNamesMale: [
      common('Akros'), normal('Vaspian'), common('Ryven'), normal('Corvin'),
      normal('Kaelris'), normal('Malchion'), normal('Zaraith'), normal('Ondrek'),
      normal('Vexal'), rare('Damaric'), normal('Ithrek'), normal('Sorvane')
    ],
    firstNamesFemale: [
      common('Zephyra'), common('Seraphine'), normal('Ophira'), normal('Thessaly'),
      normal('Ilvara'), normal('Morwenna'), normal('Azurine'), normal('Kestrel'),
      normal('Nyxara'), normal('Ravenna'), rare('Sathiel'), normal('Voxelle')
    ],
    firstNamesNeutral: [common('Cael'), normal('Nocturne'), normal('Vexen'), normal('Ashira'), rare('Rael')],
    lastNames: [
      common('Ashborn'), common('Cinderfall'), normal('Duskhorn'), normal('Emberlash'),
      normal('Grimwick'), normal('Hollowfang'), normal('Ironbrand'), common('Nightfall'),
      normal('Shadowmere'), normal('Smokewreath'), normal('Blackthorn'), normal('Duskveil'),
      rare('Cindermoor'), normal('Hollowsworn'), normal('Ashvale'), normal('Grimhollow'),
      normal('Nightbrand'), rare('Vexmoor'), normal('Cinderhall'), normal('Duskbrand')
    ]
  },
  {
    id: 'dwarf',
    name: 'Dwarf',
    firstNamesMale: [
      common('Borin'), normal('Eldrin'), normal('Grombar'), normal('Kildrak'),
      normal('Modrin'), normal('Orvald'), normal('Skarr'), common('Thrain'),
      normal('Ulfar'), rare('Wilbrek'), normal('Dagrun'), normal('Torvik')
    ],
    firstNamesFemale: [
      common('Dagna'), common('Hilde'), normal('Lorna'), normal('Nissa'),
      normal('Runa'), normal('Volda'), normal('Brenna'), normal('Gudrun'),
      normal('Signe'), normal('Thyra'), normal('Brynna'), rare('Kagda')
    ],
    firstNamesNeutral: [common('Fenn'), normal('Rok'), normal('Dain'), normal('Skye'), rare('Brok')],
    lastNames: [
      common('Stonefist'), common('Ironbeard'), normal('Deepdelve'), normal('Goldvein'),
      normal('Hearthstone'), normal('Rockbrow'), common('Steelforge'), normal('Coalridge'),
      normal('Emberforge'), normal('Granitehall'), normal('Ashenpeak'), normal('Mossbeard'),
      normal('Cragholm'), normal('Ironroot'), rare('Deepforge'), normal('Stonewarden'),
      normal('Coppervein'), normal('Frosthammer'), normal('Anvilheart'), rare('Ironvein')
    ]
  },
  {
    id: 'halfling',
    name: 'Halfling',
    firstNamesMale: [
      common('Alder'), normal('Colby'), normal('Fennick'), normal('Gorse'),
      common('Jasper'), normal('Linden'), normal('Otho'), normal('Rosco'),
      normal('Tolman'), normal('Bramwell'), rare('Cotton'), normal('Digby')
    ],
    firstNamesFemale: [
      common('Daisy'), common('Holly'), normal('Marigold'), normal('Nettle'),
      normal('Pippa'), normal('Bryony'), normal('Poppy'), normal('Primrose'),
      normal('Rue'), normal('Tansy'), rare('Willa'), normal('Clover')
    ],
    firstNamesNeutral: [common('Sorrel'), normal('Fern'), normal('Wren'), normal('Berry'), rare('Ash')],
    lastNames: [
      common('Underbrush'), common('Barrelfoot'), normal('Cobblestone'), normal('Fairweather'),
      common('Goodbarrel'), normal('Hilltopple'), normal('Leafwhistle'), normal('Mossback'),
      normal('Nimblefinger'), normal('Proudpaw'), normal('Quickstep'), normal('Thistledown'),
      normal('Applecross'), normal('Berrywick'), rare('Honeyfoot'), normal('Puddlefoot'),
      normal('Tealeaf'), normal('Windwhistle'), rare('Nutbrown'), normal('Sweetwater')
    ]
  },
  {
    id: 'dragonborn',
    name: 'Dragonborn',
    firstNamesMale: [
      common('Vaeros'), normal('Zhorath'), normal('Kaelith'), common('Rhaskos'),
      normal('Ilvantor'), normal('Draventh'), normal('Korrash'), normal('Vhalkir'),
      normal('Ashkar'), rare('Mordrek'), normal('Thessarian'), normal('Grethis')
    ],
    firstNamesFemale: [
      common('Nyvrasa'), normal('Sylvraketh'), normal('Vashira'), common('Kethrala'),
      normal('Draxenne'), normal('Ilvashka'), normal('Rhozana'), normal('Zaethyr'),
      normal('Morvexa'), rare('Thessika'), normal('Vraelith'), normal('Kashera')
    ],
    firstNamesNeutral: [common('Vex'), normal('Zharn'), normal('Kael'), normal('Rhaz'), rare('Ith')],
    lastNames: [
      common('Emberclaw'), common('Stormscale'), normal('Ironwing'), normal('Duskflame'),
      normal('Goldhorn'), normal('Bronzetail'), normal('Shadowvane'), normal('Frostmane'),
      normal('Cinderwing'), normal('Thornscale'), normal('Emberhorn'), rare('Stormtail'),
      normal('Ashwing'), normal('Goldscale'), normal('Duskclaw'), normal('Ironscale'),
      rare('Bronzeflame'), normal('Frostwing'), normal('Shadowhorn'), normal('Cinderscale')
    ]
  },
  {
    id: 'orc',
    name: 'Orc',
    firstNamesMale: [
      common('Ruk'), common('Thok'), normal('Ghazan'), normal('Vrog'),
      normal('Korgath'), normal('Skarn'), normal('Brakka'), normal('Grumak'),
      normal('Bruk'), rare('Horgan'), normal('Drazul'), normal('Mogrek')
    ],
    firstNamesFemale: [
      common('Malka'), common('Ursha'), normal('Drenna'), normal('Uzza'),
      normal('Nazka'), normal('Yaggra'), normal('Zulka'), normal('Ragna'),
      normal('Skava'), rare('Vorka'), normal('Grishna'), normal('Thazra')
    ],
    firstNamesNeutral: [common('Grix'), normal('Zag'), normal('Krun'), normal('Vosh'), rare('Dun')],
    lastNames: [
      common('Bloodfang'), common('Skullcrusher'), normal('Ironjaw'), normal('Stonejaw'),
      normal('Duskfang'), normal('Grimtusk'), normal('Warhide'), normal('Ashclaw'),
      normal('Boneshard'), normal('Redtusk'), normal('Ironhide'), rare('Gorehorn'),
      normal('Blackfang'), normal('Stonehide'), normal('Duskclaw'), normal('Warfist'),
      rare('Ashtusk'), normal('Bonebrow'), normal('Grimfang'), normal('Skullhide')
    ]
  },
  {
    id: 'goliath',
    name: 'Goliath',
    firstNamesMale: [
      common('Kavaan'), common('Thurgo'), normal('Torvin'), normal('Halvor'),
      normal('Brolga'), normal('Draska'), normal('Kessil'), normal('Vrangar'),
      normal('Bjorund'), rare('Ormek'), normal('Skarvald'), normal('Rutger')
    ],
    firstNamesFemale: [
      common('Kaldra'), common('Vrenna'), normal('Ymira'), normal('Sunnva'),
      normal('Freyka'), normal('Astrun'), normal('Drovna'), normal('Kessa'),
      normal('Brenja'), rare('Vala'), normal('Skaldra'), normal('Rangva')
    ],
    firstNamesNeutral: [common('Vrik'), normal('Tuun'), normal('Skorn'), normal('Haan'), rare('Orvun')],
    lastNames: [
      common('Stonebreaker'), common('Cloudtop'), normal('Stormrender'), normal('Peakwalker'),
      normal('Frostbrow'), normal('Thunderfist'), normal('Duskcrest'), normal('Snowstride'),
      normal('Ironpeak'), normal('Skyrend'), normal('Stormcrest'), rare('Frostpeak'),
      normal('Cragstrider'), normal('Thunderpeak'), normal('Snowbrow'), normal('Stonecrest'),
      rare('Windpeak'), normal('Duskstrider'), normal('Frostrender'), normal('Cloudstrider')
    ]
  }
]

// Real-world naming-tradition sources a CUSTOM race can pool from instead of
// a baseline fantasy-race bank — inspired by fantasytowngenerator.com's
// multi-select name-source picker. List and scope confirmed with the user
// (see feedback_project_vault_no_campaign_content — the user supplies which
// categories exist, Claude builds the content within them). Each entry is
// its own single cohesive real-world naming tradition, so — unlike the
// deliberately-uniform-weight Human bank above, which mixes many traditions
// into one pool and would be skewed by weighting any of them — these DO use
// common/normal/rare weighting for in-tradition flavor, same as the 7
// fantasy race banks.
//
// NOT included: a "Native American" category. The user asked for one and
// pointed at two research sources; both that research and follow-up
// searches on specific nations (Diné/Navajo, Cherokee), plus a further
// FirstVoices deep-dive in 2026-08 (see
// docs/plans/2026-08-08-native-pacific-names-research.md), turned up
// traditional given names described as ceremonial/sacred — reserved for
// spiritual contexts, not generic reuse — plus mostly low-quality,
// non-tribal-authored source material. The user decided 2026-08-09 this
// topic is too sensitive to include at all — this is a closed decision,
// not a research gap. Do not revisit without the user explicitly reopening
// it themselves.
export const NAME_INSPIRATION_SOURCES: NameBank[] = [
  {
    id: 'nordic',
    name: 'Nordic',
    firstNamesMale: [
      common('Erik'), common('Lars'), common('Magnus'), common('Anders'),
      normal('Sven'), normal('Bjorn'), normal('Nils'), normal('Gustav'),
      normal('Henrik'), normal('Fredrik'), normal('Olaf'), normal('Leif'),
      normal('Anton'), normal('Emil'), normal('Axel'), normal('Kasper'),
      normal('Aleksi'), rare('Sigurd'), rare('Viggo'), rare('Torbjorn')
    ],
    firstNamesFemale: [
      common('Astrid'), common('Ingrid'), common('Freya'), common('Elin'),
      normal('Karin'), normal('Liv'), normal('Maja'), normal('Signe'),
      normal('Ida'), normal('Linnea'), normal('Saga'), normal('Ronja'),
      normal('Vilma'), normal('Aino'), normal('Elsa'), normal('Thora'),
      normal('Hedda'), rare('Solveig'), rare('Kajsa'), rare('Gunhild')
    ],
    firstNamesNeutral: [common('Kim'), common('Noa'), normal('Eli'), normal('Sasha'), normal('Sol'), normal('Nova'), normal('Sami'), rare('Frey')],
    lastNames: [
      common('Andersen'), common('Nilsson'), common('Johansson'), common('Larsen'), common('Eriksen'),
      normal('Karlsson'), normal('Berg'), normal('Lindgren'), normal('Holm'), normal('Solberg'),
      normal('Fredriksen'), normal('Bakken'), normal('Haugen'), normal('Sandvik'), normal('Dahl'),
      normal('Lund'), normal('Nystrom'), normal('Rasmussen'), normal('Kristiansen'), normal('Virtanen'),
      rare('Myklebust'), rare('Viklund'), rare('Backlund'), rare('Halvorsen')
    ]
  },
  {
    id: 'romantic',
    name: 'Romantic (Italian / French / Portuguese / Spanish / Latin)',
    firstNamesMale: [
      common('Marco'), common('Luca'), common('Julien'), common('Carlos'), common('Diego'),
      normal('Matteo'), normal('Enzo'), normal('Dario'), normal('Théo'), normal('Antoine'),
      normal('Mathis'), normal('João'), normal('Tiago'), normal('Rafael'), normal('Bruno'),
      normal('Mateo'), normal('Emilio'), normal('Gabriel'), rare('Marcus'), rare('Augustus'), rare('Cassian')
    ],
    firstNamesFemale: [
      common('Giulia'), common('Chiara'), common('Camille'), common('Sofia'), common('Camila'),
      normal('Bianca'), normal('Alessia'), normal('Valentina'), normal('Margaux'), normal('Élodie'),
      normal('Léa'), normal('Beatriz'), normal('Mariana'), normal('Inês'), normal('Catarina'),
      normal('Lucía'), normal('Elena'), rare('Aurelia'), rare('Flavia'), rare('Livia')
    ],
    firstNamesNeutral: [common('Andrea'), common('Noel'), normal('Guadalupe'), normal('Ariel'), normal('Dominique'), normal('Simone'), normal('Rene'), rare('Nino')],
    lastNames: [
      common('Rossi'), common('Silva'), common('Rousseau'), common('Reyes'), common('Costa'),
      normal('Bianchi'), normal('Moretti'), normal('Ricci'), normal('Greco'), normal('Lavigne'),
      normal('Beaumont'), normal('Girard'), normal('Ferreira'), normal('Pereira'), normal('Carvalho'),
      normal('Morales'), normal('Castillo'), normal('Herrera'), normal('Vargas'),
      rare('Marino'), rare('Fontaine'), rare('Moreau'), rare('Nunes'), rare('Delgado')
    ]
  },
  {
    id: 'british-isles',
    name: 'British Isles (English / Irish / Welsh / Scottish)',
    firstNamesMale: [
      common('Edward'), common('Sean'), common('Rhys'), common('Angus'), common('Liam'),
      normal('William'), normal('Henry'), normal('Arthur'), normal('Percy'),
      normal('Declan'), normal('Cormac'), normal('Fionn'), normal('Ronan'),
      normal('Dylan'), normal('Gareth'), normal('Owen'),
      normal('Hamish'), normal('Callum'),
      rare('Eoin'), rare('Gruffydd'), rare('Fergus')
    ],
    firstNamesFemale: [
      common('Eleanor'), common('Niamh'), common('Carys'), common('Fiona'), common('Charlotte'),
      normal('Beatrice'), normal('Edith'), normal('Margaret'), normal('Alice'),
      normal('Aoife'), normal('Saoirse'), normal('Roisin'), normal('Maeve'),
      normal('Bronwen'), normal('Gwendolyn'), normal('Rhiannon'),
      normal('Isla'), normal('Elspeth'),
      rare('Angharad'), rare('Catriona'), rare('Orla')
    ],
    firstNamesNeutral: [
      common('Rowan'), common('Robin'),
      normal('Kerry'), normal('Shay'), normal('Bryn'), normal('Ashby'), normal('Reagan'),
      rare('Blair')
    ],
    lastNames: [
      common('Baker'), common('Byrne'), common('Vaughan'), common('Fraser'), common('Turner'),
      normal('Fletcher'), normal('Whitfield'), normal('Hartley'), normal('Sutton'),
      normal('Doyle'), normal('Kavanagh'), normal('Malone'), normal('Brennan'),
      normal('Pritchard'), normal('Llewellyn'), normal('Bevan'),
      normal('Mackenzie'), normal('Cameron'), normal('Sinclair'),
      rare('Ashworth'), rare('Flynn'), rare('Probert'), rare('Buchanan'), rare('Douglas')
    ]
  },
  {
    id: 'eastern-european',
    name: 'Eastern European',
    firstNamesMale: [
      common('Dmitri'), common('Ivan'), common('Tomasz'), common('Nikolai'),
      normal('Sergei'), normal('Pavel'), normal('Boris'), normal('Anton'), normal('Yuri'),
      normal('Oleg'), normal('Karol'), normal('Marek'), normal('Wojciech'), normal('Josef'),
      normal('Vaclav'), normal('Andriy'), normal('Taras'), normal('Istvan'),
      rare('Vlad'), rare('Radu')
    ],
    firstNamesFemale: [
      common('Olga'), common('Natasha'), common('Katarzyna'), common('Elena'),
      normal('Katarina'), normal('Nadia'), normal('Irina'), normal('Svetlana'), normal('Anya'),
      normal('Vera'), normal('Agnieszka'), normal('Zofia'), normal('Magda'), normal('Eliska'),
      normal('Tereza'), normal('Oksana'), normal('Yulia'), normal('Zsofia'),
      rare('Ilona'), rare('Ioana')
    ],
    firstNamesNeutral: [common('Sasha'), common('Zhenya'), normal('Valya'), normal('Nikita'), normal('Dana'), normal('Robin'), normal('Kai'), rare('Aleks')],
    lastNames: [
      common('Volkov'), common('Nowak'), common('Kowalski'), common('Petrov'), common('Novak'),
      normal('Sokolov'), normal('Ivanov'), normal('Dvorak'), normal('Kovac'), normal('Horvat'),
      normal('Nagy'), normal('Kovacs'), normal('Popescu'), normal('Ionescu'), normal('Kravets'),
      normal('Melnyk'), normal('Wojcik'), normal('Kaminski'), normal('Zielinski'),
      rare('Baranov'), rare('Smirnov'), rare('Kuznetsov'), rare('Nemec'), rare('Vaculik')
    ]
  },
  {
    id: 'east-asian',
    name: 'East Asian',
    firstNamesMale: [
      common('Wei'), common('Hao'), common('Haruto'), common('Ren'), common('Min-jun'),
      normal('Jian'), normal('Chen'), normal('Ming'), normal('Yong'), normal('Feng'),
      normal('Sora'), normal('Kenji'), normal('Daiki'), normal('Kaito'), normal('Seo-jun'),
      normal('Do-yoon'), normal('Jun-ho'), normal('Ji-ho'),
      rare('Temujin'), rare('Batbayar')
    ],
    firstNamesFemale: [
      common('Mei'), common('Ling'), common('Yuki'), common('Sakura'), common('Seo-yeon'),
      normal('Xia'), normal('Fang'), normal('Yan'), normal('Jing'), normal('Lan'),
      normal('Hana'), normal('Aoi'), normal('Yui'), normal('Rin'), normal('Ji-woo'),
      normal('Min-seo'), normal('Ha-eun'), normal('Soo-ah'),
      rare('Altantsetseg'), rare('Sarnai')
    ],
    firstNamesNeutral: [common('Yu'), common('Jin'), normal('Xin'), normal('Hikaru'), normal('Eun'), normal('Nari'), normal('Kyo'), rare('Bat')],
    lastNames: [
      common('Wang'), common('Li'), common('Kim'), common('Tanaka'), common('Lee'),
      normal('Zhang'), normal('Chen'), normal('Liu'), normal('Yang'), normal('Suzuki'),
      normal('Sato'), normal('Watanabe'), normal('Yamamoto'), normal('Nakamura'), normal('Park'),
      normal('Choi'), normal('Jung'), normal('Kang'),
      rare('Batbold'), rare('Ganbaatar'), rare('Dorj'), rare('Tsend'), rare('Erdene'), rare('Sukhbaatar')
    ]
  },
  {
    id: 'south-asian',
    name: 'South Asian',
    firstNamesMale: [
      common('Arjun'), common('Ravi'), common('Aarav'), common('Rohan'), common('Ahmed'),
      normal('Vikram'), normal('Rajesh'), normal('Suresh'), normal('Harpreet'), normal('Jaspreet'),
      normal('Gurpreet'), normal('Karthik'), normal('Arun'), normal('Vijay'), normal('Senthil'),
      normal('Debashish'), normal('Anirban'), normal('Rahul'),
      rare('Imran'), rare('Farhan')
    ],
    firstNamesFemale: [
      common('Aditi'), common('Priya'), common('Ananya'), common('Kavya'), common('Ayesha'),
      normal('Neha'), normal('Pooja'), normal('Anjali'), normal('Simran'), normal('Amandeep'),
      normal('Harleen'), normal('Meena'), normal('Divya'), normal('Lakshmi'), normal('Kavitha'),
      normal('Priyanka'), normal('Ritu'), normal('Anika'),
      rare('Zara'), rare('Sana')
    ],
    firstNamesNeutral: [common('Kiran'), common('Preet'), normal('Amrit'), normal('Deep'), normal('Chand'), normal('Nur'), normal('Arya'), rare('Sunny')],
    lastNames: [
      common('Sharma'), common('Singh'), common('Khan'), common('Patel'), common('Kaur'),
      normal('Verma'), normal('Gupta'), normal('Mehta'), normal('Joshi'), normal('Rao'),
      normal('Gill'), normal('Dhillon'), normal('Pillai'), normal('Iyer'), normal('Raman'),
      normal('Krishnan'), normal('Chatterjee'), normal('Banerjee'),
      rare('Sengupta'), rare('Das'), rare('Malik'), rare('Qureshi'), rare('Siddiqui'), rare('Chaudhry')
    ]
  },
  {
    id: 'west-asian',
    name: 'West Asian (Turkish / Persian / Armenian / Georgian / Azerbaijani / Kurdish / Hebrew)',
    firstNamesMale: [
      common('Mehmet'), common('Emre'), common('Cyrus'), common('Darius'), common('Ari'),
      normal('Kaan'), normal('Baris'), normal('Farhan'), normal('Kian'), normal('Armen'),
      normal('Vahan'), normal('Tigran'), normal('Giorgi'), normal('Levan'), normal('Luka'),
      normal('Elvin'), normal('Tural'), normal('Rojhat'),
      rare('Diyar'), rare('Noam')
    ],
    firstNamesFemale: [
      common('Elif'), common('Ayse'), common('Roxana'), common('Yasmin'), common('Maya'),
      normal('Ece'), normal('Zeynep'), normal('Neda'), normal('Shirin'), normal('Ani'),
      normal('Lusine'), normal('Nare'), normal('Nino'), normal('Tamar'), normal('Salome'),
      normal('Aysel'), normal('Nigar'), normal('Berivan'),
      rare('Rojin'), rare('Talia')
    ],
    firstNamesNeutral: [common('Deniz'), common('Tal'), normal('Sahar'), normal('Baran'), normal('Or'), normal('Aras'), normal('Sina'), rare('Roya')],
    lastNames: [
      common('Yilmaz'), common('Cohen'), common('Aliyev'), common('Hosseini'), common('Petrosyan'),
      normal('Kaya'), normal('Demir'), normal('Aydin'), normal('Rostami'), normal('Karimi'),
      normal('Ahmadi'), normal('Sarkisyan'), normal('Grigoryan'), normal('Avetisyan'), normal('Beridze'),
      normal('Gelashvili'), normal('Mammadov'), normal('Huseynov'),
      rare('Tsereteli'), rare('Abashidze'), rare('Ismayilov'), rare('Levi'), rare('Rashid'), rare('Amedi')
    ]
  },
  {
    id: 'north-african-middle-eastern',
    name: 'North African / Middle Eastern',
    firstNamesMale: [
      common('Omar'), common('Yusuf'), common('Tariq'), common('Khalid'), common('Hassan'),
      normal('Karim'), normal('Ali'), normal('Amir'), normal('Samir'), normal('Rashid'),
      normal('Nasser'), normal('Mostafa'), normal('Hamza'), normal('Anis'), normal('Sami'),
      normal('Faisal'), normal('Bilal'), normal('Zayd'),
      rare('Idris'), rare('Malik')
    ],
    firstNamesFemale: [
      common('Fatima'), common('Layla'), common('Amira'), common('Yasmin'), common('Noor'),
      normal('Salma'), normal('Huda'), normal('Rania'), normal('Dalia'), normal('Zainab'),
      normal('Aisha'), normal('Hana'), normal('Mariam'), normal('Sara'), normal('Nadia'),
      normal('Samira'), normal('Iman'), normal('Farida'),
      rare('Widad'), rare('Basma')
    ],
    firstNamesNeutral: [common('Nour'), common('Amal'), normal('Karam'), normal('Salam'), normal('Hilal'), normal('Rayan'), normal('Amin'), rare('Sena')],
    lastNames: [
      common('Haddad'), common('Khalil'), common('Mansour'), common('Saleh'), common('Aziz'),
      normal('Farouk'), normal('Rahman'), normal('Fahmy'), normal('Sabbagh'), normal('Najjar'),
      normal('Khoury'), normal('Barakat'), normal('Hakim'), normal('Idrissi'), normal('Benali'),
      normal('Cherkaoui'), normal('Amrani'), normal('Younes'),
      rare('Ziani'), rare('Bouzid'), rare('Selmani'), rare('Kassab'), rare('Deeb'), rare('Antar')
    ]
  },
  {
    id: 'central-african',
    name: 'Central African',
    firstNamesMale: [
      common('Emmanuel'), common('Patrice'), common('Serge'), common('Guy'), common('Blaise'),
      normal('Baraka'), normal('Jelani'), normal('Kito'), normal('Sefu'), normal('Tau'),
      normal('Zuberi'), normal('Bakari'), normal('Dieudonné'), normal('Innocent'), normal('Aime'),
      normal('Faustin'), normal('Bienvenu'), normal('Franck'),
      rare('Yannick'), rare('Junior')
    ],
    firstNamesFemale: [
      common('Grace'), common('Chantal'), common('Josephine'), common('Divine'), common('Solange'),
      normal('Amani'), normal('Neema'), normal('Furaha'), normal('Malaika'), normal('Zawadi'),
      normal('Bahati'), normal('Nzuzi'), normal('Kavira'), normal('Mwamini'), normal('Espoir'),
      normal('Bernadette'), normal('Odile'), normal('Clarisse'),
      rare('Aline'), rare('Prisca')
    ],
    firstNamesNeutral: [common('Amani'), common('Divine'), normal('Baraka'), normal('Tumaini'), normal('Nsuka'), normal('Kanku'), normal('Doudou'), rare('Junior')],
    lastNames: [
      common('Mabiala'), common('Ilunga'), common('Ngoma'), common('Kasongo'), common('Mukendi'),
      normal('Nzeza'), normal('Mulumba'), normal('Kanyinda'), normal('Tshibangu'), normal('Kabongo'),
      normal('Mwepu'), normal('Bemba'), normal('Moukoko'), normal('Ondo'), normal('Eyenga'),
      normal('Ekwalla'), normal('Assam'), normal('Ateba'),
      rare('Mbida'), rare('Ngono'), rare('Zang'), rare('Owona'), rare('Fouda'), rare('Essomba')
    ]
  },
  {
    id: 'south-african',
    name: 'South African',
    firstNamesMale: [
      common('Sipho'), common('Themba'), common('Thabo'), common('Pieter'), common('Lucky'),
      normal('Mandla'), normal('Bongani'), normal('Sizwe'), normal('Kgosi'), normal('Tumelo'),
      normal('Kabelo'), normal('Tebogo'), normal('Jaco'), normal('Willem'), normal('Hendrik'),
      normal('Lwazi'), normal('Nkosana'), normal('Vusi'),
      rare('Sanele'), rare('Andile')
    ],
    firstNamesFemale: [
      common('Nomvula'), common('Thandiwe'), common('Lerato'), common('Precious'), common('Blessing'),
      normal('Zanele'), normal('Ntombi'), normal('Nokuthula'), normal('Lindiwe'), normal('Palesa'),
      normal('Refilwe'), normal('Dineo'), normal('Anneke'), normal('Susara'), normal('Marietjie'),
      normal('Elsabe'), normal('Zodwa'), normal('Bongiwe'),
      rare('Nomsa'), rare('Khanyisile')
    ],
    firstNamesNeutral: [common('Karabo'), common('Neo'), normal('Lesedi'), normal('Reitumetse'), normal('Kagiso'), normal('Onalenna'), normal('Ayanda'), rare('Bontle')],
    lastNames: [
      common('Dlamini'), common('Ndlovu'), common('Khumalo'), common('Nkosi'), common('Botha'),
      normal('Mahlangu'), normal('Sithole'), normal('Zulu'), normal('Molefe'), normal('Mokoena'),
      normal('Motaung'), normal('Sebe'), normal('van der Merwe'), normal('du Plessis'), normal('Pretorius'),
      normal('Fourie'), normal('Mabaso'), normal('Radebe'),
      rare('Naude'), rare('Mthembu'), rare('Skosana'), rare('Baloyi'), rare('Chiweshe'), rare('Moyo')
    ]
  },
  {
    // Smaller than the other regions above by design, not an oversight —
    // every word here was individually looked up against Pukui & Elbert's
    // Hawaiian Dictionary (via wehewehe.org/Ulukau) and only kept if it came
    // back as a real headword with the stated meaning. lastNames are real
    // attested two-word compounds already in the dictionary (found via its
    // "contains" search, e.g. "wai lani" / "pua lani" / "loke lani"), not
    // combinations invented this session — see
    // docs/plans/2026-08-08-native-pacific-names-research.md for the
    // word-by-word sourcing notes and the reasoning behind both calls.
    id: 'hawaiian',
    name: 'Hawaiian',
    firstNamesMale: [
      common('Kai'), common('Koa'),
      normal('Ikaika'), normal('Noa'),
      rare('Haku')
    ],
    firstNamesFemale: [
      common('Pua'), common('Maile'), common('Nani'),
      normal('Mele'), normal('Kiele'), normal('ʻIlima'),
      rare('Momi')
    ],
    firstNamesNeutral: [
      common('Lani'), common('Aloha'),
      normal('Nalu'), normal('Mana'), normal('Hōkū'),
      rare('Aliʻi'), rare('Mauli'), rare('Lei')
    ],
    lastNames: [
      common('Leilani'), common('Pualani'),
      normal('Wailani'), normal('Lokelani'), normal('Hōkūkai'),
      rare('Waolani'), rare('Papalani'), rare('Puahōkū')
    ]
  },
  {
    // Same sourcing standard as the Hawaiian entry above — every firstName
    // word individually looked up against Te Aka (maoridictionary.co.nz,
    // John C. Moorfield). lastNames are real dictionary entries too, but of
    // a different kind: minor/secondary personifications (a sea atua, a
    // tree spirit, a moth/flute-music atua, a mist personification, a
    // planet, a star) rather than ordinary compound nouns — Te Aka didn't
    // have a Hawaiian-lani-style "ordinary word doubling as a name" seam to
    // mine, so this leans on figures one tier below the primal
    // creator-deities (excludes Rangi-nui, Tāne, Hine-nui-te-pō, and any
    // real historical named individual) — confirmed with the user this
    // tier was an acceptable substitute, see
    // docs/plans/2026-08-08-native-pacific-names-research.md.
    id: 'maori',
    name: 'Māori',
    firstNamesMale: [
      common('Tāne'),
      normal('Ariki'), normal('Manu'),
      rare('Tūī')
    ],
    firstNamesFemale: [
      common('Aroha'), common('Kahurangi'),
      normal('Hine'), normal('Marama'),
      rare('Wahine')
    ],
    firstNamesNeutral: [
      common('Rangi'), common('Moana'),
      normal('Wai'), normal('Ao'),
      rare('Huia'), rare('Whetū')
    ],
    lastNames: [
      common('Hinemoana'), common('Hineitīweka'),
      normal('Hinekaikōmako'), normal('Hineraukatauri'),
      rare('Hinepūkohurangi'), rare('Whakaahurangi')
    ]
  }
]

// Used when a race id resolves to neither a baseline bank nor a custom race
// with any inspiration sources selected yet — keeps generation from ever
// crashing on an unconfigured race, at the cost of obviously-generic output.
const FALLBACK_NAME_BANK: NameBank = {
  id: 'generic',
  name: 'Generic',
  firstNamesMale: [normal('Ash'), normal('Brin'), normal('Cael'), normal('Del')],
  firstNamesFemale: [normal('Ero'), normal('Fen'), normal('Gale'), normal('Hollis')],
  firstNamesNeutral: [normal('Vale'), normal('Marsh')],
  lastNames: [normal('Thorn'), normal('Cross'), normal('Wood'), normal('Hale')]
}

/** Display label for a race id: a custom race's own name, else a capitalized baseline race id (e.g. "human" -> "Human"). Shared by every place that needs to show a race id to a user — the SetupTab's race picker, the People tab's race filter, and sample-output scripts — instead of ever displaying a raw id (which, for a custom race, is a crypto.randomUUID()). */
export function raceLabel(raceId: string, customRaces: CustomRaceDef[] = []): string {
  const custom = customRaces.find((cr) => cr.id === raceId)
  if (custom) return custom.name
  return raceId.charAt(0).toUpperCase() + raceId.slice(1)
}

/** Finds the right name pool for a race id: baseline bank, else a custom race's pooled inspiration sources, else a generic fallback. */
export function resolveNameBank(
  raceId: string,
  customRaces: CustomRaceDef[] = [],
  inspirationSources: NameBank[] = NAME_INSPIRATION_SOURCES
): NameBank {
  const baseline = BASELINE_NAME_BANKS.find((bank) => bank.id === raceId)
  if (baseline) return baseline

  const custom = customRaces.find((race) => race.id === raceId)
  if (custom) {
    const sources = inspirationSources.filter((source) => custom.inspirationSourceIds.includes(source.id))
    if (sources.length > 0) {
      return {
        id: custom.id,
        name: custom.name,
        firstNamesMale: sources.flatMap((source) => source.firstNamesMale),
        firstNamesFemale: sources.flatMap((source) => source.firstNamesFemale),
        firstNamesNeutral: sources.flatMap((source) => source.firstNamesNeutral),
        lastNames: sources.flatMap((source) => source.lastNames)
      }
    }
  }

  return FALLBACK_NAME_BANK
}

// Male/Female draw from their own pool plus the bank's unisex pool; any
// other gender string (Nonbinary, or a custom value someone typed) draws
// from all three pools combined — more variety, not less, for residents
// outside the binary rather than limiting them to just the (smallest) pool.
function genderPool(bank: NameBank, gender: string): WeightedName[] {
  if (gender === 'Male') return [...bank.firstNamesMale, ...bank.firstNamesNeutral]
  if (gender === 'Female') return [...bank.firstNamesFemale, ...bank.firstNamesNeutral]
  return [...bank.firstNamesMale, ...bank.firstNamesFemale, ...bank.firstNamesNeutral]
}

export function generateName(bank: NameBank, gender: string, rng: () => number = Math.random): string {
  const first = pickWeighted(genderPool(bank, gender), rng)?.name ?? 'Unnamed'
  const last = pickWeighted(bank.lastNames, rng)
  return last ? `${first} ${last.name}` : first
}

// Personality/goal for a notable (staffed-building resident) are drawn from
// two separate pools — one trait line, one goal line, picked independently
// — rather than one flat list of full personalities, so the combinations
// stay varied from a small seed set.
//
// NOTABLE_TRAITS and NOTABLE_GOALS are both user-authored, not AI-generated
// — the user dictated these themselves (recorded, transcribed, then
// confirmed/corrected) as a deliberate replacement for the original
// Claude-written lists, wanting the notable-NPC flavor text to be their own
// creative content rather than generated. See
// [[feedback_project_vault_no_campaign_content]]-style precedent
// (class-reference, conditions.ts): Claude builds the mechanism, the user
// supplies the content.
export const NOTABLE_TRAITS: string[] = [
  'Always has some kind of animal following them around',
  'Wears a lot of gold jewelry',
  'Wears a lot of silver jewelry',
  'Wears mismatched jewelry',
  'Wears lots of rhinestones and gems',
  'Has a lot of tattoos',
  'Has one favorite color that shows up in everything they wear',
  'Hates one specific color',
  'Always dresses in formal attire',
  'Always dressed in silk',
  'Wears mismatched clothing',
  'Has a really weird hairstyle',
  'Always has messy hair',
  'Has lots of freckles',
  'Has heterochromia',
  'Wears strange glasses',
  'Has a lazy eye',
  'Has bad breath',
  'Blind in one eye',
  'Blind in both eyes',
  'Deaf in one ear',
  'Completely deaf',
  'Smells like animals',
  'Smells like expensive cologne',
  'Smells floral',
  'Smells like tobacco',
  'Smells really bad',
  'Always a little sweaty',
  'Talks with a very strange accent',
  'Uses long words incorrectly',
  'Talks in very short sentences',
  'Talks exclusively in very long words',
  'Talks very loudly',
  'Never talks above a whisper',
  'Has some kind of vocal tic',
  'Whistles constantly',
  'Constantly sniffling',
  'Yawns a lot',
  'Never makes eye contact',
  'Constantly smiling',
  'Always seems happy',
  'Always seems sad',
  'Fidgets constantly with their hands',
  'Fidgets constantly with their hair',
  'Always fidgeting with the same small object',
  'Talks a lot with their hands',
  'Has trouble focusing',
  'Hyperfocuses on one topic and won\'t stop talking about it',
  'Constantly getting harassed by birds',
  'Thinks they\'re famous and expects to be treated like it',
  'Always cold',
  'Always hot',
  'Always sleepy',
  'Taps their fingers constantly',
  'Itches themselves a lot',
  'Lies constantly',
  'Will never tell a lie',
  'Talks constantly',
  'Clumsy',
  'Doesn\'t like being touched',
  'Very patient',
  'Very impatient',
  'Has a unique sense of humor',
  'Very stoic',
  'Very humble',
  'Indecisive',
  'Confidently wrong, a lot',
  'Doesn\'t like being corrected',
  'Likes correcting other people',
  'Cracks their neck, knuckles, and back constantly',
  'Really good with plants',
  'Really good with animals',
  'Doesn\'t like animals',
  'Talks to animals as if they understand',
  'Talks to plants as if they understand',
  'Adrenaline junkie',
  'Obsessed with the approval of others',
  'Perfectionist',
  'Generally suspicious of everyone',
  'Takes credit for other people\'s work',
  'Genuinely kind',
  'Always trying to sell you something',
  'Mean',
  'Always looks angry',
  'Very entitled, comes from a rich family',
  'Hates magic',
  'Loves magic',
  'Dances around when moving',
  'Cannot dance but thinks they can',
  'Always has their nose in a book',
  'Head in the clouds',
  'Goes on lots of tangents',
  'Cross-eyed',
  'Nose twitches',
  "Can't smell",
  'Tone deaf',
  'Conspiracy theorist',
  'Always talks about "the good old days"',
  'Grumpy',
  'Has very nice teeth',
  'Has very bad teeth',
  'Has a flower/flowers in their hair',
  'Talks about how they only have {days} days left to live',
  'Hates new technology/magic',
  'Believes they are the descendant of a god',
  'Sings to animals',
  'Sings to plants',
  'Constantly refers to "the spiders"',
  'Believes they need to be the one to fix everything',
  'Protective of children',
  'Protective of the elderly',
  'Runs away from their problems',
  'Kleptomaniac',
  'Pyromaniac',
  'Is always trying to help everyone',
  'Only thinks about themselves',
  'Narcissistic',
  'Vegan',
  'Easily bribed',
  'Easily bribed with candy',
  'Easily bribed with drugs',
  'Knows a lot about plants',
  'Knows a lot about anatomy',
  'Knows a lot about birds',
  'Talks about their special interest at every opportunity',
  'Winks a lot',
  "Doesn't understand sarcasm",
  'Needs everything to be in order',
  'Never smiles',
  'Dyslexic',
  'Has a fear of birds',
  'Has a fear of heights',
  'Has claustrophobia',
  'Has a fear of spiders',
  'Scared of the dark',
  'Is terrified of failing',
  "Stands too close to the person they're talking to",
  'Interrupts whoever they are talking to',
  'Says "uh-huh, okay, yep, hmmm" throughout the conversation',
  'Tries to finish your sentences',
  'Constantly mispronounces words',
  'Nods frantically, encouraging you to talk faster',
  'Answers a completely different question than the one asked',
  "Closes their eyes throughout the conversation, making you wonder if they're asleep",
  'Over-shares personal information',
  'Stands cross-armed in a defensive posture throughout the conversation',
  'Stares intently at you while talking',
  'Touches your shoulder while talking to you',
  'Constantly glances over their shoulder looking for something or someone',
  'Laughs out loud at inappropriate times',
  'Coughs incessantly while you are speaking',
  'Blinks a lot',
  'Speaks in a very squeaky voice',
  'Speaks in a very gravelly voice',
  'Speaks too quickly',
  'Speaks too slowly',
  'Is afraid and nervous',
  'Cries constantly throughout the conversation',
  'Is paranoid and jumpy throughout the conversation',
  'Speaks in an intense, dramatic whisper',
  'Uses filler words and sounds throughout ("ummm," "ahhhh")',
  'Spits when they speak',
  'Speaks with a heavy lisp'
]

export const NOTABLE_GOALS: string[] = [
  'wants a big family',
  'is secretly in love with someone',
  'has a notable rival',
  'wants to open another location',
  'wants to change careers',
  'is trying to solve the murder of a dead family member',
  'wants to move to a different place',
  'wants to work in government',
  'wants to have their artwork displayed in a museum',
  'fears falling into poverty',
  'wants to become rich',
  'fears being caught for a crime they committed long ago',
  'wants to complete a collection they\'ve been working on',
  'wants to retire and stop working',
  'fears dying alone',
  'wants to become religious and start spreading the word of their religion',
  'wants to achieve the purpose a deity or higher being has given them',
  'wants to live comfortably',
  'wants to adopt a bunch of animals',
  'is on a mission from a mentor',
  'wants to take over for their mentor',
  'wants to be a local hero',
  'wants to live up to their family legacy',
  'wants to be a successful criminal',
  'wants to cause chaos',
  'is trying to make up for something they did in the past',
  'is trying to repair their family\'s legacy',
  'has a specific goal for their town that they\'re trying to get people to care about',
  'wants to be loved',
  'wants to be accepted',
  'wants to spread joy',
  'wants to spread hate',
  'wants to do something impossible',
  'just wants to follow orders',
  'fears obsolescence',
  'wants to become famous',
  'wants to be a world-renowned musician',
  'wants to be a world-renowned athlete',
  'wants to explore the world',
  'wants to protect people',
  'wants to better themselves',
  'wants to rule somewhere',
  'wants to find out a secret',
  'wants to see other people suffer',
  'specifically hates a god or other powerful being and wants to see them fall',
  'wants to conquer a fear',
  'wants to repay a debt',
  'wants to live by the will of the gods',
  'wants to break an addiction',
  'wants to not be bored',
  'wants to apologize for something they did to someone no longer living nearby',
  'wants to avoid a specific person',
  'wants to find someone who has gone missing',
  'hates magic and is trying to get rid of it',
  'wants to educate people',
  'wants to spread magic',
  'wants to avenge someone',
  'wants to help a family member or friend find love',
  'wants to help strangers',
  'wants to make the world a better place',
  'wants to make the world a worse place',
  'is a storm-chaser',
  'is looking for a rare plant',
  'is looking for a rare animal',
  'wants to meet someone famous',
  'wants to travel more',
  'wants to be a pirate',
  'wants to be a chef',
  'wants to be a professor',
  'wants to be a hero',
  'wants to save the world',
  'wants to discover secrets about the past',
  'wants to discover secrets about the universe',
  'wants more justice in the world',
  'wants anarchy',
  'wants world peace',
  'wants to settle down',
  'wants to be a baker',
  'wants to be a florist',
  'wants to own a bookshop',
  'wants to be a toy maker',
  'wants to get revenge on their childhood bully',
  'wants to drop everything and move somewhere else',
  'wants to be a healer'
]

export function generatePersonalityLine(rng: () => number = Math.random): string {
  const line = NOTABLE_TRAITS[Math.floor(rng() * NOTABLE_TRAITS.length)]
  // One trait is templated rather than static text — "only has N days left
  // to live" — because the user wants a fresh random 1-12 every time it's
  // picked, not the same number for every NPC who gets this trait. Drawn
  // from the same seeded rng as the trait pick itself so settlement
  // generation stays fully reproducible from its seed.
  if (line.includes('{days}')) {
    const days = Math.floor(rng() * 12) + 1
    return line.replace('{days}', String(days))
  }
  return line
}

export function generateGoal(rng: () => number = Math.random): string {
  return NOTABLE_GOALS[Math.floor(rng() * NOTABLE_GOALS.length)]
}

// One-line flavor for non-notable (stub) residents — cheaper than a full
// personality/goal, but enough to make a household list feel populated
// rather than a wall of identical blank names.
export const FLAVOR_TAG_TEMPLATES: string[] = [
  'Whistles constantly, off-key.',
  'Owes someone in town a favor.',
  'Collects odd trinkets from travelers.',
  'Superstitious about the number thirteen.',
  'Known for a suspiciously green thumb.',
  "Hasn't missed a market day in years.",
  'Quick with a rumor, slow with the truth.',
  'Keeps a lucky charm on a cord around their neck.',
  'Fiercely proud of a mediocre vegetable garden.',
  'Always the first to volunteer, rarely finishes the job.',
  'Distrustful of anyone not born in town.',
  'Sings to the animals; swears it helps.',
  'Never talks about where they came from.',
  "Saving up for something they won't name.",
  "The town's unofficial keeper of gossip.",
  'Surprisingly good at cards.',
  'Afraid of open water.',
  'Wears the same hat every single day.',
  'Feeds every stray that wanders through.',
  'Owes their trade to a parent who taught them everything.',
  'Talks to their tools by name before starting work.',
  'Insists the well water tastes different on Tuesdays.',
  'Keeps a running tally of how many times they\'ve been wronged.',
  'Practices a speech for a fight that never happens.',
  'Names every chicken, mourns none of them.',
  'Convinced they once met a dragon; the details change every telling.',
  'Refuses to walk under ladders, over drains, or past black cats.',
  'Bakes a pie every time it rains, for reasons no one\'s gotten out of them.',
  'Has strong, unsolicited opinions about everyone else\'s fence.',
  'Claims to have invented a recipe everyone else already knows.',
  'Writes letters to a pen pal who may not exist.',
  'Insists their left boot is luckier than the right.',
  'Hums the same three notes whenever nervous.',
  'Once bet a week\'s wages on a two-legged race — lost, doesn\'t regret it.',
  'Talks to the town cat like it understands every word.',
  'Sharpens a knife they never use.',
  'Keeps a jar of buttons with no shirts to match.',
  'Insists their grandmother invented the recipe first.',
  'Never sits with their back to a door.',
  'Waters someone else\'s garden when they think no one\'s looking.',
  'Whittles small animals and gives them away for free.',
  'Counts their steps out of habit.',
  'Refuses to say a certain word, won\'t explain why.',
  'Trades favors instead of coin whenever possible.',
  'Keeps every letter they\'ve ever received.',
  'Won\'t eat anything that used to have a face, except fish.',
  'Learned to juggle and never stopped practicing.',
  'Names their tools like old friends.',
  'Sleeps with a weapon within reach, just in case.',
  'Trusts animals more than people.',
  'Still owes an apology they haven\'t worked up the nerve to give.',
  'Grows the same three herbs on every windowsill.',
  'Only tells the truth after dark.',
  'Keeps a spare pair of shoes buried in the yard.',
  'Believes the moon affects their mood, and is probably right.',
  'Draws the same symbol absentmindedly when bored.',
  'Refuses to sell anything on their birthday.',
  'Argues with themselves out loud while working.',
  'Keeps score of every debt, owed or owing.',
  'Has never lost a game of cards, or admits to it.',
  'Smells like woodsmoke no matter the season.',
  'Talks to plants; won\'t talk to most people.',
  'Sleepwalks occasionally, always toward water.',
  'Collects buttons, bottle caps, and other small shiny things.',
  'Wears a wedding ring that isn\'t theirs.',
  'Insists on shaking hands twice.',
  'Can\'t whistle, tries anyway, often.',
  'Keeps a locked box no one\'s allowed to open.',
  'Cries at weddings that aren\'t their own.',
  'Always finishes other people\'s sentences, usually wrong.',
  'Refuses to walk the same road home twice in a row.',
  'Prays to a god no one else in town follows.',
  'Braids their hair the same way every single day.',
  'Keeps bees, mostly to be left alone.',
  'Never learned to swim, never admits it.',
  'Owns exactly one good outfit, saved for emergencies.',
  'Sneaks food to the town\'s stray dogs after dark.',
  'Talks in their sleep, loud enough for neighbors to hear.',
  'Insists left-handed people are luckier.',
  'Keeps a running list of everyone who\'s wronged them, just in case.',
  'Whittles the same shape over and over, never says why.',
  'Refuses to be the first one through a door.',
  'Learned three languages badly instead of one well.',
  'Sings under their breath while working, stops if noticed.',
  'Keeps a jar of coins for a trip they\'ll probably never take.',
  'Won\'t shake hands with strangers, bows instead.',
  'Named their favorite tool after a lost love.',
  'Believes bad luck comes in threes and counts obsessively.',
  'Has strong opinions about proper bread-cutting technique.',
  'Keeps a scar hidden and a story ready if anyone asks.',
  'Always double-checks locks, even ones they just checked.',
  'Grew up somewhere else and never quite lost the accent.',
  'Feeds the pigeons more than the family eats some weeks.',
  'Refuses to discuss the weather, considers it bad luck.',
  'Keeps their money sewn into their coat lining.',
  'Never removes their hat indoors, not even to sleep.',
  'Talks about "the old days" that weren\'t that long ago.',
  'Collects rejection letters — every failed apprenticeship, every lost bet.',
  'Whittles toys for children they don\'t have.',
  'Insists on tasting everything before it\'s served to anyone else.',
  'Keeps a second set of tools, "just in case."',
  'Trades gossip like currency, and it usually pays off.',
  'Believes their left boot brings good luck, the right one doesn\'t matter.',
  'Owns a pet no one\'s ever actually seen.',
  'Never finishes a story the same way twice.',
  'Keeps the shop unnaturally tidy, to the point of suspicion.',
  'Refuses payment from children, no matter how much they insist.',
  'Has a nemesis three streets over, over something long forgotten.',
  'Keeps dried flowers from every spring for the last decade.',
  'Insists the town well tastes different depending on who draws from it.',
  'Wears mismatched boots on purpose, calls it a personal signature.',
  'Won\'t discuss family, changes the subject every time.',
  'Keeps an old war medal that isn\'t theirs.',
  'Refuses to work on a particular day of the week.',
  'Speaks to horses like they understand every word, because maybe they do.',
  'Saves every broken tool "to fix later," never does.',
  'Distrusts anyone too eager to make a deal.',
  'Keeps a spare key to a door that no longer exists.',
  'Insists the stars look different from this town than anywhere else.',
  'Never learned their letters, hides it well.',
  'Trades favors in threes, insists it\'s tradition.',
  'Keeps a list of names for children they\'ll probably never have.',
  'Won\'t step on cracks, counts them instead.',
  'Believes every stranger is a lost relative until proven otherwise.',
  'Keeps their true age a closely guarded secret.',
  'Practices a foreign greeting on every traveler who passes through.',
  'Refuses to sleep with the window closed, rain or shine.',
  'Has an opinion about every neighbor\'s fence, unsolicited.',
  'Keeps their best work hidden, sells the rest.',
  'Insists ghosts walk the market square after midnight.',
  'Whistles a tune no one else recognizes.',
  'Never admits when they\'re wrong, just changes the subject.',
  'Keeps a drawing of someone they\'ve never mentioned by name.',
  'Trusts a stray cat\'s opinion more than most people\'s.',
  'Refuses to haggle, insists the price is the price.'
]

export function generateFlavorTag(rng: () => number = Math.random): string {
  return FLAVOR_TAG_TEMPLATES[Math.floor(rng() * FLAVOR_TAG_TEMPLATES.length)]
}

// User-supplied, not AI-generated — same category as NOTABLE_TRAITS/
// NOTABLE_GOALS above. A random faction (settlementGenerator.ts's
// generateFactions) picks names from this pool verbatim rather than
// inventing any text; a custom faction is named directly by the user in
// SettlementSetupTab.tsx and never touches this list at all.
export const FACTION_NAME_POOL: string[] = [
  'Trade Guild',
  'Political Faction',
  'Mercenary Band',
  "Thieves' Guild",
  'Cult',
  'Druidic Circle',
  'Secret Society',
  'Military Organization',
  'Revolutionary Movement',
  'Academic Society',
  'Theater Troupe',
  "Merchants' Guild",
  'Archivists',
  'Cartographers',
  'Religious Group'
]
