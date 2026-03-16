const Gamedig = require('gamedig');

async function queryRustServer(host, port) {
  try {
    const state = await Gamedig.query({
      type: 'rust',
      host,
      port,
      maxAttempts: 1,
      socketTimeout: 2500
    });

    return {
      name: state.name || null,
      map: state.map || null,
      players: typeof state.raw?.players === 'number' ? state.raw.players : state.players?.length ?? null,
      maxPlayers: state.maxplayers ?? null,
      connect: host && port ? `connect ${host}:${port}` : null
    };
  } catch {
    return null;
  }
}

module.exports = { queryRustServer };
