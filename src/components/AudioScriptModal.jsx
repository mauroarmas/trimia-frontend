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
  const [estimatedDurationSeconds, setEstimatedDurationSeconds] = useState(96);

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

  const durationPresets = [
    { label: '1m', seconds: 60 },
    { label: '1.5m', seconds: 90 },
    { label: '2m', seconds: 120 },
    { label: '3m', seconds: 180 },
  ];

  return (
    <div className="modal-overlay audio-script-overlay">
      <section className="audio-script-modal" aria-label="Editor de guion y audio">
        <header className="audio-script-header">
          <div>
            <span className="audio-script-kicker">Guion &amp; Audio</span>
            <h2>Guion a 2 Voces y Síntesis TTS</h2>
            <p>Píldora: {pill.title}</p>
          </div>
          <button type="button" className="audio-script-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="audio-script-workspace">
          <aside className="audio-script-sidebar">
            <span className="audio-script-section-label">Configuración</span>
            <h3>Producción de audio</h3>

            <label className="audio-script-duration-label" htmlFor="audio-script-duration">
              <span aria-hidden="true">◷</span> Tiempo objetivo
            </label>
            <div className="audio-script-duration-input">
              <input
                id="audio-script-duration"
                type="number"
                min="30"
                max="600"
                step="1"
                value={estimatedDurationSeconds}
                onChange={(e) => setEstimatedDurationSeconds(e.target.value)}
              />
              <span>segundos</span>
            </div>
            <p className="audio-script-duration-hint">
              {estimatedDurationSeconds} segundos /{' '}
              {Math.round((Number(estimatedDurationSeconds) / 60) * 10) / 10} minutos
            </p>
            <div className="audio-script-presets" aria-label="Duraciones sugeridas">
              {durationPresets.map(({ label, seconds }) => (
                <button
                  key={seconds}
                  type="button"
                  className={Number(estimatedDurationSeconds) === seconds ? 'is-selected' : ''}
                  onClick={() => setEstimatedDurationSeconds(seconds)}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="audio-script-generate"
              onClick={handleGenerateAIScript}
              disabled={generating || saving || synthesizing}
              title="Consulta la base de conocimiento y genera un diálogo calibrado para el tiempo seleccionado"
            >
              <span aria-hidden="true">✣</span>
              {generating ? 'Generando guion...' : 'Generar Guion con IA'}
            </button>

            <div className="audio-script-sidebar-divider" />
            <h4>Voces del guion</h4>
            <div className="audio-script-voice">
              <strong>Voz 1 · Principal</strong>
              <span>SPEAKER_1</span>
            </div>
            <div className="audio-script-voice is-secondary">
              <strong>Voz 2 · Co-locutor</strong>
              <span>SPEAKER_2</span>
            </div>
            <div className="audio-script-tip">
              <strong>Del guion a la voz</strong>
              <p>Revisa las intervenciones, guarda el guion y luego sintetiza el audio.</p>
            </div>
          </aside>

          <main className="audio-script-main">
            <div className="audio-script-main-heading">
              <div>
                <h3>Guion editable</h3>
                <p>Inicio del desplazamiento</p>
              </div>
              <span>{dialogue.length} turnos</span>
            </div>

            {notice && <div className="audio-script-message is-success">✓ {notice}</div>}
            {error && <div className="audio-script-message is-error">⚠️ {error}</div>}

            {loading ? (
              <p className="audio-script-loading">Cargando guion estructurado...</p>
            ) : dialogue.length === 0 ? (
              <div className="audio-script-empty">
                <p>Esta píldora aún no tiene un guion generado.</p>
                <span>Elige un tiempo objetivo y genera un guion con IA para empezar.</span>
              </div>
            ) : (
              <div className="audio-script-lines">
                {dialogue.map((line, idx) => {
                  const isSpk1 = line.speaker === 'SPEAKER_1';
                  return (
                    <article className={`audio-script-line ${isSpk1 ? 'is-primary' : 'is-secondary'}`} key={idx}>
                      <div className="audio-script-line-heading">
                        <span className="audio-script-line-number">{String(idx + 1).padStart(2, '0')}</span>
                        <span className="audio-script-speaker-badge">
                          {isSpk1 ? 'Voz 1 (Principal)' : 'Voz 2 (Co-locutor)'}
                        </span>
                        <select
                          aria-label={`Voz de la intervención ${idx + 1}`}
                          value={line.speaker}
                          onChange={(e) => handleLineChange(idx, 'speaker', e.target.value)}
                        >
                          <option value="SPEAKER_1">SPEAKER_1</option>
                          <option value="SPEAKER_2">SPEAKER_2</option>
                        </select>
                        <button
                          type="button"
                          className="audio-script-remove"
                          onClick={() => handleRemoveLine(idx)}
                          title="Eliminar intervención"
                        >
                          <span aria-hidden="true">▤</span> Quitar
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        aria-label={`Texto de la intervención ${idx + 1}`}
                        value={line.text}
                        onChange={(e) => handleLineChange(idx, 'text', e.target.value)}
                        placeholder="Escribe el parlamento aquí..."
                      />
                    </article>
                  );
                })}
                <button type="button" className="audio-script-add-line" onClick={handleAddLine}>
                  + Agregar intervención
                </button>
                <p className="audio-script-scroll-hint">El guion continúa al desplazarse.</p>
              </div>
            )}
          </main>
        </div>

        <footer className="audio-script-footer">
          <button type="button" className="audio-script-footer-close" onClick={onClose}>
            Cerrar
          </button>
          <div className="audio-script-footer-actions">
            <button
              type="button"
              className="audio-script-save"
              onClick={handleSave}
              disabled={saving || generating || loading || dialogue.length === 0}
            >
              {saving ? 'Guardando...' : '▣ Guardar Guion'}
            </button>
            <button
              type="button"
              className="audio-script-synthesize"
              onClick={handleSynthesize}
              disabled={synthesizing || saving || generating || loading || dialogue.length === 0}
            >
              {synthesizing ? 'Encolando...' : '◖ Sintetizar Audio (TTS)'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
