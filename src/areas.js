/**
 * Áreas de las que alguien es responsable (spec 005).
 *
 * ⚠️ **Esto es una pista para la pantalla, no la regla.** La regla vive en el
 * backend (`KnowledgeService.assertPuedeEscribir`) y es la única que decide: si el
 * panel se equivoca acá, el servidor igual responde 403. Está duplicado a propósito
 * y solo para poder **deshabilitar un botón con el motivo a la vista**, que es mejor
 * que dejar hacer clic y devolver un error.
 *
 * Si algún día las dos difieren, la que está mal es ésta.
 */

/** Los agentes de un conjunto de áreas. Un área sin agente no habilita nada. */
export function agentesDe(areas) {
  return (areas ?? []).map((a) => a.agentType).filter(Boolean);
}

/**
 * ¿Es responsable de TODAS las áreas que existen? Eso —y solo eso— es ser gerente:
 * no hay ningún campo que marcar.
 */
export function esGerente(areas, totalAreas) {
  return totalAreas > 0 && (areas?.length ?? 0) === totalAreas;
}

/**
 * ¿Puede escribir un documento de esta área?
 *
 * `agentType` en `null` es un documento **transversal**: responde para todos los
 * agentes, así que lo toca solo quien es responsable de todas las áreas.
 */
export function puedeEscribirEn(areas, totalAreas, agentType) {
  if (!agentType) return esGerente(areas, totalAreas);
  return agentesDe(areas).includes(agentType);
}

/** Por qué no puede, en palabras. Vacío si sí puede. */
export function motivoDeBloqueo(areas, totalAreas, agentType) {
  if (puedeEscribirEn(areas, totalAreas, agentType)) return '';

  const propias = (areas ?? []).map((a) => a.name).join(', ');
  if (!propias) {
    return 'No tenés áreas asignadas, así que no podés modificar documentos. Pedile a un supervisor que te asigne al menos una.';
  }
  if (!agentType) {
    return `Este documento no es de un área en particular: responde para todos los agentes, así que solo lo modifica quien es responsable de todas. Vos sos responsable de: ${propias}.`;
  }
  return `Este documento es de otra área. Sos responsable de: ${propias}.`;
}

/**
 * Ordena a los candidatos de una derivación poniendo primero a quien es
 * responsable del área del caso (spec 005, US4).
 *
 * **Ordena, no filtra, y la diferencia importa.** Responder un caso NO está
 * restringido por área: alguien puede saber la respuesta sin ser el responsable, y
 * el gerente puede tomar cualquiera. Filtrar dejaría sin poder derivar un caso de un
 * área que hoy no tiene supervisor activo. Lo que sí hace falta es que la persona
 * correcta esté arriba y que la de otra área se elija a sabiendas, no por descuido.
 */
export function ordenarCandidatos(candidatos, agentTypeDelCaso) {
  const esDelArea = (c) =>
    !!agentTypeDelCaso && agentesDe(c.areasSupervisadas).includes(agentTypeDelCaso);
  return [...candidatos].sort((a, b) => Number(esDelArea(b)) - Number(esDelArea(a)));
}

/** ¿Esta persona maneja el área del caso? Para marcarla en la lista. */
export function manejaElArea(candidato, agentTypeDelCaso) {
  if (!agentTypeDelCaso) return false;
  return agentesDe(candidato.areasSupervisadas).includes(agentTypeDelCaso);
}

/** Cómo se describe a un candidato en un desplegable de derivación. */
export function etiquetaDeCandidato(candidato, agentTypeDelCaso) {
  const areas = (candidato.areasSupervisadas ?? []).map((a) => a.name).join(', ');
  const marca = manejaElArea(candidato, agentTypeDelCaso) ? '★ ' : '';
  return `${marca}${candidato.name} — ${areas || 'sin áreas'}`;
}
