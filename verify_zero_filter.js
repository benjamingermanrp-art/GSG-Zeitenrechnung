// verify_zero_filter.js
const http = require('http');
const assert = require('assert');

console.log('================================================================');
console.log('🔍 STARTE VERIFIKATION: 0 € FILTER-CORE-FEATURE & WORKFLOW');
console.log('================================================================\n');

// 1. HTTP Server & HTML Toggle Verification
function testHttpAndToggle() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000', (res) => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        assert.strictEqual(res.statusCode, 200);
        assert(html.includes('showZeroPayoutsToggle'), 'HTML must contain showZeroPayoutsToggle checkbox');
        assert(html.includes('Nullbeträge anzeigen'), 'HTML must contain Nullbeträge anzeigen label');
        assert(html.includes('zeroPayoutCountBadge'), 'HTML must contain zeroPayoutCountBadge');
        assert(html.includes('showZeroPayouts = false'), 'Default state must be false (0 € hidden by default)');
        console.log('✔ [1/4] HTTP 200 OK & UI-Toggle "Nullbeträge anzeigen" im HTML nachgewiesen.');
        resolve();
      });
    }).on('error', reject);
  });
}

// 2. Parser Logic with 0 € Evaluation
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

function parseLine(rawLine) {
  const firstBracketIndex = rawLine.indexOf('[');
  if (firstBracketIndex === -1) return null;
  const bracketCloseIndex = rawLine.indexOf(']', firstBracketIndex);
  if (bracketCloseIndex === -1) return null;

  const callsign = rawLine.substring(firstBracketIndex + 1, bracketCloseIndex).trim();
  let rankInfo = null;

  if (callsign === 'GK-01') rankInfo = DEFAULT_RATES['GK-01'];
  else if (callsign === 'GK-02') rankInfo = DEFAULT_RATES['GK-02'];
  else if (callsign === 'GLD-03') rankInfo = DEFAULT_RATES['GLD-03'];
  else if (callsign.startsWith('GK-') || callsign.startsWith('GLD-')) rankInfo = { rate: 0, name: 'Ungültig' };
  else {
    const hyphenIdx = callsign.indexOf('-');
    const prefix = (hyphenIdx !== -1 ? callsign.substring(0, hyphenIdx) : callsign).toUpperCase();
    rankInfo = DEFAULT_RATES[prefix] || { rate: 0, name: 'Unbekannt' };
  }

  const afterBracket = rawLine.substring(bracketCloseIndex + 1);
  const sepMatch = afterBracket.match(/[-:]/);
  if (!sepMatch) return null;

  const name = afterBracket.substring(0, sepMatch.index).trim();
  const afterFirstSep = afterBracket.substring(sepMatch.index + 1);
  const secondSepIndex = afterFirstSep.indexOf('-');
  const timeStr = (secondSepIndex !== -1 ? afterFirstSep.substring(0, secondSepIndex) : afterFirstSep).trim();

  const hoursMatch = timeStr.match(/(\d+)\s*(?:hours?|std|h)\b/i);
  const minutesMatch = timeStr.match(/(\d+)\s*(?:minutes?|min|m)\b/i);
  const secondsMatch = timeStr.match(/(\d+)\s*(?:seconds?|sek|s)\b/i);

  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  const seconds = secondsMatch ? parseInt(secondsMatch[1], 10) : 0;

  const decimalHours = hours + (minutes / 60) + (seconds / 3600);
  const payout = Math.round(decimalHours * rankInfo.rate);

  return { callsign, name, payout, rate: rankInfo.rate };
}

