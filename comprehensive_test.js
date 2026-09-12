// comprehensive_test.js
const http = require('http');
const fs = require('fs');
const assert = require('assert');

console.log('=== STARTE MELONLY DASHBOARD & PARSER VALIDIERUNG ===\n');

// 1. HTTP Endpoint Test
function testHttpServer() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000', (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        assert.strictEqual(res.statusCode, 200, 'Server must respond with status 200');
        assert(data.includes('SYSTEM BEREIT / SECURE PARSER'), 'HTML must include system badge');
        assert(data.includes('Jede Schicht erfassen'), 'HTML must include headline start');
        assert(data.includes('sekundengenau bezahlt.'), 'HTML must include headline end');
        assert(data.includes('Abrechnung berechnen'), 'HTML must include calculate button');
        assert(data.includes('Beispieldaten laden'), 'HTML must include sample button');
        assert(data.includes('Eingabe leeren'), 'HTML must include clear button');
        assert(data.includes('Komplette Liste als Text kopieren'), 'HTML must include bulk copy button');
        console.log('✔ [1/4] HTTP Server & HTML Strukturprüfung erfolgreich (200 OK, alle UI-Komponenten vorhanden).');
        resolve();
      });
    }).on('error', (err) => {
      reject(new Error('HTTP request failed: ' + err.message));
    });
  });
}

// 2. Parser Logic Validation against Specification
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

