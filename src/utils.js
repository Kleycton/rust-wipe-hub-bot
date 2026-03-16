const TIMEZONE = process.env.TIMEZONE || process.env.TZ || 'America/Sao_Paulo';

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeName(name) {
  const text = cleanText(name);
  if (!text || /^unknown$/i.test(text) || /^server$/i.test(text) || /^servidor$/i.test(text)) {
    return 'Servidor sem nome';
  }
  return text;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clampText(value, max = 4000) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function chunkText(lines, maxLength = 3800) {
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : ['Sem dados no momento.'];
}

function formatDateTime(date, tz = TIMEZONE) {
  if (!date) return 'sem data';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return 'sem data';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: tz
  }).format(d);
}

function formatRelativeHours(hours) {
  if (hours == null || Number.isNaN(hours)) return '?h';
  if (hours < 1) return '<1h';
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function nowIso() {
  return new Date().toISOString();
}

function formatCountdown(target) {
  if (!target) return 'sem data';
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return 'agora';
  const minutes = Math.floor(diff / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return `${days}d ${hours}h ${mins}m`;
}

function regionFlag(region) {
  if (region === 'br') return '🇧🇷';
  if (region === 'eu') return '🇪🇺';
  if (region === 'na') return '🇺🇸';
  return '🌍';
}

function calculateForceWipeDate() {
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();

  function firstThursdayAt19UTC(y, m) {
    const d = new Date(Date.UTC(y, m, 1, 19, 0, 0));
    while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  let force = firstThursdayAt19UTC(year, month);
  if (force < now) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    force = firstThursdayAt19UTC(year, month);
  }
  return force;
}

function inferTier(name) {
  const n = cleanText(name).toLowerCase();
  if (/\b(official|rustafied|rustoria|reddit|moose)\b/.test(n)) return 'official_vanilla';
  if (/\b(vanilla)\b/.test(n) && !/\b(2x|3x|5x|10x|modded|kits)\b/.test(n)) return 'community_vanilla';
  if (/\b(2x|3x)\b/.test(n)) return 'light_moded';
  if (/\b(5x|10x|modded|kits|arena|bedwars|gungame|battlefield)\b/.test(n)) return 'heavy_moded';
  return 'unknown';
}

module.exports = {
  cleanText,
  safeName,
  uniqueBy,
  clampText,
  chunkText,
  formatDateTime,
  formatRelativeHours,
  nowIso,
  formatCountdown,
  regionFlag,
  inferTier,
  calculateForceWipeDate,
  TIMEZONE
};
