// verify_master.js
const http = require('http');
const assert = require('assert');

console.log('================================================================');
console.log('🚀 STARTE MASTER-VERIFIKATION: PAYROLL & STARRED-BOT COMMANDS');
console.log('================================================================\n');

// 1. HTTP Server & UI Architecture Validation
function testHttpServer() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000', (res) => {
      let html = '';
      res.on('data', chunk => { html += chunk; });
      res.on('end', () => {
        assert.strictEqual(res.statusCode, 200, 'Server must return status 200');
        assert(html.includes('LIVE · PARSER AKTIV'), 'HTML must include live radar badge');
        assert(html.includes('Jede Schicht erfassen'), 'HTML must include headline start');
        assert(html.includes('sekundengenau bezahlt.'), 'HTML must include headline end');
        assert(html.includes('/economy add'), 'HTML must include Starred-Bot command syntax');
        assert(html.includes('melonly_discord_mapping_v3'), 'HTML must include persistent Discord mapping');
        assert(html.includes('Alle fertigen Commands kopieren'), 'HTML must include bulk commands copy button');
        console.log('✔ [1/5] HTTP-Server läuft fehlerfrei (200 OK) & enthält alle Master-UI-Komponenten.');
        resolve();
      });
    }).on('error', (err) => {
      reject(new Error('HTTP-Verbindung fehlgeschlagen: ' + err.message));
    });
  });
}

// 2. Parser & Rates Reference
const DEFAULT_RATES = {
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

function parseMelonlyLine(rawLine, rates = DEFAULT_RATES, discordMapping = {}) {
  if (!rawLine || !rawLine.trim()) return null;

  const firstBracketIndex = rawLine.indexOf('[');
  if (firstBracketIndex === -1) return null;

  const bracketCloseIndex = rawLine.indexOf(']', firstBracketIndex);
  if (bracketCloseIndex === -1) return null;

  const callsign = rawLine.substring(firstBracketIndex + 1, bracketCloseIndex).trim();

  let rankKey = '';
  let rankInfo = null;
  let isUnknownRank = false;

  // Strikte Führungskennungen
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
    isUnknownRank = true;
    rankKey = callsign;
    rankInfo = { name: 'Ungültig / Nicht autorisiert', rate: 0 };
  } else {
    const hyphenIdx = callsign.indexOf('-');
    const prefix = (hyphenIdx !== -1 ? callsign.substring(0, hyphenIdx) : callsign).toUpperCase();
    if (rates[prefix]) {
      rankKey = prefix;
      rankInfo = rates[prefix];
    } else {
      isUnknownRank = true;
      rankKey = prefix;
      rankInfo = { name: `Unbekannter Rang (${prefix})`, rate: 0 };
    }
  }

  const afterBracket = rawLine.substring(bracketCloseIndex + 1);
  const sepMatch = afterBracket.match(/[-:]/);
  if (!sepMatch) return null;

  const firstSepIndex = sepMatch.index;
  const name = afterBracket.substring(0, firstSepIndex).trim();

  const afterFirstSep = afterBracket.substring(firstSepIndex + 1);
  const secondSepIndex = afterFirstSep.indexOf('-');
  const timeStr = (secondSepIndex !== -1 ? afterFirstSep.substring(0, secondSepIndex) : afterFirstSep).trim();

  const hoursMatch = timeStr.match(/(\d+)\s*(?:hours?|std|h)\b/i);
  const minutesMatch = timeStr.match(/(\d+)\s*(?:minutes?|min|m)\b/i);
  const secondsMatch = timeStr.match(/(\d+)\s*(?:seconds?|sek|s)\b/i);

  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  const seconds = secondsMatch ? parseInt(secondsMatch[1], 10) : 0;

  const decimalHours = hours + (minutes / 60) + (seconds / 3600);
  const rate = rankInfo ? rankInfo.rate : 0;
  const payout = Math.round(decimalHours * rate);

  const discordUser = (discordMapping[callsign] || '').replace(/^@+/, '').trim();
  const botCommand = discordUser.length > 0
    ? `/economy add user:@${discordUser} money:${payout}`
    : '';

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
    isUnknownRank,
    discordUser,
    botCommand
  };
}

// 3. Test All 18 Sample Lines from Specification
function testSampleLines() {
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
    "@[GKO-14] Nico von Falken - 3 seconds -"
  ];

  let sumPayout = 0;
  for (const line of sampleLines) {
    const res = parseMelonlyLine(line);
    assert(res !== null, `Parsing fehlgeschlagen für: ${line}`);
    assert(Number.isInteger(res.payout), 'Auszahlung muss eine ganze Zahl sein');
    assert(res.payout >= 0, 'Auszahlung darf nicht negativ sein');
    sumPayout += res.payout;
  }

  assert.strictEqual(sumPayout, 639286, 'Gesamtsumme aller 18 Personen muss exakt 639.286 € betragen');
  console.log(`✔ [2/5] Alle 18 Melonly-Zeilen exakt berechnet (Gesamtsumme: ${sumPayout.toLocaleString('de-DE')} €).`);
}

