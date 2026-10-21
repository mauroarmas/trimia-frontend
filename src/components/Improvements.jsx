import { useEffect, useState } from 'react';
import {
  getImprovements,
  refreshImprovements,
  dismissImprovement,
  getEmployee,
  listSectors,
} from '../api';

const POLL_MS = 4000;

/** De dónde salió el ítem, en términos que se entienden sin conocer el sistema. */
const FUENTE = {
  CONSULTA_FALLIDA: { label: 'Alguien preguntó y no supo contestar', color: '#09b4aa' },
  ESCALADO: { label: 'Caso que pasó a una persona', color: '#288fd9' },
  DOCUMENTO_INCONCLUSO: { label: 'Documento incompleto', color: '#0369a1' },
};

/**
 * Los tres avisos NO son intercambiables aunque los tres traigan `items: []`.
 * "Nunca se revisó" y "se revisó y está bien" piden acciones distintas, y
 * ofrecer revisar un área sin documentos es mentir. La UI los aplasta en "no
 * hay nada" si nadie lo cuida.
 */
const NOTICE = {
  SIN_REVISAR: {
    texto: 'Todavía no se actualizó esta área. Dale a "Actualizar" para ver qué hay para mejorar.',
    ofreceActualizar: true,
  },
  TODO_CUBIERTO: {
    texto: 'Se revisó y no quedó nada pendiente: ni consultas sin responder, ni casos escalados, ni documentos incompletos.',
    ofreceActualizar: true,
  },
  SIN_DOCUMENTOS: {
    texto: 'Esta área no tiene ningún documento cargado, así que no hay nada que revisar todavía.',
    ofreceActualizar: false,
  },
};

/**
 * "Una sola pantalla para mejorar el conocimiento" (spec 011).
 *
 * Reemplaza a la pestaña "¿Qué me falta?" (spec 009) y es la puerta de entrada
 * de la entrevista (spec 010): antes eran dos pantallas para un solo trabajo —
 * la primera decía qué estaba flojo y la segunda lo arreglaba.
 *
 * Se elige área primero, como en la entrevista y como en el prototipo.
 */
