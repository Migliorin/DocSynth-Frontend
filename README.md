# DocSynth frontend

Interface para enviar PDFs PUR e RDA, acompanhar a extração OCR e gerar sínteses analíticas em tempo real. O projeto usa React, TypeScript e Vite; a tela de análise fica em `public/modelo.html` e consome a API do DocSynth.

## O que você pode fazer

- Criar uma conta, entrar e acessar os documentos associados a ela.
- Enviar PDFs PUR ou RDA, acompanhar o processamento e consultar o Markdown extraído.
- Configurar tópicos e informações adicionais para a síntese.
- Ver o progresso do prompt e a resposta aparecer gradualmente via Server-Sent Events (SSE).
- Parar a geração sem perder a prévia já recebida; visualizar tabelas Markdown formatadas.
- Copiar a síntese, salvar uma versão concluída e consultar o histórico.

## Início rápido

Você precisa de Node.js e pnpm, além da API do DocSynth em execução. No workspace local, ela fica em `../backend`.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Abra a URL exibida pelo Vite (normalmente `http://localhost:5173`). O valor padrão de `VITE_API_URL` é `http://localhost:3000`; ajuste-o no `.env` se a API estiver em outro endereço. No backend, configure `FRONTEND_ORIGIN` com a origem exata do Vite para permitir as requisições do navegador.

> [!IMPORTANT]
> `VITE_API_URL` é incorporada à build e fica visível no navegador. Defina a URL correta **antes** de executar `pnpm build` e nunca use variáveis `VITE_` para credenciais. O frontend não contém o servidor de API, PostgreSQL, Redis, MinIO nem o modelo de inferência.

## Como funciona

1. O usuário entra ou se cadastra em `/login` ou `/cadastro`. O token fica no armazenamento da sessão ou, quando a opção de lembrar está marcada, no armazenamento local do navegador.
2. `/workspace` abre a interface de análise, que envia as requisições autenticadas à API.
3. Após o upload, a interface acompanha os estados do documento. PUR e RDA usam o mesmo fluxo, com tópicos e textos próprios.
4. A síntese chega por SSE e é renderizada como Markdown, incluindo tabelas. O botão de parar solicita o cancelamento ao backend e mantém o texto parcial na prévia.
5. Uma síntese concluída só entra no histórico depois de **Salvar síntese**.

| Arquivo | Papel |
| --- | --- |
| `src/App.tsx` | Login, cadastro e acesso ao workspace. |
| `public/modelo.html` | Interface de documentos, síntese e histórico. |
| `public/document-flow.js` | Upload, estados, geração, cancelamento e chamadas à API. |
| `public/sse.js` | Leitura incremental do stream HTTP. |
| `public/markdown.js` e `public/markdown.css` | Renderização da prévia Markdown e das tabelas. |

## Configuração e build

O [`.env.example`](./.env.example) contém a única variável necessária para a interface:

| Variável | Finalidade |
| --- | --- |
| `VITE_API_URL` | URL pública da API, sem barra final. Exemplo local: `http://localhost:3000`. |

```bash
pnpm lint     # ESLint
pnpm test     # testes com o runner nativo do Node.js
pnpm build    # TypeScript + build de produção em dist/
pnpm preview  # visualiza a build localmente
```

> [!NOTE]
> As rotas `/login`, `/cadastro` e `/workspace` precisam ser encaminhadas para `index.html` pelo servidor que hospedar a build. A interface carrega `modelo.html` a partir da raiz do site e usa Tailwind via CDN e Google Fonts; verifique o acesso a esses recursos no ambiente de implantação.

Os testes em `test/` cobrem a alternância PUR/RDA, a renderização de tabelas Markdown e a leitura de SSE. Arquivos `.env` locais e `dist/` são ignorados pelo Git.
