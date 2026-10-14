import { useState } from 'react';
import { login, getMe } from '../api';

// Emails del seed (prisma/seed.ts). La contraseña de dev es única: trimia2026.
const TEST_USERS = [
  { label: 'Supervisor (todas las áreas) — Diego Bazán', email: 'diego.bazan@credimision.com' },
  { label: 'Supervisora (solo Cobranzas) — Silvia Ríos', email: 'silvia.rios@credimision.com' },
  { label: 'Cobrador — Roberto Sosa', email: 'roberto.sosa@credimision.com' },
  { label: 'Cobradora Controladora — Marisa Paz', email: 'marisa.paz@credimision.com' },
];

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('diego.bazan@credimision.com');
  const [password, setPassword] = useState('trimia2026');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { accessToken } = await login(email, password);
      const user = await getMe(accessToken);
      onLogin(accessToken, user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleQuickLogin(testEmail) {
    setEmail(testEmail);
    setError('');
  }

  return (
    <main className="login-page">
      <div className="login-background-orb login-background-orb-primary" aria-hidden="true" />
      <div className="login-background-orb login-background-orb-secondary" aria-hidden="true" />
      <section className="login-card">
        <div className="login-brand-panel">
          <img src="/logo.png" alt="TrimIA" className="login-logo" />
          <div>
            <p className="login-eyebrow">Portal de Gestión</p>
            <h1>Todo tu equipo, en un solo lugar.</h1>
            <p className="login-brand-description">
              Asistencia inteligente para la operación diaria de Credimisión.
            </p>
          </div>
          <div className="login-brand-decoration" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-heading">
            <h2>Iniciar sesión</h2>
            <p>Ingresá con tu cuenta para continuar.</p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">Contraseña</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          {error && <p className="error login-error">{error}</p>}

          <div className="login-test-users">
            <div className="login-test-users-heading">Acceso rápido de prueba</div>
            <div className="login-test-users-grid">
              {TEST_USERS.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  className="secondary"
                  onClick={() => handleQuickLogin(u.email)}
                >
                  {u.label}
                </button>
              ))}
            </div>
            <p className="login-test-users-hint">
              Seleccioná un perfil para completar el email. Contraseña: <b>trimia2026</b>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
