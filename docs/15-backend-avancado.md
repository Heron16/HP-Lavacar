# 15. Back-end Avançado — Redis, Mensageria e Microsserviço

---

## 15.1 Cache Distribuído com Redis

### 15.1.1 Padrão Cache-Aside

O AquaWash implementa o padrão **cache-aside** (lazy loading): a aplicação consulta o Redis antes de ir ao banco, e popula o cache quando há miss.

**Arquivo:** `backend/src/utils/cache.ts`

```
Fluxo Cache-Aside:

Requisição
    │
    ▼
┌──────────────┐   HIT    ┌─────────┐
│  Redis Cache │ ────────► retorna  │
└──────┬───────┘           └─────────┘
       │ MISS
       ▼
┌──────────────┐
│  MySQL Query │
└──────┬───────┘
       │ resultado
       ▼
┌──────────────┐
│  SET no Redis│ (com TTL)
└──────┬───────┘
       │
       ▼
    retorna
```

**Implementação:**

```typescript
// utils/cache.ts
export async function cacheAside<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      console.log(`[Cache] HIT  → ${key}`);
      return JSON.parse(cached) as T;
    }
    console.log(`[Cache] MISS → ${key}`);
  } catch (err) {
    // Redis indisponível: degrada gracefully, vai ao banco
    console.error(`[Cache] Erro ao ler (${key}):`, err.message);
  }

  const resultado = await fn();  // executa query ao banco

  try {
    await redis.set(key, JSON.stringify(resultado), 'EX', ttl);
    console.log(`[Cache] SET  → ${key} (TTL: ${ttl}s)`);
  } catch (err) {
    console.error(`[Cache] Erro ao gravar (${key}):`, err.message);
  }

  return resultado;
}
```

---

### 15.1.2 TTL por Tipo de Dado

| Chave | TTL | Justificativa |
|---|---|---|
| `servicos:listar:p{n}:l{n}` | **300s** (5 min) | Serviços mudam raramente; custo alto de recalcular a lista |
| `servicos:admin:p{n}:l{n}` | **300s** (5 min) | Igual ao anterior, mas inclui inativos |
| `slots:{data}:{servicoId}` | **120s** (2 min) | Slots mudam ao criar/cancelar agendamento; window curta |
| `agendamentos:admin:p{n}:l{n}` | **60s** (1 min) | Dado mais dinâmico; admin precisa ver informação fresca |

**Configuração:**

```typescript
// utils/cache.ts
export const TTL = {
  SERVICOS:           300,
  SLOTS:              120,
  AGENDAMENTOS_ADMIN:  60,
} as const;
```

---

### 15.1.3 Invalidação de Cache em Updates

Quando uma entidade é criada, atualizada ou excluída, o cache relacionado é **invalidado imediatamente** para garantir consistência.

**Estratégia de chaves:**

```typescript
// ServicoService — chaves de invalidação
const KEY = {
  listar:      (p, l) => `servicos:listar:p${p}:l${l}`,
  listarAdmin: (p, l) => `servicos:admin:p${p}:l${l}`,
  todos:       'servicos:*',   // padrão glob para SCAN+DEL
};

// AgendamentoService
const KEY = {
  slots:              (data, svcId) => `slots:${data}:${svcId}`,
  slotsDia:           (data)        => `slots:${data}:*`,
  agendamentosAdmin:  (p, l)        => `agendamentos:admin:p${p}:l${l}`,
  agendamentosAdmin_todos:           'agendamentos:admin:*',
};
```

**Invalidação por padrão (SCAN + DEL):**

```typescript
// utils/cache.ts — invalidarCache com glob
export async function invalidarCache(pattern: string): Promise<void> {
  if (!pattern.includes('*')) {
    await redis.del(pattern);
    return;
  }
  // SCAN para não bloquear o Redis com KEYS *
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== '0');
}
```

**Fluxo de invalidação:**

```
POST /api/services (criar serviço)
    │
    ├── ServiceModel.create()
    ├── invalidarCache('servicos:*')    ← SCAN+DEL todas as páginas em cache
    └── publicar(CANAIS.SERVICO_CRIADO, ...)
```

---

### 15.1.4 Logs de Cache em Operação

Exemplo de logs reais demonstrando o ciclo:

