# Eztrogun IPTV

Player web feito com Next.js para importar playlists M3U, navegar por grupos, filtrar canais e reproduzir streams IPTV no navegador.

## Recursos atuais

- Importacao de playlist por URL remota
- Leitura manual de conteudo M3U colado
- Player HTML5 com suporte a HLS via `hls.js`
- Busca por nome e categoria
- Favoritos persistidos no navegador
- Historico recente de canais acessados
- Exportacao da lista filtrada e dos favoritos em `.m3u`

## Stack

- Next.js App Router
- TypeScript
- React 19
- `hls.js`
- CSS global sem framework visual

## Como rodar

1. Instale as dependencias com `npm install`
2. Rode `npm run dev`
3. Abra `http://localhost:3000`

## Estrutura principal

- `src/app`: layout, home e rotas API
- `src/components/iptv-client.tsx`: interface principal do player
- `src/components/iptv-player.tsx`: reproducao do canal selecionado
- `src/lib/iptv.ts`: parser M3U e utilitarios de exportacao
- `src/app/api/playlist/route.ts`: proxy para carregar playlist remota

## Observacoes

- Algumas rotas e arquivos administrativos ainda existem porque o projeto foi reaproveitado de uma base anterior.
- O player depende de o provedor permitir acesso ao stream e a playlist sem bloqueios de autenticacao ou CORS.
