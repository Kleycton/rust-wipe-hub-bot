const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'store.json');

function defaultStore() {
  return { guilds: {} };
}

function loadStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return defaultStore();
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch (error) {
    console.error('Erro ao ler store.json:', error);
    return defaultStore();
  }
}

function saveStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function ensureGuild(store, guildId) {
  if (!store.guilds[guildId]) {
    store.guilds[guildId] = {
      categoryId: '',
      channels: {},
      messages: {},
      alerts: { recent: {}, upcoming: {} },
      lastUpdatedAt: '',
      lastSnapshot: {}
    };
  }
  const state = store.guilds[guildId];
  state.channels = state.channels || {};
  state.messages = state.messages || {};
  state.alerts = state.alerts || { recent: {}, upcoming: {} };
  state.lastSnapshot = state.lastSnapshot || {};
  return state;
}

module.exports = { loadStore, saveStore, ensureGuild };