```
# Primeiro acesso — MISS, popula cache
2026-11-09T14:00:00.001Z [DEBUG] [ServicoService] Listando serviços ativos
2026-11-09T14:00:00.010Z [INFO ] [Cache] MISS → servicos:listar:p1:l10
2026-11-09T14:00:00.145Z [INFO ] [Cache] SET  → servicos:listar:p1:l10 (TTL: 300s)

# Segundo acesso — HIT, retorno imediato
2026-11-09T14:00:15.002Z [DEBUG] [ServicoService] Listando serviços ativos
2026-11-09T14:00:15.010Z [INFO ] [Cache] HIT  → servicos:listar:p1:l10

# Admin cria novo serviço — invalidação
2026-11-09T14:01:00.001Z [INFO ] [ServicoService] Criando novo serviço | {"nome":"Polimento Express"}
2026-11-09T14:01:00.120Z [INFO ] [Cache] SCAN+DEL → "servicos:*" (2 chave(s))

# Próximo acesso — MISS novamente
2026-11-09T14:01:30.001Z [INFO ] [Cache] MISS → servicos:listar:p1:l10
```

---

## 15.2 Mensageria e Assinatura de Eventos — Redis Pub/Sub

### 15.2.1 Arquitetura de Eventos

```
┌─────────────────────────────────────────────────────────────────┐
│  Backend (Producer)              Redis Pub/Sub                  │
│                                                                 │
│  AgendamentoService                ┌─────────────────────┐     │
│  ├── criar()         ──PUBLISH──►  │ agendamento:criado  │     │
│  ├── atualizarStatus() ─PUBLISH──► │ agendamento:atualiz │     │
│  └── excluir()       ──PUBLISH──►  │ agendamento:cancela │     │
│                                    ├─────────────────────┤     │
│  ServicoService                    │ servico:criado      │     │
│  ├── criar()         ──PUBLISH──►  │ servico:atualizado  │     │
│  └── atualizar()     ──PUBLISH──►  └──────────┬──────────┘     │
└─────────────────────────────────────────────────────────────────┘
                                                │ SUBSCRIBE
                                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Notification Service (Consumer)                                │
│                                                                 │
│  subscriber.ts                                                  │
│  └── rotear(canal, payload)                                     │
│       ├── AGENDAMENTO_CRIADO   → handleAgendamentoCriado()      │
│       ├── AGENDAMENTO_ATUALIZADO→ handleAgendamentoAtualizado() │
│       ├── AGENDAMENTO_CANCELADO→ handleAgendamentoCancelado()   │
│       ├── SERVICO_CRIADO       → handleServicoCriado()          │
│       └── SERVICO_ATUALIZADO   → handleServicoAtualizado()      │
└─────────────────────────────────────────────────────────────────┘
```

---

### 15.2.2 Publicação de Eventos (Backend)

**Arquivo:** `backend/src/lib/pubsub.ts`

```typescript
export async function publicar<T extends object>(canal: Canal, payload: T): Promise<void> {
  const mensagem = JSON.stringify({
    canal,
    payload,
    timestamp: new Date().toISOString()
  });
  const qtd = await publisher.publish(canal, mensagem);
  console.log(`[PubSub:Publisher] PUBLISH → ${canal} | ${qtd} subscriber(s)`);
}
```

**Formato da mensagem:**
```json
{
  "canal": "agendamento:criado",
  "payload": {
    "agendamentoId": "uuid-aqui",
    "usuarioId": "uuid-aqui",
    "servicoId": "uuid-aqui",
    "veiculoId": "uuid-aqui",
    "agendadoPara": "2026-11-15T09:00:00.000Z",
    "precoTotal": 65.00,
    "criadoEm": "2026-11-09T14:05:00.000Z"
  },
  "timestamp": "2026-11-09T14:05:00.001Z"
}
```

---

### 15.2.3 Consumo de Eventos (Notification Service)

**Arquivo:** `notification-service/src/subscriber.ts`

O serviço assina todos os 5 canais definidos e roteia para o handler correspondente:

```typescript
subscriber.subscribe(...CANAIS_LISTA, (err, count) => {
  log.info(`Assinando ${count} canal(is)`, { canais: CANAIS_LISTA });
});

subscriber.on('message', (canal, raw) => {
  log.info('◀ RECEBIDO', { canal });
  const { payload } = JSON.parse(raw) as MensagemEvento;
  rotear(canal as Canal, payload);
});
```

