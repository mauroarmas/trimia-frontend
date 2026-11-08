/**
 * Tarifas públicas de referencia (Pay-as-you-go) en Google AI Studio, expresadas
 * en USD por cada 1.000.000 de tokens.
 */
const flash38Introductory = Date.now() < Date.UTC(2027, 0, 1);
const MODEL_PRICING = {
  // https://ai.google.dev/gemini-api/docs/pricing — tarifa de referencia, no factura.
  'gemini-3.8-flash': {
    label: 'Google Gemini 3.8 Flash',
    badge: 'Flash',
    inputPer1M: flash38Introductory ? 0.75 : 1.50,
    outputPer1M: flash38Introductory ? 3.75 : 7.50,
    summary: 'Modelo conversacional y de razonamiento. Referencia de pago por uso; no representa cargos de la cuenta gratuita.',
  },
  'gemini-3.5-flash-lite': {
    label: 'Google Gemini 3.5 Flash-Lite',
    badge: 'Alta velocidad · Bajo costo',
    inputPer1M: 0.30,
    outputPer1M: 2.50,
    summary:
      'Motor ágil optimizado para atención inmediata en vivo, clasificación y consulta documental con consumo mínimo.',
  },
  'gemini-3.1-flash-lite': {
    label: 'Google Gemini 3.1 Flash-Lite',
    badge: 'Alta eficiencia',
    inputPer1M: 0.25,
    outputPer1M: 1.50,
    summary:
      'Modelo liviano orientado a alto volumen de respuestas rápidas y bajo costo operativo.',
  },
  'gemini-2.5-flash-lite': {
    label: 'Google Gemini 2.5 Flash-Lite',
    badge: 'Económico',
    inputPer1M: 0.10,
    outputPer1M: 0.40,
    summary: 'Modelo ligero de generación previa para tareas conversacionales simples.',
  },
  'gemini-3.5-flash': {
    label: 'Google Gemini 3.5 Flash',
    badge: 'Balanceado',
    inputPer1M: 0.30,
    outputPer1M: 2.50,
    summary: 'Equilibrio entre razonamiento comercial complejo y rapidez de respuesta.',
  },
  'gemini-2.5-flash': {
    label: 'Google Gemini 2.5 Flash',
    badge: 'Balanceado',
    inputPer1M: 0.30,
    outputPer1M: 2.50,
    summary: 'Modelo multimodal versátil para asistencia general y análisis de contexto.',
  },
};

export function getModelPricing(modelId) {
  const normalized = (modelId || 'gemini-3.5-flash-lite').trim().toLowerCase();
  if (MODEL_PRICING[normalized]) {
    return { id: modelId || normalized, ...MODEL_PRICING[normalized] };
  }
  if (normalized.includes('flash-lite')) {
    return {
      id: modelId,
      label: `Google ${modelId}`,
      badge: 'Alta eficiencia',
      inputPer1M: 0.30,
      outputPer1M: 2.50,
      summary: 'Variante ligera de la familia Gemini Flash optimizada en costos.',
    };
  }
  if (normalized.includes('pro')) {
    return {
      id: modelId,
      label: `Google ${modelId}`,
      badge: 'Razonamiento avanzado',
      inputPer1M: 1.25,
      outputPer1M: 10.0,
      summary: 'Modelo de máxima profundidad analítica para casos complejos.',
    };
  }
  return {
    id: modelId || 'gemini-3.5-flash-lite',
    label: modelId ? `Google ${modelId}` : 'Google Gemini 3.5 Flash-Lite',
    badge: 'Estándar',
    inputPer1M: 0.30,
    outputPer1M: 2.50,
    summary: 'Motor conversacional conectado a la base de conocimiento institucional.',
  };
}

export const AGENT_LABELS = {
  SALES: { name: 'Ventas', role: 'Asesoría comercial, stock y financiación', color: '#2563eb' },
  COLLECTIONS: { name: 'Cobranzas', role: 'Cuotas, vencimientos y comprobantes', color: '#0d9488' },
  ADMIN: { name: 'Administración', role: 'Políticas internas y evaluación crediticia', color: '#7c3aed' },
  LOGISTICS: { name: 'Logística', role: 'Entregas, envíos y seguimiento de reparto', color: '#d97706' },
  DEPOSITS: { name: 'Depósito', role: 'Inventario físico, retiro y despacho', color: '#0284c7' },
  ORCHESTRATOR: { name: 'Recepción y Ruteo', role: 'Clasificación inicial hacia el área correcta', color: '#475569' },
};

