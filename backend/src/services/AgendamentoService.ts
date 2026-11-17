import { Op } from 'sequelize';
import { AppointmentModel } from '../models/AppointmentModel';
import { ServiceModel } from '../models/ServiceModel';
import { VehicleModel } from '../models/VehicleModel';
import { UserModel } from '../models/UserModel';
import { StatusAgendamento, ConsultaPaginacao, DadosCriacaoAgendamento } from '../types';
import { getPaginationParams, paginate } from '../utils/pagination';
import { cacheAside, invalidarCache, TTL } from '../utils/cache';
import { publicar } from '../lib/pubsub';
import { CANAIS } from '../types/events';
import { criarLogger } from '../utils/logger';

const log = criarLogger('AgendamentoService');

// Fuso horário do estabelecimento
const TZ = 'America/Sao_Paulo';

/**
 * Extrai hora e minuto de um Date no fuso do estabelecimento (BRT).
 */
function getBRTTime(data: Date): { diaSemana: number; totalMinutos: number } {
  const diasSemana: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const diaStr  = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(data);
  const horaStr = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit',   hour12: false }).format(data);
  const minStr  = new Intl.DateTimeFormat('en-US', { timeZone: TZ, minute: '2-digit'               }).format(data);
  const hora    = parseInt(horaStr === '24' ? '0' : horaStr, 10);
  return {
    diaSemana:     diasSemana[diaStr] ?? 0,
    totalMinutos:  hora * 60 + parseInt(minStr, 10),
  };
}

/**
 * Cria um Date correspondente a YYYY-MM-DD HH:MM no fuso BRT.
 * Equivalente a new Date(`${dateStr}T${HH}:${MM}:00-03:00`).
 */
function criarDataBRT(ano: number, mes: number, dia: number, horas = 0, minutos = 0): Date {
  const pad = (n: number) => String(n).padStart(2, '0');
  return new Date(`${ano}-${pad(mes)}-${pad(dia)}T${pad(horas)}:${pad(minutos)}:00-03:00`);
}

// Prefixos das chaves Redis para cache
const KEY = {
  slots: (data: string, servicoId: string) => `slots:${data}:${servicoId}`,
  slotsDia: (data: string) => `slots:${data}:*`,
  agendamentosAdmin: (pagina: number, limite: number) =>
    `agendamentos:admin:p${pagina}:l${limite}`,
  agendamentosAdmin_todos: 'agendamentos:admin:*',
};

export class AgendamentoService {
  async criar(dados: DadosCriacaoAgendamento) {
    log.info('Iniciando criação de agendamento', { usuarioId: dados.usuarioId, servicoId: dados.servicoId });

    const servico = await ServiceModel.findByPk(dados.servicoId);
    if (!servico) throw new Error('Serviço não encontrado');

    this.validarHorarioFuncionamento(dados.agendadoPara);

    const fimNovo = new Date(dados.agendadoPara.getTime() + servico.duracao * 60000);
    await this.verificarConflito(dados.agendadoPara, fimNovo);

    const agendamento = await AppointmentModel.create({
      ...dados,
      precoTotal: Number(servico.preco),
    });

    log.info('Agendamento criado com sucesso', { agendamentoId: agendamento.id });

    // Invalidar cache dos slots do dia
    const dataStr = dados.agendadoPara.toISOString().slice(0, 10);
    await invalidarCache(KEY.slotsDia(dataStr));
    await invalidarCache(KEY.agendamentosAdmin_todos);

    // Publicar evento via Pub/Sub → notification-service recebe e processa
    await publicar(CANAIS.AGENDAMENTO_CRIADO, {
      agendamentoId: agendamento.id,
      usuarioId: agendamento.usuarioId,
      servicoId: agendamento.servicoId,
      veiculoId: agendamento.veiculoId,
      agendadoPara: agendamento.agendadoPara.toISOString(),
      precoTotal: agendamento.precoTotal,
      criadoEm: agendamento.criadoEm.toISOString(),
    });

    return agendamento;
  }

