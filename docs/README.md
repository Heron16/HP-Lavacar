# AquaWash — Índice da Documentação

Sistema de Agendamento de Lavagem de Veículos  
**Equipe:** Lava - Car PH | **Versão:** 1.0

---

## Documentação Existente (originais)

| Arquivo | Conteúdo |
|---|---|
| [01-contextualizacao.md](./01-contextualizacao.md) | Problema, solução, evolução do produto e tecnologias |
| [02-diagrama-er.md](./02-diagrama-er.md) | Diagrama Entidade-Relacionamento do banco de dados |
| [03-requisitos.md](./03-requisitos.md) | Requisitos funcionais (RF) e não funcionais (RNF) |
| [04-casos-de-uso.md](./04-casos-de-uso.md) | Casos de uso com atores e fluxos |
| [05-diagramas-atividades.md](./05-diagramas-atividades.md) | Diagramas de atividades UML |
| [06-diagramas-sequencia.md](./06-diagramas-sequencia.md) | Diagramas de sequência UML |

---

## Documentação Arquitetural

| Arquivo | Conteúdo |
|---|---|
| [07-c4-diagramas.md](./07-c4-diagramas.md) | **Diagramas C4** — Contexto, Containers e Componentes |
| [08-adrs.md](./08-adrs.md) | **ADRs** — Registro de Decisões Arquiteturais (5 decisões) |
| [09-quality-scenarios.md](./09-quality-scenarios.md) | **Quality Scenarios** — Desempenho, disponibilidade, segurança |

---

## Estilos Arquiteturais e DDD

| Arquivo | Conteúdo |
|---|---|
| [10-ddd-context-map.md](./10-ddd-context-map.md) | **Context Map**, Bounded Contexts, Entities, Value Objects e Aggregates |

---

## Integração, APIs e Dados

| Arquivo | Conteúdo |
|---|---|
| [11-openapi.yaml](./11-openapi.yaml) | **OpenAPI 3.0** — Especificação completa de todos os endpoints |
| [08-adrs.md → ADR-002](./08-adrs.md) | **ADR banco de dados** — Justificativa para MySQL vs PostgreSQL vs MongoDB |

---

## Atributos de Qualidade, Resiliência e Observabilidade

| Arquivo | Conteúdo |
|---|---|
| [12-slos-resiliencia-observabilidade.md](./12-slos-resiliencia-observabilidade.md) | **SLOs/SLIs**, estratégias de resiliência e plano de observabilidade |

---

## Entrega Contínua

| Arquivo | Conteúdo |
|---|---|
| [13-cicd-pipeline.md](./13-cicd-pipeline.md) | **Pipeline CI/CD** (GitHub Actions), estratégia de deploy e runbook de incidentes |

---

## Back-end Avançado

| Arquivo | Conteúdo |
|---|---|
| [15-backend-avancado.md](./15-backend-avancado.md) | **Redis cache-aside**, TTL, invalidação, **Redis Pub/Sub**, microsserviço de notificações, Docker Compose, Nginx, boas práticas |

---

## Gestão do Projeto

| Arquivo | Conteúdo |
|---|---|
| [16-gestao-projeto.md](./16-gestao-projeto.md) | **Cynefin** (classificação Complexo), abordagem Scrum, papéis, sprints, **Product Backlog** priorizado com User Stories e critérios de aceite, uso do Jira, velocity |

---

## Resumo de Entregas por Rubrica

| Rubrica | Documento(s) | Status |
|---|---|---|
| Diagramas C4 (Contexto e Containers) | `07-c4-diagramas.md` | ✅ |
| ADRs com decisões principais | `08-adrs.md` (5 ADRs) | ✅ |
| Quality Scenarios | `09-quality-scenarios.md` | ✅ |
| Context Map + Bounded Contexts | `10-ddd-context-map.md` | ✅ |
| Entities, Value Objects e Aggregates | `10-ddd-context-map.md` | ✅ |
| OpenAPI/Swagger | `11-openapi.yaml` | ✅ |
| ADR banco de dados | `08-adrs.md → ADR-002` | ✅ |
| SLOs/SLIs | `12-slos-resiliencia-observabilidade.md` | ✅ |
| Estratégias de resiliência | `12-slos-resiliencia-observabilidade.md` | ✅ |
| Plano de observabilidade | `12-slos-resiliencia-observabilidade.md` | ✅ |
| Pipeline CI/CD | `13-cicd-pipeline.md` | ✅ |
| Estratégia de deploy | `13-cicd-pipeline.md` | ✅ |
| Runbook de incidentes | `13-cicd-pipeline.md` | ✅ |
| Cache Redis (cache-aside, TTL, invalidação) | `15-backend-avancado.md` | ✅ |
| Redis Pub/Sub + logs de circulação | `15-backend-avancado.md` | ✅ |
| Docker Compose + Nginx proxy reverso | `15-backend-avancado.md` | ✅ |
| Organização do código + logs + erros | `15-backend-avancado.md` | ✅ |
| Microsserviço (notification-service) | `15-backend-avancado.md` | ✅ |
| Jira — gestão de tarefas | `16-gestao-projeto.md` | ✅ |
| Cynefin + abordagem de gestão | `16-gestao-projeto.md` | ✅ |
| Scrum — sprints, backlog, user stories | `16-gestao-projeto.md` | ✅ |
