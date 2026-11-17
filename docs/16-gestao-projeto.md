# 16. Gestão do Projeto — Cynefin, Scrum e Product Backlog

---

## 16.1 Framework Cynefin — Análise e Classificação

### 16.1.1 O Framework

O Cynefin classifica contextos de problemas em cinco domínios para guiar a escolha da abordagem de gestão:

| Domínio | Causa-Efeito | Resposta |
|---|---|---|
| **Óbvio** (Simples) | Claro e previsível | Perceber → Categorizar → Responder |
| **Complicado** | Requer análise de especialistas | Perceber → Analisar → Responder |
| **Complexo** | Visível só após o fato | Sondar → Perceber → Responder |
| **Caótico** | Sem causa e efeito claros | Agir → Perceber → Responder |
| **Desordem** | Domínio desconhecido | — |

---

### 16.1.2 Classificação do AquaWash: **Domínio Complexo**

O projeto AquaWash foi classificado no domínio **Complexo** pelas seguintes evidências:

**1. Requisitos Emergentes**

O campo CPF foi projetado no frontend com validação completa (algoritmo de dígitos verificadores), mas a coluna correspondente não existia no banco de dados. Essa lacuna só foi descoberta durante o desenvolvimento — um comportamento emergente típico do domínio complexo.

**2. Múltiplos Perfis Interdependentes**

O sistema possui dois perfis (`cliente` e `admin`) com fluxos distintos e interdependentes. O admin altera o status de agendamentos do cliente, criando dependências comportamentais que não eram totalmente previsíveis no início do projeto.

**3. Lógica de Negócio Não Trivial**

A lógica de slots de horário exigiu múltiplas iterações para acomodar todas as restrições:
- Segunda a sexta: 08h–12h e 13h30–18h
- Sábado: 08h–12h
- Domingo: fechado
- Slots a cada 30 minutos com verificação de sobreposição de intervalos considerando a duração de cada serviço

**4. Integração com Ajustes Iterativos**

A integração entre React, Node.js, MySQL e Docker exigiu ajustes contínuos de CORS, proxy Nginx e sincronização de modelos Sequelize — imprevistos que emergiam à medida que o sistema era construído.

---

### 16.1.3 Abordagem Escolhida: Ágil — Scrum

O Cynefin recomenda para o domínio Complexo o ciclo **Sondar → Perceber → Responder**, que se traduz diretamente nas cerimônias do Scrum:

| Cynefin | Scrum |
|---|---|
| **Sondar** | Sprint Planning — definir o que tentar |
| **Perceber** | Sprint Review + Daily Scrum — observar o que emergiu |
| **Responder** | Sprint Retrospective — adaptar o processo |

O Scrum foi escolhido por permitir inspeção e adaptação frequente, essenciais quando os requisitos evoluem a cada sprint conforme o sistema é construído e testado.

---

## 16.2 Papéis Scrum

| Papel | Responsável | Responsabilidades |
|---|---|---|
| **Product Owner** | Heron Jose da Silva | Prioriza o backlog, define critérios de aceite, representa o negócio, valida as entregas de cada sprint |
| **Scrum Master** | Paulo Henrique Kondazeski | Facilita cerimônias, remove impedimentos, garante que o processo Scrum seja seguido |
| **Dev Team** | Equipe Lava - Car PH | Desenvolve as funcionalidades, estima story points, participa de todas as cerimônias |

---

## 16.3 Sprints e Versões Entregues

### Visão Geral das Versões

| Sprint | Versão | Período | Entrega Principal |
|---|---|---|---|
| Sprint 1 | v0.1 | 13–14 out/2026 | MVP — Autenticação (cadastro, login, JWT) |
| Sprint 2 | v0.2 | 20 out – 2 nov/2026 | Veículos e Serviços (CRUD completo) |
| Sprint 3 | v0.3 | 28 out – 5 nov/2026 | Agendamentos (criação, slots, validações) |
| Sprint 4 | v0.4 | 1–5 nov/2026 | Painel Administrativo |
| Sprint 5 | v1.0 | 4–5 nov/2026 | Docker, testes E2E, Redis, Pub/Sub |

---

### Sprint 1 — v0.1 | Autenticação e Base

**Objetivo:** ter o sistema funcionando com cadastro e login de usuários.

**User Stories entregues:**

| ID | User Story | Story Points | Status |
|---|---|---|---|
| SCRUM-11 | Como usuário, quero me cadastrar com e-mail, nome e senha para acessar o sistema | 5 | ✅ Concluído |
| SCRUM-12 | Como usuário, quero fazer login para acessar minha conta com segurança | 5 | ✅ Concluído |

**Critérios de aceite — SCRUM-11 (Cadastro):**
- Sistema valida e-mail por formato
- Senha deve ter mínimo 8 chars, maiúscula, minúscula, número e especial
- E-mail duplicado retorna erro com mensagem clara
- Usuário criado com perfil `cliente` por padrão

