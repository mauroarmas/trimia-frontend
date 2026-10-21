import { useState } from 'react';
import { login, getMe } from '../api';

// Emails del seed (prisma/seed.ts). La contraseña de dev es única: trimia2026.
const TEST_USERS = [
  { label: '👑 Supervisor General (Todas las áreas) — Diego Bazán', email: 'diego.bazan@credimision.com' },
  { label: '🛡️ Supervisora de Cobranzas — Silvia Ríos', email: 'silvia.rios@credimision.com' },
  { label: '🛍️ Vendedora — Laura Gómez', email: 'laura.gomez@credimision.com' },
  { label: '💳 Cobrador — Roberto Sosa', email: 'roberto.sosa@credimision.com' },
  { label: '🔍 Cobradora Controladora — Marisa Paz', email: 'marisa.paz@credimision.com' },
  { label: '📋 Administrativa (Financiación) — Graciela Medina', email: 'graciela.medina@credimision.com' },
  { label: '🚚 Logística — Carlos Ruiz', email: 'carlos.ruiz@credimision.com' },
  { label: '📦 Depósito — Ana Torres', email: 'ana.torres@credimision.com' },
];

function TrimiaBrand({ className }) {
  return (
    <div className={className} aria-hidden="true">
      <svg className="login-brand-symbol" viewBox="0 0 300 300">
        <path className="login-logo-piece login-logo-piece-orange" d="M18 47 82 12a17 17 0 0 1 21 3l42 42-55 53a17 17 0 0 1-22 1L15 75a17 17 0 0 1 3-28Z" />
        <path className="login-logo-piece login-logo-piece-top" d="M126 12h151a12 12 0 0 1 9 20l-81 91a17 17 0 0 1-25 0l-64-73a23 23 0 0 1 10-38Z" />
        <path className="login-logo-piece login-logo-piece-left" d="M93 136a16 16 0 0 1 27-12l20 20v119a13 13 0 0 1-22 9l-28-30a25 25 0 0 1-7-18v-71a25 25 0 0 1 10-17Z" />
        <path className="login-logo-piece login-logo-piece-right" d="M157 150l22-22a16 16 0 0 1 27 12v92a25 25 0 0 1-8 18l-27 25a13 13 0 0 1-22-10V150Z" />
      </svg>
      <p className="login-brand-name"><span>Trim</span><span>IA</span></p>
    </div>
  );
}

export default function Login({ onLogin, showIntro = false }) {
  const [email, setEmail] = useState('diego.bazan@credimision.com');
  const [password, setPassword] = useState('trimia2026');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEntryAnimation, setShowEntryAnimation] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { accessToken } = await login(email, password);
      const user = await getMe(accessToken);
      setShowEntryAnimation(true);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await new Promise((resolve) => window.setTimeout(resolve, 1800));
      }
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
    <main className={`login-page${showIntro ? ' login-page-with-intro' : ''}`}>
      <div className="login-lights" aria-hidden="true">
        <span className="login-light login-light-one" />
        <span className="login-light login-light-two" />
        <span className="login-light login-light-three" />
        <span className="login-light login-light-four" />
        <span className="login-light login-light-five" />
        <span className="login-light login-light-six" />
        <span className="login-light login-light-seven" />
        <span className="login-light login-light-eight" />
      </div>
      {showIntro && <TrimiaBrand className="login-intro-brand" />}
      {showEntryAnimation && (
        <div className="login-entry-overlay" role="status" aria-label="Ingresando a TrimIA">
          <TrimiaBrand className="login-entry-brand" />
        </div>
      )}
      <section className="login-card">
        <div className="login-form-panel">
          <img src="/logo-login.png" alt="TrimIA" className="login-logo" />
          <div className="login-heading">
            <h2>Iniciar sesión</h2>
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

          <details className="login-test-users">
            <summary>Accesos de prueba por rol</summary>
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
          </details>
        </div>
      </section>
    </main>
  );
}