  async listarPorUsuario(usuarioId: string, consulta: ConsultaPaginacao) {
    log.debug('Listando agendamentos por usuário', { usuarioId });
    const { currentPage, pageLimit, skip } = getPaginationParams(consulta.pagina, consulta.limite);
    const { rows: dados, count: total } = await AppointmentModel.findAndCountAll({
      where: { usuarioId },
      offset: skip,
      limit: pageLimit,
      include: [
        { model: VehicleModel, as: 'veiculo' },
        { model: ServiceModel, as: 'servico' },
      ],
      order: [['agendadoPara', 'DESC']],
    });
    return paginate(dados, total, currentPage, pageLimit);
  }

  async listarTodos(consulta: ConsultaPaginacao) {
    log.debug('Listando todos os agendamentos (admin)');
    const { currentPage, pageLimit, skip } = getPaginationParams(consulta.pagina, consulta.limite);

    return cacheAside(
      KEY.agendamentosAdmin(currentPage, pageLimit),
      TTL.AGENDAMENTOS_ADMIN,
      async () => {
        const { rows: dados, count: total } = await AppointmentModel.findAndCountAll({
          offset: skip,
          limit: pageLimit,
          include: [
            { model: UserModel, as: 'usuario', attributes: ['nome', 'email'] },
            { model: VehicleModel, as: 'veiculo' },
            { model: ServiceModel, as: 'servico' },
          ],
          order: [['agendadoPara', 'DESC']],
        });
        return paginate(dados, total, currentPage, pageLimit);
      },
    );
  }

  async slotsdisponives(dataStr: string, servicoId: string): Promise<string[]> {
    log.debug('Consultando slots disponíveis', { dataStr, servicoId });

    return cacheAside(
      KEY.slots(dataStr, servicoId),
      TTL.SLOTS,
      async () => {
        const servico = await ServiceModel.findByPk(servicoId);
        if (!servico) throw new Error('Serviço não encontrado');

        const duracao = servico.duracao;
        const [ano, mes, dia] = dataStr.split('-').map(Number);
        // Criar data no fuso BRT para calcular dia da semana corretamente
        const data = criarDataBRT(ano, mes, dia);
        const { diaSemana } = getBRTTime(data);

        if (diaSemana === 0) return [];

        const janelas =
          diaSemana === 6
            ? [{ inicio: 480, fim: 720 }]
            : [{ inicio: 480, fim: 720 }, { inicio: 810, fim: 1080 }];

        const todosSlots: Date[] = [];
        for (const janela of janelas) {
          for (let min = janela.inicio; min + duracao <= janela.fim; min += 30) {
            todosSlots.push(criarDataBRT(ano, mes, dia, Math.floor(min / 60), min % 60));
          }
        }

        const inicioDia = criarDataBRT(ano, mes, dia, 0, 0);
        const fimDia    = criarDataBRT(ano, mes, dia, 23, 59);

        type AgendamentoComServico = AppointmentModel & { servico: { duracao: number } };
        const ativos = await AppointmentModel.findAll({
          where: {
            status: { [Op.in]: ['pendente', 'em_andamento'] },
            agendadoPara: { [Op.between]: [inicioDia, fimDia] },
          },
          include: [{ model: ServiceModel, as: 'servico', attributes: ['duracao'] }],
        }) as AgendamentoComServico[];

        const agora = new Date();
        return todosSlots
          .filter((slot) => {
            if (slot <= agora) return false;
            const fimSlot = new Date(slot.getTime() + duracao * 60000);
            return !ativos.some((a) => {
              const inicioExistente = new Date(a.agendadoPara);
              const fimExistente = new Date(inicioExistente.getTime() + a.servico.duracao * 60000);
              return slot < fimExistente && fimSlot > inicioExistente;
            });
          })
          .map((s) => {
            // Formatar slot no fuso BRT para retornar "YYYY-MM-DDTHH:mm" local
            const fmt = new Intl.DateTimeFormat('sv-SE', {
              timeZone: TZ,
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            });
            // sv-SE usa formato "YYYY-MM-DD HH:mm" — converter para "YYYY-MM-DDTHH:mm"
            return fmt.format(s).replace(' ', 'T');
          });
      },
    );
  }