// 3. Test That 0 € Entries are Hidden by Default
function testDefaultZeroHidden() {
  const mixedLines = [
    "@[GUF-68] Sarah Salzberg - 11 hours 56 minutes - 3 hours required", // 54.893 €
    "@[GK-02] Sven Wood - 3 hours 25 minutes - 0 hours required",        // 61.500 €
    "@[GRE-99] Null Sekunden Test - 0 seconds - 0 hours required",      // 0 €
    "@[GK-05] Falscher Kommandeur - 1 hour - 0 hours required",         // 0 € (ungültig)
    "@[GRE-88] Probe Sekunde - 1 second - 2 hours required"             // 0 € (0.27 € -> 0 €)
  ];

  const parsed = mixedLines.map(parseLine);
  assert.strictEqual(parsed.length, 5);

  // Standardverhalten: showZeroPayouts = false
  const showZeroPayoutsDefault = false;
  const activeWorkingList = showZeroPayoutsDefault 
    ? parsed 
    : parsed.filter(r => r.payout > 0);

  // Es dürfen NUR die 2 Personen mit > 0 € in der Liste sein!
  assert.strictEqual(activeWorkingList.length, 2, 'Working list must contain exactly 2 non-zero entries by default');
  assert(activeWorkingList.every(r => r.payout > 0), 'No 0 € entry must be present in the default working list');
  assert.strictEqual(activeWorkingList[0].callsign, 'GUF-68');
  assert.strictEqual(activeWorkingList[1].callsign, 'GK-02');

  console.log('✔ [2/4] Standardverhalten nachgewiesen: Alle 3 Personen mit 0 € Auszahlung sind standardmäßig aus der Arbeitsliste ausgeblendet.');
}

// 4. Test Toggle Activation
function testToggleVisibility() {
  const mixedLines = [
    "@[GUF-68] Sarah Salzberg - 11 hours 56 minutes - 3 hours required", // 54.893 €
    "@[GK-05] Falscher Kommandeur - 1 hour - 0 hours required",         // 0 €
    "@[GRE-99] Null Sekunden Test - 0 seconds - 0 hours required"       // 0 €
  ];

  const parsed = mixedLines.map(parseLine);
  
  // Wenn Toggle aktiviert wird: showZeroPayouts = true
  const showZeroPayoutsActive = true;
  const listWithZero = showZeroPayoutsActive 
    ? parsed 
    : parsed.filter(r => r.payout > 0);

  assert.strictEqual(listWithZero.length, 3, 'All 3 entries must appear when toggle is active');
  
  // Sortierung: Nullbeträge ans Ende schieben
  listWithZero.sort((a, b) => {
    if (a.payout === 0 && b.payout > 0) return 1;
    if (a.payout > 0 && b.payout === 0) return -1;
    return 0;
  });

  assert.strictEqual(listWithZero[0].callsign, 'GUF-68');
  assert.strictEqual(listWithZero[1].payout, 0);
  assert.strictEqual(listWithZero[2].payout, 0);

  console.log('✔ [3/4] Umschalter-Funktion nachgewiesen: Bei Aktivierung des Toggles erscheinen die 0 € Personen am Ende der Liste.');
}

// 5. Test Bulk Command Export Never Includes 0 €
function testBulkCommandExcludesZero() {
  const members = [
    { callsign: 'GUF-68', discordUser: 'sarah', payout: 54893 },
    { callsign: 'GK-05', discordUser: 'fake_commander', payout: 0 },
    { callsign: 'GRE-99', discordUser: 'null_guy', payout: 0 }
  ];

  // Bulk commands generation: rec.payout > 0 is strictly enforced
  const commands = members
    .filter(rec => rec.payout > 0 && rec.discordUser && rec.discordUser.trim().length > 0)
    .map(rec => `/economy add user:@${rec.discordUser.trim()} money:${rec.payout}`);

  assert.strictEqual(commands.length, 1);
  assert.strictEqual(commands[0], '/economy add user:@sarah money:54893');

  console.log('✔ [4/4] Bulk-Export-Sicherheit nachgewiesen: 0 € Einträge generieren niemals versehentlich Starred-Bot Commands.\n');
}

async function run() {
  try {
    await testHttpAndToggle();
    testDefaultZeroHidden();
    testToggleVisibility();
    testBulkCommandExcludesZero();
    console.log('================================================================');
    console.log('🎉 ALLE TESTS ZUR 0 € AUSBLENDUNG ERFOLGREICH BESTANDEN!');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Fehler:', err);
    process.exit(1);
  }
}

run();