**Handlers implementados:**

| Canal | Handler | Ação |
|---|---|---|
| `agendamento:criado` | `handleAgendamentoCriado` | Loga confirmação + simula envio de e-mail |
| `agendamento:atualizado` | `handleAgendamentoAtualizado` | Loga mudança de status + mensagem contextual |
| `agendamento:cancelado` | `handleAgendamentoCancelado` | Loga cancelamento + simula notificação |
| `servico:criado` | `handleServicoCriado` | Loga novo serviço no catálogo |
| `servico:atualizado` | `handleServicoAtualizado` | Loga + alerta se preço foi alterado |

---

### 15.2.4 Logs que Comprovam a Circulação de Mensagens

**Logs do Backend (Producer):**
```
2026-11-09T14:05:00.001Z [INFO ] [AgendamentoService] Iniciando criação | {"usuarioId":"abc","servicoId":"xyz"}
2026-11-09T14:05:00.150Z [INFO ] [AgendamentoService] Agendamento criado | {"agendamentoId":"def"}
2026-11-09T14:05:00.155Z [INFO ] [Cache] SCAN+DEL → "slots:2026-11-15:*" (1 chave(s))
2026-11-09T14:05:00.160Z [INFO ] [PubSub:Publisher] PUBLISH → agendamento:criado | 1 subscriber(s)
```

**Logs do Notification Service (Consumer):**
```
2026-11-09T14:05:00.162Z [INFO ] [Subscriber] ◀ RECEBIDO | {"canal":"agendamento:criado"}
2026-11-09T14:05:00.163Z [INFO ] [AgendamentoHandler] 📅 Agendamento criado — enviando confirmação | {"agendamentoId":"def","usuarioId":"abc","agendadoPara":"2026-11-15T09:00:00.000Z","precoTotal":65}
2026-11-09T14:05:00.164Z [INFO ] [AgendamentoHandler] ✉️  [E-mail] Confirmação enviada | {"usuarioId":"abc","assunto":"Seu agendamento foi confirmado!"}
2026-11-09T14:05:00.165Z [INFO ] [Subscriber] ✔ Processado | {"canal":"agendamento:criado"}
```

---

## 15.3 Docker Compose e Nginx como Proxy Reverso

### 15.3.1 Orquestração com Docker Compose

O `docker-compose.yml` orquestra 6 serviços com dependências, healthchecks e volumes:

```
redis ──────────────────────────────┐
                                    │ (healthy)
mysql ──────────────────────────────┤
      (healthy)                     │
                                    ▼
                              backend (3001)
                                    │
                              notification-service
                                    │
frontend (80) ──────────────────────┤
                                    ▼
                              nginx (80/443) ← único exposto ao host
```

**Dependências encadeadas (garante ordem de startup):**
```yaml
backend:
  depends_on:
    mysql:
      condition: service_healthy
    redis:
      condition: service_healthy
```

**Volumes persistentes:**
```yaml
volumes:
  mysql_data:    # dados do MySQL
  redis_data:    # AOF do Redis (appendonly yes)
  uploads_data:  # fotos de perfil dos usuários
```

**Redis configurado para persistência e limite de memória:**
```yaml
redis:
  command: redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy allkeys-lru
```

---

### 15.3.2 Nginx como Proxy Reverso

O Nginx é o **único container com portas expostas ao host** (80 e 443). Responsabilidades:

1. **Termina TLS** (HTTPS) — certificado em `/etc/nginx/certs/`
2. **Redireciona HTTP → HTTPS** (301)
3. **Roteamento por path:**
   - `/api/*` → `backend:3001`
   - `/uploads/*` → `backend:3001`
   - `/*` → `frontend:80`
4. **Headers de segurança:** HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy
5. **Compressão gzip** para assets estáticos

```nginx
# Roteamento principal (simplificado)
server {
    listen 443 ssl;

    # API → backend
    location /api/ {
        proxy_pass http://backend:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Uploads
    location /uploads/ {
        proxy_pass http://backend:3001;
    }

    # SPA → frontend (+ fallback para React Router)
    location / {
        proxy_pass http://frontend:80;
        try_files $uri $uri/ /index.html;
    }
}
```

