# 10. DDD — Context Map, Bounded Contexts e Modelagem de Domínio

## 10.1 Domínio e Subdomínios

O AquaWash resolve o problema de **agendamento de serviços automotivos** de forma digitalizada.

### Domínio Principal (Core Domain)
**Agendamento de Lavagem** — é o coração do negócio. Sem ele o sistema não tem valor. Toda a lógica de horários, conflitos, slots e regras de funcionamento pertence aqui.

### Subdomínios de Suporte (Supporting)
- **Gestão de Serviços** — catálogo de serviços oferecidos (preço, duração, compatibilidade por tipo de veículo).
- **Gestão de Veículos** — cadastro e vínculo de veículos ao cliente.

### Subdomínios Genéricos (Generic)
- **Identidade e Acesso** — autenticação JWT, cadastro de usuários, controle de perfis.
- **Notificações** — eventos de domínio entregues via Pub/Sub (notification-service).

---

## 10.2 Context Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AquaWash — Context Map                          │
└─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────┐         ┌──────────────────────────────┐
  │   Identidade e Acesso   │         │    Gestão de Serviços        │
  │  (Generic Subdomain)    │         │   (Supporting Subdomain)     │
  │                         │         │                              │
  │  Usuario                │         │  Servico                     │
  │  JWT / bcrypt           │         │  TipoVeiculo                 │
  │  Perfil: cliente/admin  │         │  Preço / Duração             │
  └───────────┬─────────────┘         └──────────────┬───────────────┘
              │ upstream (U)                          │ upstream (U)
              │ "conformista"                         │ "conformista"
              ▼                                       ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                  Agendamento de Lavagem                             │
  │                    (Core Domain) ★                                  │
  │                                                                     │
  │  Agendamento (Aggregate Root)                                       │
  │  SlotDisponivel (Value Object)                                      │
  │  HorarioFuncionamento (Value Object)                                │
  │  Conflito de horário (lógica de domínio)                            │
  └────────────────────────────────┬────────────────────────────────────┘
                                   │ downstream (D)
                                   │ publica eventos
                                   ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                      Notificações                                   │
  │                    (Generic Subdomain)                              │
  │                                                                     │
  │  Consome: agendamento:criado, agendamento:cancelado,               │
  │           agendamento:atualizado, servico:criado                    │
  │  Padrão: Published Language (eventos tipados)                       │
  └─────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────┐
  │   Gestão de Veículos     │
  │  (Supporting Subdomain)  │
  │                          │
  │  Veiculo                 │
  │  TipoVeiculo             │
  │  Placa (único)           │
  └──────────────┬───────────┘
                 │ upstream (U)
                 │ "conformista"
                 ▼
  (Agendamento referencia Veiculo para filtrar serviços compatíveis)

