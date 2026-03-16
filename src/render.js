const { EmbedBuilder } = require('discord.js');
const { clampText, formatDateTime, formatRelativeHours, chunkText, formatCountdown, regionFlag, calculateForceWipeDate } = require('./utils');

function buildInfoEmbed(snapshot, meta = {}) {
  return new EmbedBuilder()
    .setTitle('🛠️ Rust Wipe Hub PRO')
    .setColor(0xf97316)
    .setDescription('Hub automático focado em **servidores conhecidos**, **vanilla/oficiais**, **2x/3x curados**, favoritos e alertas.')
    .addFields(
      { name: 'Atualizado em', value: meta.updatedAt || 'agora', inline: true },
      { name: 'Total lido', value: String(snapshot.recentAll?.length || 0), inline: true },
      { name: 'Modo', value: 'Steam Query + scraping', inline: true },
      { name: 'Comandos', value: '/setupwipehub, /refreshwipehub, /wipeinfo, /forcewipe, /wipehubstatus', inline: false }
    );
}

function briefServerLine(server) {
  const wipe = server.hoursSinceWipe != null ? formatRelativeHours(server.hoursSinceWipe) : '?';
  const group = server.maxGroup ? ` | grupo ${server.maxGroup}` : '';
  const connect = server.connect ? ` | \`${server.connect}\`` : '';
  return `• ${regionFlag(server.region)} **${server.name}** — ${server.playersCurrent}/${server.playersMax} | rating ${server.rating}% | wipe ${wipe} atrás${group}${connect}`;
}

function favoriteBlock(server) {
  const lines = [
    `${regionFlag(server.region)} **${server.name}**`,
    `Players: **${server.playersCurrent}/${server.playersMax}**`,
    `Próximo wipe: **${server.prediction?.nextWipe ? formatDateTime(server.prediction.nextWipe) : 'sem previsão'}**`,
    `Connect: ${server.connect ? `\`${server.connect}\`` : 'sem connect'}`,
    `Tipo: ${server.tier}`,
    `Mapa: ${server.map || 'desconhecido'}`
  ];
  return lines.join('\n');
}

function popularLine(server, index) {
  const load = server.playersMax ? Math.round((server.playersCurrent / server.playersMax) * 100) : 0;
  const connect = server.connect ? ` | \`${server.connect}\`` : '';
  return `${index + 1}. ${regionFlag(server.region)} **${server.name}** — ${server.playersCurrent}/${server.playersMax} (${load}%) | ${server.country}${connect}`;
}

function buildGenericListEmbed(title, color, servers, footerText) {
  const lines = servers.length ? servers.map(briefServerLine) : ['Sem servidores no momento.'];
  return new EmbedBuilder().setTitle(title).setColor(color).setDescription(clampText(lines.join('\n'), 4000)).setFooter({ text: footerText });
}

function buildRegionEmbeds(title, color, servers, footerText) {
  const lines = servers.length ? servers.map(briefServerLine) : ['Sem servidores no momento.'];
  return chunkText(lines, 3800).map((chunk, index) =>
    new EmbedBuilder()
      .setTitle(index === 0 ? title : `${title} (continuação)`)
      .setColor(color)
      .setDescription(chunk)
      .setFooter({ text: footerText })
  );
}

function buildFavoritesEmbed(servers, footerText) {
  const desc = servers.length ? servers.map(favoriteBlock).join('\n\n') : 'Sem favoritos encontrados agora.';
  return new EmbedBuilder().setTitle('⭐ Favoritos / conhecidos').setColor(0xeab308).setDescription(clampText(desc, 4000)).setFooter({ text: footerText });
}

function buildPopularEmbed(title, servers, footerText, color = 0xf59e0b) {
  const lines = servers.length ? servers.map(popularLine) : ['Sem servidores no momento.'];
  return new EmbedBuilder().setTitle(title).setColor(color).setDescription(clampText(lines.join('\n'), 4000)).setFooter({ text: footerText });
}

