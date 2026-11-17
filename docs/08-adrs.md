# 8. ADRs — Architecture Decision Records

Registro das principais decisões arquiteturais tomadas durante o desenvolvimento do AquaWash.

---

## ADR-001 — Arquitetura: Monólito Modular (Modulith) vs Microsserviços

**Status:** Aceita  
**Data:** outubro/2026  
**Autor:** Equipe Lava - Car PH

### Contexto

Na fase inicial do projeto precisávamos escolher entre desenvolver o backend como um **monólito tradicional**, um **modulith** (monólito com módulos bem delimitados internamente) ou uma **arquitetura de microsserviços completa**.

### Decisão

Adotamos **monólito modular (modulith)** com um microsserviço extraído para notificações.

A estrutura adotada:
- **Backend principal** (`/backend`): único processo Node.js com separação interna em camadas (routes → controllers → services → models).
- **notification-service**: processo Node.js independente, isolado, sem banco de dados próprio — comunica-se exclusivamente via Redis Pub/Sub.

### Consequências

**Positivas:**
- Complexidade operacional reduzida: um único deploy para o core do sistema.
- Compartilhamento de tipos TypeScript via domínio interno.
- Facilidade de desenvolvimento e depuração numa equipe pequena.
- O notification-service demonstra o padrão de microsserviço com baixo custo de implementação.

**Negativas:**
- Escalar partes individuais da lógica (ex.: só o módulo de agendamentos) requer escalar o processo inteiro.
- Acoplamento implícito pode crescer se a disciplina de camadas não for mantida.

### Alternativas descartadas

- **Microsserviços completos**: custo de operação elevado (service mesh, descoberta de serviços, autenticação entre serviços) inadequado para equipe de 2 pessoas.
- **Monólito puro sem separação**: descartado pela dificuldade de evolução e testabilidade.

---

## ADR-002 — Banco de Dados: MySQL vs PostgreSQL vs MongoDB

**Status:** Aceita  
**Data:** outubro/2026  
**Autor:** Equipe Lava - Car PH

### Contexto

O AquaWash gerencia entidades com relacionamentos claros (usuários → veículos → agendamentos → serviços) e precisamos de um banco de dados confiável, com suporte a transações ACID.

### Decisão

**MySQL 8.0** foi escolhido como banco de dados relacional.

### Justificativa

| Critério | MySQL 8.0 | PostgreSQL | MongoDB |
|---|---|---|---|
| Suporte ACID | ✅ completo | ✅ completo | ⚠️ parcial |
| UUID nativos | ✅ (UUID() no DDL) | ✅ | ✅ |
| Integridade referencial | ✅ FK + CASCADE | ✅ | ❌ |
| Suporte no Sequelize | ✅ excelente | ✅ excelente | ⚠️ via mongoose |
| Familiaridade da equipe | ✅ alta | ⚠️ média | ⚠️ média |
| Imagem Docker oficial | ✅ mysql:8.0 | ✅ | ✅ |

Os dados do AquaWash são inerentemente relacionais: um agendamento referencia um usuário, um veículo e um serviço. Essa estrutura é naturalmente modelada em SQL com integridade referencial via chaves estrangeiras.

### Consequências

- Todas as relações possuem FKs com `ON DELETE CASCADE`, garantindo integridade automática.
- O Sequelize mapeia as tabelas com `sync({ alter: true })`, evitando migrações manuais em desenvolvimento.
- O script `database.sql` serve como documentação viva do schema.

---

## ADR-003 — Cache: Redis cache-aside vs sem cache

**Status:** Aceita  
**Data:** novembro/2026  
**Autor:** Equipe Lava - Car PH

### Contexto

Algumas queries são executadas frequentemente e com dados que mudam pouco: listagem de serviços ativos, slots disponíveis por dia/serviço, e listagem de agendamentos pelo admin.

### Decisão

Implementar **cache-aside com Redis** para as queries de leitura mais frequentes.

TTLs definidos:
- Serviços: 300 segundos (5 min) — mudam raramente
- Slots disponíveis: 120 segundos (2 min) — invalidados ao criar/cancelar agendamento
- Agendamentos admin: 60 segundos (1 min) — invalidados em qualquer mutação

**Estratégia de invalidação:** ao criar, atualizar ou excluir qualquer entidade que afete o resultado da query, a chave (ou padrão de chaves via SCAN) é deletada do Redis imediatamente.

### Consequências

**Positivas:**
- Redução de carga no MySQL para queries repetitivas.
- Logs `[Cache] HIT/MISS/SET/DEL` facilitam observabilidade.
- O Redis já era necessário para Pub/Sub, então sem custo adicional de infraestrutura.

**Negativas:**
- Window de inconsistência de até TTL segundos caso a invalidação falhe (tratada com try/catch: a query ao banco é feita normalmente se o Redis estiver indisponível).

---

## ADR-004 — Mensageria: Redis Pub/Sub vs Fila (BullMQ/RabbitMQ)

**Status:** Aceita  
**Data:** novembro/2026  
**Autor:** Equipe Lava - Car PH

### Contexto

Precisávamos de um mecanismo para desacoplar efeitos colaterais (notificações, logs de auditoria) das operações principais (criar/cancelar agendamento). A questão era usar Redis Pub/Sub (fire-and-forget) ou uma fila com garantia de entrega (BullMQ sobre Redis, ou RabbitMQ).

### Decisão

**Redis Pub/Sub** para a versão atual, com ciência das limitações.

### Justificativa

- Redis já está na infraestrutura para cache; reusar sem adicionar componentes.
- Os eventos atuais (logs de auditoria, futura notificação) toleram perda ocasional de mensagem.
- BullMQ ou RabbitMQ adicionariam complexidade (workers, dead-letter queues, retries) desnecessária para o escopo atual.

### Consequências

- Mensagens não são persistidas: se o subscriber estiver offline ao publicar, a mensagem é perdida.
- Aceitável enquanto o notification-service for apenas log — revisitar ao implementar envio real de e-mail/push.

---

## ADR-005 — Autenticação: JWT Stateless vs Sessions

**Status:** Aceita  
**Data:** outubro/2026  
**Autor:** Equipe Lava - Car PH

### Contexto

Precisávamos de um mecanismo de autenticação para a API REST.

### Decisão

**JWT (JSON Web Token) stateless** com expiração de 7 dias, armazenado no `localStorage` do frontend.

### Justificativa

- API REST por natureza é stateless; sessions exigiriam armazenamento de estado no servidor (Redis session store).
- JWT permite validação sem consulta ao banco a cada request.
- Expiração de 7 dias equilibra segurança e UX (usuário não precisa logar toda semana).

### Consequências

- Revogação de token antes do vencimento requer blacklist (não implementada; aceitável para o escopo).
- O secret JWT é configurado via variável de ambiente `JWT_SECRET`.