```

### Relacionamentos entre Bounded Contexts

| Relação | Tipo | Descrição |
|---|---|---|
| Identidade → Agendamento | **Conformist** | Agendamento usa o `usuarioId` do token JWT diretamente, sem transformação |
| Serviços → Agendamento | **Conformist** | Agendamento referencia `servicoId` e copia o `preco` no momento da criação (snapshot) |
| Veículos → Agendamento | **Conformist** | Agendamento referencia `veiculoId`; tipo do veículo filtra serviços compatíveis |
| Agendamento → Notificações | **Published Language** | Eventos tipados (interfaces TypeScript) publicados via Redis Pub/Sub |

---

## 10.3 Bounded Context: Agendamento de Lavagem

Este é o contexto mais rico em lógica de domínio.

### Entities

**Agendamento** (Entity — Aggregate Root)

| Atributo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Identificador único |
| `usuarioId` | UUID | FK para usuário |
| `veiculoId` | UUID | FK para veículo |
| `servicoId` | UUID | FK para serviço |
| `agendadoPara` | DateTime | Data e hora do agendamento |
| `status` | Enum | `pendente` / `em_andamento` / `concluido` / `cancelado` |
| `observacoes` | String? | Observações opcionais do cliente |
| `precoTotal` | Decimal | Snapshot do preço no momento da criação |
| `criadoEm` | DateTime | Timestamp de criação |
| `atualizadoEm` | DateTime | Timestamp de última atualização |

**Invariantes do Aggregate:**
1. `agendadoPara` deve estar dentro do horário de funcionamento.
2. Não pode haver sobreposição com agendamentos `pendente` ou `em_andamento` (verificação de conflito considera duração do serviço).
3. `precoTotal` é imutável após criação (snapshot price).
4. Apenas admin pode transicionar para `em_andamento` ou `concluido`; cliente pode cancelar apenas agendamentos `pendente` próprios.

---

### Value Objects

**HorarioFuncionamento**

Encapsula as regras de janela horária do estabelecimento:
- Segunda a sexta: 08:00–12:00 e 13:30–18:00
- Sábado: 08:00–12:00
- Domingo: fechado

```
HorarioFuncionamento {
  validar(data: Date): void  // lança erro se fora do horário
}
```

**SlotDisponivel**

Representa um horário disponível para agendamento:
```
SlotDisponivel {
  inicio: DateTime   // ex.: "2026-11-10T09:00"
  fim: DateTime      // inicio + duracao do serviço
}
```

Calculado dinamicamente: todos os slots de 30 em 30 minutos dentro das janelas de funcionamento, excluindo os já ocupados (considerando duração de cada agendamento ativo).

**IntervaloDuracao**

Representa um par (inicio, fim) usado na verificação de conflito:
```
IntervaloDuracao {
  inicio: DateTime
  fim: DateTime
  sobrepoe(outro: IntervaloDuracao): boolean
}
```

---

### Aggregates

O AquaWash tem um único aggregate no contexto de Agendamento:

**Aggregate Root: Agendamento**
- Protege todas as invariantes listadas acima.
- Operações permitidas externamente: `criar()`, `atualizarStatus()`, `excluir()`.
- Toda lógica de validação (`validarHorarioFuncionamento`, `verificarConflito`) é encapsulada no `AgendamentoService`, que age como Application Service coordenando o aggregate.

---

## 10.4 Bounded Context: Gestão de Serviços

### Entities

**Servico** (Entity — Aggregate Root)

| Atributo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Identificador único |
| `nome` | String | Nome do serviço |
| `descricao` | Text | Descrição detalhada |
| `preco` | Decimal | Preço atual (pode mudar; agendamentos usam snapshot) |
| `duracao` | Int | Duração em minutos |
| `tiposVeiculo` | String | Tipos compatíveis (CSV: `carro,suv,moto`) |
| `ativo` | Boolean | Se está disponível para novos agendamentos |
| `imagemUrl` | String? | URL da imagem ilustrativa |

### Value Objects

**TipoVeiculo** — enum: `carro`, `moto`, `caminhao`, `suv`

**CompatibilidadeServico** — lógica que verifica se um serviço atende ao tipo de veículo selecionado:
```
CompatibilidadeServico {
  compativel(servico: Servico, tipoVeiculo: TipoVeiculo): boolean
}
```

---

## 10.5 Bounded Context: Identidade e Acesso

### Entities

**Usuario** (Entity — Aggregate Root)

| Atributo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Identificador único |
| `nome` | String | Nome completo |
| `email` | String | E-mail único (imutável após cadastro) |
| `senha` | String | Hash bcrypt (fator 12) |
| `perfil` | Enum | `cliente` / `admin` |
| `telefone` | String? | Telefone opcional |
| `fotoPerfil` | String? | URL da foto de perfil |

### Value Objects

**Credenciais** — par (email, senha) validado no login:
```
Credenciais {
  email: Email          // formato válido por regex
  senha: SenhaForte     // mínimo 8 chars, maiúscula, minúscula, número, especial
}
```

**Perfil** — enum `cliente | admin` que determina as permissões do usuário no sistema.
