# 9. Quality Scenarios — Atributos de Qualidade

Documento de cenários de qualidade baseado no modelo ISO/IEC 25010 e inspirado no método de Quality Attribute Workshops (QAW).

---

## 9.1 Desempenho (Performance Efficiency)

### QS-01 — Listagem de serviços com cache

| Campo | Valor |
|---|---|
| **Estímulo** | Cliente acessa a página de agendamento (listagem de serviços) |
| **Fonte** | 50 usuários simultâneos |
| **Artefato** | `GET /api/services` |
| **Ambiente** | Sistema em carga normal |
| **Resposta** | Redis retorna resultado em cache (HIT) |
| **Medida** | Tempo de resposta < 50 ms para cache HIT; < 300 ms para cache MISS (query MySQL) |

**Mecanismo implementado:** `cacheAside` com TTL de 300s para serviços ativos.

---

### QS-02 — Consulta de slots disponíveis

| Campo | Valor |
|---|---|
| **Estímulo** | Cliente seleciona data e serviço no formulário de agendamento |
| **Fonte** | Usuário individual |
| **Artefato** | `GET /api/appointments/slots?data=YYYY-MM-DD&servicoId=UUID` |
| **Ambiente** | Sistema em operação normal |
| **Resposta** | Lista de slots calculados e retornados |
| **Medida** | Tempo de resposta < 200 ms para cache HIT; < 500 ms para MISS |

**Mecanismo implementado:** `cacheAside` com TTL de 120s, invalidado ao criar/cancelar agendamentos.

---

## 9.2 Disponibilidade (Reliability)

### QS-03 — Falha do Redis

| Campo | Valor |
|---|---|
| **Estímulo** | Container Redis fica indisponível |
| **Fonte** | Falha de infraestrutura |
| **Artefato** | Backend API — utilitário `cache.ts` |
| **Ambiente** | Produção |
| **Resposta** | Sistema continua operando; queries vão direto ao MySQL |
| **Medida** | Zero downtime; degradação graceful com logs `[Cache] Erro ao ler` |

**Mecanismo implementado:** try/catch em `cacheAside` e `invalidarCache` — erro no Redis não propaga para o caller.

---

### QS-04 — Reinicialização automática de containers

| Campo | Valor |
|---|---|
| **Estímulo** | Container do backend crasha (ex.: exceção não tratada em worker) |
| **Fonte** | Docker daemon |
| **Artefato** | `docker-compose.yml` — política `restart: unless-stopped` |
| **Ambiente** | Produção |
| **Resposta** | Container reinicia automaticamente |
| **Medida** | Tempo de recuperação < 30 segundos |

---

## 9.3 Segurança (Security)

### QS-05 — Acesso não autorizado a rota admin

| Campo | Valor |
|---|---|
| **Estímulo** | Usuário com perfil `cliente` tenta acessar `GET /api/appointments` (listagem admin) |
| **Fonte** | Cliente autenticado com JWT válido |
| **Artefato** | Middleware `autorizar('admin')` |
| **Ambiente** | Qualquer |
| **Resposta** | Requisição rejeitada com HTTP 403 |
| **Medida** | 100% das tentativas com token de cliente retornam 403 sem vazar dados |

---

### QS-06 — Força bruta na autenticação

| Campo | Valor |
|---|---|
| **Estímulo** | Atacante tenta múltiplas senhas para o mesmo e-mail |
| **Fonte** | Agente externo |
| **Artefato** | `POST /api/auth/login` |
| **Ambiente** | Produção |
| **Resposta** | Mensagem genérica ("E-mail ou senha incorretos"), sem diferenciação entre usuário inexistente e senha errada |
| **Medida** | Sem vazamento de informação sobre existência do e-mail |

**Nota:** rate limiting por IP não está implementado na versão atual — identificado como gap.

---

## 9.4 Manutenibilidade (Maintainability)

### QS-07 — Adição de novo módulo de domínio

| Campo | Valor |
|---|---|
| **Estímulo** | Time decide adicionar módulo de pagamentos ao sistema |
| **Fonte** | Desenvolvedor |
| **Artefato** | Estrutura backend (routes/controllers/services/models) |
| **Ambiente** | Desenvolvimento |
| **Resposta** | Novo módulo criado sem alterar módulos existentes |
| **Medida** | Menos de 1 dia de trabalho para criar rota, controller, service e model seguindo o padrão existente |

---

## 9.5 Observabilidade (Operability)

### QS-08 — Diagnóstico de falha em produção

| Campo | Valor |
|---|---|
| **Estímulo** | Agendamento falha com status 400 em produção |
| **Fonte** | Suporte recebe relato de cliente |
| **Artefato** | Logs estruturados do backend |
| **Ambiente** | Produção |
| **Resposta** | Log identifica módulo, operação, IDs envolvidos e mensagem de erro |
| **Medida** | Tempo para identificar causa raiz < 5 minutos via `docker logs aquawash_backend` |

**Formato de log implementado:**
```
2026-11-09T14:32:10.000Z [INFO ] [AgendamentoService] Iniciando criação | {"usuarioId":"...","servicoId":"..."}
2026-11-09T14:32:10.050Z [ERROR] [AgendamentoService] Falha: Já existe um agendamento neste horário
```

---

## 9.6 Resumo dos SLOs

| ID | Atributo | SLI | SLO |
|---|---|---|---|
| SLO-01 | Desempenho | Tempo de resposta `GET /api/services` | p95 < 300 ms |
| SLO-02 | Desempenho | Tempo de resposta `GET /api/appointments/slots` | p95 < 500 ms |
| SLO-03 | Disponibilidade | Uptime do sistema | ≥ 99% (mensal) |
| SLO-04 | Disponibilidade | Recuperação de container crash | < 30 segundos |
| SLO-05 | Segurança | Rotas admin bloqueadas sem token admin | 100% |
| SLO-06 | Observabilidade | Incidentes identificados via log | < 5 min (MTTR) |
