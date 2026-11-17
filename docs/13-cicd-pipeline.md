# 13. Pipeline CI/CD, Estratégia de Deploy e Runbook de Incidentes

---

## 13.1 Pipeline CI/CD — Esqueleto

O arquivo abaixo é o esqueleto do pipeline GitHub Actions para o AquaWash.  
**Arquivo:** `.github/workflows/ci-cd.yml`

```yaml
# ============================================================
#  AquaWash — Pipeline CI/CD (GitHub Actions)
#  Etapas: build → test → docker-build → deploy
# ============================================================

name: CI/CD AquaWash

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_BACKEND: ghcr.io/${{ github.repository }}/backend
  IMAGE_FRONTEND: ghcr.io/${{ github.repository }}/frontend
  IMAGE_NOTIFICATION: ghcr.io/${{ github.repository }}/notification-service

jobs:

  # ─────────────── JOB 1: BUILD & TEST ───────────────
  build-and-test:
    name: Build & Test
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: carwash_test
          MYSQL_USER: carwash_user
          MYSQL_PASSWORD: carwash_pass123
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping -h localhost -u root -proot"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=10

      redis:
        image: redis:7.2-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd="redis-cli ping"
          --health-interval=10s
          --health-timeout=3s
          --health-retries=5

    steps:
      - name: Checkout código
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      # ── Backend ──
      - name: Instalar dependências (backend)
        run: npm ci
        working-directory: backend

      - name: TypeScript — verificar tipos (backend)
        run: npx tsc --noEmit
        working-directory: backend

      - name: Executar testes unitários (backend)
        run: npm test -- --coverage --passWithNoTests
        working-directory: backend
        env:
          NODE_ENV: test
          DATABASE_URL: mysql://carwash_user:carwash_pass123@localhost:3306/carwash_test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test_secret_key_ci
          JWT_EXPIRES_IN: 1h

      - name: Upload cobertura (Codecov)
        uses: codecov/codecov-action@v4
        with:
          directory: backend/coverage
          flags: backend

      # ── Frontend ──
      - name: Instalar dependências (frontend)
        run: npm ci
        working-directory: frontend

      - name: TypeScript — verificar tipos (frontend)
        run: npx tsc --noEmit
        working-directory: frontend

      - name: Build frontend
        run: npm run build
        working-directory: frontend
        env:
          VITE_API_URL: ""

  # ─────────────── JOB 2: DOCKER BUILD ───────────────
  docker-build:
    name: Docker Build & Push
    runs-on: ubuntu-latest
    needs: build-and-test
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'

    steps:
      - name: Checkout código
        uses: actions/checkout@v4

      - name: Login no GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build e push — Backend
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: |
            ${{ env.IMAGE_BACKEND }}:latest
            ${{ env.IMAGE_BACKEND }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build e push — Frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: |
            ${{ env.IMAGE_FRONTEND }}:latest
            ${{ env.IMAGE_FRONTEND }}:${{ github.sha }}
          build-args: |
            VITE_API_URL=

      - name: Build e push — Notification Service
        uses: docker/build-push-action@v5
        with:
          context: ./notification-service
          push: true
          tags: |
            ${{ env.IMAGE_NOTIFICATION }}:latest
            ${{ env.IMAGE_NOTIFICATION }}:${{ github.sha }}

  # ─────────────── JOB 3: TESTES E2E ───────────────
  e2e-tests:
    name: Testes E2E (Playwright)
    runs-on: ubuntu-latest
    needs: docker-build
    if: github.ref == 'refs/heads/main'

    steps:
      - name: Checkout código
        uses: actions/checkout@v4

      - name: Subir ambiente completo
        run: docker compose up -d --wait
        env:
          MYSQL_ROOT_PASSWORD: ${{ secrets.MYSQL_ROOT_PASSWORD }}
          MYSQL_DATABASE: carwash
          MYSQL_USER: carwash_user
          MYSQL_PASSWORD: ${{ secrets.MYSQL_PASSWORD }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
          REDIS_URL: redis://redis:6379

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Instalar Playwright
        run: npx playwright install --with-deps chromium
        working-directory: e2e

      - name: Executar testes E2E
        run: npx playwright test --reporter=html
        working-directory: e2e
        env:
          E2E_BASE_URL: http://localhost:5174
          E2E_ADMIN_EMAIL: ${{ secrets.E2E_ADMIN_EMAIL }}
          E2E_ADMIN_PASSWORD: ${{ secrets.E2E_ADMIN_PASSWORD }}

      - name: Upload relatório Playwright
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: e2e/playwright-report/

      - name: Derrubar ambiente
        if: always()
        run: docker compose down -v

  # ─────────────── JOB 4: DEPLOY ───────────────
  deploy:
    name: Deploy Produção
    runs-on: ubuntu-latest
    needs: [docker-build, e2e-tests]
    if: github.ref == 'refs/heads/main'
    environment: production

    steps:
      - name: Checkout código
        uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/aquawash
            git pull origin main
            docker compose pull
            docker compose up -d --remove-orphans
            docker image prune -f
            echo "Deploy concluído: $(date)"
```

---

## 13.2 Estratégia de Deploy

### Estratégia Adotada: Rolling Restart (Simples)

Para a versão atual do AquaWash, a estratégia é **rolling restart** via Docker Compose:

```
1. git pull (baixa nova versão do código)
2. docker compose pull (baixa novas imagens do registry)
3. docker compose up -d (recria containers com novas imagens)
   └── Docker para o container antigo
   └── Sobe container novo com nova imagem
   └── Intervalo de indisponibilidade: 5-15 segundos
4. docker image prune (limpeza de imagens antigas)
```

