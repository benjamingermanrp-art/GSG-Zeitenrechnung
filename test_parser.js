// test_parser.js
const defaultRates = {
  'GK-01': { name: 'Kommandeur', rate: 20000, isLeadership: true },
  'GK-02': { name: 'Stellv. Kommandeur', rate: 18000, isLeadership: true },
  'GLD-03': { name: 'Leitender Direktor', rate: 16000, isLeadership: true },
  'GD': { name: 'Direktor', rate: 14500 },
  'GGF': { name: 'Gruppenführer / Stellv. / i.A.', rate: 13800 },
  'GOB': { name: 'Oberst', rate: 13000 },
  'GKO': { name: '1. Klasse Offizier', rate: 11500 },
  'GOF': { name: 'Offizier', rate: 10000 },
  'GOH': { name: 'Oberhauptmann', rate: 8800 },
  'GHM': { name: 'Hauptmann', rate: 7600 },
  'GOL': { name: 'Oberleitmann', rate: 6500 },
  'GLM': { name: 'Leitmann', rate: 5500 },
  'GUF': { name: 'Unteroffizier', rate: 4600 },
  'GHG': { name: 'Hauptgefreiter', rate: 3000 },
  'GOG': { name: 'Obergefreiter', rate: 2300 },
  'GGE': { name: 'Gefreiter', rate: 1700 },
  'GRE': { name: 'Rekrut', rate: 1000 }
};

function parseLine(rawLine, rates = defaultRates) {
  if (!rawLine || !rawLine.trim()) return null;

  // 1. Bereinigung: Führende Pings, Emojis, Leerzeichen vor der ersten Klammer
  const firstBracketIndex = rawLine.indexOf('[');
  if (firstBracketIndex === -1) return null;

  const bracketCloseIndex = rawLine.indexOf(']', firstBracketIndex);
  if (bracketCloseIndex === -1) return null;

  // 2. Dienstnummer & Rang-Erkennung
  const callsign = rawLine.substring(firstBracketIndex + 1, bracketCloseIndex).trim();

  let rankKey = '';
  let rankInfo = null;
  let isUnknownRank = false;

  // Strikte Pflicht-Kennungen der Führungsebene
  if (callsign === 'GK-01') {
    rankKey = 'GK-01';
    rankInfo = rates['GK-01'];
  } else if (callsign === 'GK-02') {
    rankKey = 'GK-02';
    rankInfo = rates['GK-02'];
  } else if (callsign === 'GLD-03') {
    rankKey = 'GLD-03';
    rankInfo = rates['GLD-03'];
  } else if (callsign.startsWith('GK-') || callsign.startsWith('GLD-')) {
    // Sollte eine Eingabe wie GK-05 oder GLD-99 vorkommen, darf dies NICHT als Führungsebene gewertet werden!
    isUnknownRank = true;
    rankKey = callsign;
    rankInfo = { name: 'Ungültig / Unbekannt', rate: 0 };
  } else {
    // Reguläre Ränge: Präfix vor dem ersten Bindestrich
    const hyphenIdx = callsign.indexOf('-');
    const prefix = hyphenIdx !== -1 ? callsign.substring(0, hyphenIdx).toUpperCase() : callsign.toUpperCase();
    if (rates[prefix]) {
      rankKey = prefix;
      rankInfo = rates[prefix];
    } else {
      isUnknownRank = true;
      rankKey = prefix;
      rankInfo = { name: 'Unbekannter Rang (' + prefix + ')', rate: 0 };
    }
  }

  // 3. Namens-Extraktion
  const afterBracket = rawLine.substring(bracketCloseIndex + 1);
  const sepMatch = afterBracket.match(/[-:]/);
  if (!sepMatch) return null;

  const firstSepIndex = sepMatch.index;
  const name = afterBracket.substring(0, firstSepIndex).trim();

  // 4. Zeiterfassung (Duration Extraction)
  const afterFirstSep = afterBracket.substring(firstSepIndex + 1);
  const secondSepIndex = afterFirstSep.indexOf('-');
  const timeStr = (secondSepIndex !== -1 ? afterFirstSep.substring(0, secondSepIndex) : afterFirstSep).trim();

  const hoursMatch = timeStr.match(/(\d+)\s*(?:hours?|stunden?|std|h)\b/i);
  const minutesMatch = timeStr.match(/(\d+)\s*(?:minutes?|minuten?|min|m)\b/i);
  const secondsMatch = timeStr.match(/(\d+)\s*(?:seconds?|sekunden?|sek|s)\b/i);

  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  const seconds = secondsMatch ? parseInt(secondsMatch[1], 10) : 0;

  // 5. Mathematische Berechnung & Rundung
  const decimalHours = hours + (minutes / 60) + (seconds / 3600);
  const rate = rankInfo ? rankInfo.rate : 0;
  const payout = Math.round(decimalHours * rate);

  return {
    callsign,
    rankKey,
    rankName: rankInfo.name,
    rate,
    name,
    hours,
    minutes,
    seconds,
    decimalHours,
    payout,
    isUnknownRank
  };
}

