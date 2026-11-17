import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificacoes } from '../../hooks/useNotificacoes';

interface NavbarProps {
  onMenuClick?: () => void;
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const { usuario, estaAutenticado, logout } = useAuth();
  const navigate = useNavigate();
  const { naoLidas } = useNotificacoes();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          <div className="flex items-center gap-3">
            {estaAutenticado && (
              <button
                onClick={onMenuClick}
                className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition"
                aria-label="Menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}

            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">AW</span>
              </div>
              <span className="font-bold text-gray-900 text-lg">AquaWash</span>
            </Link>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {!estaAutenticado ? (
              <>
                <Link
                  to="/login"
                  className="text-sm text-gray-600 hover:text-blue-600 transition font-medium"
                >
                  Entrar
                </Link>
                <Link
                  to="/cadastro"
                  className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Cadastrar
                </Link>
              </>
            ) : (
              <>
                {/* Sino de notificações — só cliente */}
                {usuario?.perfil === 'cliente' && (
                  <Link
                    to="/dashboard/notificacoes"
                    className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition"
                    aria-label="Notificações"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {naoLidas > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {naoLidas > 9 ? '9+' : naoLidas}
                      </span>
                    )}
                  </Link>
                )}
                <Link
                  to={usuario?.perfil === 'admin' ? '/admin' : '/dashboard'}
                  className="hidden sm:block text-sm text-gray-600 hover:text-blue-600 transition font-medium"
                >
                  {usuario?.perfil === 'admin' ? 'Painel Admin' : 'Minha Área'}
                </Link>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 text-sm font-semibold">
                      {usuario?.nome[0].toUpperCase()}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-sm text-gray-500 hover:text-red-500 transition"
                  >
                    Sair
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
