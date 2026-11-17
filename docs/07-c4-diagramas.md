# 7. Diagramas C4 — Contexto e Containers

## 7.1 Nível 1 — Diagrama de Contexto

O diagrama de contexto mostra o sistema AquaWash e seus relacionamentos com atores externos.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SISTEMA: AquaWash                              │
│              Sistema web de agendamento de lavagem de veículos          │
└─────────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐                                ┌──────────────────┐
     │   Cliente    │  Agenda lavagens, consulta      │     Admin        │
     │  (usuário    │ ──────────────────────────────► │  (funcionário/   │
     │  final)      │  horários, gerencia veículos    │   proprietário)  │
     └──────────────┘                                └──────────────────┘
            │                                                │
            │  HTTPS (navegador web)                         │  HTTPS (navegador web)
            ▼                                                ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │                                                                    │
   │                         AquaWash                                  │
   │   Sistema de agendamento online para estabelecimentos automotivos  │
   │                                                                    │
   └────────────────────────────────────────────────────────────────────┘
            │
            │  (futuro) notificações por e-mail
            ▼
   ┌─────────────────────┐
   │  Notification Svc   │
   │  (microsserviço     │
   │   de eventos)       │
   └─────────────────────┘
```

**Atores:**
- **Cliente**: pessoa física que deseja agendar lavagens de veículos via web.
- **Admin**: funcionário do estabelecimento que gerencia serviços, horários e agendamentos.

**Sistema externo (futuro):** serviço de e-mail/push para notificações (atualmente o notification-service só loga os eventos).

---

## 7.2 Nível 2 — Diagrama de Containers

O diagrama de containers mostra os processos e tecnologias que compõem o AquaWash.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  AquaWash — Limite do Sistema                                                        │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐    │
│  │  Docker Compose — rede interna "internal"                                    │    │
│  │                                                                              │    │
│  │  ┌─────────────┐   HTTPS      ┌──────────────────────────────────────────┐  │    │
│  │  │             │   :443 / :80 │                Nginx                     │  │    │
│  │  │  Navegador  │ ───────────► │  Proxy reverso + TLS termination         │  │    │
│  │  │  (Cliente   │              │  nginx:1.25-alpine                       │  │    │
│  │  │   ou Admin) │              └────────────┬──────────────────────┬──────┘  │    │
│  │  └─────────────┘                           │ /api/*               │ /*       │    │
│  │                                            │                      │          │    │
│  │                              ┌─────────────▼──────┐  ┌───────────▼────────┐ │    │
│  │                              │     Backend API    │  │     Frontend SPA   │ │    │
│  │                              │  Express + Seq.    │  │  React 18 + Vite   │ │    │
│  │                              │  Node.js 20        │  │  TypeScript + TW   │ │    │
│  │                              │  Porta: 3001       │  │  Servido p/ Nginx  │ │    │
│  │                              └───────┬─────┬──────┘  └────────────────────┘ │    │
│  │                                      │     │                                 │    │
│  │                         ┌────────────┘     └──────────┐                     │    │
│  │                         │                             │                     │    │
│  │              ┌──────────▼──────────┐    ┌────────────▼────────────┐        │    │
│  │              │      MySQL 8.0      │    │        Redis 7.2         │        │    │
│  │              │  Banco relacional   │    │  Cache + Pub/Sub         │        │    │
│  │              │  Volume: mysql_data │    │  Volume: redis_data      │        │    │
│  │              └─────────────────────┘    └────────────┬────────────┘        │    │
│  │                                                       │                     │    │
│  │                              ┌────────────────────────┘                     │    │
│  │                              │ subscribe (eventos)                          │    │
│  │                   ┌──────────▼────────────────┐                            │    │
│  │                   │   Notification Service     │                            │    │
│  │                   │   Node.js (microsserviço)  │                            │    │
│  │                   │   Consome Redis Pub/Sub     │                            │    │
│  │                   └───────────────────────────┘                            │    │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Containers — Resumo

| Container | Tecnologia | Responsabilidade |
|---|---|---|
| **Nginx** | nginx:1.25-alpine | Ponto único de entrada. Termina TLS, redireciona HTTP→HTTPS, roteia `/api/*` ao backend e `/*` ao frontend. |
| **Frontend SPA** | React 18 + Vite + TypeScript + Tailwind | Interface web para clientes e admins. Build estático servido pelo Nginx interno. |
| **Backend API** | Express 4 + Sequelize 6 + Node.js 20 + TypeScript | API REST com autenticação JWT, regras de negócio, cache Redis e publicação de eventos. |
| **MySQL 8.0** | mysql:8.0 | Persistência relacional de usuários, veículos, serviços e agendamentos. |
| **Redis 7.2** | redis:7.2-alpine | Cache cache-aside para queries frequentes (serviços, slots, agendamentos admin) e broker Pub/Sub para eventos de domínio. |
| **Notification Service** | Node.js + ioredis | Microsserviço que assina canais Redis Pub/Sub e processa eventos (log de notificações). |

---

## 7.3 Nível 3 — Diagrama de Componentes do Backend

```
┌─────────────────────────────── Backend API ─────────────────────────────────┐
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Express App (app.ts)                                                │   │
│  │  ┌────────────────┐  ┌─────────────────┐  ┌───────────────────────┐ │   │
│  │  │ CORS Middleware│  │ Logger Middleware│  │ Error Handler Global  │ │   │
│  │  └────────────────┘  └─────────────────┘  └───────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ AuthRoutes  │  │ UserRoutes  │  │ ServiceRoutes│  │ VehicleRoutes   │  │
│  │ /api/auth   │  │ /api/users  │  │ /api/services│  │ /api/vehicles   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘  │
│         │                │                 │                    │            │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼───────┐  ┌───────▼────────┐  │
│  │AuthController│ │UserController│ │ServicoController│ │VeiculoController│ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                 │                    │            │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼───────┐  ┌───────▼────────┐  │
│  │ AuthService │  │ UserService │  │ ServicoService│  │ VeiculoService │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                 │                    │            │
│         └────────────────┴─────────────────┴────────────────────┘            │
│                                    │                                         │
│                        ┌───────────▼──────────┐                              │
│                        │   Sequelize Models    │                              │
│                        │ UserModel / ServiceModel                             │
│                        │ VehicleModel / AppointmentModel                     │
│                        └───────────┬──────────┘                              │
│                                    │                                         │
│                           ┌────────▼────────┐                               │
│                           │    MySQL 8.0     │                               │
│                           └─────────────────┘                               │
│                                                                              │
│         ┌──────────────────────────────────────────────────────┐            │
│         │  Infraestrutura transversal                          │            │
│         │  ┌────────────┐  ┌──────────┐  ┌─────────────────┐  │            │
│         │  │ cache.ts   │  │ pubsub.ts│  │  logger.ts      │  │            │
│         │  │ cacheAside │  │publicar()│  │  criarLogger()  │  │            │
│         │  │ invalidar()│  └─────┬────┘  └─────────────────┘  │            │
│         │  └─────┬──────┘        │                             │            │
│         │        └───────────────┴──── Redis ──────────────────┤            │
│         └──────────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────────────────┘
```