**Rede interna isolada:** todos os serviços comunicam-se na rede `internal` do Docker. O MySQL e o Redis **nunca ficam acessíveis** fora dessa rede.

---

## 15.4 Microsserviço: Notification Service

### 15.4.1 Características

| Característica | Valor |
|---|---|
| **Tecnologia** | Node.js 20 + TypeScript + ioredis |
| **Comunicação** | Redis Pub/Sub (zero HTTP, zero banco) |
| **Deploy** | Container independente no Docker Compose |
| **Porta exposta** | Nenhuma — processo totalmente interno |
| **Dependência** | Apenas Redis |
| **Restart policy** | `unless-stopped` |

### 15.4.2 Isolamento de Tipos

O notification-service define seus próprios DTOs em `src/types/events.ts` — **cópia intencional** dos tipos do backend. Isso garante que os dois serviços evoluam de forma independente sem acoplamento de pacotes compartilhados.

### 15.4.3 Resiliência no Subscriber

```typescript
retryStrategy: (times) => {
  const delay = Math.min(times * 300, 5000);
  log.warn(`Reconectando (tentativa #${times}) em ${delay}ms`);
  return delay;
}
```

Reconexão automática com backoff exponencial caso o Redis fique temporariamente indisponível.

---

## 15.5 Organização do Código e Boas Práticas

### 15.5.1 Estrutura de Módulos do Backend

```
src/
├── app.ts              ← configuração Express (middlewares, rotas)
├── index.ts            ← bootstrap (DB sync, subscriber, listen)
├── controllers/        ← recebe req/res, delega ao service
│   ├── AppointmentController.ts
│   ├── AuthController.ts
│   ├── ServiceController.ts
│   ├── UserController.ts
│   └── VehicleController.ts
├── services/           ← lógica de negócio, sem conhecimento de HTTP
│   ├── AgendamentoService.ts
│   ├── AuthService.ts
│   ├── ServicoService.ts
│   ├── UserService.ts
│   └── VeiculoService.ts
├── models/             ← Sequelize models (mapeamento ORM)
│   ├── AppointmentModel.ts
│   ├── ServiceModel.ts
│   ├── UserModel.ts
│   ├── VehicleModel.ts
│   └── database.ts
├── routes/             ← definição de rotas e aplicação de middlewares
├── middlewares/        ← auth, logger, errorHandler, upload
├── lib/                ← infraestrutura: redis, pubsub, subscriber
├── types/              ← interfaces e tipos TypeScript compartilhados
└── utils/              ← helpers: cache, logger, pagination, validators
```

### 15.5.2 Separação de Responsabilidades

| Camada | Responsabilidade | Conhece HTTP? | Conhece Banco? |
|---|---|---|---|
| Routes | Define URL, método, middlewares | ✅ | ❌ |
| Controller | Extrai dados do req, chama service, monta res | ✅ | ❌ |
| Service | Regras de negócio, validações, cache, eventos | ❌ | Via Model |
| Model | Mapeamento Sequelize, schema da tabela | ❌ | ✅ |
| Utils | Helpers puros (cache, logger, pagination) | ❌ | Indireto (cache) |

### 15.5.3 DTOs e Tipagem

Todos os dados trafegados entre camadas são tipados via interfaces TypeScript:

```typescript
// types/index.ts
export interface DadosCriacaoAgendamento {
  usuarioId: string;
  veiculoId: string;
  servicoId: string;
  agendadoPara: Date;
  observacoes?: string;
}

// types/events.ts — Published Language (Pub/Sub)
export interface EventoAgendamentoCriado {
  agendamentoId: string;
  usuarioId: string;
  // ...
}
```

### 15.5.4 Tratamento de Erros

**Erros de negócio** → `throw new Error('mensagem amigável')` no service → controller captura → HTTP 400.

**Erros inesperados** → propagam para `errorHandler` global → HTTP 500 sem stack em produção.

**Erros de infraestrutura (Redis)** → capturados localmente com try/catch → degradação graceful, sem impacto no usuário.

```typescript
// Exemplo no controller:
async criar(req: AuthRequest, res: Response): Promise<void> {
  try {
    const agendamento = await agendamentoService.criar(dados);
    res.status(201).json(agendamento);
  } catch (error) {
    const msg = (error as Error).message;
    res.status(400).json({ mensagem: msg });
  }
}
```