export default function Improvements({ token, me, onEntrevistar, onRetomar }) {
  const [misAreas, setMisAreas] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [sectorId, setSectorId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    if (!me) return undefined;
    let vigente = true;
    Promise.all([getEmployee(token, me.id), listSectors(token)])
      .then(([empleado, secs]) => {
        if (!vigente) return;
        setMisAreas(empleado.areasSupervisadas ?? []);
        setSectors(secs);
      })
      .catch((err) => setError(err.message));
    return () => { vigente = false; };
  }, [token, me]);

  async function cargar(id) {
    setError('');
    setLoading(true);
    try {
      const res = await getImprovements(token, id);
      setData(res);
      return res;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  // Encuesta SOLO mientras algún análisis corre — mismo criterio que la
  // entrevista. Preguntar en bucle cuando no hay nada trabajando es ruido.
  useEffect(() => {
    if (!sectorId || !data?.refreshing) return undefined;
    const id = setInterval(() => { cargar(sectorId); }, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorId, data?.refreshing]);

  async function handleActualizar() {
    setError('');
    setAviso('');
    setRefreshing(true);
    try {
      const res = await refreshImprovements(token, sectorId);
      const enganchado = res.coverage?.reused || res.documents?.reused;
      setAviso(
        enganchado
          ? 'Ya había un análisis corriendo: nos enganchamos a ese en vez de arrancar otro.'
          : 'Analizando. La primera vez de un área tarda unos minutos; las siguientes son casi instantáneas.',
      );
      await cargar(sectorId);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDescartar(item) {
    const note = window.prompt(`¿Por qué está bien así?\n\n${item.title}`, '');
    if (note === null) return;
    setError('');
    try {
      await dismissImprovement(token, item.id, note || undefined);
      setData((prev) => ({
        ...prev,
        items: prev.items.filter((i) => i.id !== item.id),
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (misAreas === null) return <p className="hint">Cargando…</p>;

  // Rol y área son dos gates distintos: acá se elige entre las áreas de las
  // que la persona es responsable, y el backend lo verifica igual.
  const misSectores = sectors.filter(
    (s) => s.agentType && misAreas.some((a) => a.id === s.id),
  );

  if (!sectorId) {
    return (
      <div className="card">
        <h3>Mejorar el conocimiento</h3>
        <p className="hint" style={{ margin: '0 0 12px' }}>
          Todo lo que le falta al asistente en un área, en una sola lista: lo que
          le preguntaron y no supo contestar, los casos que terminaron en una
          persona, y los documentos que quedaron incompletos. Cada cosa se
          arregla con una entrevista.
        </p>
        {error && <p className="error">{error}</p>}
        {misSectores.length === 0 && (
          <p className="hint">No sos responsable de ningún área con agente asociado.</p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {misSectores.map((s) => (
            <button key={s.id} onClick={() => { setSectorId(s.id); cargar(s.id); }}>
              {s.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const nombreArea = data?.sector?.name
    ?? sectors.find((s) => s.id === sectorId)?.name
    ?? '…';
  const notice = data?.notice ? NOTICE[data.notice.code] : null;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <h3 style={{ margin: 0 }}>Mejorar el conocimiento — {nombreArea}</h3>
        <button
          className="secondary"
          onClick={() => { setSectorId(null); setData(null); setAviso(''); }}
        >
          Elegir otra área
        </button>
      </div>

      <Resumen data={data} onActualizar={handleActualizar} refreshing={refreshing} />

      {aviso && <p className="hint" style={{ marginTop: 8 }}>{aviso}</p>}
      {error && <p className="error">{error}</p>}

      {loading && !data && <p className="hint">Cargando…</p>}

      {/* ⚠️ Sin esto, una entrevista con fichas esperando aprobación queda
          inalcanzable: la lista se vacía apenas se abre (los ítems pasan a
          "ya entrevistado") y desde que se retiró la pestaña "Entrevista"
          esta pantalla es la única puerta. */}
      {data?.openSession && (
        <div
          style={{
            marginTop: 12, padding: 12, borderRadius: 6,
            background: '#fffbeb', border: '1px solid #4dfcf2',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}
        >
          <span className="hint" style={{ margin: 0 }}>
            {data.openSession.status === 'EN_REVISION'
              ? 'Tenés una entrevista con fichas esperando que las apruebes.'
              : 'Tenés una entrevista de esta área sin terminar.'}
          </span>
          <button onClick={() => onRetomar?.(sectorId)}>Retomar</button>
        </div>
      )}

      {notice && (
        <div className="hint" style={{ marginTop: 12, padding: 12, background: '#f8fafc', borderRadius: 6 }}>
          {notice.texto}
        </div>
      )}

      {data?.items?.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onEntrevistar={() => onEntrevistar?.(sectorId, item.id)}
              onDescartar={() => handleDescartar(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * El resumen de UNA línea: cuándo fue y cuánto se miró. Nada más de medición —
 * el detalle de la corrida no es lo que esta pantalla viene a resolver.
 */
function Resumen({ data, onActualizar, refreshing }) {
  const puedeActualizar =
    data?.notice?.code !== 'SIN_DOCUMENTOS' && !data?.refreshing && !refreshing;

  return (
    <div
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 12, marginTop: 10, flexWrap: 'wrap',
      }}
    >
      <span className="hint">
        {data?.refreshing
          ? '⏳ Analizando… (la primera vez de un área tarda unos minutos)'
          : data?.lastRefresh
            ? `Última actualización: ${new Date(data.lastRefresh.at).toLocaleString()} · ` +
              `${data.lastRefresh.documentsAnalyzed} documento(s) revisado(s), ` +
              `${data.lastRefresh.documentsSkipped} sin cambios`
            : 'Sin actualizaciones todavía.'}
      </span>
      <button onClick={onActualizar} disabled={!puedeActualizar}>
        {data?.refreshing || refreshing ? 'Analizando…' : 'Actualizar'}
      </button>
    </div>
  );
}

function ItemCard({ item, onEntrevistar, onDescartar }) {
  const fuente = FUENTE[item.source] ?? { label: item.source, color: '#475569' };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '.03em', color: fuente.color,
          }}
        >
          {fuente.label}
        </span>
        {/* ⚠️ `severity` SOLO viene en DOCUMENTO_INCONCLUSO y no es comparable
            con la evidencia de las otras dos fuentes: no se pinta como si
            midiera lo mismo. */}
        {item.source === 'DOCUMENTO_INCONCLUSO' && item.severity != null && (
          <span className="hint" style={{ fontSize: 11 }}>
            gravedad {item.severity}/100
          </span>
        )}
      </div>

      <p style={{ margin: '6px 0 4px', fontWeight: 600 }}>{item.title}</p>
      <p className="hint" style={{ margin: 0 }}>{item.evidence}</p>

      {item.quotes?.length > 0 && (
        <ul className="hint" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {item.quotes.map((q, i) => <li key={i}>«{q}»</li>)}
        </ul>
      )}

      {item.unansweredQuestions?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <span className="hint">Lo que este documento deja sin responder:</span>
          <ul className="hint" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {item.unansweredQuestions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {/* Un ítem se VE aunque no se pueda tocar — ver no es editar. Los dos
            permisos los resuelve el backend por área; acá no se recalculan. */}
        <button onClick={onEntrevistar} disabled={!item.canInterview}>
          Entrevistarme sobre esto
        </button>
        <button className="secondary" onClick={onDescartar} disabled={!item.canDismiss}>
          Está bien así
        </button>
        {!item.canInterview && !item.canDismiss && (
          <span className="hint" style={{ alignSelf: 'center' }}>
            No sos responsable de esta área.
          </span>
        )}
      </div>
    </div>
  );
}