export function formatUsd(amount, { compact = false } = {}) {
  if (!Number.isFinite(amount) || amount <= 0) return 'USD $0,00';
  if (amount < 0.01 && !compact) {
    return `USD $${amount.toLocaleString('es-AR', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })}`;
  }
  if (amount < 1 && !compact) {
    return `USD $${amount.toLocaleString('es-AR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    })}`;
  }
  return `USD $${amount.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function estimateMetricsEconomics(metrics) {
  const tokens = metrics?.tokens ?? {};
  const totalInput = tokens.totalInput ?? 0;
  const totalOutput = tokens.totalOutput ?? 0;
  const totalTokens = totalInput + totalOutput;
  const configuredModel = tokens.configuredModel || 'gemini-3.5-flash-lite';
  const primaryPricing = getModelPricing(configuredModel);

  let inputCostUsd = 0;
  let outputCostUsd = 0;

  if (Array.isArray(tokens.byModel) && tokens.byModel.length > 0) {
    for (const row of tokens.byModel) {
      const p = getModelPricing(row.model);
      inputCostUsd += (row.input / 1_000_000) * p.inputPer1M;
      outputCostUsd += (row.output / 1_000_000) * p.outputPer1M;
    }
  } else {
    inputCostUsd = (totalInput / 1_000_000) * primaryPricing.inputPer1M;
    outputCostUsd = (totalOutput / 1_000_000) * primaryPricing.outputPer1M;
  }

  const totalCostUsd = inputCostUsd + outputCostUsd;
  const totalCalls =
    tokens.totalCalls ??
    (Array.isArray(tokens.byModel)
      ? tokens.byModel.reduce((acc, m) => acc + (m.calls || 0), 0)
      : 0);

  const assistedConversations =
    tokens.conversationsCount || metrics?.conversations?.total || 0;

  const costPerCallUsd = totalCalls > 0 ? totalCostUsd / totalCalls : 0;
  const costPerConversationUsd =
    assistedConversations > 0 ? totalCostUsd / assistedConversations : 0;
  const responsesPerDollar =
    costPerCallUsd > 0 ? Math.round(1 / costPerCallUsd) : null;

  // 1 token ≈ 0.75 palabras en español; 1 página A4 estándar ≈ 450 palabras
  const equivalentWords = Math.round(totalTokens * 0.75);
  const equivalentPages =
    equivalentWords > 0 ? Math.max(1, Math.round(equivalentWords / 450)) : 0;

  const byAgentSource = tokens.byAgentDetailed || tokens.byAgent || {};
  const agentRows = Object.entries(byAgentSource)
    .map(([agentKey, info]) => {
      const input = info?.input ?? 0;
      const output = info?.output ?? 0;
      const calls = info?.calls ?? null;
      const avgDurationMs = info?.avgDurationMs ?? null;
      const modelUsed = info?.models?.[0] || primaryPricing.id;
      const pricing = getModelPricing(modelUsed);
      const usd =
        (input / 1_000_000) * pricing.inputPer1M +
        (output / 1_000_000) * pricing.outputPer1M;
      const meta = AGENT_LABELS[agentKey] || {
        name: agentKey,
        role: 'Asistencia especializada',
        color: '#64748b',
      };
      return {
        agentKey,
        name: meta.name,
        role: meta.role,
        color: meta.color,
        input,
        output,
        total: input + output,
        calls,
        avgDurationMs,
        usd,
      };
    })
    .sort((a, b) => b.usd - a.usd || b.total - a.total);

  return {
    totalInput,
    totalOutput,
    totalTokens,
    totalCalls,
    avgDurationMs: tokens.avgDurationMs ?? null,
    assistedConversations,
    configuredModel,
    embeddingModel: tokens.embeddingModel || 'gemini-embedding-001',
    ttsModel: tokens.ttsModel || null,
    periodFrom: tokens.periodFrom || null,
    periodTo: tokens.periodTo || null,
    primaryPricing,
    byModel: tokens.byModel || [],
    inputCostUsd,
    outputCostUsd,
    totalCostUsd,
    costPerCallUsd,
    costPerConversationUsd,
    responsesPerDollar,
    equivalentWords,
    equivalentPages,
    agentRows,
  };
}

