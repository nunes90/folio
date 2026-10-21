# 0006 — Foco em Linux; macOS adiado

**Status:** aceita (substitui, em parte, a ADR 0001 quanto às plataformas)

## Contexto
O plano inicial era Linux e macOS. Na prática:
- Os jobs de macOS na CI ficaram presos na fila: o GitHub avisou falta de capacidade nas máquinas macOS com Apple Silicon ("The job was not acquired by Runner of type hosted even after multiple attempts"). Em três PRs seguidos, a primeira tentativa foi cancelada depois de 15 minutos.
- O repositório é privado: cada minuto de macOS consome 10 minutos da cota do GitHub Actions.
- Ninguém no projeto testa no macOS; a CI só verificava se o código compilava.

## Decisão
Por enquanto, o app é só para Linux. O macOS sai da CI, do empacotamento (`.dmg`) e dos testes manuais (VoiceOver), e vai para "Futuro" no ROADMAP, ao lado do Windows.

## Consequências
- PRs mais rápidos e sem esperas pela fila do macOS.
- O código específico de macOS que já existe fica (diretório de logs em `~/Library/Logs`, escala de texto fixa em 1), mas deixa de ser verificado. Pode quebrar sem ninguém perceber até a volta.
- Para voltar: acrescentar um runner macOS na matriz da CI, corrigir o que não compilar, testar a janela, o leitor de tela (VoiceOver) e as fontes, e criar o `.dmg`.
