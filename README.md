# Rust Wipe Hub Bot ULTRA BR

Bot de Discord focado em wipes de Rust com scraping do just-wiped + Steam Query. Cria um hub automático por categoria/canal, envia alertas e permite consultas rápidas.

## Comandos
- `/setupwipehub` cria a categoria `wipe-hub` com todos os canais e popula as embeds.
- `/refreshwipehub` força atualização imediata.
- `/wipehubstatus` mostra contadores da última execução.
- `/wipeinfo query:<texto>` busca um servidor pelo nome ou connect e mostra detalhes em tempo real.
- `/forcewipe` exibe a próxima data de force wipe oficial e contagem regressiva.

## Features
- Detecção estendida para BR/LATAM, EU e NA.
- Favoritos curados via `config/favorites.json` com match por aliases e connect.
- Listas separadas: favoritos, vanilla/oficiais, modded curados (2x/3x), regiões e próximos wipes estimados.
- Alertas proativos no canal `alertas-wipe` para wipes recentes e previsões nas próximas horas, com menção opcional de cargo.
- Scraping + Steam Query: tenta pegar connect/map/players quando disponível.

## Configuração rápida
1. Copie `.env.example` para `.env` e preencha `DISCORD_BOT_TOKEN`. Opcional: `DISCORD_GUILD_ID` para registrar comandos apenas em um servidor.
2. Ajuste intervalos/limites se quiser (padrão: 5 min). `LIST_PAGES` agora vem 8 e `TOP_DETAIL_FETCH` 80 para cobrir mais servidores; `TOP_REGION_LIMIT=9999` lista todos por região (dividindo em várias mensagens se passar do limite de embed).
3. Opcional: defina um cargo para pingar alertas (`ALERT_ROLE_ID`) e o fuso para datas/horários (`TIMEZONE`).

### Variáveis de ambiente principais
- `DISCORD_BOT_TOKEN` (obrigatório)
- `DISCORD_GUILD_ID` (opcional, registro local)
- `UPDATE_INTERVAL_MINUTES` (padrão 5)
- `ALERT_ROLE_ID` (opcional, id do cargo para mention)
- `UPCOMING_ALERT_MINUTES` (janela em minutos para alertar previsões, padrão 180)
- `RECENT_ALERT_MINUTES` (janela em minutos após um wipe para alertar, padrão 120)
- `ALERT_COOLDOWN_HOURS` (cooldown por servidor entre alertas, padrão 12h)
- `TIMEZONE` (padrão `America/Sao_Paulo`)
- BattleMetrics scraping: `BM_PAGES` (padrão 2) e `BM_PAGE_SIZE` (padrão 100) para buscar servidores adicionais por região.
- BattleMetrics global: `BM_GLOBAL_PAGES` (padrão 2) para trazer também o ranking global (mais chances de capturar BR que não têm país marcado corretamente).
