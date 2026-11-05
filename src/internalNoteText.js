/** Presenta las notas automáticas antiguas sin alterar el registro original. */
export function internalNoteText(note) {
  const content = note.content ?? '';
  if (!note.authorAgentType || !content.startsWith('Escalado automático: la base de conocimiento')) return content;
  const query = content.match(/Consulta del cliente:\s*«([\s\S]*)»\s*$/)?.[1];
  if (!query) return content;
  const characters = Array.from(query.replace(/\s+/g, ' ').trim());
  const excerpt = characters.slice(0, 180).join('') + (characters.length > 180 ? '…' : '');
  if (/^(s[ií](\s+por\s+favor)?|dale|ok|perfecto)[.!\s]*$/i.test(query)) {
    return `El cliente respondió «${excerpt}». Revisar el intercambio anterior y continuar la atención.`;
  }
  return `Consulta: «${excerpt}».\nPendiente: confirmar la información y responder al cliente.`;
}
