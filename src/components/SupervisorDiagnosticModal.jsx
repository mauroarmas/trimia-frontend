import { useCallback, useEffect, useState } from 'react';
import { getSupervisorEmployeeDiagnostic, resetEmployeeDiagnostic } from '../api';

export default function SupervisorDiagnosticModal({ token, employeeId, employeeName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getSupervisorEmployeeDiagnostic(token, employeeId)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Error al cargar diagnóstico del empleado');
        setLoading(false);
      });
  }, [token, employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      const res = await resetEmployeeDiagnostic(token, employeeId);
      setSuccessMsg(res.message || 'Diagnóstico reiniciado exitosamente');
      setConfirmReset(false);
      load();
    } catch (err) {
      setError(err.message || 'Error al reiniciar diagnóstico');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 540 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Diagnóstico: {employeeName || data?.employeeName}</h3>
          <button className="secondary" onClick={onClose} style={{ padding: '4px 10px' }}>✕</button>
        </div>

        {loading && <p style={{ textAlign: 'center', padding: 20 }}>Cargando información del diagnóstico...</p>}

        {error && <p className="error">{error}</p>}
        {successMsg && (
          <div style={{ padding: '8px 12px', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 6, marginBottom: 12, color: 'var(--success)' }}>
            ✓ {successMsg}
          </div>
        )}

        {!loading && data && (
          <div>
            <div className="card" style={{ backgroundColor: 'var(--bg)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="hint">Sector</span>
                <strong>{data.sectorName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="hint">Estado Diagnóstico</span>
                <strong>
                  {data.hasActiveDiagnostic ? (
                    <span className="badge" style={{ backgroundColor: 'var(--success)', color: '#fff' }}>Completado</span>
                  ) : (
                    <span className="badge">No Rendido / Reseteado</span>
                  )}
                </strong>
              </div>
            </div>

            {data.lastSession ? (
              <div className="card" style={{ marginBottom: 16 }}>
                <h4>Detalle de la Última Sesión</h4>
                <div style={{ display: 'flex', gap: 16, margin: '12px 0' }}>
                  <div style={{ padding: '10px 16px', backgroundColor: 'var(--bg)', borderRadius: 8, textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--primary)' }}>
                      {data.lastSession.score}%
                    </div>
                    <div className="hint" style={{ fontSize: 11 }}>Puntaje Obtenido</div>
                  </div>
                  <div style={{ padding: '10px 16px', backgroundColor: 'var(--bg)', borderRadius: 8, textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold' }}>
                      {data.lastSession.correctAnswers} / {data.lastSession.totalQuestions}
                    </div>
                    <div className="hint" style={{ fontSize: 11 }}>Aciertos</div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Fecha: {new Date(data.lastSession.completedAt).toLocaleString()}
                </div>

                {data.lastSession.exemptedModuleIds?.length > 0 ? (
                  <div>
                    <span className="hint" style={{ display: 'block', marginBottom: 4 }}>
                      Módulos Eximidos ({data.lastSession.exemptedModuleIds.length}):
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {data.lastSession.exemptedModuleIds.map((id) => (
                        <span key={id} className="badge" style={{ backgroundColor: 'var(--success)', color: '#fff' }}>
                          ID: {id.slice(0, 8)}…
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="hint">Ningún módulo alcanzó el 100% para exención temática.</p>
                )}
              </div>
            ) : (
              <p className="hint" style={{ padding: '12px 0' }}>
                El empleado aún no registra una evaluación diagnóstica activa.
              </p>
            )}

            {/* Bloque de Reinicio */}
            {data.hasActiveDiagnostic && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
                {!confirmReset ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="hint" style={{ fontSize: 12 }}>
                      ¿Necesitas que el empleado vuelva a rendir su nivelación?
                    </span>
                    <button
                      className="secondary"
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      onClick={() => setConfirmReset(true)}
                    >
                      Reiniciar Diagnóstico
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: 12, backgroundColor: 'var(--danger-bg)', borderRadius: 6, border: '1px solid var(--danger)' }}>
                    <strong style={{ color: 'var(--danger)', display: 'block', marginBottom: 4 }}>
                      ¿Confirmar reinicio de diagnóstico?
                    </strong>
                    <p style={{ fontSize: 12, margin: '0 0 10px' }}>
                      Se archivará la sesión actual y las píldoras que estaban eximidas por diagnóstico volverán a estado no iniciado con candados ordinarios.
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="secondary" onClick={() => setConfirmReset(false)} disabled={resetting}>
                        Cancelar
                      </button>
                      <button
                        onClick={handleReset}
                        disabled={resetting}
                        style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }}
                      >
                        {resetting ? 'Reiniciando...' : 'Sí, Reiniciar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button className="secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

