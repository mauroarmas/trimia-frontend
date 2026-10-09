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
    <div className="container" style={{ maxWidth: 380, paddingTop: 60 }}>
      <div className="card" style={{ padding: '28px 24px', textAlign: 'center' }}>
        <img
          src="/logo.png"
          alt="TrimIA"
          style={{ height: 48, objectFit: 'contain', marginBottom: 16 }}
        />
        <h2 style={{ fontSize: 18, marginBottom: 18, fontWeight: 700 }}>Iniciar Sesión</h2>
        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          <div className="field">
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Usuarios de prueba:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TEST_USERS.map((u) => (
              <button
                key={u.email}
                className="secondary"
                onClick={() => handleQuickLogin(u.email)}
                style={{ fontSize: 12 }}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
          <b>Supervisor (Diego):</b> casos escalados, panel, chat y base de conocimiento
          de las cinco áreas — es gerente por tener todas (spec 005).
          <br />
          <b>Supervisora (Silvia):</b> lo mismo, pero solo puede corregir/enseñar
          conocimiento de Cobranzas — sirve para probar el rechazo por área.
          <br />
          <b>Cobrador:</b> solo sus clientes y comprobantes.
          <br />
          <b>Controladora:</b> lo de Cobranzas sin filtrar + verificación de impacto bancario.
        </p>
      </div>
    </div>
  );
}
