const fs = require('fs');
const path = require('path');
const { cleanText } = require('./utils');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'favorites.json');

function loadFavorites() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).favorites || [];
  } catch (error) {
    console.error('Erro ao ler favorites.json:', error);
    return [];
  }
}

function isFavorite(server, favorites) {
  const text = cleanText(`${server.name} ${server.country} ${server.map} ${server.connect || ''}`).toLowerCase();
  return favorites.some((fav) =>
    (fav.aliases || []).some((alias) => text.includes(cleanText(alias).toLowerCase()))
  );
}

module.exports = { loadFavorites, isFavorite };