  async atualizarStatus(id: string, status: StatusAgendamento, isAdmin: boolean, usuarioId: string) {
    log.info('Atualizando status de agendamento', { agendamentoId: id, novoStatus: status });

    const condicao = isAdmin ? { id } : { id, usuarioId };
    const agendamento = await AppointmentModel.findOne({ where: condicao });
    if (!agendamento) throw new Error('Agendamento não encontrado ou sem permissão');

    const statusAnterior = agendamento.status;
    await agendamento.update({ status });

    log.info('Status atualizado', { agendamentoId: id, de: statusAnterior, para: status });

    // Invalidar cache de slots e listagem admin
    const dataStr = new Date(agendamento.agendadoPara).toISOString().slice(0, 10);
    await invalidarCache(KEY.slotsDia(dataStr));
    await invalidarCache(KEY.agendamentosAdmin_todos);

    // Publicar evento correto conforme o novo status
    if (status === 'cancelado') {
      await publicar(CANAIS.AGENDAMENTO_CANCELADO, {
        agendamentoId: agendamento.id,
        usuarioId: agendamento.usuarioId,
        agendadoPara: agendamento.agendadoPara.toISOString(),
        canceladoEm: new Date().toISOString(),
      });
    } else {
      await publicar(CANAIS.AGENDAMENTO_ATUALIZADO, {
        agendamentoId: agendamento.id,
        usuarioId: agendamento.usuarioId,
        statusAnterior,
        statusNovo: status,
        atualizadoEm: new Date().toISOString(),
      });
    }

    return agendamento;
  }

  async excluir(id: string, usuarioId: string, isAdmin: boolean) {
    log.info('Excluindo agendamento', { agendamentoId: id });

    const condicao = isAdmin ? { id } : { id, usuarioId };
    const agendamento = await AppointmentModel.findOne({ where: condicao });
    if (!agendamento) throw new Error('Agendamento não encontrado ou sem permissão');

    const dataStr = new Date(agendamento.agendadoPara).toISOString().slice(0, 10);
    await agendamento.destroy();

    log.info('Agendamento excluído', { agendamentoId: id });

    // Invalidar cache
    await invalidarCache(KEY.slotsDia(dataStr));
    await invalidarCache(KEY.agendamentosAdmin_todos);

    // Publicar evento de cancelamento (exclusão = cancelamento definitivo)
    await publicar(CANAIS.AGENDAMENTO_CANCELADO, {
      agendamentoId: id,
      usuarioId,
      agendadoPara: agendamento.agendadoPara.toISOString(),
      canceladoEm: new Date().toISOString(),
    });
  }

  private validarHorarioFuncionamento(data: Date): void {
    const { diaSemana, totalMinutos } = getBRTTime(data);

    if (diaSemana === 0) throw new Error('Não atendemos aos domingos');

    const manha = { inicio: 480, fim: 720 };
    const tarde = { inicio: 810, fim: 1080 };

    if (diaSemana === 6) {
      if (totalMinutos < manha.inicio || totalMinutos >= manha.fim)
        throw new Error('Sábado: atendemos das 08:00 às 12:00');
      return;
    }

    const dentroManha = totalMinutos >= manha.inicio && totalMinutos < manha.fim;
    const dentroTarde = totalMinutos >= tarde.inicio && totalMinutos < tarde.fim;
    if (!dentroManha && !dentroTarde)
      throw new Error('Atendemos de segunda a sexta das 08:00 às 12:00 e das 13:30 às 18:00');
  }

  private async verificarConflito(inicio: Date, fim: Date): Promise<void> {
    type AgendamentoComServico = AppointmentModel & { servico: { duracao: number } };

    const ativos = await AppointmentModel.findAll({
      where: { status: { [Op.in]: ['pendente', 'em_andamento'] } },
      include: [{ model: ServiceModel, as: 'servico', attributes: ['duracao'] }],
    }) as AgendamentoComServico[];

    const temConflito = ativos.some((a) => {
      const inicioExistente = new Date(a.agendadoPara);
      const fimExistente = new Date(inicioExistente.getTime() + a.servico.duracao * 60000);
      return inicio < fimExistente && fim > inicioExistente;
    });

    if (temConflito) throw new Error('Já existe um agendamento neste horário. Escolha outro horário.');
  }
}
