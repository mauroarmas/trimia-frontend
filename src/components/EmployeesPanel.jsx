import { useCallback, useEffect, useState } from 'react';
import { listEmployees, listSectors, setSupervisedAreas } from '../api';
import { esGerente } from '../areas';
import InfoNotes, { InfoToggle } from './InfoNotes';
import SupervisorDiagnosticModal from './SupervisorDiagnosticModal';
import SupervisorSimulationsModal from './SupervisorSimulationsModal';

const FILTROS = [
  ['todos', 'Todos'],
  ['supervisores', 'Supervisores'],
  ['empleados', 'Empleados'],
  ['baja', 'Dados de baja'],
];

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
  const [simulationEmployee, setSimulationEmployee] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState('todos');
  const [mostrarInfo, setMostrarInfo] = useState(false);

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

  const conteos = {
    todos: employees.length,
    supervisores: employees.filter((e) => e.role === 'SUPERVISOR').length,
    empleados: employees.filter((e) => e.role !== 'SUPERVISOR').length,
    baja: employees.filter((e) => !e.isActive).length,
  };
  const visibles = employees.filter((e) => {
    if (filtro === 'supervisores') return e.role === 'SUPERVISOR';
    if (filtro === 'empleados') return e.role !== 'SUPERVISOR';
    if (filtro === 'baja') return !e.isActive;
    return true;
  });

  return (
    <div className="knowledge-page employees-page">
      <section className="knowledge-hero">
        <div className="knowledge-hero-layout">
          <div>
            <span className="knowledge-hero-kicker">Equipo y responsabilidades</span>
            <h2 className="knowledge-hero-title">Empleados y áreas</h2>
            <p className="knowledge-hero-description">
              Asigná de qué áreas es responsable cada supervisor y seguí el diagnóstico y las
              simulaciones de cada persona del equipo.
            </p>
          </div>
          <div className="employees-hero-stats">
            <div>
              <strong>{conteos.todos}</strong>
              <span>personas</span>
            </div>
            <div>
              <strong>{sectors.length}</strong>
              <span>áreas</span>
            </div>
          </div>
        </div>
      </section>

      <div className="submenu-bar">
        <nav className="submenu-pills" aria-label="Filtrar empleados">
          {FILTROS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`submenu-pill${filtro === id ? ' active' : ''}`}
              aria-current={filtro === id ? 'page' : undefined}
              onClick={() => setFiltro(id)}
            >
              {label} <span className="employees-tab-count">{conteos[id]}</span>
            </button>
          ))}
        </nav>
        <div className="info-bar-actions">
          <InfoToggle open={mostrarInfo} onToggle={() => setMostrarInfo((v) => !v)} />
          <button type="button" className="btn-pill-action" onClick={load} disabled={loading}>
            <span>🔄</span>
            <span>{loading ? 'Cargando…' : 'Refrescar'}</span>
          </button>
        </div>
      </div>

      {mostrarInfo && (
        <InfoNotes
          title="Empleados y áreas"
          onClose={() => setMostrarInfo(false)}
          notes={[
            ['Sector y áreas.', <>
              El <strong>sector</strong> es dónde trabaja la persona. Las{' '}
              <strong>áreas</strong> son de qué es responsable, y es lo que decide qué
              conocimiento puede modificar y cómo la trata el asistente.
            </>],
            ['Son dos cosas distintas.',
              'Alguien puede trabajar en Cobranzas y ser responsable de Depósito y Logística.'],
            ['Gerente.', <>
              No hay ninguna casilla de “gerente”, y no falta: se es gerente al ser
              responsable de <strong>todas</strong> las áreas. Marcar las{' '}
              {sectors.length || '…'} equivale a serlo.
            </>],
          ]}
        />
      )}

      {error && <p className="error">{error}</p>}

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

      <section className="knowledge-panel">
        <header className="knowledge-panel-heading">
          <div>
            <span className="knowledge-kicker">Equipo</span>
            <h3>Personas y responsabilidades</h3>
          </div>
          <span className="knowledge-panel-count">{visibles.length} de {employees.length}</span>
        </header>

        {loading && employees.length === 0 ? (
          <p className="knowledge-empty">Cargando empleados…</p>
        ) : (
          <div className={`knowledge-table-wrap${loading ? ' is-loading' : ''}`}>
            <table className="knowledge-table employees-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Rol</th>
                  <th>Trabaja en</th>
                  <th>Responsable de</th>
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr className="knowledge-table-empty">
                    <td colSpan={5}>No hay personas en esta vista.</td>
                  </tr>
                )}
                {visibles.map((e) => {
                  const areas = e.areasSupervisadas ?? [];
                  const gerente = esGerente(areas, sectors.length);
                  return (
                    <tr key={e.id} className={e.isActive ? undefined : 'is-inactive'}>
                      <td className="knowledge-doc-cell">
                        <div className="employees-person">
                          <span className="employees-avatar" aria-hidden="true">{iniciales(e.name)}</span>
                          <div>
                            <strong className="knowledge-doc-title">{e.name}</strong>
                            <span className="knowledge-doc-summary">{e.email}</span>
                            {!e.isActive && <span className="knowledge-readonly">Dado de baja</span>}
                          </div>
                        </div>
                      </td>
                      <td data-label="Rol">
                        <span className={`badge ${e.role === 'SUPERVISOR' ? 'status-info' : 'status-idle'}`}>
                          {e.role}
                        </span>
                      </td>
                      <td data-label="Trabaja en">
                        <span className="knowledge-area">{e.sector?.name ?? '—'}</span>
                      </td>
                      <td data-label="Responsable de" className="employees-areas-cell">
                        {/* Que se vea de un vistazo quién quedó con todas: es la
                            comprobación más rápida de que el dueño está bien cargado. */}
                        {gerente ? (
                          <span className="badge status-active" title="Responsable de todas las áreas">
                            Gerente · todas las áreas
                          </span>
                        ) : (
                          <div className="employees-area-chips">
                            {areas.length === 0 && <span className="knowledge-usage is-empty">ninguna</span>}
                            {areas.map((a) => (
                              <span key={a.id} className="employees-area-chip">{a.name}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="knowledge-row-action">
                        <div className="employees-actions">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setDiagnosticEmployee({ id: e.id, name: e.name })}
                            title="Ver y gestionar evaluación diagnóstica"
                          >
                            🎯 Diagnóstico
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setSimulationEmployee({ id: e.id, name: e.name })}
                            title="Ver historial de simulaciones y devoluciones pedagógicas"
                          >
                            🎭 Simulaciones
                          </button>
                          {e.role === 'SUPERVISOR' && (
                            <button type="button" className="secondary" onClick={() => setEditando(e)}>
                              Cambiar áreas
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {diagnosticEmployee && (
        <SupervisorDiagnosticModal
          token={token}
          employeeId={diagnosticEmployee.id}
          employeeName={diagnosticEmployee.name}
          onClose={() => setDiagnosticEmployee(null)}
        />
      )}
      {simulationEmployee && (
        <SupervisorSimulationsModal
          token={token}
          employeeId={simulationEmployee.id}
          employeeName={simulationEmployee.name}
          onClose={() => setSimulationEmployee(null)}
        />
      )}
    </div>
  );
}

function iniciales(nombre = '') {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
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
    <section className="knowledge-panel employees-assign">
      <header className="knowledge-panel-heading">
        <div>
          <span className="knowledge-kicker">Asignar responsabilidades</span>
          <h3>Áreas de {empleado.name}</h3>
        </div>
        <span className="knowledge-panel-count">{seleccion.size} de {sectors.length}</span>
      </header>

      <div className="employees-area-grid">
        {sectors.map((s) => (
          <label
            key={s.id}
            className={`employees-area-option${seleccion.has(s.id) ? ' is-selected' : ''}`}
          >
            <input
              type="checkbox"
              checked={seleccion.has(s.id)}
              onChange={() => toggle(s.id)}
            />
            <span>
              <strong>{s.name}</strong>
              <small>Agente {s.agentType ?? 'ninguno'}</small>
            </span>
          </label>
        ))}
      </div>

      {quedaGerente && (
        <p className="success-msg employees-assign-message">
          Con todas las áreas marcadas, el sistema lo trata como <strong>gerente</strong>:
          el asistente le habla como al dueño y puede modificar los documentos
          transversales.
        </p>
      )}
      {seleccion.size === 0 && (
        <p className="knowledge-note employees-assign-message">
          Sin ninguna área no va a poder modificar ningún documento. Es un estado
          válido —recién asignado, por ejemplo—, no un error.
        </p>
      )}

      {error && <p className="error employees-assign-message">{error}</p>}

      <div className="knowledge-form-actions">
        <button type="button" className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="knowledge-primary-button" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar áreas'}
        </button>
      </div>
    </section>
  );
}