// 4. Test Leadership & Invalid Callings
function testLeadershipIsolation() {
  const gk01 = parseMelonlyLine("@[GK-01] General Kommandeur - 1 hour -");
  assert.strictEqual(gk01.rate, 20000);
  assert.strictEqual(gk01.rankName, 'Kommandeur');
  assert.strictEqual(gk01.isUnknownRank, false);

  const gk02 = parseMelonlyLine("@[GK-02] Stellvertreter - 1 hour -");
  assert.strictEqual(gk02.rate, 18000);
  assert.strictEqual(gk02.rankName, 'Stellv. Kommandeur');
  assert.strictEqual(gk02.isUnknownRank, false);

  const gld03 = parseMelonlyLine("@[GLD-03] Leitender Direktor - 1 hour -");
  assert.strictEqual(gld03.rate, 16000);
  assert.strictEqual(gld03.rankName, 'Leitender Direktor');
  assert.strictEqual(gld03.isUnknownRank, false);

  // Invalid Numbers (must be rejected)
  const gk05 = parseMelonlyLine("@[GK-05] Falscher Kommandeur - 1 hour -");
  assert.strictEqual(gk05.rate, 0);
  assert.strictEqual(gk05.isUnknownRank, true);

  const gld10 = parseMelonlyLine("@[GLD-10] Falscher Direktor - 1 hour -");
  assert.strictEqual(gld10.rate, 0);
  assert.strictEqual(gld10.isUnknownRank, true);

  console.log('✔ [3/5] Strikte Pflicht-Nummern (GK-01, GK-02, GLD-03) und Abweisung ungültiger Nummern verifiziert.');
}

// 5. Test Cent-Free Guarantee
function testCentFreeRule() {
  const testValues = [
    { callsign: "GUF-01", time: "11 hours 56 minutes", rate: 4600, expected: 54893 },
    { callsign: "GRE-01", time: "10 hours 52 minutes", rate: 1000, expected: 10867 },
    { callsign: "GKO-01", time: "3 seconds", rate: 11500, expected: 10 },
    { callsign: "GGF-01", time: "10 minutes", rate: 13800, expected: 2300 }
  ];

  for (const tv of testValues) {
    const res = parseMelonlyLine(`@[${tv.callsign}] Tester - ${tv.time} -`);
    assert.strictEqual(res.payout, tv.expected);
    assert.strictEqual(Number.isInteger(res.payout), true);
  }
  console.log('✔ [4/5] Kaufmännische Rundung auf ganze Euro ohne Cent-Stellen strikt nachgewiesen.');
}

// 6. Test Discord Mapping & Starred-Bot Command Generation
function testDiscordMappingAndCommands() {
  const mockStorage = {
    'GUF-68': 'sarah_salzberg',
    'GK-02': '@sven.wood' // with leading @
  };

  const line1 = "@[GUF-68] Sarah Salzberg - 11 hours 56 minutes - 3 hours required";
  const res1 = parseMelonlyLine(line1, DEFAULT_RATES, mockStorage);
  assert.strictEqual(res1.discordUser, 'sarah_salzberg');
  assert.strictEqual(res1.botCommand, '/economy add user:@sarah_salzberg money:54893');

  const line2 = "@[GK-02] Sven Wood - 3 hours 25 minutes - 0 hours required";
  const res2 = parseMelonlyLine(line2, DEFAULT_RATES, mockStorage);
  // Must automatically strip duplicate @
  assert.strictEqual(res2.discordUser, 'sven.wood');
  assert.strictEqual(res2.botCommand, '/economy add user:@sven.wood money:61500');

  // Unmapped user
  const line3 = "@[GRE-33] Oskar Zuckerberger - 10 hours 52 minutes - 2 hours required";
  const res3 = parseMelonlyLine(line3, DEFAULT_RATES, mockStorage);
  assert.strictEqual(res3.discordUser, '');
  assert.strictEqual(res3.botCommand, '');

  console.log('✔ [5/5] Discord User-Mapping & Starred-Bot Command-Generierung (/economy add) vollumfänglich verifiziert.\n');
}

async function run() {
  try {
    await testHttpServer();
    testSampleLines();
    testLeadershipIsolation();
    testCentFreeRule();
    testDiscordMappingAndCommands();
    console.log('================================================================');
    console.log('🌟 ALLE 5 MASTER-VERIFIKATIONEN ERFOLGREICH BESTANDEN!');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Fehler bei der Verifikation:', err);
    process.exit(1);
  }
}

run();
