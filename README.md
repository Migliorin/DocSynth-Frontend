# DocSynth frontend

Interface para enviar PDFs PUR e RDA, acompanhar a extração OCR e gerar sínteses analíticas em tempo real. O projeto usa React, TypeScript e Vite; a tela de análise é um componente React em `src/features/documents/DocumentWorkspace.tsx`.

## O que você pode fazer

- Criar uma conta, entrar e acessar os documentos associados a ela.
- Enviar PDFs PUR ou RDA e acompanhar o processamento.
- Configurar tópicos e informações adicionais para a síntese.
- Ver o progresso do prompt e a resposta aparecer gradualmente via Server-Sent Events (SSE).
- Parar a geração sem perder a prévia já recebida; visualizar tabelas Markdown formatadas.
- Copiar a síntese, salvar uma versão concluída e consultar o histórico.

## Início rápido

Você precisa de Node.js 22.18+ (com suporte nativo a TypeScript) e pnpm, além da API do DocSynth em execução. No workspace local, ela fica em `../backend`.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Abra a URL exibida pelo Vite (normalmente `http://localhost:5173`). O valor padrão de `VITE_API_URL` é `http://localhost:3000`; ajuste-o no `.env` se a API estiver em outro endereço. No backend, configure `FRONTEND_ORIGIN` com a origem exata do Vite para permitir as requisições do navegador.

> [!IMPORTANT]
> `VITE_API_URL` é incorporada à build e fica visível no navegador. Defina a URL correta **antes** de executar `pnpm build` e nunca use variáveis `VITE_` para credenciais. O frontend não contém o servidor de API, PostgreSQL, Redis, MinIO nem o modelo de inferência.

## Como funciona

1. O usuário entra ou se cadastra em `/login` ou `/cadastro`. O frontend consulta `/auth/me` para obter o perfil e guarda os tokens no armazenamento da sessão ou, quando a opção de lembrar está marcada, no armazenamento local do navegador. O token de acesso é renovado por `/auth/refresh` quando expira.
2. O cabeçalho e o rodapé permanecem montados entre as rotas. O cabeçalho lê nome, e-mail e função do perfil salvo, sem consultar `/auth/me` a cada troca de tela; o perfil é removido no logout ou quando a sessão expira.
3. `/workspace` abre a interface React de análise, que envia as requisições autenticadas à API.
4. Após o upload, a interface acompanha os estados do documento. PUR e RDA usam o mesmo fluxo, com tópicos e textos próprios.
5. A síntese chega por SSE e é renderizada como Markdown, incluindo tabelas. O botão de parar solicita o cancelamento ao backend e mantém o texto parcial na prévia.
6. Uma síntese concluída só entra no histórico depois de **Salvar síntese**. A prévia e cada página do histórico do documento selecionado são carregadas pelas rotas específicas da API.

## Estrutura

```text
src/
├── app/
│   ├── config/api.ts
│   ├── routes/AppRoutes.tsx
│   ├── pages/WorkspacePage.tsx
│   └── styles.css
├── features/
│   ├── auth/              # Login, cadastro e sessão
│   ├── documents/         # PDFs, processamento, sínteses e histórico
│   └── shell/             # Cabeçalho e rodapé persistentes
├── shared/
│   ├── assets/
│   └── lib/sse.ts
└── main.tsx
tests/
AGENTS.md
```

A lógica da aplicação usa React e TypeScript. Cada funcionalidade mantém seus componentes,
estilos e tipos juntos. `shared` contém recursos sem regras de uma funcionalidade;
a configuração e a escolha de telas ficam em `app`. A única entrada HTML do Vite
é `index.html`.

## Configuração e build

O [`.env.example`](./.env.example) contém a única variável necessária para a interface:

| Variável | Finalidade |
| --- | --- |
| `VITE_API_URL` | URL pública da API, sem barra final. Exemplo local: `http://localhost:3000`. |

```bash
pnpm lint     # ESLint
pnpm test     # checagem de tipos e testes TypeScript com o runner nativo do Node.js
pnpm build    # TypeScript + build de produção em dist/
pnpm preview  # visualiza a build localmente
```

> [!NOTE]
> As rotas `/login`, `/cadastro` e `/workspace` precisam ser encaminhadas para `index.html` pelo servidor que hospedar a build. O CSS do Tailwind é servido localmente; as fontes continuam usando Google Fonts. A API é definida por `VITE_API_URL` na build.

Os testes em `tests/` verificam a renovação de sessão, a URL paginada do histórico e a renderização React do workspace. Arquivos `.env` locais e `dist/` são ignorados pelo Git.
