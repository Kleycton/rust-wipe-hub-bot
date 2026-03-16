const axios = require('axios');
const cheerio = require('cheerio');
const { uniqueBy, cleanText, safeName, inferTier } = require('./utils');
const { pickRegularInterval } = require('./predict');
const { queryRustServer } = require('./query');

const BASE_URL = 'https://just-wiped.net';
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
};

const EU = new Set(['austria','belgium','bulgaria','croatia','cyprus','czech republic','denmark','estonia','finland','france','germany','greece','hungary','iceland','ireland','italy','latvia','lithuania','luxembourg','malta','netherlands','norway','poland','portugal','romania','slovakia','slovenia','spain','sweden','switzerland','united kingdom','uk','england','scotland','wales','gb','gbr','irl','de','fr','es','pt','it','pl','se','no','fi','dk','nl','be','cz','sk','hu','at','ch','ro','bg','gr']);
const NA = new Set(['united states','usa','canada','mexico','us','ca','mx','na']);
const SA = new Set(['brazil','brasil','argentina','chile','colombia','peru','uruguay','paraguay','bolivia','ecuador','venezuela','br','bra','latam','south america','sa']);

function classifyRegion(country, name) {
  const c = cleanText(country).toLowerCase();
  const n = cleanText(name).toLowerCase();

  if (
    SA.has(c) ||
    SA.has(country.toLowerCase?.() || '') ||
    /\b(br|brazil|brasil|south america|latam|sa)\b/.test(n) ||
    /\b(brazil|brasil|south america|latam|sa)\b/.test(c)
  ) return 'br';

  if (
    EU.has(c) ||
    EU.has(country.toLowerCase?.() || '') ||
    /\b(eu|europe|eu west|eu east|uk)\b/.test(n) ||
    /\b(europe|united kingdom|uk|england|gb)\b/.test(c)
  ) return 'eu';

  if (
    NA.has(c) ||
    NA.has(country.toLowerCase?.() || '') ||
    /\b(us|usa|na|north america|canada)\b/.test(n) ||
    /\b(united states|usa|canada|north america|mx)\b/.test(c)
  ) return 'na';

  return 'other';
}

async function fetchText(url) {
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  return res.data;
}

function chooseName($, elem) {
  const candidates = [
    cleanText($('a.name h1', elem).text()),
    cleanText($('a.name', elem).clone().children().remove().end().text()),
    cleanText($('.name', elem).text()).split('\n')[0],
    cleanText($('h1', elem).text())
  ].filter(Boolean);

  return safeName(candidates.find((x) => x && x.toLowerCase() !== 'unknown'));
}

function parseCard($, elem) {
  const country = $('.flag', elem).attr('title') || 'Unknown';
  const href = $('a.name', elem).attr('href') || $('a[href*="/rust_servers/"]', elem).attr('href') || '';
  const m = href.match(/\/rust_servers\/(\d+)/);
  const id = m ? Number(m[1]) : NaN;
  const name = chooseName($, elem);
  const region = classifyRegion(country, name);
  const lastWipeIso = $('.i-last-wipe time', elem).attr('datetime') || '';
  const lastWipe = lastWipeIso ? new Date(lastWipeIso) : null;
  const rating = Number.parseInt(cleanText($('.i-rating .value', elem).text()), 10) || 0;
  const playersParts = cleanText($('.i-player .value', elem).text()).split('/');
  const playersCurrent = Number.parseInt(playersParts[0] || '0', 10) || 0;
  const playersMax = Number.parseInt(playersParts[1] || '0', 10) || 0;
  const map = cleanText($('.i-map .value', elem).text()) || 'Unknown';
  const maxGroup = Number.parseInt(cleanText($('.i-max-group .value', elem).text()), 10) || null;
  const hoursSinceWipe = lastWipe && !Number.isNaN(lastWipe.getTime()) ? (Date.now() - lastWipe.getTime()) / (1000 * 60 * 60) : null;

  return {
    id, name, country, region, tier: inferTier(name), url: href ? `${BASE_URL}${href}` : '',
    lastWipe, rating, playersCurrent, playersMax, map, maxGroup, hoursSinceWipe,
    host: null, port: null, connect: null
  };
}

function parseServerList(html) {
  const $ = cheerio.load(html);
  return uniqueBy(
    $('.servers .server').map((_, elem) => parseCard($, elem)).get().filter((s) => Number.isFinite(s.id) && s.url),
    (s) => s.id
  );
}

async function fetchRecentServers({ pages = 4 } = {}) {
  const out = [];
  for (let page = 1; page <= pages; page += 1) {
    out.push(...parseServerList(await fetchText(`${BASE_URL}/rust_servers?page=${page}`)));
  }
  return uniqueBy(out, (s) => s.id);
}

// ---------- BattleMetrics fallback / enrichment ----------
// API docs hint: https://api.battlemetrics.com/servers?filter[game]=rust&filter[countries]=BR&page[size]=100&page[number]=1
const BM_BASE = 'https://api.battlemetrics.com/servers';

const REGION_COUNTRIES = {
  br: ['BR'],
  eu: ['PT','ES','FR','DE','NL','BE','IT','SE','NO','DK','FI','PL','CZ','SK','HU','AT','CH','GB','IE','UA','RO','BG','GR','RS','HR','SI','BA','MK','AL','LT','LV','EE'],
  na: ['US','CA','MX']
};