**Por que não blue/green?** O sistema possui um único servidor de deploy; blue/green exigiria dois ambientes paralelos e um load balancer. Para o escopo atual (pequeno estabelecimento), o breve downtime de deploy é aceitável.

### Estratégia de Rollback

Em caso de falha após o deploy:

```bash
# Opção 1: reverter para imagem anterior (tag SHA do commit anterior)
docker compose down
docker pull ghcr.io/org/aquawash/backend:SHA_ANTERIOR
# Editar docker-compose.yml para apontar para a tag anterior
docker compose up -d

# Opção 2: reverter o código e fazer redeploy
git revert HEAD
git push origin main
# Pipeline CI/CD reexecuta automaticamente
```

### Variáveis de Ambiente em Produção

Gerenciadas como **GitHub Secrets** (`Settings > Secrets > Actions`):

| Secret | Descrição |
|---|---|
| `MYSQL_ROOT_PASSWORD` | Senha root do MySQL |
| `MYSQL_PASSWORD` | Senha do usuário da aplicação |
| `DATABASE_URL` | URL completa de conexão |
| `JWT_SECRET` | Chave secreta para JWT |
| `E2E_ADMIN_EMAIL` | E-mail do admin para testes E2E |
| `E2E_ADMIN_PASSWORD` | Senha do admin para testes E2E |
| `DEPLOY_HOST` | IP/domínio do servidor de produção |
| `DEPLOY_USER` | Usuário SSH |
| `DEPLOY_SSH_KEY` | Chave privada SSH |

---

## 13.3 Runbook de Incidentes

### O que é este documento?

Guia rápido para resposta a incidentes no AquaWash em produção.

---

### INCIDENTE 1 — API retorna 500 ou está inacessível

**Sintomas:** clientes reportam erro ao tentar agendar; `/health` não responde.

```bash
# 1. Verificar status dos containers
docker compose ps

# 2. Ver logs recentes do backend
docker logs --tail=100 aquawash_backend

# 3. Se container parado, reiniciar
docker compose restart backend

# 4. Verificar se MySQL está healthy
docker exec aquawash_mysql mysqladmin ping -u root -p$MYSQL_ROOT_PASSWORD

# 5. Se MySQL com problema, verificar logs
docker logs --tail=50 aquawash_mysql

# 6. Verificar espaço em disco (volumes MySQL)
docker system df

# 7. Se necessário, rollback
git log --oneline -5
git revert HEAD && git push origin main
```

**Escalada:** Se o problema persistir após reinício, notificar o dev responsável.

---

### INCIDENTE 2 — Redis indisponível

**Sintomas:** logs mostram `[Cache] Erro ao ler`; sistema lento (sem cache).

```bash
# 1. Verificar status do Redis
docker compose ps redis

# 2. Testar conexão
docker exec aquawash_redis redis-cli ping

# 3. Ver logs do Redis
docker logs aquawash_redis

# 4. Reiniciar Redis (sistema continua operando sem cache)
docker compose restart redis

# 5. Verificar uso de memória
docker exec aquawash_redis redis-cli info memory | grep used_memory_human
```

**Impacto:** Sistema opera normalmente, porém com maior latência (queries diretas ao MySQL). Não requer evacuação imediata.

---

### INCIDENTE 3 — Banco de dados MySQL inacessível

**Sintomas:** logs mostram `SequelizeConnectionError`; API retorna 500 em todas as rotas com dados.

```bash
# 1. Verificar healthcheck do MySQL
docker inspect aquawash_mysql | grep -A5 Health

# 2. Ver logs do MySQL
docker logs --tail=50 aquawash_mysql

# 3. Tentar reinício graceful
docker compose restart mysql

# 4. Verificar integridade do volume
docker volume inspect car-wash_mysql_data

# 5. Em último caso: restore de backup
# (procedimento de restore depende da estratégia de backup adotada)
```

**ATENÇÃO:** Nunca remover o volume `mysql_data` sem fazer backup. Isso resulta em perda irreversível de dados.

---

### INCIDENTE 4 — Certificado TLS expirado

**Sintomas:** browsers bloqueiam acesso; erro `NET::ERR_CERT_DATE_INVALID`.

```bash
# Regenerar certificado (mkcert — ambiente local)
cd nginx/certs
mkcert meuapp.local
docker compose restart nginx

# Para produção com Let's Encrypt:
# certbot renew --quiet
# docker compose restart nginx
```

---

### INCIDENTE 5 — Deploy falhou no CI/CD

**Sintomas:** pipeline marcado como failed no GitHub Actions.

```
1. Acessar GitHub Actions → aba do workflow falhado
2. Identificar qual job falhou (build-and-test / docker-build / e2e-tests / deploy)
3. Ver logs do step específico
4. Para falha em testes: corrigir o código e fazer novo push
5. Para falha no deploy SSH: verificar se o servidor está acessível e se a chave SSH ainda é válida
6. Para rollback imediato: executar manualmente o workflow na tag do último commit estável
```

---

### Contatos de Escalada

| Nível | Responsável | Quando acionar |
|---|---|---|
| L1 | Dev On-call | Qualquer incidente fora do horário comercial |
| L2 | Paulo Henrique (Scrum Master) | Incidente afeta mais de 10% dos usuários |
| L3 | Heron Jose (Product Owner) | Downtime > 2 horas ou perda de dados |