**Critérios de aceite — SCRUM-12 (Login):**
- Login com e-mail e senha válidos retorna token JWT
- Usuário admin é redirecionado para `/admin`
- Usuário cliente é redirecionado para `/dashboard`
- Credenciais inválidas retornam mensagem genérica sem expor qual campo está errado

---

### Sprint 2 — v0.2 | Veículos e Serviços

**Objetivo:** clientes gerenciam veículos; admin gerencia catálogo de serviços.

**User Stories entregues:**

| ID | User Story | Story Points | Status |
|---|---|---|---|
| SCRUM-13 | Como cliente, quero cadastrar meu veículo com marca, modelo, placa, tipo e cor | 5 | ✅ Concluído |
| SCRUM-14 | Como cliente, quero editar e excluir meus veículos | 3 | ✅ Concluído |
| SCRUM-15 | Como admin, quero criar serviços com nome, preço, duração e tipos de veículo compatíveis | 5 | ✅ Concluído |
| SCRUM-16 | Como cliente, quero ver os serviços disponíveis filtrados pelo tipo do meu veículo | 5 | ✅ Concluído |

**Critérios de aceite — SCRUM-13 (Cadastrar veículo):**
- Placa deve ser única no sistema
- Tipos válidos: carro, moto, caminhão, SUV
- Veículo vinculado automaticamente ao usuário autenticado

**Critérios de aceite — SCRUM-16 (Filtrar serviços):**
- Apenas serviços ativos aparecem
- Serviços incompatíveis com o tipo de veículo selecionado são ocultados
- Lista atualiza ao trocar o veículo no formulário

---

### Sprint 3 — v0.3 | Agendamentos

**Objetivo:** clientes podem agendar lavagens; sistema valida conflitos e horários.

**User Stories entregues:**

| ID | User Story | Story Points | Status |
|---|---|---|---|
| SCRUM-17 | Como cliente, quero agendar uma lavagem escolhendo veículo, serviço, data e hora | 5 | ✅ Concluído |
| SCRUM-18 | Como cliente, quero visualizar e cancelar meus agendamentos | 3 | ✅ Concluído |
| SCRUM-19 | Como admin, quero ver todos os agendamentos e alterar seus status | 5 | ✅ Concluído |

**Critérios de aceite — SCRUM-17 (Criar agendamento):**
- Sistema não permite data no passado
- Agendamento criado retorna confirmação com ID
- Status inicial do agendamento é "pendente"
- Apenas serviços compatíveis com o tipo do veículo aparecem
- Apenas horários dentro do funcionamento são disponibilizados
- Sistema não permite agendar em horário já ocupado (considera duração do serviço)

**Critérios de aceite — SCRUM-18 (Cancelar agendamento):**
- Cliente só pode cancelar agendamentos próprios com status "pendente"
- Confirmação de cancelamento antes de executar

**Critérios de aceite — SCRUM-19 (Admin — todos os agendamentos):**
- Admin vê agendamentos de todos os clientes com nome e veículo
- Admin pode alterar status para: em_andamento, concluido, cancelado
- Lista paginada com no máximo 10 itens por página

---

### Sprint 4 — v0.4 | Painel Administrativo

**Objetivo:** admin tem dashboard centralizado com métricas e gestão completa.

**User Stories entregues:**

| ID | User Story | Story Points | Status |
|---|---|---|---|
| SCRUM-25 | Como admin, quero ver dashboard com totais e agendamentos recentes | 5 | ✅ Concluído |
| SCRUM-26 | Como admin, quero gerenciar todos os agendamentos e alterar seus status | 5 | ✅ Concluído |

**Critérios de aceite — SCRUM-25 (Dashboard admin):**
- Exibe total de usuários, veículos, serviços e agendamentos
- Lista os últimos 5 agendamentos com status colorido
- Dados atualizados a cada carregamento de página

---

### Sprint 5 — v1.0 | Release Final

**Objetivo:** infraestrutura completa, testes E2E e backend avançado com Redis.

**User Stories entregues:**

| ID | User Story | Story Points | Status |
|---|---|---|---|
| SCRUM-27 | Como time, precisamos de testes E2E automatizados para garantir as funcionalidades principais | 8 | ✅ Concluído |
| SCRUM-20 | Como desenvolvedor, quero que o sistema rode em Docker com proxy Nginx para facilitar o deploy | 3 | ✅ Concluído |

**Critérios de aceite — SCRUM-27 (Testes E2E):**
- Testes cobrem: login, cadastro, CRUD de serviços, CRUD de veículos
- Testes rodam em ambiente Docker via Playwright
- Relatório HTML gerado após execução

---

## 16.4 Product Backlog Priorizado

O backlog está organizado por valor de negócio e dependência técnica.

