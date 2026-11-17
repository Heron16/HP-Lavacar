# 12. SLOs/SLIs, Resiliência e Observabilidade

---

## 12.1 SLIs e SLOs

**SLI (Service Level Indicator):** métrica mensurável do comportamento do sistema.  
**SLO (Service Level Objective):** meta numérica para o SLI.

### Tabela de SLOs

| ID | Categoria | SLI | SLO | Como medir |
|---|---|---|---|---|
| SLO-01 | Desempenho | Latência `GET /api/services` (p95) | < 300 ms | Log do logger middleware: tempo por requisição |
| SLO-02 | Desempenho | Latência `GET /api/appointments/slots` (p95) | < 500 ms | Log do logger middleware |
| SLO-03 | Desempenho | Latência `POST /api/appointments` (p95) | < 800 ms | Log do logger middleware |
| SLO-04 | Disponibilidade | Uptime da API (`/health` retorna 200) | ≥ 99% (mensal) | Monitor externo (ex.: UptimeRobot) |
| SLO-05 | Disponibilidade | Taxa de erros 5xx | < 1% das requisições | Contagem de logs `[ERROR] HTTP` |
| SLO-06 | Segurança | Rotas admin rejeitam token de cliente | 100% | Teste E2E automatizado |
| SLO-07 | Correção | Agendamentos com conflito de horário rejeitados | 100% | Testes unitários `AgendamentoService` |
| SLO-08 | Cache | Taxa de cache HIT em serviços (regime permanente) | ≥ 80% | Contagem de logs `[Cache] HIT` vs `MISS` |

### Error Budget

Para SLO-04 (99% uptime mensal):
- Período: 30 dias = 43.200 minutos
- Budget de indisponibilidade: 1% = 432 minutos (~7,2 horas/mês)

---

## 12.2 Estratégias de Resiliência

### 12.2.1 Retry com Backoff Exponencial — Redis

Implementado em todas as conexões Redis (`redis.ts`, `pubsub.ts`, `subscriber.ts`):

```typescript
retryStrategy: (times) => Math.min(times * 200, 5000)
```

- 1ª tentativa: aguarda 200 ms
- 2ª tentativa: aguarda 400 ms
- 10ª tentativa: aguarda 2.000 ms
- Máximo: 5.000 ms (5 segundos)

**Cobertura:** reconexão automática após falha temporária do Redis.

---

### 12.2.2 Degradação Graceful — Cache

Quando o Redis está indisponível, o sistema opera **sem cache** ao invés de falhar:

```typescript
// cache.ts — cacheAside
try {
  const cached = await redis.get(key);
  // ...
} catch (err) {
  console.error(`[Cache] Erro ao ler (${key}):`, err.message);
  // fluxo continua: vai ao banco normalmente
}
```

**Resultado:** zero downtime da API quando o Redis cai; apenas degradação de desempenho temporária.

---

### 12.2.3 Timeout Implícito — Conexões

- `enableOfflineQueue: false` nas conexões Redis: chamadas falham imediatamente ao invés de enfileirar indefinidamente quando o Redis está offline.
- `maxRetriesPerRequest: 1`: limita retentativas por query, evitando timeout longo.

---

### 12.2.4 Healthcheck — Docker

Todos os serviços dependentes possuem healthcheck no Docker Compose:

```yaml
# MySQL
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
  interval: 10s
  timeout: 5s
  retries: 10
  start_period: 30s

# Redis
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 10s
  timeout: 3s
  retries: 5
```

O backend só sobe após MySQL e Redis estarem healthy (`depends_on: condition: service_healthy`), evitando falhas de startup.

---

### 12.2.5 Restart Policy

```yaml
restart: unless-stopped
```

Todos os containers reiniciam automaticamente em caso de crash, exceto quando parados manualmente.

---

### 12.2.6 Circuit Breaker (Gap identificado)

