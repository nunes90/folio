# 0005 — Biblioteca: livros copiados, id por SHA-256, SQLite

**Status:** aceita

## Decisão
- Ao importar, o arquivo é **copiado** para o diretório de dados do app (`<id>.epub`), em vez de guardar só o caminho original.
- O id do livro é o SHA-256 do conteúdo. Reimportar o mesmo arquivo devolve o livro existente.
- Banco SQLite (`rusqlite` com SQLite embutido). Migrações em `MIGRACOES`, versão em `PRAGMA user_version`. Nunca editar uma migração publicada: acrescentar outra.
- Capas extraídas para o diretório de cache (`$APPCACHE/capas`) e servidas pelo protocolo de assets do Tauri, com escopo restrito a essa pasta.
- O progresso é guardado como EPUB CFI (o que o foliate-js usa para retomar a posição) mais a fração lida.

## Motivos
- Copiar faz a biblioteca sobreviver a arquivos movidos ou apagados (como o Calibre). Referenciar no lugar (como o Foliate) economiza espaço, mas perde livros quando o usuário reorganiza pastas.
- O hash do conteúdo identifica o livro independentemente do nome ou do lugar do arquivo.
- O banco guarda caminhos relativos (nome do arquivo), então o diretório de dados pode mudar de lugar.

## Consequências
- Espaço em disco duplicado para quem mantém os originais.
- Remover um livro apaga a cópia do app, a capa e o progresso; o arquivo original nunca é tocado.
- Capas ficam em cache: se o cache for limpo, será preciso regerá-las a partir do EPUB (ainda não implementado; hoje aparece a capa substituta).
