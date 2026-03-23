/**
 * Generates genesis.json from hard-coded event data using traditional biblical
 * chronology (Ussher). Run with: bun scripts/generate-genesis.ts
 */

import { writeFileSync, mkdirSync } from "fs";

interface TimelineEvent {
  id: string;
  start: number;
  end?: number;
  title: string;
  category: string;
  meta: {
    reference: string;
    description: string;
  };
}

/** Convert a BCE year to a Unix timestamp (ms). Month is 0-indexed (Jan = 0). */
function bce(year: number, month = 0, day = 1): number {
  // BCE year Y → astronomical year (1 - Y): e.g. 4004 BCE → -4003
  const d = new Date(0);
  d.setUTCFullYear(1 - year, month, day);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

const Y = 365.25 * 24 * 60 * 60 * 1000; // ms per year

const events: TimelineEvent[] = [
  // ── Primeval History (Gen 1–11) ────────────────────────────────────────────

  {
    id: "gen-creation",
    start: bce(4004),
    end: bce(4004) + 7 * 24 * 60 * 60 * 1000,
    title: "The Creation",
    category: "Primeval History",
    meta: {
      reference: "Genesis 1:1-2:3",
      description:
        "God creates the heavens, earth, and all living things in six days and rests on the seventh.",
    },
  },
  {
    id: "gen-garden-eden",
    start: bce(4004) + 14 * 24 * 60 * 60 * 1000,
    title: "The Garden of Eden",
    category: "Primeval History",
    meta: {
      reference: "Genesis 2:4-25",
      description:
        "God forms Adam from dust, plants the Garden of Eden, and creates Eve from Adam's rib.",
    },
  },
  {
    id: "gen-the-fall",
    start: bce(4003),
    title: "The Fall",
    category: "Primeval History",
    meta: {
      reference: "Genesis 3:1-24",
      description:
        "The serpent tempts Eve; Adam and Eve eat the forbidden fruit and are expelled from the Garden.",
    },
  },
  {
    id: "gen-cain-abel",
    start: bce(3875),
    title: "Cain Murders Abel",
    category: "Primeval History",
    meta: {
      reference: "Genesis 4:1-16",
      description:
        "Cain, jealous of God's acceptance of Abel's offering, kills his brother and is condemned to wander.",
    },
  },
  {
    id: "gen-cain-lineage",
    start: bce(3875) + Y,
    title: "The Lineage of Cain",
    category: "Primeval History",
    meta: {
      reference: "Genesis 4:17-24",
      description:
        "The descendants of Cain, including Jabal, Jubal, and Tubal-cain.",
    },
  },
  {
    id: "gen-birth-seth",
    start: bce(3874),
    title: "Birth of Seth",
    category: "Primeval History",
    meta: {
      reference: "Genesis 4:25-26",
      description:
        "Adam and Eve have another son, Seth, after Abel's death. People begin to call on the name of the Lord.",
    },
  },
  {
    id: "gen-genealogy-adam",
    start: bce(3874),
    end: bce(2948),
    title: "Genealogy: Adam to Noah",
    category: "Primeval History",
    meta: {
      reference: "Genesis 5:1-32",
      description:
        "The generations from Adam to Noah, recording lifespans and including Enoch who walked with God.",
    },
  },
  {
    id: "gen-enoch-taken",
    start: bce(3017),
    title: "Enoch Taken by God",
    category: "Primeval History",
    meta: {
      reference: "Genesis 5:21-24",
      description:
        "Enoch walked with God for three hundred years; then he was no more, because God took him.",
    },
  },
  {
    id: "gen-sons-of-god",
    start: bce(2950),
    title: "Sons of God and Daughters of Humans",
    category: "Primeval History",
    meta: {
      reference: "Genesis 6:1-4",
      description:
        "The sons of God took human wives; the Nephilim were on the earth in those days.",
    },
  },
  {
    id: "gen-flood-decision",
    start: bce(2350),
    title: "God Decides to Flood the Earth",
    category: "Primeval History",
    meta: {
      reference: "Genesis 6:5-22",
      description:
        "God sees human wickedness and resolves to send a flood, instructing Noah to build an ark.",
    },
  },
  {
    id: "gen-noah-enters-ark",
    start: bce(2349),
    title: "Noah Enters the Ark",
    category: "Primeval History",
    meta: {
      reference: "Genesis 7:1-16",
      description:
        "God commands Noah to bring his family and every kind of animal aboard the ark.",
    },
  },
  {
    id: "gen-the-flood",
    start: bce(2349),
    end: bce(2348),
    title: "The Great Flood",
    category: "Primeval History",
    meta: {
      reference: "Genesis 7:17-8:14",
      description:
        "Rain falls for forty days; the waters cover the earth for one hundred fifty days before receding.",
    },
  },
  {
    id: "gen-noah-leaves-ark",
    start: bce(2348),
    title: "Noah Leaves the Ark",
    category: "Primeval History",
    meta: {
      reference: "Genesis 8:15-22",
      description:
        "God commands Noah to leave the ark. Noah builds an altar and offers sacrifices; God vows never to flood the earth again.",
    },
  },
  {
    id: "gen-noahic-covenant",
    start: bce(2348),
    title: "God's Covenant with Noah",
    category: "Primeval History",
    meta: {
      reference: "Genesis 9:1-17",
      description:
        "God establishes a covenant with Noah and all living creatures, setting the rainbow as its sign.",
    },
  },
  {
    id: "gen-noah-vineyard",
    start: bce(2347),
    title: "Noah Plants a Vineyard",
    category: "Primeval History",
    meta: {
      reference: "Genesis 9:18-29",
      description:
        "Noah plants a vineyard, becomes drunk, and curses Canaan while blessing Shem and Japheth.",
    },
  },
  {
    id: "gen-table-of-nations",
    start: bce(2247),
    title: "The Table of Nations",
    category: "Primeval History",
    meta: {
      reference: "Genesis 10:1-32",
      description:
        "The descendants of Noah's three sons spread across the earth, forming the nations of the world.",
    },
  },
  {
    id: "gen-tower-of-babel",
    start: bce(2242),
    title: "The Tower of Babel",
    category: "Primeval History",
    meta: {
      reference: "Genesis 11:1-9",
      description:
        "The people build a great tower; God scatters them across the earth by confusing their language.",
    },
  },
  {
    id: "gen-shem-to-abram",
    start: bce(2347),
    end: bce(2000),
    title: "Genealogy: Shem to Abram",
    category: "Primeval History",
    meta: {
      reference: "Genesis 11:10-32",
      description:
        "The line from Shem through to Terah, father of Abram, Nahor, and Haran.",
    },
  },

  // ── Abraham (Gen 12–25) ────────────────────────────────────────────────────

  {
    id: "gen-abram-call",
    start: bce(2091),
    title: "God Calls Abram",
    category: "Abraham",
    meta: {
      reference: "Genesis 12:1-9",
      description:
        "God calls Abram to leave his country and promises to make him a great nation. Abram departs for Canaan at age seventy-five.",
    },
  },
  {
    id: "gen-abram-egypt",
    start: bce(2090),
    title: "Abram in Egypt",
    category: "Abraham",
    meta: {
      reference: "Genesis 12:10-20",
      description:
        "During a famine, Abram goes to Egypt, passes Sarai off as his sister, and is expelled by Pharaoh after God afflicts Pharaoh's house.",
    },
  },
  {
    id: "gen-abram-lot-separate",
    start: bce(2088),
    title: "Abram and Lot Separate",
    category: "Abraham",
    meta: {
      reference: "Genesis 13:1-18",
      description:
        "Abram and Lot part ways due to conflict between their herdsmen. Lot chooses the Jordan valley; God reaffirms the promise to Abram.",
    },
  },
  {
    id: "gen-abram-rescues-lot",
    start: bce(2085),
    title: "Abram Rescues Lot",
    category: "Abraham",
    meta: {
      reference: "Genesis 14:1-24",
      description:
        "Abram defeats four kings to rescue his nephew Lot, and is blessed by Melchizedek, priest of the Most High God.",
    },
  },
  {
    id: "gen-abram-covenant",
    start: bce(2081),
    title: "God's Covenant with Abram",
    category: "Abraham",
    meta: {
      reference: "Genesis 15:1-21",
      description:
        "God promises Abram countless descendants and the land of Canaan, sealing the covenant with a smoking fire pot and flaming torch.",
    },
  },
  {
    id: "gen-hagar-ishmael",
    start: bce(2080),
    title: "Hagar and the Birth of Ishmael",
    category: "Abraham",
    meta: {
      reference: "Genesis 16:1-16",
      description:
        "Sarai gives her servant Hagar to Abram as a wife. Hagar conceives and bears Ishmael when Abram is eighty-six.",
    },
  },
  {
    id: "gen-covenant-circumcision",
    start: bce(2067),
    title: "Covenant of Circumcision",
    category: "Abraham",
    meta: {
      reference: "Genesis 17:1-27",
      description:
        "God renames Abram to Abraham, establishes circumcision as a covenant sign, and renames Sarai to Sarah.",
    },
  },
  {
    id: "gen-three-visitors",
    start: bce(2067),
    title: "Three Visitors Announce Isaac's Birth",
    category: "Abraham",
    meta: {
      reference: "Genesis 18:1-15",
      description:
        "Three divine visitors appear to Abraham and announce that Sarah will bear a son within a year. Sarah laughs.",
    },
  },
  {
    id: "gen-abraham-intercedes",
    start: bce(2067),
    title: "Abraham Intercedes for Sodom",
    category: "Abraham",
    meta: {
      reference: "Genesis 18:16-33",
      description:
        "Abraham bargains with God, asking him to spare Sodom if even ten righteous people are found there.",
    },
  },
  {
    id: "gen-sodom-gomorrah",
    start: bce(2067),
    title: "Destruction of Sodom and Gomorrah",
    category: "Abraham",
    meta: {
      reference: "Genesis 19:1-29",
      description:
        "God destroys Sodom and Gomorrah with fire and sulfur. Lot and his daughters escape; Lot's wife looks back and becomes a pillar of salt.",
    },
  },
  {
    id: "gen-lot-daughters",
    start: bce(2066),
    title: "Lot's Daughters",
    category: "Abraham",
    meta: {
      reference: "Genesis 19:30-38",
      description:
        "Lot's daughters bear sons by their father; the ancestors of the Moabites and Ammonites.",
    },
  },
  {
    id: "gen-abraham-abimelech",
    start: bce(2066),
    title: "Abraham and Abimelech",
    category: "Abraham",
    meta: {
      reference: "Genesis 20:1-18",
      description:
        "Abraham passes Sarah off as his sister; Abimelech of Gerar takes her but is warned by God in a dream.",
    },
  },
  {
    id: "gen-birth-isaac",
    start: bce(2066),
    title: "Birth of Isaac",
    category: "Abraham",
    meta: {
      reference: "Genesis 21:1-7",
      description:
        "Sarah bears Isaac to Abraham in his old age, just as God had promised. Abraham circumcises him on the eighth day.",
    },
  },
  {
    id: "gen-hagar-expelled",
    start: bce(2064),
    title: "Hagar and Ishmael Expelled",
    category: "Abraham",
    meta: {
      reference: "Genesis 21:8-21",
      description:
        "Sarah demands that Hagar and Ishmael be sent away. God assures Abraham that Ishmael will also become a great nation.",
    },
  },
  {
    id: "gen-binding-isaac",
    start: bce(2050),
    title: "The Binding of Isaac",
    category: "Abraham",
    meta: {
      reference: "Genesis 22:1-19",
      description:
        "God tests Abraham by commanding him to sacrifice Isaac. At the last moment, an angel stops him and provides a ram in Isaac's place.",
    },
  },
  {
    id: "gen-death-sarah",
    start: bce(2029),
    title: "Death and Burial of Sarah",
    category: "Abraham",
    meta: {
      reference: "Genesis 23:1-20",
      description:
        "Sarah dies at one hundred twenty-seven years old. Abraham purchases the cave of Machpelah to bury her.",
    },
  },
  {
    id: "gen-isaac-rebekah",
    start: bce(2026),
    title: "Isaac and Rebekah",
    category: "Abraham",
    meta: {
      reference: "Genesis 24:1-67",
      description:
        "Abraham sends his servant to find a wife for Isaac among his own kin. Rebekah is chosen and becomes Isaac's wife.",
    },
  },
  {
    id: "gen-death-abraham",
    start: bce(1991),
    title: "Death of Abraham",
    category: "Abraham",
    meta: {
      reference: "Genesis 25:1-11",
      description:
        "Abraham dies at one hundred seventy-five years old and is buried with Sarah at Machpelah by Isaac and Ishmael.",
    },
  },
  {
    id: "gen-ishmael-genealogy",
    start: bce(1990),
    title: "Genealogy of Ishmael",
    category: "Abraham",
    meta: {
      reference: "Genesis 25:12-18",
      description:
        "The twelve tribal rulers descended from Ishmael, Abraham's son by Hagar the Egyptian.",
    },
  },

  // ── Jacob (Gen 25–36) ──────────────────────────────────────────────────────

  {
    id: "gen-birth-jacob-esau",
    start: bce(2006),
    title: "Birth of Jacob and Esau",
    category: "Jacob",
    meta: {
      reference: "Genesis 25:19-28",
      description:
        "Rebekah struggles in pregnancy; God tells her two nations are in her womb. Esau is born first, then Jacob grasping his heel.",
    },
  },
  {
    id: "gen-esau-birthright",
    start: bce(1990),
    title: "Esau Sells His Birthright",
    category: "Jacob",
    meta: {
      reference: "Genesis 25:29-34",
      description:
        "Esau, famished from hunting, sells his birthright to Jacob for a bowl of lentil stew.",
    },
  },
  {
    id: "gen-isaac-gerar",
    start: bce(1985),
    title: "Isaac in Gerar",
    category: "Jacob",
    meta: {
      reference: "Genesis 26:1-35",
      description:
        "Isaac goes to Gerar during a famine and prospers greatly. God reaffirms the Abrahamic covenant with him.",
    },
  },
  {
    id: "gen-jacob-deceives-isaac",
    start: bce(1930),
    title: "Jacob Deceives Isaac",
    category: "Jacob",
    meta: {
      reference: "Genesis 27:1-46",
      description:
        "Rebekah helps Jacob disguise himself as Esau to steal his brother's blessing from their aging, nearly blind father Isaac.",
    },
  },
  {
    id: "gen-jacob-bethel",
    start: bce(1929),
    title: "Jacob's Dream at Bethel",
    category: "Jacob",
    meta: {
      reference: "Genesis 28:10-22",
      description:
        "Fleeing Esau, Jacob dreams of a ladder reaching heaven with angels ascending and descending. God reaffirms the covenant.",
    },
  },
  {
    id: "gen-jacob-laban",
    start: bce(1929),
    end: bce(1909),
    title: "Jacob and Laban",
    category: "Jacob",
    meta: {
      reference: "Genesis 29:1-30",
      description:
        "Jacob works seven years for Rachel but is tricked into marrying Leah first, then works another seven years for Rachel.",
    },
  },
  {
    id: "gen-birth-jacobs-sons",
    start: bce(1928),
    end: bce(1916),
    title: "Birth of Jacob's Sons and Dinah",
    category: "Jacob",
    meta: {
      reference: "Genesis 29:31-30:24",
      description:
        "Leah, Rachel, and their servants Zilpah and Bilhah bear Jacob eleven sons and one daughter, Dinah.",
    },
  },
  {
    id: "gen-jacob-flocks",
    start: bce(1916),
    end: bce(1909),
    title: "Jacob's Flocks Increase",
    category: "Jacob",
    meta: {
      reference: "Genesis 30:25-43",
      description:
        "Through a clever agreement with Laban, Jacob's flocks grow and he becomes very wealthy.",
    },
  },
  {
    id: "gen-jacob-flees-laban",
    start: bce(1909),
    title: "Jacob Flees from Laban",
    category: "Jacob",
    meta: {
      reference: "Genesis 31:1-55",
      description:
        "Jacob secretly departs with his family and flocks. Laban pursues him but they make a covenant at Mizpah.",
    },
  },
  {
    id: "gen-jacob-wrestles",
    start: bce(1909),
    title: "Jacob Wrestles with God",
    category: "Jacob",
    meta: {
      reference: "Genesis 32:22-32",
      description:
        "Jacob wrestles with a divine being through the night and is renamed Israel — \"one who strives with God.\"",
    },
  },
  {
    id: "gen-jacob-esau-reunite",
    start: bce(1909),
    title: "Jacob and Esau Reunite",
    category: "Jacob",
    meta: {
      reference: "Genesis 33:1-20",
      description:
        "After twenty years apart, Jacob and Esau are reconciled. Esau runs to meet his brother and embraces him with tears.",
    },
  },
  {
    id: "gen-rape-dinah",
    start: bce(1907),
    title: "The Rape of Dinah and Massacre at Shechem",
    category: "Jacob",
    meta: {
      reference: "Genesis 34:1-31",
      description:
        "Dinah is violated by Shechem. Her brothers Simeon and Levi avenge her by killing every male in the city.",
    },
  },
  {
    id: "gen-jacob-returns-bethel",
    start: bce(1906),
    title: "Jacob Returns to Bethel",
    category: "Jacob",
    meta: {
      reference: "Genesis 35:1-15",
      description:
        "God commands Jacob to return to Bethel. God confirms his new name, Israel, and reaffirms the Abrahamic covenant.",
    },
  },
  {
    id: "gen-birth-benjamin-death-rachel",
    start: bce(1906),
    title: "Birth of Benjamin; Death of Rachel",
    category: "Jacob",
    meta: {
      reference: "Genesis 35:16-20",
      description:
        "Rachel dies giving birth to Benjamin and is buried on the road to Ephrath (Bethlehem).",
    },
  },
  {
    id: "gen-death-isaac",
    start: bce(1886),
    title: "Death of Isaac",
    category: "Jacob",
    meta: {
      reference: "Genesis 35:27-29",
      description:
        "Isaac dies at one hundred eighty years old. Esau and Jacob bury him at Mamre.",
    },
  },
  {
    id: "gen-esau-descendants",
    start: bce(1885),
    title: "Descendants of Esau",
    category: "Jacob",
    meta: {
      reference: "Genesis 36:1-43",
      description:
        "The genealogy of Esau, father of Edom, including the kings and chiefs of Edom.",
    },
  },

  // ── Joseph (Gen 37–50) ─────────────────────────────────────────────────────

  {
    id: "gen-joseph-dreams",
    start: bce(1898),
    title: "Joseph's Dreams",
    category: "Joseph",
    meta: {
      reference: "Genesis 37:1-11",
      description:
        "Joseph dreams his brothers' sheaves bow to his, and that the sun, moon, and eleven stars bow to him, stoking his brothers' jealousy.",
    },
  },
  {
    id: "gen-joseph-sold",
    start: bce(1898),
    title: "Joseph Sold into Slavery",
    category: "Joseph",
    meta: {
      reference: "Genesis 37:12-36",
      description:
        "Joseph's brothers throw him into a pit and sell him to Ishmaelite traders bound for Egypt. They tell Jacob he was killed by a wild animal.",
    },
  },
  {
    id: "gen-judah-tamar",
    start: bce(1897),
    title: "Judah and Tamar",
    category: "Joseph",
    meta: {
      reference: "Genesis 38:1-30",
      description:
        "Tamar, denied her rights as a widow, disguises herself and conceives twins by Judah, bearing Perez and Zerah.",
    },
  },
  {
    id: "gen-joseph-potiphar",
    start: bce(1897),
    end: bce(1889),
    title: "Joseph in Potiphar's House",
    category: "Joseph",
    meta: {
      reference: "Genesis 39:1-23",
      description:
        "Joseph prospers in Potiphar's house. Potiphar's wife falsely accuses him of assault and he is cast into prison.",
    },
  },
  {
    id: "gen-joseph-prison",
    start: bce(1887),
    end: bce(1885),
    title: "Joseph Interprets Dreams in Prison",
    category: "Joseph",
    meta: {
      reference: "Genesis 40:1-23",
      description:
        "Joseph correctly interprets dreams of Pharaoh's cupbearer and baker. The cupbearer is restored; the baker is executed.",
    },
  },
  {
    id: "gen-joseph-vizier",
    start: bce(1885),
    title: "Pharaoh's Dreams; Joseph Becomes Vizier",
    category: "Joseph",
    meta: {
      reference: "Genesis 41:1-46",
      description:
        "Joseph interprets Pharaoh's dreams of seven fat and seven lean cows. Pharaoh appoints him second-in-command over all Egypt at age thirty.",
    },
  },
  {
    id: "gen-seven-years-plenty",
    start: bce(1885),
    end: bce(1878),
    title: "Seven Years of Plenty",
    category: "Joseph",
    meta: {
      reference: "Genesis 41:47-52",
      description:
        "During seven years of abundance, Joseph stores surplus grain throughout Egypt in preparation for the coming famine.",
    },
  },
  {
    id: "gen-seven-years-famine",
    start: bce(1878),
    end: bce(1871),
    title: "Seven Years of Famine",
    category: "Joseph",
    meta: {
      reference: "Genesis 41:53-57",
      description:
        "A severe famine strikes all the surrounding lands. Egypt alone has food, and people from all nations come to buy grain from Joseph.",
    },
  },
  {
    id: "gen-brothers-first-journey",
    start: bce(1876),
    title: "Brothers' First Journey to Egypt",
    category: "Joseph",
    meta: {
      reference: "Genesis 42:1-38",
      description:
        "Ten of Joseph's brothers go to Egypt for grain. Joseph recognizes them but they do not recognize him. He keeps Simeon as a hostage.",
    },
  },
  {
    id: "gen-brothers-second-journey",
    start: bce(1875),
    title: "Brothers' Second Journey to Egypt",
    category: "Joseph",
    meta: {
      reference: "Genesis 43:1-44:34",
      description:
        "The brothers return with Benjamin. Joseph feasts with them, then plants his silver cup on Benjamin to test his brothers' loyalty.",
    },
  },
  {
    id: "gen-joseph-reveals-himself",
    start: bce(1875),
    title: "Joseph Reveals Himself",
    category: "Joseph",
    meta: {
      reference: "Genesis 45:1-28",
      description:
        "Joseph reveals his identity to his brothers, weeping aloud. He tells them God sent him ahead to preserve life and urges them to bring Jacob to Egypt.",
    },
  },
  {
    id: "gen-jacob-migrates",
    start: bce(1876),
    title: "Jacob's Family Migrates to Egypt",
    category: "Joseph",
    meta: {
      reference: "Genesis 46:1-34",
      description:
        "Jacob and his entire household — seventy persons — travel to Egypt. Joseph meets his father on the road with tears.",
    },
  },
  {
    id: "gen-family-settles-goshen",
    start: bce(1876),
    title: "Jacob's Family Settles in Goshen",
    category: "Joseph",
    meta: {
      reference: "Genesis 47:1-12",
      description:
        "Pharaoh grants Jacob's family the best land in Goshen. Jacob blesses Pharaoh and the family settles there.",
    },
  },
  {
    id: "gen-joseph-famine-policy",
    start: bce(1876),
    end: bce(1871),
    title: "Joseph's Administration During the Famine",
    category: "Joseph",
    meta: {
      reference: "Genesis 47:13-26",
      description:
        "Joseph acquires all Egyptian land and livestock for Pharaoh in exchange for grain, establishing a permanent tax of one-fifth.",
    },
  },
  {
    id: "gen-jacob-blesses-ephraim-manasseh",
    start: bce(1859),
    title: "Jacob Blesses Ephraim and Manasseh",
    category: "Joseph",
    meta: {
      reference: "Genesis 48:1-22",
      description:
        "Jacob adopts Joseph's two sons. He crosses his hands to give the greater blessing to the younger Ephraim over the firstborn Manasseh.",
    },
  },
  {
    id: "gen-jacob-blesses-sons",
    start: bce(1859),
    title: "Jacob's Blessing of His Twelve Sons",
    category: "Joseph",
    meta: {
      reference: "Genesis 49:1-28",
      description:
        "Jacob prophetically blesses each of his twelve sons, describing the future destiny of their tribes.",
    },
  },
  {
    id: "gen-death-jacob",
    start: bce(1859),
    title: "Death and Burial of Jacob",
    category: "Joseph",
    meta: {
      reference: "Genesis 50:1-21",
      description:
        "Jacob dies at one hundred forty-seven years old. Joseph has him embalmed and buries him in Canaan at Machpelah with great ceremony.",
    },
  },
  {
    id: "gen-death-joseph",
    start: bce(1805),
    title: "Death of Joseph",
    category: "Joseph",
    meta: {
      reference: "Genesis 50:22-26",
      description:
        "Joseph dies at one hundred ten years old, making his brothers swear to carry his bones back to Canaan when God brings them out of Egypt.",
    },
  },
];

mkdirSync("./src/lib/data", { recursive: true });
writeFileSync(
  "./src/lib/data/genesis.json",
  JSON.stringify({ events }, null, 2),
);
console.log(
  `Generated ${events.length} events spanning ${Math.round((events[0].start - events[events.length - 1].start) / (365.25 * 24 * 60 * 60 * 1000))} years.`,
);
console.log(
  `View start: ${events[events.length - 1].start} (${new Date(events[events.length - 1].start).getUTCFullYear()} CE equiv)`,
);
console.log(
  `View end: ${events[0].start} (${new Date(events[0].start).getUTCFullYear()} CE equiv)`,
);
