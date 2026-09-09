# Publicação do Portal Carandaí 25 · v4.3

## Railway (recomendado)

A versão 4.3 foi preparada para usar um único armazenamento persistente.

Variáveis:

```text
NODE_ENV=production
PORT=3000
STORAGE_ROOT=/storage
SEED_DEMO=0
ADMIN_PASSWORD=UMA_SENHA_FORTE
```

Crie um Railway Volume e monte exatamente em:

```text
/storage
```

O banco será criado em `/storage/data/portal.db` e os arquivos enviados em `/storage/uploads/`.

O healthcheck configurado em `railway.toml` usa:

```text
/api/health
```

## Atualização sem perder dados

Se o portal já estiver funcionando no Railway, faça o novo deploy no mesmo serviço e **mantenha o mesmo Volume `/storage`**. O código pode ser substituído via GitHub sem apagar o banco e os uploads persistentes.

## Docker / VPS

O `docker-compose.yml` também monta `./storage:/storage`. Troque a senha administrativa antes de iniciar:

```bash
docker compose up -d --build
```

## Conteúdo estático incluído

- `public/docs/` contém os dois manuais.
- `public/assets/estruturas/` contém as quatro imagens de estruturas por segmento.

## Recomendações

- Use HTTPS.
- Não publique `ADMIN_PASSWORD` no GitHub.
- Faça backup recorrente do Volume `/storage`.
- Para escala muito maior, considere PostgreSQL e storage de objetos.