O circuit breaker formal **não está implementado** na versão atual. A degradação graceful do cache funciona como um pattern de fallback parcial. Para implementação futura, a biblioteca `opossum` é recomendada para envolver chamadas ao MySQL e Redis.

---

### 12.2.7 Tratamento de Erros em Cascata

O `errorHandler` global (`middlewares/errorHandler.ts`) captura qualquer exceção não tratada:

- `AppError` (erros de negócio): HTTP 400 com mensagem amigável.
- Erros inesperados: HTTP 500 com `detalhe` e `stack` apenas em ambiente de desenvolvimento.
- Prevenção de vazamento de stack trace em produção.

---

## 12.3 Plano de Observabilidade

### 12.3.1 Logs — O Que Coletar

O AquaWash usa logs estruturados no formato:
```
TIMESTAMP [NÍVEL] [MÓDULO] mensagem | {metadados JSON}
```

**Logs de negócio (INFO):**

| Evento | Módulo | Campos |
|---|---|---|
| Agendamento criado | AgendamentoService | agendamentoId, usuarioId, servicoId |
| Status de agendamento atualizado | AgendamentoService | agendamentoId, de, para |
| Agendamento excluído | AgendamentoService | agendamentoId |
| Serviço criado | ServicoService | servicoId, nome, preco |
| Serviço atualizado | ServicoService | servicoId, campos |

**Logs de infraestrutura (INFO):**

| Evento | Módulo | Campos |
|---|---|---|
| Cache HIT | Cache | key |
| Cache MISS | Cache | key |
| Cache SET | Cache | key, ttl |
| Cache DEL | Cache | pattern, quantidade |
| Evento publicado | PubSub:Publisher | canal, subscribers |
| Evento recebido | PubSub:Subscriber | canal |

**Logs de requisição HTTP (INFO/WARN/ERROR):**

| Evento | Campos |
|---|---|
| Toda requisição HTTP | method, url, status, ms, ip |

**Logs de erro (ERROR):**

| Evento | Campos |
|---|---|
| Erro inesperado | url, method, stack |
| Falha de conexão Redis | mensagem de erro |
| Falha de banco | mensagem de erro |

---

### 12.3.2 Métricas — O Que Monitorar

| Métrica | Tipo | Como obter |
|---|---|---|
| Tempo de resposta por endpoint | Histogram | Parsear logs `→ Xms` do loggerMiddleware |
| Taxa de erros 5xx | Counter | Parsear logs `ERROR` do HTTP middleware |
| Taxa de cache HIT vs MISS | Ratio | Parsear `[Cache] HIT` vs `[Cache] MISS` |
| Eventos publicados por canal | Counter | Parsear `[PubSub:Publisher] PUBLISH` |
| Uptime da API | Gauge | `GET /health` → campo `uptime` |
| Agendamentos criados/hora | Counter | Parsear `[AgendamentoService] Agendamento criado` |

---

### 12.3.3 Comandos de Diagnóstico

```bash
# Ver logs em tempo real do backend
docker logs -f aquawash_backend

# Ver apenas erros
docker logs aquawash_backend 2>&1 | grep ERROR

# Ver eventos Pub/Sub
docker logs aquawash_backend 2>&1 | grep "PubSub"

# Ver hits/misses de cache
docker logs aquawash_backend 2>&1 | grep "Cache"

# Ver requisições lentas (> 500ms)
docker logs aquawash_backend 2>&1 | grep "HTTP" | grep -E "[5-9][0-9]{2}ms|[0-9]{4}ms"

# Status dos containers
docker compose ps

# Health check manual
curl http://localhost:3001/health
```

---

### 12.3.4 Stack de Observabilidade Futura (Recomendada)

Para evoluir além de logs em console:

| Ferramenta | Papel |
|---|---|
| **Prometheus** | Coleta de métricas (adicionar `prom-client` ao backend) |
| **Grafana** | Dashboards de métricas |
| **Loki** | Agregação de logs estruturados |
| **Grafana Tempo** | Distributed tracing |
| **AlertManager** | Alertas quando SLOs são violados |