function upcomingLine(server) {
  const next = server.prediction?.nextWipe ? formatDateTime(server.prediction.nextWipe) : 'sem previsão';
  const every = server.prediction?.intervalDays ? `${server.prediction.intervalDays}d` : '?';
  const confidence = server.prediction ? `${Math.round(server.prediction.confidence * 100)}%` : '?';
  const connect = server.connect ? ` | \`${server.connect}\`` : '';
  return `• ${regionFlag(server.region)} **${server.name}** — próximo: ${next} | ciclo: ${every} | confiança: ${confidence}${connect}`;
}

function buildUpcomingEmbeds(servers, footerText) {
  const sorted = [...servers].filter((s) => s.prediction?.nextWipe).sort((a, b) => a.prediction.nextWipe - b.prediction.nextWipe);
  const lines = sorted.length ? sorted.map(upcomingLine) : ['Nenhum próximo wipe estimado agora.'];
  return chunkText(lines, 3800).map((chunk, index) =>
    new EmbedBuilder()
      .setTitle(index === 0 ? '⏳ Próximos wipes estimados' : '⏳ Próximos wipes estimados (continuação)')
      .setColor(0x22c55e)
      .setDescription(chunk)
      .setFooter({ text: footerText })
  );
}

function buildAlertsEmbed(snapshot, footerText) {
  const force = calculateForceWipeDate();
  const soon = [...(snapshot.upcoming || [])]
    .filter((s) => s.prediction?.nextWipe && s.prediction.nextWipe.getTime() - Date.now() <= 24 * 60 * 60 * 1000)
    .sort((a, b) => a.prediction.nextWipe - b.prediction.nextWipe)
    .slice(0, 10);

  const lines = [
    `**Próximo force wipe:** ${formatDateTime(force)}`,
    `**Contagem regressiva:** ${formatCountdown(force)}`,
    '',
    '**Wipes estimados nas próximas 24h:**',
    ...(soon.length ? soon.map((s) => `• ${regionFlag(s.region)} ${s.name} — ${formatDateTime(s.prediction.nextWipe)}`) : ['• Nenhum servidor estimado nas próximas 24h.'])
  ];

  return new EmbedBuilder().setTitle('🚨 Alertas de wipe').setColor(0xef4444).setDescription(lines.join('\n')).setFooter({ text: footerText });
}

function buildServerInfoEmbed(server, footerText) {
  const descLines = [
    `${regionFlag(server.region)} **${server.name}**`,
    `Players: **${server.playersCurrent}/${server.playersMax || '?'}** | Rating: **${server.rating || 0}%**`,
    `Último wipe: ${server.hoursSinceWipe != null ? formatRelativeHours(server.hoursSinceWipe) + ' atrás' : 'desconhecido'}`,
    `Próximo wipe (estimado): ${server.prediction?.nextWipe ? formatDateTime(server.prediction.nextWipe) : 'sem previsão'}${server.prediction?.intervalDays ? ` | ciclo ~${server.prediction.intervalDays}d` : ''}`,
    `Mapa: ${server.map || 'desconhecido'}${server.maxGroup ? ` | grupo máx: ${server.maxGroup}` : ''}`,
    `País/Região: ${server.country || '??'} / ${server.region || 'other'}`,
    `Conexão: ${server.connect ? `\`${server.connect}\`` : 'não disponível'}`,
    server.url ? `Fonte: ${server.url}` : null
  ].filter(Boolean);

  return new EmbedBuilder()
    .setTitle('📡 Consulta de servidor')
    .setColor(0x0ea5e9)
    .setDescription(clampText(descLines.join('\n'), 4000))
    .setFooter({ text: footerText });
}

module.exports = {
  buildInfoEmbed,
  buildGenericListEmbed,
  buildFavoritesEmbed,
  buildPopularEmbed,
  buildUpcomingEmbeds,
  buildAlertsEmbed,
  buildServerInfoEmbed,
  buildRegionEmbeds
};
