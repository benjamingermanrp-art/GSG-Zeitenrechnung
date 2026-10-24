// scripts/fetch-discord-members.js
// Lädt alle Mitglieder des Discord-Servers und schreibt discord-members.json:
// Name (wie im Melonly-Export) -> Discord-Username.
// Übernommen werden nur Mitglieder, deren Server-Nickname eine Dienstnummer wie [GUF-68] enthält.
// Läuft per GitHub Action (.github/workflows/discord-members.yml).
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const OUTPUT = path.join(__dirname, '..', 'discord-members.json');

// Gleiche Regel wie der Melonly-Parser in index.html: Text nach ']' bis zum ersten '-' oder ':'
function nameFromNickname(nick) {
  const open = nick.indexOf('[');
  const close = open === -1 ? -1 : nick.indexOf(']', open);
  if (close === -1) return '';
  return nick.substring(close + 1).split(/[-:]/)[0].replace(/\s+/g, ' ').trim();
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchAllMembers() {
  const members = [];
  let after = '0';
  for (;;) {
    const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=1000&after=${after}`, {
      headers: { Authorization: `Bot ${TOKEN}` }
    });
    if (res.status === 429) {
      const { retry_after = 1 } = await res.json();
      await sleep(retry_after * 1000);
      continue;
    }
    if (!res.ok) {
      const hints = {
        401: 'Bot-Token ist falsch (Secret DISCORD_BOT_TOKEN prüfen).',
        403: 'Bot ist nicht auf dem Server oder "Server Members Intent" ist im Developer Portal nicht aktiviert.',
        404: 'Server-ID ist falsch (Secret DISCORD_GUILD_ID prüfen) oder der Bot ist nicht auf dem Server.'
      };
      throw new Error(`Discord-API antwortet mit ${res.status}. ${hints[res.status] || await res.text()}`);
    }
    const page = await res.json();
    members.push(...page);
    if (page.length < 1000) return members;
    after = page[page.length - 1].user.id;
  }
}

async function main() {
  if (!TOKEN || !GUILD_ID) {
    throw new Error('Secrets DISCORD_BOT_TOKEN und DISCORD_GUILD_ID müssen im GitHub-Repo hinterlegt sein.');
  }

  const members = await fetchAllMembers();
  const byName = {};
  const duplicates = new Set();

  for (const member of members) {
    if (!member.user || member.user.bot) continue;
    const display = member.nick || member.user.global_name || member.user.username;
    const name = nameFromNickname(display || '');
    if (!name) continue;
    if (byName[name] && byName[name] !== member.user.username) duplicates.add(name);
    byName[name] = member.user.username;
  }

  // Doppelte Namen nicht automatisch zuordnen, sonst könnte an die falsche Person ausgezahlt werden
  for (const name of duplicates) {
    console.warn(`Übersprungen (Name mehrfach vergeben): ${name}`);
    delete byName[name];
  }

  const sorted = {};
  Object.keys(byName).sort((a, b) => a.localeCompare(b, 'de')).forEach(k => { sorted[k] = byName[k]; });
  fs.writeFileSync(OUTPUT, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`${members.length} Mitglieder geladen, ${Object.keys(sorted).length} mit Dienstnummer gespeichert.`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
