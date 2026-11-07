import { useState } from 'react';
import { login, getMe } from '../api';
import TrimiLogin from './TrimiLogin';

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
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
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
    // Al seleccionar un usuario de prueba, enfocamos visualmente el email brevemente
    setFocusedField('email');
    setTimeout(() => {
      setFocusedField(null);
    }, 1500);
  }

  return (
    <main className={`login-page${showIntro ? ' login-page-with-intro' : ''}`}>
      {/* Luces y estrellas de ambiente sutiles fieles al mockup */}
      <div className="login-lights" aria-hidden="true">
        <span className="login-light login-light-one" />
        <span className="login-light login-light-two" />
        <span className="login-light login-light-three" />
        <span className="login-light login-light-four" />
        <span className="login-light login-light-five" />
        <span className="login-light login-light-six" />
        <span className="login-light login-light-seven" />
        <span className="login-light login-light-eight" />
        {/* Estrellitas sutiles flotantes */}
        <span className="login-star login-star-1">✦</span>
        <span className="login-star login-star-2">✧</span>
        <span className="login-star login-star-3">✦</span>
        <span className="login-star login-star-4">✦</span>
      </div>

      {showIntro && <TrimiaBrand className="login-intro-brand" />}
      {showEntryAnimation && (
        <div className="login-entry-overlay" role="status" aria-label="Ingresando a TrimIA">
          <TrimiaBrand className="login-entry-brand" />
        </div>
      )}

      {/* Contenedor central con Trimi asomándose en el borde superior */}
      <div className="login-card-container">
        <TrimiLogin
          focusedField={focusedField}
          emailValue={email}
          showPassword={showPassword}
          showIntro={showIntro}
        />

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
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="tu.nombre@credimision.com"
                />
              </div>

              <div className="field login-password-field">
                <label htmlFor="login-password">Contraseña</label>
                <div className="login-password-input-wrapper">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    tabIndex="-1"
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
            {error && <p className="error login-error">{error}</p>}

            <details className="login-test-users">
              <summary>Acceso de prueba por rol</summary>
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
      </div>
    </main>
  );
}
