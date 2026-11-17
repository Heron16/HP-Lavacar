import axios from 'axios';

// Em produção (via Nginx): /notif/ é proxy reverso para notification-service:3002
// Em desenvolvimento local: Vite proxy redireciona /notif para http://localhost:3002
const notifApi = axios.create({
  baseURL: '/notif',
  timeout: 5000,
});

export interface Notificacao {
  id: string;
  usuarioId: string;
  tipo: 'agendamento_criado' | 'agendamento_cancelado';
  mensagem: string;
  lida: boolean;
  criadoEm: string;
}

export async function buscarNotificacoes(
  usuarioId: string,
): Promise<{ notificacoes: Notificacao[]; naoLidas: number }> {
  const { data } = await notifApi.get(`/notificacoes/${usuarioId}`);
  return data;
}

export async function marcarComoLida(id: string): Promise<void> {
  await notifApi.patch(`/notificacoes/${id}/lida`);
}

export async function marcarTodasComoLidas(usuarioId: string): Promise<void> {
  await notifApi.patch(`/notificacoes/${usuarioId}/todas-lidas`);
}
