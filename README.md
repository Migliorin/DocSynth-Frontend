# DocSynth frontend

Interface React, TypeScript e Vite para upload de documentos, geração de sínteses PUR e RDA e consulta do histórico.

## Desenvolvimento local

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Inicie também a API em `../backend` e configure nela `FRONTEND_ORIGIN` com a origem exibida pelo Vite (por padrão, `http://localhost:5173`). `VITE_API_URL` deve apontar para a URL pública da API, sem barra final. Para uma build implantada, defina essa variável antes de `pnpm build`: o Vite incorpora seu valor nos arquivos gerados. Variáveis `VITE_` são visíveis no navegador; nunca coloque credenciais nelas.

```bash
pnpm lint
pnpm test
pnpm build
```

Arquivos `.env` locais e a saída `dist/` não devem ser incluídos no commit. Mantenha apenas `.env.example` como referência de configuração.
