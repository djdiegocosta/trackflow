# TrackFlow Renamer

Renomeador inteligente de arquivos MP3, para desktop (Windows), **100% local e offline**.
Nenhum arquivo, metadado ou informação da biblioteca é enviado para qualquer servidor —
o app não faz nenhuma chamada de rede (a política de segurança de conteúdo da janela
bloqueia `connect-src`).

## Funcionalidades

- Selecionar uma pasta e analisar recursivamente todos os `.mp3`.
- Ler metadados ID3 (Artist, Title, Album, Year, Track) de cada arquivo.
- Gerar uma **prévia** dos novos nomes antes de qualquer alteração no disco.
- Modelos de nome: `Artista - Música`, `Música - Artista`, `Música`, `Artista` ou
  **personalizado** (`{artist} {title} {album} {year} {track}`).
- Regras de limpeza (ativáveis/desativáveis individualmente):
  - Remover numeração inicial (`01 - `, `02.` etc.)
  - Remover underscores
  - Colapsar espaços/hífens duplicados
  - Remover caracteres inválidos para o sistema de arquivos e caracteres invisíveis
  - Remover texto entre `[colchetes]` / `(parênteses)`
  - Padronizar separador ` - `
  - Padronizar capitalização (Title Case)
  - **Termos preservados**: `Remix`, `Live`, `Extended Mix`, `Radio Edit`, `Remaster`,
    `Bootleg`, `VIP Mix` são mantidos com a grafia original mesmo com as regras acima
    ativadas (lista editável na interface).
- Detecção de **conflitos** antes de renomear: nomes duplicados dentro do mesmo lote e
  colisão com arquivos já existentes na pasta — **nunca sobrescreve** um arquivo.
- **Backup automático** antes de renomear (manifesto para desfazer + cópia opcional dos
  arquivos originais) e botão **Desfazer última alteração**.
- Relatório detalhado de cada operação (sucesso / conflito / erro).

## Requisitos

- [Node.js](https://nodejs.org) 18 ou superior (LTS recomendado).
- Windows 10/11 para gerar o instalador `.exe` (o app também roda em modo dev em
  macOS/Linux, mas o instalador de distribuição é para Windows, conforme solicitado).

## Como rodar em modo desenvolvimento

```bash
npm install
npm start
```

## Como gerar o instalador para Windows

```bash
npm install
npm run dist
```

O instalador `.exe` (NSIS) será gerado na pasta `release/`. Para gerar uma versão
portátil (sem instalador), use `npm run dist:portable`.

> Se estiver empacotando a partir de outro sistema operacional, o `electron-builder`
> pode precisar de ferramentas adicionais (ex.: Wine) para gerar o binário Windows.
> O caminho mais simples é rodar `npm run dist` diretamente em uma máquina Windows.

## Como usar

1. Abra o app e clique em **Selecionar pasta…**.
2. Aguarde a varredura e leitura dos metadados de todos os MP3 (recursiva).
3. Escolha o **modelo de nome** e ajuste as **regras de limpeza** na barra lateral.
4. Clique em **Gerar prévia** para ver como cada arquivo ficará, sem alterar nada ainda.
5. Revise a tabela: arquivos com conflito ou sem metadados ficam desmarcados
   automaticamente e não são renomeados até você resolver o problema (ex.: corrigir a
   tag ID3 ou editar o nome do arquivo manualmente).
6. Clique em **Executar renomeação**. O app cria um backup local (pasta
   `.trackflow-backups` dentro da pasta selecionada) e então renomeia os arquivos
   marcados.
7. Se precisar reverter, clique em **Desfazer última alteração** — restaura os nomes
   originais da última sessão de renomeação executada naquela pasta.

## Arquitetura e segurança

- **Electron** com `contextIsolation: true`, `nodeIntegration: false` e `sandbox: true`
  na janela principal — o renderer (HTML/JS da interface) não tem acesso direto ao
  Node.js/sistema de arquivos.
- Toda a manipulação de arquivos (varredura, leitura de tags, renomeação, backup)
  acontece no **processo principal**, exposta ao renderer apenas através de uma API
  restrita definida em `src/preload/preload.js` (via `contextBridge`).
- **CSP** (`Content-Security-Policy`) na página bloqueia scripts externos e qualquer
  conexão de rede (`connect-src 'none'`).
- Leitura de metadados via [`music-metadata`](https://www.npmjs.com/package/music-metadata),
  biblioteca puramente local (sem chamadas de rede).
- Renomeação nunca sobrescreve um arquivo existente; conflitos são sinalizados na prévia
  e o item fica bloqueado para execução até ser resolvido.

## Estrutura do projeto

```
trackflow-renamer/
├── package.json
├── src/
│   ├── main/            # processo principal (Node.js/Electron)
│   │   ├── main.js
│   │   ├── mp3-scanner.js
│   │   ├── metadata-reader.js
│   │   ├── renamer.js
│   │   └── backup-manager.js
│   ├── preload/
│   │   └── preload.js   # ponte segura entre main e renderer
│   └── renderer/         # interface (HTML/CSS/JS puro)
│       ├── index.html
│       ├── styles.css
│       └── renderer.js
└── assets/
```

## Licença

MIT
