import { useCallback, useEffect, useState } from 'react';
import { listEmployees, listSectors, setSupervisedAreas } from '../api';
import { esGerente } from '../areas';
import SupervisorDiagnosticModal from './SupervisorDiagnosticModal';

/**
 * Pantalla de empleados (spec 005, US3).
 *
 * **Es nueva**: hasta ahora `listEmployees()` se usaba solo para el desplegable de
 * delegación de la cola de casos, y no había ninguna pestaña de empleados.
 *
 * Lo que viene a resolver: quién es responsable de qué. De esa asignación dependen
 * dos cosas que se ven en otras pantallas —cómo le habla el asistente y qué
 * documentos puede modificar—, así que si no se puede tocar desde acá, no se puede
 * probar nada de eso.
 */
export default function EmployeesPanel({ token }) {
  const [employees, setEmployees] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [editando, setEditando] = useState(null);
  const [diagnosticEmployee, setDiagnosticEmployee] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [emps, secs] = await Promise.all([listEmployees(token), listSectors(token)]);
      setEmployees(emps);
      setSectors(secs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="card">
        <h3>Empleados y áreas</h3>
        <p className="hint">
          El <strong>sector</strong> es dónde trabaja la persona. Las{' '}
          <strong>áreas</strong> son de qué es responsable, y es lo que decide qué
          conocimiento puede modificar y cómo la trata el asistente. Son dos cosas
          distintas: alguien puede trabajar en Cobranzas y ser responsable de
          Depósito y Logística.
        </p>
        <p className="hint">
          No hay ninguna casilla de “gerente”, y no falta: se es gerente al ser
          responsable de <strong>todas</strong> las áreas. Marcar las{' '}
          {sectors.length || '…'} equivale a serlo.
        </p>

        <button className="secondary" onClick={load} disabled={loading}>
          {loading ? 'Cargando…' : 'Refrescar'}
        </button>
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Trabaja en</th>
              <th>Responsable de</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const areas = e.areasSupervisadas ?? [];
              const gerente = esGerente(areas, sectors.length);
              return (
                <tr key={e.id} style={e.isActive ? undefined : { opacity: 0.5 }}>
                  <td>
                    {e.name}
                    {!e.isActive && ' (dado de baja)'}
                    <div className="msg-time">{e.email}</div>
                  </td>
                  <td>{e.role}</td>
                  <td>{e.sector?.name ?? '—'}</td>
                  <td>
                    {areas.length === 0 && <span className="hint">ninguna</span>}
                    {areas.map((a) => (
                      <span key={a.id} className="badge" style={{ marginRight: 4 }}>
                        {a.name}
                      </span>
                    ))}
                    {/* Que se vea de un vistazo quién quedó con todas: es la
                        comprobación más rápida de que el dueño está bien cargado. */}
                    {gerente && (
                      <strong style={{ marginLeft: 4 }}>← responsable de TODAS (gerente)</strong>
                    )}
                  </td>
                  <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                    <button
                      className="secondary"
                      style={{ fontSize: 12, padding: '4px 8px' }}
                      onClick={() => setDiagnosticEmployee({ id: e.id, name: e.name })}
                      title="Ver y gestionar evaluación diagnóstica"
                    >
                      🎯 Diagnóstico
                    </button>
                    {e.role === 'SUPERVISOR' ? (
                      <button className="secondary" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setEditando(e)}>
                        Cambiar áreas
                      </button>
                    ) : (
                      <span style={{ width: 85 }} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {diagnosticEmployee && (
        <SupervisorDiagnosticModal
          token={token}
          employeeId={diagnosticEmployee.id}
          employeeName={diagnosticEmployee.name}
          onClose={() => setDiagnosticEmployee(null)}
        />
      )}
      {editando && (
        <AsignarAreas
          token={token}
          empleado={editando}
          sectors={sectors}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** Selección múltiple de áreas. La lista reemplaza a la anterior: sirve para quitar. */
function AsignarAreas({ token, empleado, sectors, onClose, onSaved }) {
  const [seleccion, setSeleccion] = useState(
    () => new Set((empleado.areasSupervisadas ?? []).map((a) => a.id)),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function toggle(id) {
    setSeleccion((previa) => {
      const proxima = new Set(previa);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      return proxima;
    });
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      await setSupervisedAreas(token, empleado.id, [...seleccion]);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const quedaGerente = seleccion.size === sectors.length && sectors.length > 0;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h4>Áreas de {empleado.name}</h4>

      {sectors.map((s) => (
        <label key={s.id} style={{ display: 'block', marginTop: 6 }}>
          <input
            type="checkbox"
            checked={seleccion.has(s.id)}
            onChange={() => toggle(s.id)}
          />{' '}
          {s.name}
          <span className="hint"> · agente {s.agentType ?? 'ninguno'}</span>
        </label>
      ))}

      {quedaGerente && (
        <p className="success-msg" style={{ marginTop: 12 }}>
          Con todas las áreas marcadas, el sistema lo trata como <strong>gerente</strong>:
          el asistente le habla como al dueño y puede modificar los documentos
          transversales.
        </p>
      )}
      {seleccion.size === 0 && (
        <p className="hint" style={{ marginTop: 12 }}>
          Sin ninguna área no va a poder modificar ningún documento. Es un estado
          válido —recién asignado, por ejemplo—, no un error.
        </p>
      )}

      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 12 }}>
        <button onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button className="secondary" onClick={onClose} style={{ marginLeft: 8 }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

