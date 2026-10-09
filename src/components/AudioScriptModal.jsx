import { useEffect, useState } from 'react';
import {
  enqueueAudioGeneration,
  generatePillAudioScript,
  getPillAudioScript,
  updatePillAudioScript,
} from '../api';

export default function AudioScriptModal({ token, pill, onClose, onScriptUpdated }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [dialogue, setDialogue] = useState([]);
  const [estimatedDurationSeconds, setEstimatedDurationSeconds] = useState(180);

  const loadScript = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPillAudioScript(token, pill.id);
      if (data && Array.isArray(data.dialogue)) {
        setDialogue(data.dialogue);
        if (data.estimatedDurationSeconds) {
          setEstimatedDurationSeconds(data.estimatedDurationSeconds);
        }
      } else {
        setDialogue([]);
      }
    } catch (err) {
      // Si 404, significa que todavía no se generó guion
      if (err.status === 404 || err.message?.includes('404')) {
        setDialogue([]);
      } else {
        setError(err.message || 'Error al cargar guion de audio');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScript();
  }, [pill.id]);

  const handleGenerateAIScript = async () => {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const targetSec = Number(estimatedDurationSeconds) || 90;
      const result = await generatePillAudioScript(token, pill.id, targetSec);
      setDialogue(result.dialogue || []);
      setEstimatedDurationSeconds(result.estimatedDurationSeconds || targetSec);
      setNotice(
        `✓ Guion a 2 voces generado exitosamente con IA en base a la base de conocimiento (${result.dialogue?.length || 0} intervenciones, ~${result.estimatedDurationSeconds || targetSec}s).`,
      );
      if (onScriptUpdated) onScriptUpdated();
    } catch (err) {
      setError(err.message || 'Error al generar guion con IA');
    } finally {
      setGenerating(false);
    }
  };

  const handleLineChange = (index, field, value) => {
    const updated = [...dialogue];
    updated[index] = { ...updated[index], [field]: value };
    setDialogue(updated);
  };

  const handleAddLine = () => {
    const lastSpeaker = dialogue.length > 0 ? dialogue[dialogue.length - 1].speaker : 'SPEAKER_2';
    const nextSpeaker = lastSpeaker === 'SPEAKER_1' ? 'SPEAKER_2' : 'SPEAKER_1';
    setDialogue([...dialogue, { speaker: nextSpeaker, text: '' }]);
  };

  const handleRemoveLine = (index) => {
    const updated = dialogue.filter((_, idx) => idx !== index);
    setDialogue(updated);
  };

  const handleSave = async () => {
    if (dialogue.length === 0) {
      alert('El guion debe tener al menos una línea de diálogo.');
      return;
    }
    const emptyLine = dialogue.some((d) => !d.text.trim());
    if (emptyLine) {
      alert('Todas las líneas de diálogo deben tener texto.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updatePillAudioScript(token, pill.id, {
        dialogue,
        estimatedDurationSeconds: Number(estimatedDurationSeconds) || 180,
      });
      setDialogue(updated.dialogue);
      setNotice('Guion guardado correctamente.');
      if (onScriptUpdated) onScriptUpdated();
    } catch (err) {
      setError(err.message || 'Error al guardar guion');
    } finally {
      setSaving(false);
    }
  };

  const handleSynthesize = async () => {
    if (dialogue.length === 0) {
      alert('Debes generar o agregar un guion antes de sintetizar audio.');
      return;
    }
    if (!window.confirm('¿Deseas enviar este guion a la cola de síntesis TTS (BullMQ)?')) {
      return;
    }

    setSynthesizing(true);
    setError(null);
    setNotice(null);
    try {
      await enqueueAudioGeneration(token, pill.id);
      setNotice('¡Síntesis de voz encolada con éxito! El audio estará listo en unos momentos.');
      if (onScriptUpdated) onScriptUpdated();
    } catch (err) {
      setError(err.message || 'Error al iniciar síntesis de audio');
    } finally {
      setSynthesizing(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 840, maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>🎙️ Guion a 2 Voces y Síntesis TTS</h3>
            <p className="hint" style={{ margin: 0 }}>
              Píldora: <strong>{pill.title}</strong>
            </p>
          </div>
          <button className="secondary" onClick={onClose} style={{ padding: '4px 10px' }}>
            ✕
          </button>
        </div>

        {notice && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--success-bg)',
              color: 'var(--success)',
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            ✓ {notice}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', padding: 40 }}>Cargando guion estructurado...</p>
        ) : (
          <div>
            {/* Barra de Acciones Superior */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                padding: '12px 16px',
                backgroundColor: 'var(--bg)',
                borderRadius: 8,
                marginBottom: 18,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  onClick={handleGenerateAIScript}
                  disabled={generating || saving || synthesizing}
                  style={{
                    backgroundColor: '#4f46e5',
                    color: '#fff',
                    padding: '8px 14px',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                  }}
                  title="Consulta la base de conocimiento de Credimisión y redacta un diálogo pedagógico a 2 voces calibrado para el tiempo seleccionado"
                >
                  {generating ? '✨ Generando Guion con IA...' : '✨ Generar Guion con IA'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Tiempo objetivo:</span>
                  <input
                    type="number"
                    min="30"
                    max="600"
                    step="15"
                    value={estimatedDurationSeconds}
                    onChange={(e) => setEstimatedDurationSeconds(e.target.value)}
                    style={{ width: 68, padding: '4px 6px', fontSize: 12, textAlign: 'center' }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>seg ({Math.round((estimatedDurationSeconds / 60) * 10) / 10} min)</span>
                </div>

                <div style={{ display: 'flex', gap: 4 }}>
                  {[60, 90, 120, 180].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setEstimatedDurationSeconds(sec)}
                      className="secondary"
                      style={{
                        padding: '3px 8px',
                        fontSize: 11,
                        backgroundColor: Number(estimatedDurationSeconds) === sec ? '#e0e7ff' : undefined,
                        borderColor: Number(estimatedDurationSeconds) === sec ? '#6366f1' : undefined,
                        color: Number(estimatedDurationSeconds) === sec ? '#4338ca' : undefined,
                        fontWeight: Number(estimatedDurationSeconds) === sec ? 700 : 400,
                      }}
                    >
                      {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="hint" style={{ fontSize: 12 }}>
                  {dialogue.length} turnos
                </span>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || generating || dialogue.length === 0}
                  className="secondary"
                  style={{ padding: '8px 14px', fontSize: 13 }}
                >
                  {saving ? 'Guardando...' : '💾 Guardar Guion'}
                </button>
                <button
                  type="button"
                  onClick={handleSynthesize}
                  disabled={synthesizing || saving || generating || dialogue.length === 0}
                  style={{
                    backgroundColor: 'var(--success)',
                    color: '#fff',
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {synthesizing ? 'Encolando...' : '🎧 Sintetizar Audio (TTS)'}
                </button>
              </div>
            </div>

            {/* Listado de Intervenciones */}
            {dialogue.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px 20px',
                  backgroundColor: 'var(--bg)',
                  borderRadius: 8,
                  border: '1px dashed var(--border)',
                }}
              >
                <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 14 }}>
                  Esta píldora aún no tiene un guion de podcast generado.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 13 }}>Duración solicitada para el audio:</span>
                  {[60, 90, 120, 180].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setEstimatedDurationSeconds(sec)}
                      style={{
                        padding: '5px 12px',
                        fontSize: 12,
                        backgroundColor: Number(estimatedDurationSeconds) === sec ? '#4f46e5' : '#f3f4f6',
                        color: Number(estimatedDurationSeconds) === sec ? '#fff' : '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontWeight: Number(estimatedDurationSeconds) === sec ? 700 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {sec / 60} min ({sec}s)
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAIScript}
                  disabled={generating}
                  style={{ backgroundColor: '#4f46e5', color: '#fff', padding: '10px 20px', fontSize: 14, fontWeight: 600 }}
                >
                  {generating ? '✨ Consultando Base de Conocimiento y Generando...' : `✨ Generar Guion con IA (~${estimatedDurationSeconds} seg)`}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {dialogue.map((line, idx) => {
                  const isSpk1 = line.speaker === 'SPEAKER_1';
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        backgroundColor: isSpk1 ? 'rgba(79, 70, 229, 0.04)' : 'rgba(16, 185, 129, 0.04)',
                        borderLeftWidth: 4,
                        borderLeftColor: isSpk1 ? '#4f46e5' : '#10b981',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              padding: '2px 8px',
                              borderRadius: 4,
                              backgroundColor: isSpk1 ? '#4f46e5' : '#10b981',
                              color: '#fff',
                            }}
                          >
                            {isSpk1 ? 'Voz 1 (Principal)' : 'Voz 2 (Co-locutor)'}
                          </span>
                          <select
                            value={line.speaker}
                            onChange={(e) => handleLineChange(idx, 'speaker', e.target.value)}
                            style={{ fontSize: 12, padding: '2px 6px' }}
                          >
                            <option value="SPEAKER_1">SPEAKER_1</option>
                            <option value="SPEAKER_2">SPEAKER_2</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="secondary"
                          title="Eliminar intervención"
                          style={{
                            padding: '2px 8px',
                            fontSize: 11,
                            color: '#dc2626',
                            borderColor: '#fca5a5',
                          }}
                        >
                          ✕ Quitar
                        </button>
                      </div>

                      <textarea
                        rows={2}
                        value={line.text}
                        onChange={(e) => handleLineChange(idx, 'text', e.target.value)}
                        placeholder="Escribe el parlamento aquí..."
                        style={{
                          width: '100%',
                          fontSize: 13,
                          lineHeight: 1.5,
                          fontFamily: 'inherit',
                          padding: '8px 10px',
                          borderRadius: 4,
                          border: '1px solid var(--border)',
                        }}
                      />
                    </div>
                  );
                })}

                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="secondary"
                    style={{ fontSize: 13, padding: '6px 14px' }}
                  >
                    + Agregar Intervención
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: 'right', marginTop: 24, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <button className="secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
