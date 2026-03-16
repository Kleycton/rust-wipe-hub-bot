require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

const { loadStore, saveStore, ensureGuild } = require('./src/store');
const { fetchRecentServers, fetchTopDetailedServers } = require('./src/scraper');
const { loadFavorites, isFavorite } = require('./src/favorites');
const {
  buildInfoEmbed,
  buildGenericListEmbed,
  buildFavoritesEmbed,
  buildPopularEmbed,
  buildUpcomingEmbeds,
  buildAlertsEmbed,
  buildServerInfoEmbed,
  buildRegionEmbeds
} = require('./src/render');
const { nowIso, formatDateTime, calculateForceWipeDate, cleanText, TIMEZONE, formatCountdown } = require('./src/utils');

const CATEGORY_NAME = 'wipe-hub';
const CHANNEL_SPECS = [
  ['informacoes', 'info'],
  ['favoritos', 'favorites'],
  ['vanilla-oficiais', 'vanilla'],
  ['modded-curados', 'modded'],
  ['proximos-wipes', 'upcoming'],
  ['regiao-brasil', 'br'],
  ['regiao-europa', 'eu'],
  ['regiao-america', 'na'],
  ['alertas-wipe', 'alerts']
];

const UPDATE_INTERVAL_MINUTES = Number(process.env.UPDATE_INTERVAL_MINUTES || 5);
const LIST_PAGES = Number(process.env.LIST_PAGES || 8);
const TOP_RECENT_LIMIT = Number(process.env.TOP_RECENT_LIMIT || 18);
const TOP_REGION_LIMIT = Number(process.env.TOP_REGION_LIMIT || 9999);
const TOP_UPCOMING_LIMIT = Number(process.env.TOP_UPCOMING_LIMIT || 20);
const TOP_POPULAR_LIMIT = Number(process.env.TOP_POPULAR_LIMIT || 15);
const TOP_DETAIL_FETCH = Number(process.env.TOP_DETAIL_FETCH || 80);
const ALERT_ROLE_ID = process.env.ALERT_ROLE_ID || '';
const UPCOMING_ALERT_MINUTES = Number(process.env.UPCOMING_ALERT_MINUTES || 180);
const RECENT_ALERT_MINUTES = Number(process.env.RECENT_ALERT_MINUTES || 120);
const ALERT_COOLDOWN_HOURS = Number(process.env.ALERT_COOLDOWN_HOURS || 12);

const store = loadStore();
const favoritesCfg = loadFavorites();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName('setupwipehub').setDescription('Cria a categoria e os canais automáticos do hub de wipes').setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName('refreshwipehub').setDescription('Força atualização imediata do hub').setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName('wipehubstatus').setDescription('Mostra o status atual do bot'),
    new SlashCommandBuilder()
      .setName('wipeinfo')
      .setDescription('Busca um servidor e mostra dados em tempo real')
      .addStringOption((option) => option.setName('query').setDescription('Nome ou connect do servidor').setRequired(true)),
    new SlashCommandBuilder().setName('forcewipe').setDescription('Mostra a previsão do próximo force wipe oficial')
  ].map((c) => c.toJSON());

  if (process.env.DISCORD_GUILD_ID) {
    try {
      const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
      await guild.commands.set(commands);
      console.log('Slash commands registrados no servidor.');
      return;
    } catch (error) {
      console.error('Falha ao registrar no servidor específico, usando global:', error.message);
    }
  }

  await client.application.commands.set(commands);
  console.log('Slash commands registrados globalmente.');
}