async function fetchBMPage(params) {
  const url = `${BM_BASE}?${new URLSearchParams(params).toString()}`;
  const res = await axios.get(url, { timeout: 12000, headers: HEADERS });
  return res.data;
}

function mapBMServer(item) {
  const a = item.attributes || {};
  const details = a.details || {};
  const country = a.country || 'Unknown';
  const region = classifyRegion(country, a.name || '');
  const host = a.ip || a.address || null;
  const port = a.port || null;
  const lastWipeSeconds = details.rust_last_wipe || details.rust_last_wipe_seconds || null;
  const lastWipe = lastWipeSeconds ? new Date(lastWipeSeconds * 1000) : null;
  return {
    id: `bm-${item.id}`,
    name: safeName(a.name || 'Unknown'),
    country,
    region,
    tier: inferTier(a.name || ''),
    url: `https://www.battlemetrics.com/servers/rust/${item.id}`,
    lastWipe,
    rating: a.rank ? Math.max(0, 100 - a.rank) : 0,
    playersCurrent: a.players ?? 0,
    playersMax: a.maxPlayers ?? 0,
    map: details.map ?? details.level ?? 'Unknown',
    maxGroup: details.maxGroupSize ?? null,
    hoursSinceWipe: lastWipe ? (Date.now() - lastWipe.getTime()) / (1000 * 60 * 60) : null,
    host,
    port,
    connect: host && port ? `connect ${host}:${port}` : null
  };
}

async function fetchBattleMetricsServers({ countries = [], pages = 1, pageSize = 100 }) {
  const results = [];
  for (let page = 1; page <= pages; page += 1) {
    const data = await fetchBMPage({
      'filter[game]': 'rust',
      'filter[countries]': countries.join(','),
      'page[size]': pageSize,
      'page[number]': page
    });
    const items = (data?.data || []).map(mapBMServer);
    results.push(...items);
    if (!data?.data || data.data.length < pageSize) break;
  }
  return results;
}

async function fetchBattleMetricsByRegion({ pages = 1, pageSize = 100 }) {
  const all = [];
  for (const [region, countries] of Object.entries(REGION_COUNTRIES)) {
    try {
      const res = await fetchBattleMetricsServers({ countries, pages, pageSize });
      all.push(...res.map((s) => ({ ...s, region })));
    } catch (error) {
      console.error(`Erro BattleMetrics região ${region}:`, error.message);
    }
  }
  return uniqueBy(all, (s) => s.connect || `${s.name}-${s.country}-${s.port || ''}`);
}

function parseRawWipeDate(text) {
  const t = cleanText(text);
  const m = t.match(/(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2}):(\d{2})\s*UTC/i);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, minute] = m;
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(minute)));
}

function parseConnect(body) {
  const m = String(body || '').match(/steam:\/\/connect\/([\d.]+):(\d+)/i);
  if (!m) return null;
  return { host: m[1], port: Number(m[2]), connect: `connect ${m[1]}:${m[2]}` };
}

async function fetchConnectInfo(url) {
  try {
    const res = await axios.get(`${url}/connect`, {
      headers: {
        ...HEADERS,
        accept: 'text/javascript, application/javascript, */*; q=0.01',
        'x-requested-with': 'XMLHttpRequest'
      },
      timeout: 10000
    });
    return parseConnect(res.data);
  } catch {
    return null;
  }
}

async function fetchServerDetails(server) {
  const html = await fetchText(server.url);
  const $ = cheerio.load(html);

  const titleName =
    cleanText($('.server.server-head a.name h1').text()) ||
    cleanText($('.server.server-head a.name').clone().children().remove().end().text()) ||
    server.name;

  const wipes = $('.wipe-history .wipe-date')
    .map((_, elem) => parseRawWipeDate($(elem).text()))
    .get()
    .filter(Boolean);

  const connectInfo = await fetchConnectInfo(server.url);
  const queryInfo = connectInfo ? await queryRustServer(connectInfo.host, connectInfo.port) : null;

  return {
    ...server,
    name: safeName(queryInfo?.name || titleName || server.name),
    map: queryInfo?.map || server.map,
    playersCurrent: typeof queryInfo?.players === 'number' ? queryInfo.players : server.playersCurrent,
    playersMax: typeof queryInfo?.maxPlayers === 'number' ? queryInfo.maxPlayers : server.playersMax,
    host: connectInfo?.host || null,
    port: connectInfo?.port || null,
    connect: queryInfo?.connect || connectInfo?.connect || null,
    wipes,
    prediction: pickRegularInterval(wipes)
  };
}

async function fetchTopDetailedServers(servers, limit = 24) {
  const candidates = [...servers]
    .sort((a, b) => ((b.playersCurrent || 0) + (b.rating || 0)) - ((a.playersCurrent || 0) + (a.rating || 0)))
    .slice(0, limit);

  const out = [];
  for (const server of candidates) {
    try {
      out.push(await fetchServerDetails(server));
    } catch (error) {
      console.error(`Erro ao buscar detalhes de ${server.name}:`, error.message);
      out.push(server);
    }
  }
  return out;
}

module.exports = { fetchRecentServers, fetchTopDetailedServers };
module.exports.fetchBattleMetricsByRegion = fetchBattleMetricsByRegion;
