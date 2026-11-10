import { useEffect, useMemo, useRef, useState } from 'react';
import {
  askPillDoubt,
  getAudioStreamUrl,
  getEmployeePill,
  getPillAudioScript,
  reportPlaybackProgress,
} from '../api';
import Trimi from './Trimi';
import TrainingIcon from './TrainingIcon';

/**
 * Lección estructurada en 3 etapas (Captura 4):
 * 1. Escuchar (Píldora de audio con Trimi, transcripción resaltada, puntos clave y RAG)
 * 2. Practicar (Práctica guiada con pistas de Trimi)
 * 3. Demostrar (Simulación libre con cliente simulado)
 */
export default function LessonStudyModal({
  token,
  pillId,
  pillData,
  areaName = 'Ventas',
  paradaNumber = 1,
  onClose,
  onStartSimulation,
  onProgressUpdated,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pill, setPill] = useState(null);

  // Etapa actual: 1 ('ESCUCHAR') | 2 ('PRACTICAR') | 3 ('DEMOSTRAR')
  const [activeStep, setActiveStep] = useState(1);

  // Audio / Reproductor
  const audioRef = useRef(null);
  const activeLineRef = useRef(null);
  const subtitlesContainerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTrimiSpeaking, setIsTrimiSpeaking] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [scriptDialogue, setScriptDialogue] = useState([]);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState(0);
  const [hasCompletedListening, setHasCompletedListening] = useState(false);

  // RAG: "¿Dudas? Preguntale a Trimi"
  const [doubtQuestion, setDoubtQuestion] = useState('');
  const [doubtAnswer, setDoubtAnswer] = useState(null);
  const [askingDoubt, setAskingDoubt] = useState(false);

  const speechIndexRef = useRef(0);
  const isSpeechActiveRef = useRef(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const [voiceTone, setVoiceTone] = useState('natural'); // 'natural' | 'calido' | 'suave' | 'dinamico'

  // Cargar lista de voces disponibles en el navegador
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        setVoices(v);
        // Excluir voces de España (es-ES) para evitar ceceo / acento peninsular
        const spVoices = v.filter((item) => {
          if (!item.lang || !item.lang.toLowerCase().startsWith('es')) return false;
          const lang = item.lang.toLowerCase();
          const name = (item.name || '').toLowerCase();
          return !lang.includes('es-es') && !lang.includes('es_es') && !name.includes('spain') && !name.includes('españa');
        });
        const fallbackSpVoices = spVoices.length > 0 ? spVoices : v.filter((item) => item.lang && item.lang.toLowerCase().startsWith('es'));
        if (fallbackSpVoices.length > 0 && !selectedVoiceName) {
          // Preferir voz femenina del Cono Sur (Uruguay / Chile / Argentina) evitando acentos caribeños/colombianos/venezolanos
          const isSouthernConeFemale = (item) => {
            const n = (item.name || '').toLowerCase();
            const l = (item.lang || '').toLowerCase();
            // Excluir voces de Colombia, Venezuela, México, Caribe
            if (l.includes('co') || l.includes('ve') || l.includes('mx') || l.includes('pr') || l.includes('do') || n.includes('salome') || n.includes('paola') || n.includes('dalia') || n.includes('sabina')) {
              return false;
            }
            return (
              n.includes('valentina') || // es-UY (rioplatense suave, no porteña exagerada)
              n.includes('catalina') ||  // es-CL (cono sur suave)
              n.includes('elena') ||     // es-AR (argentina)
              n.includes('tania') ||     // es-PY
              n.includes('sofia') ||     // es-BO
              n.includes('camila') ||
              (l.includes('es-uy') || l.includes('es-ar') || l.includes('es-cl'))
            );
          };
          const preferred =
            // 1° Valentina (es-UY) o Catalina (es-CL) Natural: suenan rioplatense/cono sur súper natural sin ser porteñas exageradas
            fallbackSpVoices.find((item) => isSouthernConeFemale(item) && ((item.name || '').toLowerCase().includes('valentina') || (item.lang || '').toLowerCase().includes('es-uy'))) ||
            fallbackSpVoices.find((item) => isSouthernConeFemale(item) && (item.name || '').toLowerCase().includes('natural')) ||
            fallbackSpVoices.find((item) => isSouthernConeFemale(item)) ||
            fallbackSpVoices.find((item) => (item.lang || '').toLowerCase().includes('es-ar')) ||
            fallbackSpVoices[0];
          if (preferred) setSelectedVoiceName(preferred.name);
        }
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [selectedVoiceName]);

  // Cargar información de la lección y del guion de audio estructurado
  useEffect(() => {
    let isMounted = true;
    const fetchPillData = async () => {
      setLoading(true);
      setError(null);

      const applyDemoPillData = () => {
        setPill({
          id: 'demo-pill-1',
          title: 'Recopilación de datos para concretar una venta',
          objective: 'a registrar los datos obligatorios del cliente y de la Nota de Pedido',
          audioDurationSeconds: 83, // 1:23
          hasAudio: false,
        });
        setScriptDialogue([
          { speaker: 'SPEAKER_2', text: '¿Y la carga se hace en papel o digital?' },
          { speaker: 'SPEAKER_1', text: 'Nada de papel. Todo se ingresa digitalmente.' },
          { speaker: 'SPEAKER_1', text: 'Y para el canal de carga: Ecommerce usa Paljet y los vendedores de calle el formulario de Google Forms.' },
          { speaker: 'SPEAKER_2', text: 'Buenísimo. Así la carga sale sin demoras en Credimisión.' },
        ]);
        setDuration(83);
        setCurrentTime(48);
        setActiveParagraphIndex(2);
      };

      if (!pillId || pillId === 'demo-pill-1' || pillId?.startsWith('demo-')) {
        applyDemoPillData();
        setLoading(false);
        return;
      }

      try {
        const p = await getEmployeePill(token, pillId);
        if (!isMounted) return;
        setPill(p);
        if (p.audioDurationSeconds) {
          setDuration(p.audioDurationSeconds);
        }

        try {
          const script = await getPillAudioScript(token, pillId);
          if (isMounted && script?.dialogue && script.dialogue.length > 0) {
            setScriptDialogue(script.dialogue);
            if (script.estimatedDurationSeconds) {
              setDuration(script.estimatedDurationSeconds);
            }
          }
        } catch {
          // Si no hay guion estructurado, derivar del contenido
          if (p.content) {
            const rawParts = p.content.split('\n\n').filter(Boolean);
            setScriptDialogue(
              rawParts.map((t, idx) => ({
                speaker: idx % 2 === 0 ? 'SPEAKER_1' : 'SPEAKER_2',
                text: t,
              }))
            );
          }
        }
      } catch (err) {
        if (!isMounted) return;
        console.warn('Fallback a datos de demostración fieles a la maqueta:', err);
        applyDemoPillData();
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (token && pillId) {
      fetchPillData();
    }
    return () => {
      isMounted = false;
    };
  }, [token, pillId]);

  // Detener locución al desmontar o pausar
  const stopSpeech = () => {
    isSpeechActiveRef.current = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsTrimiSpeaking(false);
  };

  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, []);

  // Función recursiva para reproducir diálogo con síntesis de voz en español
  const playSpeechDialogue = (index = 0) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const lines = scriptDialogue.length > 0
      ? scriptDialogue
      : (pill?.content
          ? pill.content.split('\n\n').filter(Boolean).map((t, idx) => ({ speaker: idx % 2 === 0 ? 'SPEAKER_1' : 'SPEAKER_2', text: t }))
          : paragraphs.map((t, idx) => ({ speaker: idx % 2 === 0 ? 'SPEAKER_1' : 'SPEAKER_2', text: t }))
        );

    if (index >= lines.length) {
      setIsPlaying(false);
      setIsTrimiSpeaking(false);
      setHasCompletedListening(true);
      isSpeechActiveRef.current = false;
      return;
    }

    speechIndexRef.current = index;
    setActiveParagraphIndex(index);

    const currentLine = lines[index];
    const isTrimi = currentLine.speaker === 'SPEAKER_1';

    window.speechSynthesis.cancel();

    // Determinar tono base seleccionado (1.0 = tono natural humano del sintetizador)
    let basePitch = 1.0;
    if (voiceTone === 'calido') basePitch = 0.88;
    else if (voiceTone === 'suave') basePitch = 0.94;
    else if (voiceTone === 'dinamico') basePitch = 1.04;

    const availableVoices = voices.length > 0 ? voices : window.speechSynthesis.getVoices();
    // Excluir voces con acento de España
    const spVoices = availableVoices.filter((v) => {
      if (!v.lang || !v.lang.toLowerCase().startsWith('es')) return false;
      const lang = v.lang.toLowerCase();
      const name = (v.name || '').toLowerCase();
      return !lang.includes('es-es') && !lang.includes('es_es') && !name.includes('spain') && !name.includes('españa');
    });
    const fallbackSp = spVoices.length > 0 ? spVoices : availableVoices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('es'));

    const isCaribOrAndean = (v) => {
      const l = (v?.lang || '').toLowerCase();
      const n = (v?.name || '').toLowerCase();
      return (
        l.includes('co') ||
        l.includes('ve') ||
        l.includes('mx') ||
        l.includes('pr') ||
        l.includes('do') ||
        l.includes('cu') ||
        n.includes('salome') ||
        n.includes('paola') ||
        n.includes('gonzalo') ||
        n.includes('sebastian') ||
        n.includes('dalia') ||
        n.includes('sabina') ||
        n.includes('jorge')
      );
    };

    const isFemale = (v) => {
      if (isCaribOrAndean(v)) return false;
      const n = (v?.name || '').toLowerCase();
      return (
        n.includes('valentina') || // es-UY (rioplatense suave)
        n.includes('catalina') ||  // es-CL (cono sur suave)
        n.includes('elena') ||     // es-AR (argentina)
        n.includes('tania') ||     // es-PY
        n.includes('sofia') ||     // es-BO
        n.includes('camila') ||
        n.includes('paloma') ||
        n.includes('female')
      );
    };

    const isMale = (v) => {
      if (isCaribOrAndean(v)) return false;
      const n = (v?.name || '').toLowerCase();
      return (
        n.includes('mateo') ||     // es-UY (rioplatense suave)
        n.includes('lorenzo') ||   // es-CL (cono sur suave)
        n.includes('tomas') ||     // es-AR (argentino)
        n.includes('tomás') ||
        n.includes('mario') ||     // es-PY
        n.includes('marcelo') ||   // es-BO
        n.includes('alonso') ||
        n.includes('male')
      );
    };

    // Voz primaria (SPEAKER_1 - Trimi, Femenina Cono Sur / Argentina suave)
    const primaryVoice =
      (selectedVoiceName && availableVoices.find((v) => v.name === selectedVoiceName && !isCaribOrAndean(v))) ||
      fallbackSp.find((v) => isFemale(v) && ((v.name || '').toLowerCase().includes('valentina') || (v.lang || '').toLowerCase().includes('es-uy'))) ||
      fallbackSp.find((v) => isFemale(v) && ((v.name || '').toLowerCase().includes('elena') || (v.lang || '').toLowerCase().includes('es-ar'))) ||
      fallbackSp.find((v) => isFemale(v) && (v.name || '').toLowerCase().includes('natural')) ||
      fallbackSp.find((v) => isFemale(v)) ||
      fallbackSp.find((v) => (v.lang || '').toLowerCase().includes('es-ar') || (v.lang || '').toLowerCase().includes('es-uy')) ||
      fallbackSp[0] ||
      null;

    let speakerVoice = primaryVoice;
    let speakerPitch = basePitch;
    let speakerRate = playbackSpeed;

    if (isTrimi) {
      speakerVoice = primaryVoice;
      speakerPitch = basePitch * 0.98; // Suaviza cualquier agudo excesivo para sonar más natural
    } else {
      // Colega (SPEAKER_2 - Masculina Cono Sur / Argentina suave):
      const maleVoice =
        fallbackSp.find((v) => isMale(v) && ((v.name || '').toLowerCase().includes('mateo') || (v.lang || '').toLowerCase().includes('es-uy'))) ||
        fallbackSp.find((v) => isMale(v) && ((v.name || '').toLowerCase().includes('tomas') || (v.name || '').toLowerCase().includes('tomás') || (v.lang || '').toLowerCase().includes('es-ar'))) ||
        fallbackSp.find((v) => isMale(v) && (v.name || '').toLowerCase().includes('natural')) ||
        fallbackSp.find((v) => isMale(v)) ||
        fallbackSp.find((v) => !isCaribOrAndean(v) && v.name !== primaryVoice?.name);

      if (maleVoice && isMale(maleVoice)) {
        speakerVoice = maleVoice;
        speakerPitch = basePitch * 0.96;
      } else if (maleVoice) {
        speakerVoice = maleVoice;
        speakerPitch = Math.max(0.78, basePitch - 0.14);
        speakerRate = playbackSpeed * 0.97;
      } else {
        speakerPitch = Math.max(0.76, basePitch - 0.16);
        speakerRate = playbackSpeed * 0.96;
      }
    }

    const utterance = new SpeechSynthesisUtterance(currentLine.text);
    utterance.lang = speakerVoice?.lang || 'es-AR';
    utterance.rate = speakerRate;
    utterance.pitch = speakerPitch;
    if (speakerVoice) utterance.voice = speakerVoice;

    utterance.onstart = () => {
      if (isTrimi) setIsTrimiSpeaking(true);
      else setIsTrimiSpeaking(false);
    };

    utterance.onend = () => {
      if (!isSpeechActiveRef.current) return;
      setIsTrimiSpeaking(false);
      setTimeout(() => {
        if (isSpeechActiveRef.current) {
          playSpeechDialogue(index + 1);
        }
      }, 200);
    };

    utterance.onerror = (e) => {
      console.warn('Speech error:', e);
      setIsTrimiSpeaking(false);
      if (isSpeechActiveRef.current && index + 1 < lines.length) {
        setTimeout(() => playSpeechDialogue(index + 1), 400);
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  // Manejo de reproducción de audio
  const handleTogglePlay = () => {
    if (isPlaying) {
      stopSpeech();
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      setIsTrimiSpeaking(false);
    } else {
      setIsPlaying(true);

      // Si la píldora tiene archivo de audio real (ElevenLabs MP3), reproducirlo
      if (audioRef.current && pill?.hasAudio) {
        const startSec = Math.floor(audioRef.current.currentTime || 0);
        reportPlaybackProgress(token, pillId, startSec).catch(() => {});
        lastReportedSecRef.current = startSec;
        audioRef.current.play()
          .then(() => {
            const isTrimi = scriptDialogue[activeParagraphIndex]?.speaker === 'SPEAKER_1';
            setIsTrimiSpeaking(isTrimi);
          })
          .catch((err) => {
            console.warn('Reproduciendo con síntesis de navegador como respaldo:', err);
            isSpeechActiveRef.current = true;
            playSpeechDialogue(activeParagraphIndex);
          });
      } else {
        // Respaldo de síntesis en el navegador
        isSpeechActiveRef.current = true;
        playSpeechDialogue(activeParagraphIndex);
      }

      if (duration === 0) {
        const wordCount = (scriptDialogue.length > 0 ? scriptDialogue : [{ text: pill?.content || '' }])
          .reduce((acc, l) => acc + (l.text ? l.text.split(' ').length : 0), 0);
        setDuration(Math.max(60, Math.round((wordCount / 130) * 60)));
      }
    }
  };

  // Contador de avance continuo para síntesis de navegador
  useEffect(() => {
    let interval = null;
    if (isPlaying && (!pill?.hasAudio || !audioRef.current)) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 1;
          const dur = duration || 90;
          if (next >= dur) {
            setHasCompletedListening(true);
            return dur;
          }
          if (dur > 0 && next / dur >= 0.8 && !hasCompletedListening) {
            setHasCompletedListening(true);
            reportPlaybackProgress(token, pillId, Math.floor(next), Math.floor(dur))
              .then(() => {
                if (onProgressUpdated) onProgressUpdated();
              })
              .catch(() => {});
          }
          return next;
        });
      }, 1000 / playbackSpeed);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, playbackSpeed, duration, hasCompletedListening, token, pillId, onProgressUpdated, pill?.hasAudio]);

  // Simulación fallback si el backend aún no generó el audio MP3 en BullMQ
  const simulateIntervalRef = useRef(null);
  const simulatePlayback = () => {
    if (simulateIntervalRef.current) clearInterval(simulateIntervalRef.current);
    const totalSimulated = 180; // 3 minutos
    setDuration(totalSimulated);
    setIsPlaying(true);
    simulateIntervalRef.current = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 1;
        if (next >= totalSimulated) {
          clearInterval(simulateIntervalRef.current);
          setIsPlaying(false);
          setHasCompletedListening(true);
          return totalSimulated;
        }
        // Actualizar párrafo resaltado según el progreso
        if (scriptDialogue.length > 0) {
          const idx = Math.floor((next / totalSimulated) * scriptDialogue.length);
          setActiveParagraphIndex(Math.min(idx, scriptDialogue.length - 1));
        }
        return next;
      });
    }, 1000 / playbackSpeed);
  };

  useEffect(() => {
    return () => {
      if (simulateIntervalRef.current) clearInterval(simulateIntervalRef.current);
    };
  }, []);

  // Marcas de tiempo de cada intervención calculadas según la cantidad de palabras del guion
  const dialogueTiming = useMemo(() => {
    if (!scriptDialogue || scriptDialogue.length === 0) return [];
    const totalDuration = duration > 0 ? duration : 90;
    const wordCounts = scriptDialogue.map((item) => {
      const words = item.text.trim().split(/\s+/).filter(Boolean);
      return Math.max(1, words.length);
    });
    const totalWords = wordCounts.reduce((acc, c) => acc + c, 0);

    let accumulated = 0;
    return scriptDialogue.map((item, idx) => {
      const lineRatio = wordCounts[idx] / totalWords;
      const lineDuration = lineRatio * totalDuration;
      const start = accumulated;
      const end = accumulated + lineDuration;
      accumulated = end;
      return {
        index: idx,
        speaker: item.speaker,
        text: item.text,
        start,
        end,
      };
    });
  }, [scriptDialogue, duration]);

  // Autoscroll suave del subtítulo activo para acompañar el audio
  useEffect(() => {
    if (activeLineRef.current && isPlaying) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeParagraphIndex, isPlaying]);

  // Salto directo a una intervención al hacer clic en un subtítulo
  const handleJumpToLine = (lineIdx) => {
    if (dialogueTiming[lineIdx]) {
      const targetTime = dialogueTiming[lineIdx].start;
      setCurrentTime(targetTime);
      if (audioRef.current) {
        audioRef.current.currentTime = targetTime;
      }
      setActiveParagraphIndex(lineIdx);
      setIsTrimiSpeaking(dialogueTiming[lineIdx].speaker === 'SPEAKER_1');
      if (isPlaying && (!pill?.hasAudio || !audioRef.current)) {
        window.speechSynthesis.cancel();
        playSpeechDialogue(lineIdx);
      }
    }
  };

  const lastReportedSecRef = useRef(0);

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const curr = audioRef.current.currentTime;
    setCurrentTime(curr);
    const dur = audioRef.current.duration || 0;
    if (dur > 0 && Math.abs(dur - duration) > 1) {
      setDuration(dur);
    }

    const sec = Math.floor(curr);
    if (sec - lastReportedSecRef.current >= 5) {
      lastReportedSecRef.current = sec;
      reportPlaybackProgress(token, pillId, sec)
        .then((res) => {
          if (res?.isAudioCompleted) {
            setHasCompletedListening(true);
            if (onProgressUpdated) onProgressUpdated();
          }
        })
        .catch(() => {});
    }

    // Si supera el 80%, reportar progreso al backend
    if (dur > 0 && curr / dur >= 0.8 && !hasCompletedListening) {
      setHasCompletedListening(true);
      lastReportedSecRef.current = sec;
      reportPlaybackProgress(token, pillId, sec)
        .then(() => {
          if (onProgressUpdated) onProgressUpdated();
        })
        .catch(() => {});
    }

    // Sincronizar con precisión quirúrgica el subtítulo activo según los tiempos calculados
    if (dialogueTiming.length > 0) {
      const activeLine = dialogueTiming.find((line) => curr >= line.start && curr < line.end);
      if (activeLine) {
        setActiveParagraphIndex(activeLine.index);
        setIsTrimiSpeaking(activeLine.speaker === 'SPEAKER_1');
      } else if (curr >= (dialogueTiming[dialogueTiming.length - 1]?.end || dur)) {
        setActiveParagraphIndex(dialogueTiming.length - 1);
        setIsTrimiSpeaking(false);
      }
    }
  };

  const handleSeek = (e) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    if (dialogueTiming.length > 0) {
      const activeLine = dialogueTiming.find((line) => time >= line.start && time < line.end) ||
        (time >= (dialogueTiming[dialogueTiming.length - 1]?.end || 0)
          ? dialogueTiming[dialogueTiming.length - 1]
          : dialogueTiming[0]);
      if (activeLine) {
        setActiveParagraphIndex(activeLine.index);
        setIsTrimiSpeaking(activeLine.speaker === 'SPEAKER_1');
        if (isPlaying && (!pill?.hasAudio || !audioRef.current)) {
          window.speechSynthesis.cancel();
          playSpeechDialogue(activeLine.index);
        }
      }
    }
  };

  const handleSpeedChange = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const newSpeed = speeds[nextIdx];
    setPlaybackSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  const formatSeconds = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Consulta RAG "¿Dudas? Preguntale a Trimi"
  const handleAskDoubt = async (e, customQuery) => {
    if (e) e.preventDefault();
    const query = (customQuery || doubtQuestion).trim();
    if (!query || askingDoubt) return;

    setAskingDoubt(true);

    try {
      const res = await askPillDoubt(token, pillId, query);
      if (res && res.text) {
        setDoubtAnswer({
          text: res.text,
          source: res.source || 'Base de conocimiento de Credimisión',
        });
      }
    } catch {
      setDoubtAnswer({
        text: `En esta lección sobre «${pill?.title || 'este tema'}», recordá que el objetivo principal es ${pill?.objective || 'seguir el procedimiento operativo vigente'}.`,
        source: `Lección: ${pill?.title || 'Capacitación Credimisión'}`,
      });
    } finally {
      setAskingDoubt(false);
      setDoubtQuestion('');
    }
  };

  // Párrafos del guion o fallback de teoría
  const paragraphs = scriptDialogue.length > 0
    ? scriptDialogue.map((d) => d.text)
    : pill?.theory
    ? pill.theory.split('\n\n').filter(Boolean)
    : [
        'En esta parada aprendemos a seguir el circuito comercial completo desde que el cliente solicita la compra hasta que el producto sale del depósito.',
        'Primero cargás la venta por el canal que corresponde a tu rol: Paljet si vendés por e-commerce, o Google Forms si hacés venta de calle. Antes de confirmar, revisá que el precio cargado coincida con la lista vigente.',
        'Después le contás al cliente cómo sigue la operación: plazos de entrega y estado del despacho. Desde ahí, Depósito prepara el producto y [RESPONSABLE] coordina la logística.',
      ];

  // Puntos clave pedagógicos
  const keyPoints = [
    'Cargá la venta por el canal de tu rol',
    'Revisá precio y financiación antes de confirmar',
    'Contale al cliente los plazos de entrega',
  ];

  // Cálculo de progreso porcentual y puntos vistos
  const progressPct = duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : (hasCompletedListening ? 100 : 58);
  const isPoint1Checked = progressPct >= 20 || hasCompletedListening;
  const isPoint2Checked = progressPct >= 50 || hasCompletedListening;
  const isPoint3Checked = progressPct >= 80 || hasCompletedListening;
  const pointsViewedCount = (isPoint1Checked ? 1 : 0) + (isPoint2Checked ? 1 : 0) + (isPoint3Checked ? 1 : 0);

  return (
    <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)' }}>
      <div
        className="modal-content"
        style={{
          maxWidth: 980,
          width: '95vw',
          maxHeight: '92vh',
          borderRadius: 16,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          overflow: 'hidden',
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.14)',
          border: '1px solid #E2E8F0',
        }}
      >
        {/* Encabezado: Breadcrumb, Botón Cerrar y Título */}
        <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 12.5, color: '#64748B' }}>
              <span style={{ fontWeight: 600, color: '#475569' }}>Mi ruta</span> / {areaName} / Parada {paradaNumber}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 18,
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
                title="Opciones"
              >
                ···
              </button>
              <button
                onClick={onClose}
                aria-label="Cerrar lección"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 18,
                  color: '#64748B',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>
          </div>

          <h2
            style={{
              margin: '0 0 14px',
              fontSize: 21,
              fontWeight: 700,
              color: '#0F172A',
              fontFamily: 'var(--font-title, "Lexend", sans-serif)',
            }}
          >
            {pill?.title || pillData?.title || 'Recopilación de datos para concretar una venta'}
          </h2>

          {/* Stepper Superior Horizontal: (1) Escuchar ── (2) Practicar ── 🔒 Demostrar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
            {/* 1. Escuchar (Activo) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#2563EB', fontWeight: 600 }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#2563EB',
                  color: '#ffffff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                1
              </span>
              <span>Escuchar</span>
            </div>

            {/* Línea conectora */}
            <div style={{ width: 48, height: 1.5, background: '#CBD5E1' }} />

            {/* 2. Practicar */}
            <div
              onClick={() => {
                if (hasCompletedListening || pill?.isCompleted) {
                  if (onStartSimulation) onStartSimulation('GUIDED');
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                color: hasCompletedListening || pill?.isCompleted ? '#1E293B' : '#64748B',
                cursor: hasCompletedListening || pill?.isCompleted ? 'pointer' : 'default',
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: '1.5px solid #94A3B8',
                  color: '#64748B',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11.5,
                  fontWeight: 600,
                }}
              >
                2
              </span>
              <span>Practicar</span>
            </div>

            {/* Línea conectora */}
            <div style={{ width: 48, height: 1.5, background: '#CBD5E1' }} />

            {/* 3. Demostrar */}
            <div
              onClick={() => {
                if (hasCompletedListening || pill?.isCompleted) {
                  if (onStartSimulation) onStartSimulation('FREE');
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                color: hasCompletedListening || pill?.isCompleted ? '#1E293B' : '#94A3B8',
                cursor: hasCompletedListening || pill?.isCompleted ? 'pointer' : 'default',
              }}
            >
              {hasCompletedListening || pill?.isCompleted ? (
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    border: '1.5px solid #94A3B8',
                    color: '#64748B',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                >
                  3
                </span>
              ) : (
                <span style={{ fontSize: 12 }}>🔒</span>
              )}
              <span>Demostrar</span>
            </div>
          </div>
        </div>

        {/* Cuerpo Principal de la Lección en 2 Columnas Exactas a la Imagen */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <p style={{ color: '#64748B' }}>Cargando contenidos de la lección...</p>
          </div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <p className="error">{error}</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(340px, 1.4fr) minmax(280px, 1fr)',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* Columna Izquierda: Reproductor celeste y Diálogo continuo */}
            <div
              style={{
                padding: '22px 28px',
                borderRight: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
                overflowY: 'auto',
              }}
            >
              {/* Tarjeta celeste con Trimi Capacitación + Controles de Audio */}
              <div
                style={{
                  background: '#DBEAFE',
                  borderRadius: 16,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                {/* Trimi con vestimenta oficial de Capacitación (Headset, anteojos, chaleco y tablet) */}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trimi outfit="capacitacion" isSpeaking={isPlaying && isTrimiSpeaking} size={74} />
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1E40AF' }}>
                    Píldora de audio con Trimi · {scriptDialogue.length > 0 ? scriptDialogue.length : 10} intervenciones
                  </span>

                  {/* Play/Pause + Barra de tiempo + Duración */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      aria-label={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        background: '#2563EB',
                        color: '#ffffff',
                        border: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: 14,
                        flexShrink: 0,
                        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                      }}
                    >
                      {isPlaying ? '❚❚' : '▶'}
                    </button>

                    <span style={{ fontSize: 12, color: '#1E3A8A', minWidth: 32, fontWeight: 500 }}>
                      {formatSeconds(currentTime)}
                    </span>

                    <input
                      type="range"
                      min={0}
                      max={duration || 83}
                      value={currentTime}
                      onChange={handleSeek}
                      style={{
                        flex: 1,
                        accentColor: '#2563EB',
                        cursor: 'pointer',
                      }}
                    />

                    <span style={{ fontSize: 12, color: '#1E3A8A', minWidth: 32, fontWeight: 500, textAlign: 'right' }}>
                      {formatSeconds(duration || 83)}
                    </span>
                  </div>

                  {/* Subcontroles: Velocidad y Subtítulos */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#1E40AF' }}>
                    <button
                      type="button"
                      onClick={handleSpeedChange}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#1E40AF',
                        fontSize: 12,
                        cursor: 'pointer',
                        padding: 0,
                        fontWeight: 500,
                      }}
                    >
                      Velocidad {playbackSpeed}x
                    </button>

                    <button
                      type="button"
                      onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: subtitlesEnabled ? '#1E40AF' : '#64748B',
                        fontSize: 12,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontWeight: 500,
                      }}
                    >
                      <span style={{ border: '1px solid currentColor', borderRadius: 3, padding: '1px 3px', fontSize: 10, fontWeight: 700 }}>
                        CC
                      </span>
                      <span>Subtítulos</span>
                    </button>
                  </div>
                </div>

                {/* Audio HTML5 invisible */}
                <audio
                  ref={audioRef}
                  src={getAudioStreamUrl(pillId, token)}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => {
                    setIsPlaying(false);
                    setIsTrimiSpeaking(false);
                    setHasCompletedListening(true);
                  }}
                  style={{ display: 'none' }}
                />
              </div>

              {/* Sección "Lo que dice Trimi" */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                <h3 style={{ margin: '4px 0 8px', fontSize: 14.5, fontWeight: 600, color: '#0F172A' }}>
                  Lo que dice Trimi
                </h3>

                {subtitlesEnabled ? (
                  <div
                    ref={subtitlesContainerRef}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                      overflowY: 'auto',
                      paddingRight: 8,
                      flex: 1,
                    }}
                  >
                    {paragraphs.map((para, pIdx) => {
                      const isActive = pIdx === activeParagraphIndex;
                      const speaker = scriptDialogue[pIdx]?.speaker;
                      const isTrimiSpeaker = speaker === 'SPEAKER_1' || !speaker;

                      return (
                        <div
                          key={pIdx}
                          ref={isActive ? activeLineRef : null}
                          onClick={() => handleJumpToLine(pIdx)}
                          style={{
                            borderLeft: isActive ? '3px solid #2563EB' : '3px solid transparent',
                            paddingLeft: 12,
                            marginLeft: -15,
                            transition: 'all 0.2s ease',
                            cursor: 'pointer',
                          }}
                          title="Hacé clic para saltar a esta parte del audio"
                        >
                          {/* Identificador de locutor */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            {isTrimiSpeaker ? (
                              <>
                                <Trimi outfit="capacitacion" size={18} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? '#2563EB' : '#475569' }}>
                                  Trimi
                                </span>
                              </>
                            ) : (
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>
                                Colega
                              </span>
                            )}
                          </div>

                          {/* Texto de la intervención */}
                          <p
                            style={{
                              margin: 0,
                              fontSize: 13.5,
                              lineHeight: 1.5,
                              color: isActive ? '#0F172A' : '#334155',
                              fontWeight: isActive ? 500 : 400,
                            }}
                          >
                            {para}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#94A3B8', fontSize: 13 }}>
                    Subtítulos desactivados.
                  </div>
                )}
              </div>
            </div>

            {/* Columna Derecha: Puntos clave y Dudas con Trimi Consejo */}
            <div
              style={{
                padding: '22px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 22,
                overflowY: 'auto',
              }}
            >
              {/* Sección Puntos Clave */}
              <div>
                <h3 style={{ margin: '0 0 14px', fontSize: 14.5, fontWeight: 600, color: '#0F172A' }}>
                  Puntos clave
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {keyPoints.map((pt, idx) => {
                    const isChecked = idx === 0 ? isPoint1Checked : idx === 1 ? isPoint2Checked : isPoint3Checked;
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {isChecked ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="10" stroke="#16A34A" strokeWidth="2" fill="#DCFCE7" />
                            <path d="M8 12L11 15L16 9" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="9" stroke="#94A3B8" strokeWidth="2" fill="none" />
                          </svg>
                        )}
                        <span style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.4 }}>
                          {pt}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Separador sutil */}
              <div style={{ height: 1, background: '#F1F5F9' }} />

              {/* Sección ¿Dudas? Preguntale a Trimi */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Trimi con vestimenta oficial de Consejo (Moño, mano en barbilla y bombita de luz 💡) */}
                  <Trimi outfit="consejo" size={26} />
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: '#0F172A' }}>
                    ¿Dudas? Preguntale a Trimi
                  </span>
                </div>

                {/* Burbuja celeste de respuesta (solo cuando se hace una consulta) */}
                {(askingDoubt || doubtAnswer) && (
                  <div
                    style={{
                      background: '#DBEAFE',
                      borderRadius: 12,
                      padding: '12px 14px',
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: '#1E3A8A',
                    }}
                  >
                    {askingDoubt ? (
                      <p style={{ margin: 0, fontStyle: 'italic', color: '#2563EB' }}>
                        Trimi está buscando en el procedimiento de la lección...
                      </p>
                    ) : (
                      <>
                        <p style={{ margin: 0 }}>
                          {doubtAnswer.text}
                        </p>
                        <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#64748B' }}>
                          Fuente: {doubtAnswer.source}
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Formulario de consulta con icono de avión de papel */}
                <form
                  onSubmit={(e) => handleAskDoubt(e)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '1px solid #CBD5E1',
                    borderRadius: 8,
                    padding: '4px 8px',
                    background: '#ffffff',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Escribí tu duda..."
                    value={doubtQuestion}
                    onChange={(e) => setDoubtQuestion(e.target.value)}
                    disabled={askingDoubt}
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      fontSize: 13,
                      padding: '6px 4px',
                      background: 'transparent',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={askingDoubt || !doubtQuestion.trim()}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: doubtQuestion.trim() ? '#2563EB' : '#94A3B8',
                      cursor: doubtQuestion.trim() ? 'pointer' : 'default',
                      padding: 4,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Enviar duda"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" fillOpacity="0.15" />
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Barra Inferior / Footer Bar (Exacta a la imagen) */}
        <div
          style={{
            padding: '14px 28px',
            borderTop: '1px solid #E2E8F0',
            background: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 13, color: '#64748B' }}>
            Escuchaste el {progressPct}% · {pointsViewedCount} de 3 puntos vistos
          </span>

          <button
            type="button"
            onClick={() => {
              setHasCompletedListening(true);
              if (onStartSimulation) onStartSimulation('GUIDED');
            }}
            style={{
              background: '#2563EB',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 22px',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
              transition: 'background 0.15s ease',
            }}
          >
            <span>Ir a practicar</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