function parseMelonlyLine(rawLine, rates = DEFAULT_RATES) {
  if (!rawLine || !rawLine.trim()) return null;

  // 1. Bereinigung: Führende Pings, Emojis, Leerzeichen vor der ersten Klammer abschneiden
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
    // Ungültig / unbekannt (z.B. GK-05 oder GLD-99)
    isUnknownRank = true;
    rankKey = callsign;
    rankInfo = { name: 'Ungültig / Unbekannt', rate: 0 };
  } else {
    // Reguläre Ränge: Präfix vor dem Bindestrich
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

  // 5. Mathematische Berechnung & Rundung (Ganze Euro kaufmännisch, absolut centfrei!)
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

// 3. Test all 18 Specification Lines
function testMelonlySampleLines() {
  const testCases = [
    { line: "@[GUF-68] Sarah Salzberg - 11 hours 56 minutes - 3 hours required", expected: { callsign: "GUF-68", name: "Sarah Salzberg", hours: 11, minutes: 56, seconds: 0, rate: 4600, payout: 54893 } },
    { line: "@[GRE-33] Oskar Zuckerberger - 10 hours 52 minutes - 2 hours required", expected: { callsign: "GRE-33", name: "Oskar Zuckerberger", hours: 10, minutes: 52, seconds: 0, rate: 1000, payout: 10867 } },
    { line: "@[GOF-29] Elias Salzberg - 9 hours 36 minutes - 3 hours required", expected: { callsign: "GOF-29", name: "Elias Salzberg", hours: 9, minutes: 36, seconds: 0, rate: 10000, payout: 96000 } },
    { line: "@[GGE-04] Linox Salzberg - 8 hours 59 minutes - 2 hours required", expected: { callsign: "GGE-04", name: "Linox Salzberg", hours: 8, minutes: 59, seconds: 0, rate: 1700, payout: 15272 } },
    { line: "@[GLD-03] Freddi Zuckerberg - 8 hours 52 minutes - 0 hours required", expected: { callsign: "GLD-03", name: "Freddi Zuckerberg", hours: 8, minutes: 52, seconds: 0, rate: 16000, payout: 141867 } },
    { line: "@[GOL-22] Leon Adler - 6 hours 55 minutes - 2.5 hours required", expected: { callsign: "GOL-22", name: "Leon Adler", hours: 6, minutes: 55, seconds: 0, rate: 6500, payout: 44958 } },
    { line: "@[GLM-12] Mark Rumpe - 5 hours 1 minute - 2.5 hours required", expected: { callsign: "GLM-12", name: "Mark Rumpe", hours: 5, minutes: 1, seconds: 0, rate: 5500, payout: 27592 } },
    { line: "@[GHM-06] Lucy Midnight - 4 hours 40 minutes - 2.5 hours required", expected: { callsign: "GHM-06", name: "Lucy Midnight", hours: 4, minutes: 40, seconds: 0, rate: 7600, payout: 35467 } },
    { line: "@[GUF-15] Cedric Weber - 4 hours 32 minutes - 3 hours required", expected: { callsign: "GUF-15", name: "Cedric Weber", hours: 4, minutes: 32, seconds: 0, rate: 4600, payout: 20853 } },
    { line: "@[GKO-55] Lumich Koch - 3 hours 57 minutes - 3 hours required", expected: { callsign: "GKO-55", name: "Lumich Koch", hours: 3, minutes: 57, seconds: 0, rate: 11500, payout: 45425 } },
    { line: "@[GK-02] Sven Wood - 3 hours 25 minutes - 0 hours required", expected: { callsign: "GK-02", name: "Sven Wood", hours: 3, minutes: 25, seconds: 0, rate: 18000, payout: 61500 } },
    { line: "@[GD-44] Finn Zuckerberg - 2 hours 30 minutes - 2 hours required", expected: { callsign: "GD-44", name: "Finn Zuckerberg", hours: 2, minutes: 30, seconds: 0, rate: 14500, payout: 36250 } },
    { line: "@[GD-27] Dr. Paul Kabooom - 2 hours 9 minutes - (:loa:) 2 hours required", expected: { callsign: "GD-27", name: "Dr. Paul Kabooom", hours: 2, minutes: 9, seconds: 0, rate: 14500, payout: 31175 } },
    { line: "@[GHG-42] Albert Zweistein - 2 hours 5 minutes - 2 hours required", expected: { callsign: "GHG-42", name: "Albert Zweistein", hours: 2, minutes: 5, seconds: 0, rate: 3000, payout: 6250 } },
    { line: "@[GHG-98] Toni Salvation - 2 hours - 2 hours required", expected: { callsign: "GHG-98", name: "Toni Salvation", hours: 2, minutes: 0, seconds: 0, rate: 3000, payout: 6000 } },
    { line: "@[GUF-41] Daniel Mustermann - 34 minutes - 3 hours required", expected: { callsign: "GUF-41", name: "Daniel Mustermann", hours: 0, minutes: 34, seconds: 0, rate: 4600, payout: 2607 } },
    { line: "@💤 [GGF-19] Lary Summer - 10 minutes - (:loa:) 2 hours required", expected: { callsign: "GGF-19", name: "Lary Summer", hours: 0, minutes: 10, seconds: 0, rate: 13800, payout: 2300 } },
    { line: "@[GKO-14] Nico von Falken - 3 seconds -", expected: { callsign: "GKO-14", name: "Nico von Falken", hours: 0, minutes: 0, seconds: 3, rate: 11500, payout: 10 } }
  ];

  let totalCalculated = 0;
  for (const tc of testCases) {
    const res = parseMelonlyLine(tc.line);
    assert(res !== null, `Parsing failed for: ${tc.line}`);
    assert.strictEqual(res.callsign, tc.expected.callsign, `Callsign mismatch on ${tc.line}`);
    assert.strictEqual(res.name, tc.expected.name, `Name mismatch on ${tc.line}`);
    assert.strictEqual(res.hours, tc.expected.hours, `Hours mismatch on ${tc.line}`);
    assert.strictEqual(res.minutes, tc.expected.minutes, `Minutes mismatch on ${tc.line}`);
    assert.strictEqual(res.seconds, tc.expected.seconds, `Seconds mismatch on ${tc.line}`);
    assert.strictEqual(res.rate, tc.expected.rate, `Rate mismatch on ${tc.line}`);
    assert.strictEqual(res.payout, tc.expected.payout, `Payout mismatch on ${tc.line}`);
    assert.strictEqual(Number.isInteger(res.payout), true, 'Payout must be integer (no cents)');
    totalCalculated += res.payout;
  }

  console.log(`✔ [2/4] Alle 18 Melonly-Beispieldatensätze exakt verarbeitet.`);
  console.log(`       Gesamtsumme aller 18 Personen: ${totalCalculated.toLocaleString('de-DE')} €.`);
}

// 4. Test Leadership & Unknown Ranks Edge Cases
function testSpecialRanks() {
  // GK-01
  const gk01 = parseMelonlyLine("@[GK-01] Haupt-Kommandeur - 1 hour - 0 hours required");
  assert.strictEqual(gk01.rate, 20000, 'GK-01 must have rate 20000');
  assert.strictEqual(gk01.rankName, 'Kommandeur');
  assert.strictEqual(gk01.isUnknownRank, false);

  // GK-02
  const gk02 = parseMelonlyLine("@[GK-02] Stellvertreter - 2 hours - 0 hours required");
  assert.strictEqual(gk02.rate, 18000, 'GK-02 must have rate 18000');
  assert.strictEqual(gk02.rankName, 'Stellv. Kommandeur');
  assert.strictEqual(gk02.isUnknownRank, false);

  // GLD-03
  const gld03 = parseMelonlyLine("@[GLD-03] Leitender Direktor - 3 hours - 0 hours required");
  assert.strictEqual(gld03.rate, 16000, 'GLD-03 must have rate 16000');
  assert.strictEqual(gld03.rankName, 'Leitender Direktor');
  assert.strictEqual(gld03.isUnknownRank, false);

  // Invalid leadership ID: GK-05
  const gk05 = parseMelonlyLine("@[GK-05] Falscher Kommandeur - 1 hour - 0 hours required");
  assert.strictEqual(gk05.rate, 0, 'GK-05 must be rejected (rate 0)');
  assert.strictEqual(gk05.isUnknownRank, true, 'GK-05 must be marked as unknown/invalid');

  // Invalid leadership ID: GLD-99
  const gld99 = parseMelonlyLine("@[GLD-99] Falscher Direktor - 1 hour - 0 hours required");
  assert.strictEqual(gld99.rate, 0, 'GLD-99 must be rejected (rate 0)');
  assert.strictEqual(gld99.isUnknownRank, true, 'GLD-99 must be marked as unknown/invalid');

  // Completely unknown prefix: XYZ-12
  const xyz12 = parseMelonlyLine("@[XYZ-12] Unbekannt - 1 hour - 0 hours required");
  assert.strictEqual(xyz12.rate, 0);
  assert.strictEqual(xyz12.isUnknownRank, true);

  console.log('✔ [3/4] Sonderfall-Isolation für Führungsebene (GK-01, GK-02, GLD-03) & ungültige Kennungen (GK-05, GLD-99) erfolgreich verifiziert.');
}

// 5. Verification of Cent-Free Integer Guarantee
function testCentFreeGuarantee() {
  const oddTimes = [
    { callsign: "GUF-99", text: "1 minute", rate: 4600, expected: Math.round((1/60) * 4600) },      // 76.666 -> 77
    { callsign: "GKO-99", text: "7 seconds", rate: 11500, expected: Math.round((7/3600) * 11500) }, // 22.361 -> 22
    { callsign: "GGF-99", text: "17 minutes 43 seconds", rate: 13800, expected: Math.round((17/60 + 43/3600) * 13800) }
  ];

  for (const t of oddTimes) {
    const res = parseMelonlyLine(`@[${t.callsign}] Test - ${t.text} -`);
    assert.strictEqual(Number.isInteger(res.payout), true);
    assert.strictEqual(res.payout, t.expected);
  }

  console.log('✔ [4/4] Strikte centfreie Rundung (ganze Euro als Integer) erfolgreich validiert.\\n');
}

// Execute All Tests
async function runAll() {
  try {
    await testHttpServer();
    testMelonlySampleLines();
    testSpecialRanks();
    testCentFreeGuarantee();
    console.log('======================================================');
    console.log('🎉 ALLE AUTOMATISIERTEN TESTS VOLLSTÄNDIG BESTANDEN!');
    console.log('======================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test fehlgeschlagen:', err);
    process.exit(1);
  }
}

runAll();