async function ensureCategoryAndChannels(guild) {
  const state = ensureGuild(store, guild.id);
  let category = state.categoryId ? await guild.channels.fetch(state.categoryId).catch(() => null) : null;

  if (!category) {
    category = await guild.channels.create({ name: CATEGORY_NAME, type: ChannelType.GuildCategory });
    state.categoryId = category.id;
    saveStore(store);
  }

  for (const [name, key] of CHANNEL_SPECS) {
    let channel = state.channels[key] ? await guild.channels.fetch(state.channels[key]).catch(() => null) : null;
    if (!channel) {
      channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Canal automático do Rust Wipe Hub: ${name}`
      });
      state.channels[key] = channel.id;
      saveStore(store);
    }
  }

  return state;
}

function buildSnapshot(recentAll, detailed) {
  const recentSorted = [...recentAll].sort((a, b) => {
    if (a.hoursSinceWipe == null && b.hoursSinceWipe == null) return 0;
    if (a.hoursSinceWipe == null) return 1;
    if (b.hoursSinceWipe == null) return -1;
    return a.hoursSinceWipe - b.hoursSinceWipe;
  });

  const favorites = detailed.filter((server) => isFavorite(server, favoritesCfg));

  const vanilla = detailed
    .filter((server) => ['official_vanilla', 'community_vanilla'].includes(server.tier))
    .sort((a, b) => (b.playersCurrent || 0) - (a.playersCurrent || 0))
    .slice(0, TOP_POPULAR_LIMIT);

  const modded = detailed
    .filter((server) => ['light_moded', 'unknown'].includes(server.tier))
    .sort((a, b) => (b.playersCurrent || 0) - (a.playersCurrent || 0))
    .slice(0, TOP_POPULAR_LIMIT);

  const byRegion = {
    br: detailed.filter((s) => s.region === 'br').sort((a, b) => (b.playersCurrent || 0) - (a.playersCurrent || 0)).slice(0, TOP_REGION_LIMIT),
    eu: detailed.filter((s) => s.region === 'eu').sort((a, b) => (b.playersCurrent || 0) - (a.playersCurrent || 0)).slice(0, TOP_REGION_LIMIT),
    na: detailed.filter((s) => s.region === 'na').sort((a, b) => (b.playersCurrent || 0) - (a.playersCurrent || 0)).slice(0, TOP_REGION_LIMIT)
  };

  const upcoming = detailed
    .filter((server) => server.prediction?.nextWipe)
    .sort((a, b) => a.prediction.nextWipe - b.prediction.nextWipe)
    .slice(0, TOP_UPCOMING_LIMIT);

  return {
    recentAll: recentSorted.slice(0, TOP_RECENT_LIMIT),
    favorites,
    vanilla,
    modded,
    byRegion,
    upcoming
  };
}

function shouldNotify(map, id, cooldownMs) {
  const last = map[id];
  return !last || Date.now() - last > cooldownMs;
}

async function notifyAlerts(channel, state, snapshot, footer) {
  const recentCutoff = RECENT_ALERT_MINUTES / 60;
  const cooldownMs = ALERT_COOLDOWN_HOURS * 60 * 60 * 1000;
  const soonWindowMs = UPCOMING_ALERT_MINUTES * 60 * 1000;

  const recent = (snapshot.recentAll || []).filter((s) => s.hoursSinceWipe != null && s.hoursSinceWipe <= recentCutoff);
  const soon = (snapshot.upcoming || []).filter(
    (s) => s.prediction?.nextWipe && s.prediction.nextWipe.getTime() - Date.now() <= soonWindowMs
  );

  for (const server of recent) {
    if (!shouldNotify(state.alerts.recent, server.id, cooldownMs)) continue;
    const embed = buildServerInfoEmbed(server, footer).setTitle('🚨 Servidor wipe recente').setColor(0xef4444);
    await channel.send({ content: ALERT_ROLE_ID ? `<@&${ALERT_ROLE_ID}>` : undefined, embeds: [embed] }).catch(() => null);
    state.alerts.recent[server.id] = Date.now();
    saveStore(store);
  }

  for (const server of soon) {
    if (!shouldNotify(state.alerts.upcoming, server.id, cooldownMs)) continue;
    const embed = buildServerInfoEmbed(server, footer).setTitle('⏰ Wipe previsto nas próximas horas').setColor(0xf97316);
    await channel.send({ content: ALERT_ROLE_ID ? `<@&${ALERT_ROLE_ID}>` : undefined, embeds: [embed] }).catch(() => null);
    state.alerts.upcoming[server.id] = Date.now();
    saveStore(store);
  }
}

function buildFooter() {
  return `Atualizado em ${formatDateTime(new Date())} | TZ ${TIMEZONE}`;
}

function scoreMatch(query, server) {
  const q = cleanText(query).toLowerCase();
  const name = cleanText(server.name).toLowerCase();
  const connect = cleanText(server.connect || '').toLowerCase();
  const country = cleanText(server.country || '').toLowerCase();
  let score = 0;
  if (name.includes(q)) score += 5;
  if (connect.includes(q)) score += 4;
  if (country.includes(q)) score += 1;
  score += Math.min((server.playersCurrent || 0) / 50, 2);
  return score;
}

async function upsertSingleEmbed(channel, messageId, embed) {
  let message = messageId ? await channel.messages.fetch(messageId).catch(() => null) : null;
  if (!message) message = await channel.send({ embeds: [embed] });
  else await message.edit({ embeds: [embed] });
  return message.id;
}

async function upsertMultiEmbeds(channel, existingIds, embeds) {
  const ids = [];
  const currentIds = Array.isArray(existingIds) ? existingIds : [];

  for (let i = 0; i < embeds.length; i += 1) {
    let message = currentIds[i] ? await channel.messages.fetch(currentIds[i]).catch(() => null) : null;
    if (!message) message = await channel.send({ embeds: [embeds[i]] });
    else await message.edit({ embeds: [embeds[i]] });
    ids.push(message.id);
  }

  for (let i = embeds.length; i < currentIds.length; i += 1) {
    const extra = await channel.messages.fetch(currentIds[i]).catch(() => null);
    if (extra) await extra.delete().catch(() => null);
  }

  return ids;
}

async function refreshGuildHub(guild) {
  const state = await ensureCategoryAndChannels(guild);
  const recentAll = await fetchRecentServers({ pages: LIST_PAGES });
  const detailed = await fetchTopDetailedServers(recentAll, TOP_DETAIL_FETCH);
  const snapshot = buildSnapshot(recentAll, detailed);
  const updatedAt = formatDateTime(new Date());
  const footer = buildFooter();

  const info = await guild.channels.fetch(state.channels.info);
  const favorites = await guild.channels.fetch(state.channels.favorites);
  const vanilla = await guild.channels.fetch(state.channels.vanilla);
  const modded = await guild.channels.fetch(state.channels.modded);
  const upcoming = await guild.channels.fetch(state.channels.upcoming);
  const br = await guild.channels.fetch(state.channels.br);
  const eu = await guild.channels.fetch(state.channels.eu);
  const na = await guild.channels.fetch(state.channels.na);
  const alerts = await guild.channels.fetch(state.channels.alerts);

  state.messages.info = await upsertSingleEmbed(info, state.messages.info, buildInfoEmbed(snapshot, { updatedAt }));
  state.messages.favorites = await upsertSingleEmbed(favorites, state.messages.favorites, buildFavoritesEmbed(snapshot.favorites, footer));
  state.messages.vanilla = await upsertSingleEmbed(vanilla, state.messages.vanilla, buildPopularEmbed('🏆 Vanilla / oficiais', snapshot.vanilla, footer));
  state.messages.modded = await upsertSingleEmbed(modded, state.messages.modded, buildPopularEmbed('⚙️ 2x / 3x / curados', snapshot.modded, footer, 0x8b5cf6));
  state.messages.br = await upsertMultiEmbeds(br, state.messages.br, buildRegionEmbeds('🇧🇷 Região Brasil', 0x2563eb, snapshot.byRegion.br, footer));
  state.messages.eu = await upsertMultiEmbeds(eu, state.messages.eu, buildRegionEmbeds('🇪🇺 Região Europa', 0x2563eb, snapshot.byRegion.eu, footer));
  state.messages.na = await upsertMultiEmbeds(na, state.messages.na, buildRegionEmbeds('🇺🇸 Região América do Norte', 0x2563eb, snapshot.byRegion.na, footer));
  state.messages.alerts = await upsertSingleEmbed(alerts, state.messages.alerts, buildAlertsEmbed(snapshot, footer));
  state.messages.upcoming = await upsertMultiEmbeds(upcoming, state.messages.upcoming, buildUpcomingEmbeds(snapshot.upcoming, footer));
  await notifyAlerts(alerts, state, snapshot, footer);

  state.lastUpdatedAt = nowIso();
  state.lastSnapshot = {
    recentCount: snapshot.recentAll.length,
    favoritesCount: snapshot.favorites.length,
    upcomingCount: snapshot.upcoming.length,
    vanillaCount: snapshot.vanilla.length,
    moddedCount: snapshot.modded.length
  };
  saveStore(store);
}

async function refreshAllGuilds() {
  for (const guildId of client.guilds.cache.map((g) => g.id)) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;
    try {
      await refreshGuildHub(guild);
      console.log(`Hub atualizado: ${guild.name}`);
    } catch (error) {
      console.error(`Erro ao atualizar ${guild.name}:`, error);
    }
  }
}

client.once('ready', async () => {
  console.log(`Logado como ${client.user.tag}`);
  await registerCommands();
  await refreshAllGuilds();
  setInterval(() => {
    refreshAllGuilds().catch((error) => console.error('Erro no loop:', error));
  }, UPDATE_INTERVAL_MINUTES * 60 * 1000);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === 'setupwipehub') {
      await interaction.deferReply({ ephemeral: true });
      await ensureCategoryAndChannels(interaction.guild);
      await refreshGuildHub(interaction.guild);
      await interaction.editReply('Wipe hub PRO criado e atualizado com sucesso.');
      return;
    }
    if (interaction.commandName === 'refreshwipehub') {
      await interaction.deferReply({ ephemeral: true });
      await refreshGuildHub(interaction.guild);
      await interaction.editReply('Wipe hub atualizado agora.');
      return;
    }
    if (interaction.commandName === 'wipehubstatus') {
      const s = ensureGuild(store, interaction.guild.id);
      const lines = [
        `Categoria: ${s.categoryId || 'não criada'}`,
        `Última atualização: ${s.lastUpdatedAt || 'nunca'}`,
        `Recentes: ${s.lastSnapshot.recentCount || 0}`,
        `Favoritos: ${s.lastSnapshot.favoritesCount || 0}`,
        `Próximos wipes: ${s.lastSnapshot.upcomingCount || 0}`,
        `Vanilla/oficiais: ${s.lastSnapshot.vanillaCount || 0}`,
        `2x/3x/modded curados: ${s.lastSnapshot.moddedCount || 0}`
      ];
      await interaction.reply({ content: lines.join('\n'), ephemeral: true });
      return;
    }
    if (interaction.commandName === 'wipeinfo') {
      const query = interaction.options.getString('query', true);
      await interaction.deferReply({ ephemeral: true });
      const recentAll = await fetchRecentServers({ pages: LIST_PAGES });
      const detailed = await fetchTopDetailedServers(recentAll, TOP_DETAIL_FETCH);
      const best = detailed
        .map((s) => ({ server: s, score: scoreMatch(query, s) }))
        .sort((a, b) => b.score - a.score)[0];

      if (!best || best.score < 1) {
        await interaction.editReply('Não encontrei servidores que correspondam à busca.');
        return;
      }

      const embed = buildServerInfoEmbed(best.server, buildFooter()).setTitle('🔍 Resultado da busca');
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    if (interaction.commandName === 'forcewipe') {
      const force = calculateForceWipeDate();
      await interaction.reply({
        content: `Próximo force wipe oficial: ${formatDateTime(force)}\nContagem regressiva: ${formatCountdown(force)}\nFuso: ${TIMEZONE}`,
        ephemeral: true
      });
      return;
    }
  } catch (error) {
    console.error('Erro no interactionCreate:', error);
    if (interaction.deferred || interaction.replied) await interaction.editReply('Deu erro ao executar o comando.').catch(() => null);
    else await interaction.reply({ content: 'Deu erro ao executar o comando.', ephemeral: true }).catch(() => null);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
