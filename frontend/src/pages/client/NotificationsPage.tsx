import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  buscarNotificacoes,
  marcarComoLida,
  marcarTodasComoLidas,
  type Notificacao,
} from '../../services/notificacoes';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { formatDate } from '../../utils/validators';

const ICONE: Record<string, string> = {
  agendamento_criado: '✅',
  agendamento_cancelado: '❌',
};

export function NotificationsPage() {
  const { usuario } = useAuth();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [offline, setOffline] = useState(false);

  const carregar = useCallback(async () => {
    if (!usuario?.id) return;
    setCarregando(true);
    try {
      const { notificacoes: notifs, naoLidas: count } = await buscarNotificacoes(usuario.id);
      setNotificacoes(notifs);
      setNaoLidas(count);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setCarregando(false);
    }
  }, [usuario?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleMarcarLida = async (id: string) => {
    try {
      await marcarComoLida(id);
      setNotificacoes((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
      setNaoLidas((prev) => Math.max(0, prev - 1));
    } catch {
      /* ignore */
    }
  };

  const handleMarcarTodas = async () => {
    if (!usuario?.id) return;
    try {
      await marcarTodasComoLidas(usuario.id);
      setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
      setNaoLidas(0);
    } catch {
      /* ignore */
    }
  };

  if (offline) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <span className="text-5xl mb-3">🔕</span>
        <h2 className="text-lg font-semibold text-gray-900">
          Serviço de notificações offline
        </h2>
        <p className="text-sm text-gray-500 mt-2 max-w-sm">
          As notificações voltam quando o serviço for ativado novamente.
        </p>
        <Button variant="ghost" className="mt-4" onClick={carregar}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Notificações</h1>
          {naoLidas > 0 && (
            <p className="text-gray-500 text-sm">{naoLidas} não lida(s)</p>
          )}
        </div>
        {naoLidas > 0 && (
          <Button variant="ghost" size="sm" onClick={handleMarcarTodas}>
            Marcar todas como lidas
          </Button>
        )}
      </div>

      {carregando ? (
        <LoadingSpinner mensagem="Carregando notificações..." />
      ) : notificacoes.length === 0 ? (
        <Card className="p-10 sm:p-12 text-center text-gray-400">
          <p className="text-5xl mb-3">🔔</p>
          <p className="font-medium">Nenhuma notificação ainda</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notificacoes.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.lida && handleMarcarLida(n.id)}
              className={`flex items-start gap-3 rounded-xl border-l-4 p-4 transition cursor-pointer ${
                n.lida
                  ? 'bg-white border-gray-200'
                  : 'bg-blue-50 border-blue-500 hover:bg-blue-100'
              }`}
            >
              <span className="text-xl flex-shrink-0">{ICONE[n.tipo] ?? '🔔'}</span>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm text-gray-900 ${
                    n.lida ? 'font-normal' : 'font-semibold'
                  }`}
                >
                  {n.mensagem}
                </p>
                <p className="text-xs text-gray-500 mt-1">{formatDate(n.criadoEm)}</p>
              </div>
              {!n.lida && (
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