### Épicos e User Stories

**Épico 1 — SCRUM-5: Autenticação**

| Ticket | User Story | Prioridade | SP | Status |
|---|---|---|---|---|
| SCRUM-11 | Como usuário, quero me cadastrar com e-mail, nome e senha | Medium | 5 | Concluído |
| SCRUM-12 | Como usuário, quero fazer login para acessar minha conta | Highest | 5 | Concluído |

**Épico 2 — SCRUM-8: Gestão de Veículos**

| Ticket | User Story | Prioridade | SP | Status |
|---|---|---|---|---|
| SCRUM-13 | Como cliente, quero cadastrar meu veículo | High | 5 | Concluído |
| SCRUM-14 | Como cliente, quero editar e excluir meus veículos | Medium | 3 | Concluído |

**Épico 3 — SCRUM-7: Gestão de Serviços**

| Ticket | User Story | Prioridade | SP | Status |
|---|---|---|---|---|
| SCRUM-15 | Como admin, quero criar serviços com nome, preço e duração | Medium | 5 | Concluído |
| SCRUM-16 | Como cliente, quero ver serviços filtrados pelo tipo de veículo | High | 5 | Concluído |

**Épico 4 — SCRUM-9: Agendamentos**

| Ticket | User Story | Prioridade | SP | Status |
|---|---|---|---|---|
| SCRUM-17 | Como cliente, quero agendar uma lavagem escolhendo veículo, serviço, data e hora | Highest | 5 | Concluído |
| SCRUM-18 | Como cliente, quero visualizar e cancelar meus agendamentos | Medium | 3 | Concluído |
| SCRUM-19 | Como admin, quero ver todos os agendamentos e alterar seus status | High | 5 | Concluído |

**Épico 5 — SCRUM-23: Painel Administrativo**

| Ticket | User Story | Prioridade | SP | Status |
|---|---|---|---|---|
| SCRUM-25 | Como admin, quero ver dashboard com totais e agendamentos recentes | Medium | 5 | Concluído |
| SCRUM-26 | Como admin, quero gerenciar todos os agendamentos | Medium | 5 | Concluído |

**Épico 6 — SCRUM-24: Qualidade e Testes**

| Ticket | User Story | Prioridade | SP | Status |
|---|---|---|---|---|
| SCRUM-27 | Como time, precisamos de testes E2E automatizados | Medium | 8 | Concluído |
| SCRUM-20 | Como desenvolvedor, quero o sistema rodando em Docker | Low | 3 | Concluído |

**Épico 7 — SCRUM-10: Infraestrutura e Deploy** *(em andamento)*

| Ticket | User Story | Prioridade | SP | Status |
|---|---|---|---|---|
| — | Pipeline CI/CD com GitHub Actions | Medium | — | Não Iniciado |
| — | Monitoramento e alertas em produção | Low | — | Não Iniciado |

---

## 16.5 Gestão no Jira

### Uso do Jira pela Equipe

O projeto foi gerenciado no Jira com o espaço **"Equipe Lava - Car PH"** seguindo o fluxo Scrum:

**Estrutura de issues:**
- **Épicos** (roxo): agrupam funcionalidades relacionadas (ex.: SCRUM-9 Agendamentos)
- **Stories** (azul): user stories com critérios de aceite e story points
- **Tasks**: tarefas técnicas dentro de uma story

**Campos rastreados por issue:**
- Responsável (Heron ou Paulo)
- Prioridade (Highest / High / Medium / Low)
- Status (Não Iniciado / Em Andamento / Em Teste / Concluído)
- Story Point Estimate
- Versão corrigida (v0.1 até v1.0)
- Épico pai

**Quadro Scrum:** colunas "Não Iniciado", "Em Andamento", "Em Teste" e "Concluído" com swimlanes por épico.

**Versões no Jira:**
| Versão | Status | Data lançamento |
|---|---|---|
| v0.1.0 | Lançada | 14/10/2026 |
| v0.2 — Serviços e Veículos | Lançada | 02/11/2026 |
| v0.3 — Agendamentos | Lançada | 05/11/2026 |
| v0.4 — Painel Administrativo | Lançada | 05/11/2026 |
| v1.0 — Release Final | Não lançada | 05/11/2026 (previsto) |

---

## 16.6 Velocity e Resumo

| Sprint | Story Points Entregues | Observação |
|---|---|---|
| Sprint 1 (v0.1) | 10 | MVP funcional com autenticação |
| Sprint 2 (v0.2) | 18 | CRUD completo de veículos e serviços |
| Sprint 3 (v0.3) | 13 | Agendamentos com regras complexas |
| Sprint 4 (v0.4) | 10 | Dashboard admin |
| Sprint 5 (v1.0) | 11 | Infraestrutura, testes, Redis |
| **Total** | **62** | |

**Velocity médio:** ~12 story points por sprint.
