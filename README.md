# Eztrogun IPTV

Player web feito com Next.js para importar playlists M3U, salvar acessos, navegar por catalogo e reproduzir streams IPTV no navegador.

## Recursos atuais

- Multiplas playlists salvas no navegador
- Importacao de playlist por URL remota ou conteudo M3U colado
- Suporte opcional a EPG/XMLTV via URL
- Catalogo separado em canais, filmes e series
- Navegacao por grupos, busca textual e browser de series por temporadas
- Player HTML5 com suporte a HLS via `hls.js`
- Favoritos persistidos no navegador
- Historico recente de itens acessados
- Exportacao da lista filtrada e dos favoritos em `.m3u`
- Perfil de acesso salvo localmente no navegador

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
- `src/lib/epg.ts`: parser XMLTV e indexacao de grade
- `src/app/api/playlist/route.ts`: proxy para carregar playlist remota

## Observacoes

- Ainda existem rotas e arquivos administrativos herdados de uma base anterior que nao fazem parte do fluxo principal do player.
- O player depende de o provedor permitir acesso ao stream e a playlist sem bloqueios de autenticacao ou CORS.
- Logos, posters e streams podem vir de dominios arbitrarios definidos pela propria playlist.
