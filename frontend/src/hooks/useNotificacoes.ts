import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { buscarNotificacoes } from '../services/notificacoes';

/**
 * Hook que busca o número de notificações não lidas do usuário logado.
 * Faz polling a cada 30s para manter o badge do sino atualizado.
 */
export function useNotificacoes() {
  const { usuario, estaAutenticado } = useAuth();
  const [naoLidas, setNaoLidas] = useState(0);
  const [disponivel, setDisponivel] = useState(true);

  const atualizar = useCallback(async () => {
    if (!usuario?.id) return;
    try {
      const { naoLidas: count } = await buscarNotificacoes(usuario.id);
      setNaoLidas(count);
      setDisponivel(true);
    } catch {
      setDisponivel(false);
    }
  }, [usuario?.id]);

  useEffect(() => {
    if (!estaAutenticado || !usuario?.id) return;
    atualizar();
    const interval = setInterval(atualizar, 30_000);
    return () => clearInterval(interval);
  }, [estaAutenticado, usuario?.id, atualizar]);

  return { naoLidas, disponivel, atualizar };
}