const sampleLines = [
  "@[GUF-68] Sarah Salzberg - 11 hours 56 minutes - 3 hours required",
  "@[GRE-33] Oskar Zuckerberger - 10 hours 52 minutes - 2 hours required",
  "@[GOF-29] Elias Salzberg - 9 hours 36 minutes - 3 hours required",
  "@[GGE-04] Linox Salzberg - 8 hours 59 minutes - 2 hours required",
  "@[GLD-03] Freddi Zuckerberg - 8 hours 52 minutes - 0 hours required",
  "@[GOL-22] Leon Adler - 6 hours 55 minutes - 2.5 hours required",
  "@[GLM-12] Mark Rumpe - 5 hours 1 minute - 2.5 hours required",
  "@[GHM-06] Lucy Midnight - 4 hours 40 minutes - 2.5 hours required",
  "@[GUF-15] Cedric Weber - 4 hours 32 minutes - 3 hours required",
  "@[GKO-55] Lumich Koch - 3 hours 57 minutes - 3 hours required",
  "@[GK-02] Sven Wood - 3 hours 25 minutes - 0 hours required",
  "@[GD-44] Finn Zuckerberg - 2 hours 30 minutes - 2 hours required",
  "@[GD-27] Dr. Paul Kabooom - 2 hours 9 minutes - (:loa:) 2 hours required",
  "@[GHG-42] Albert Zweistein - 2 hours 5 minutes - 2 hours required",
  "@[GHG-98] Toni Salvation - 2 hours - 2 hours required",
  "@[GUF-41] Daniel Mustermann - 34 minutes - 3 hours required",
  "@💤 [GGF-19] Lary Summer - 10 minutes - (:loa:) 2 hours required",
  "@[GKO-14] Nico von Falken - 3 seconds -",
  // Sonderfälle Tests
  "@[GK-01] Chef Kommandeur - 1 hour - 0 hours required",
  "@[GK-05] Falscher Kommandeur - 1 hour - 0 hours required",
  "@[GLD-99] Falscher Direktor - 1 hour - 0 hours required"
];

console.log("Starting verification...");
let totalPayout = 0;
sampleLines.forEach((line, i) => {
  const res = parseLine(line);
  if (!res) {
    console.error(`FAILED to parse line ${i}: ${line}`);
    process.exit(1);
  }
  console.log(`[#${i+1}] [${res.callsign}] ${res.name} | ${res.rankName} (${res.rate} €/h) | ${res.hours}h ${res.minutes}m ${res.seconds}s | Auszahlung: ${res.payout} € ${res.isUnknownRank ? '[WARN: UNBEKANNT]' : ''}`);
  totalPayout += res.payout;
});

// Check special cases
const gk01 = parseLine("@[GK-01] Hans - 1 hour - 0 hours required");
if (gk01.rate !== 20000 || gk01.rankName !== 'Kommandeur') {
  console.error("GK-01 check failed!", gk01);
  process.exit(1);
}

const gk02 = parseLine("@[GK-02] Peter - 1 hour - 0 hours required");
if (gk02.rate !== 18000 || gk02.rankName !== 'Stellv. Kommandeur') {
  console.error("GK-02 check failed!", gk02);
  process.exit(1);
}

const gld03 = parseLine("@[GLD-03] Klaus - 1 hour - 0 hours required");
if (gld03.rate !== 16000 || gld03.rankName !== 'Leitender Direktor') {
  console.error("GLD-03 check failed!", gld03);
  process.exit(1);
}

const gk05 = parseLine("@[GK-05] Fake - 1 hour - 0 hours required");
if (gk05.rate !== 0 || !gk05.isUnknownRank) {
  console.error("GK-05 check failed!", gk05);
  process.exit(1);
}

const gld99 = parseLine("@[GLD-99] Fake - 1 hour - 0 hours required");
if (gld99.rate !== 0 || !gld99.isUnknownRank) {
  console.error("GLD-99 check failed!", gld99);
  process.exit(1);
}

console.log("All unit tests passed successfully!");
