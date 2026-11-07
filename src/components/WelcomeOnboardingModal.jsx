import { useState } from 'react';
import Trimi from './Trimi';
import TrainingIcon from './TrainingIcon';

/**
 * Bienvenida con Trimi (Captura 1 - Primer ingreso, 3 pasos).
 *
 * Props:
 * - me: datos del usuario logueado
 * - onComplete: callback al terminar o saltar la presentación
 * - onStartDiagnostic: callback si el usuario decide arrancar directo el diagnóstico
 */
export default function WelcomeOnboardingModal({ me, onComplete, onStartDiagnostic }) {
  const [step, setStep] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const userName = me?.name ? me.name.split(' ')[0] : 'colaborador/a';

  // Trimi cambia de estado en cada paso: saluda -> habla -> festeja
  const getTrimiMood = () => {
    switch (step) {
      case 1:
        return 'saluda';
      case 2:
        return 'habla';
      case 3:
        return 'festeja';
      default:
        return 'saluda';
    }
  };

  const stepsData = [
    {
      title: 'Te damos la bienvenida a Credimisión',
      dialogue: `¡Hola, ${userName}! Soy Trimi y te voy a acompañar en tus primeros días en Credimisión. Acá vas a aprender lo que necesitás para atender clientes, vender en cuotas y moverte por los circuitos internos de la empresa, a tu ritmo y sin tener que interrumpir a nadie.`,
    },
    {
      title: 'Tu capacitación en paradas cortas',
      dialogue:
        'Tu ruta está organizada en paradas temáticas con 3 etapas cada una: primero vas a Escuchar la píldora explicativa, después vas a Practicar con mis pistas, y finalmente vas a Demostrar atendiendo a un cliente simulado sin ayuda.',
    },
    {
      title: 'Empecemos conociendo lo que ya sabés',
      dialogue:
        'Antes de arrancar la primera parada, tenemos un breve diagnóstico conversado de 5 minutos. Si ya conocés un tema, esa parada te queda automáticamente eximida para que no pierdas tiempo y vayas directo a atender clientes.',
    },
  ];

  const currentStepData = stepsData[step - 1];

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      if (onComplete) onComplete();
      if (onStartDiagnostic) onStartDiagnostic();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSkip = () => {
    if (onComplete) onComplete();
  };

  return (
    <div className="modal-overlay" style={{ background: 'rgba(23, 48, 90, 0.45)', backdropFilter: 'blur(3px)' }}>
      <div
        className="modal-content"
        style={{
          maxWidth: 820,
          width: '92vw',
          borderRadius: 16,
          padding: '36px 36px 28px',
          background: '#ffffff',
          boxShadow: '0 20px 45px rgba(23, 48, 90, 0.16)',
        }}
      >
        {/* Encabezado del Primer Ingreso */}
        <div style={{ marginBottom: 20 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#2B6FC0',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Primer Ingreso
          </span>
          <h2
            style={{
              margin: '6px 0 10px',
              fontSize: 26,
              fontWeight: 700,
              color: '#17305A',
              fontFamily: 'var(--font-title, "Lexend", sans-serif)',
            }}
          >
            {currentStepData.title}
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#64748B' }}>
            <span style={{ fontWeight: 600, color: '#17305A' }}>Trimi</span>
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              aria-label={isMuted ? 'Activar voz' : 'Silenciar voz'}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 6px',
                color: isMuted ? '#94A3B8' : '#2B6FC0',
                display: 'inline-flex',
                alignItems: 'center',
                minWidth: 44,
                minHeight: 44,
              }}
              title={isMuted ? 'Voz silenciada' : 'Silenciar voz'}
            >
              <TrainingIcon type={isMuted ? 'clock' : 'headphones'} size={18} />
            </button>
            <span style={{ fontSize: 12 }}>Con subtítulos siempre visibles</span>
          </div>
        </div>

        {/* Contenido Central: Tarjeta de Trimi + Globo de diálogo */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(180px, 210px) 1fr',
            gap: 24,
            alignItems: 'center',
            marginBottom: 26,
          }}
        >
          {/* Tarjeta de Trimi con fondo suave */}
          <div
            style={{
              background: '#EEF5FC',
              borderRadius: 14,
              padding: '24px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #CFE0F3',
            }}
          >
            <Trimi mood={getTrimiMood()} size={110} />
          </div>

          {/* Globo de diálogo de Trimi */}
          <div
            style={{
              background: '#EEF5FC',
              border: '1px solid #CFE0F3',
              borderRadius: 14,
              padding: '24px 26px',
              position: 'relative',
              boxShadow: '0 2px 8px rgba(43, 111, 192, 0.04)',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 15,
                lineHeight: 1.65,
                color: '#17305A',
                textAlign: 'justify',
                hyphens: 'auto',
                fontFamily: 'var(--font-body, "Nunito Sans", sans-serif)',
              }}
            >
              {currentStepData.dialogue}
            </p>
          </div>
        </div>

        {/* Barra de Navegación de Pasos */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 16,
            borderTop: '1px solid #E2E8F0',
            marginBottom: 24,
          }}
        >
          {/* Indicador de Paso */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Paso {step} de 3</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {[1, 2, 3].map((s) => (
                <span
                  key={s}
                  style={{
                    width: s === step ? 18 : 7,
                    height: 7,
                    borderRadius: 4,
                    background: s === step ? '#2B6FC0' : '#CBD5E1',
                    transition: 'all 0.2s ease',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Botones de acción */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {step > 1 && (
              <button
                type="button"
                className="secondary"
                onClick={handleBack}
                style={{ padding: '9px 18px', fontSize: 13, minHeight: 44 }}
              >
                Atrás
              </button>
            )}
            <button
              type="button"
              className="secondary"
              onClick={handleSkip}
              style={{
                padding: '9px 16px',
                fontSize: 13,
                color: '#64748B',
                borderColor: '#E2E8F0',
                minHeight: 44,
              }}
            >
              Saltar presentación
            </button>
            <button
              type="button"
              onClick={handleNext}
              style={{
                background: '#2B6FC0',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '9px 24px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              {step === 3 ? 'Empezar diagnóstico' : 'Siguiente'}
            </button>
          </div>
        </div>

        {/* 3 Tarjetas informativas inferiores de referencia (Captura 1) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: '#EEF5FC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2B6FC0',
                flexShrink: 0,
              }}
            >
              <TrainingIcon type="clock" size={15} />
            </div>
            <div>
              <strong style={{ fontSize: 12, display: 'block', color: '#17305A' }}>
                Diagnóstico de 5 minutos
              </strong>
              <span style={{ fontSize: 11, color: '#64748B' }}>Si ya sabés un tema, lo salteás.</span>
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: '#EEF5FC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2B6FC0',
                flexShrink: 0,
              }}
            >
              <TrainingIcon type="compass" size={15} />
            </div>
            <div>
              <strong style={{ fontSize: 12, display: 'block', color: '#17305A' }}>
                Tu ruta por paradas
              </strong>
              <span style={{ fontSize: 11, color: '#64748B' }}>Píldoras cortas según tu puesto.</span>
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: '#EEF5FC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2B6FC0',
                flexShrink: 0,
              }}
            >
              <TrainingIcon type="simulation" size={15} />
            </div>
            <div>
              <strong style={{ fontSize: 12, display: 'block', color: '#17305A' }}>
                Clientes simulados
              </strong>
              <span style={{ fontSize: 11, color: '#64748B' }}>Primero con ayuda, después sin ayuda.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
