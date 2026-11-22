import { parseSchedule } from '../requests/request-workflow';
import { normalizeSpanish } from './conversation-interpreter';

const operationalWords = new Set([
  'a', 'acudir', 'agenda', 'agendar', 'agendamiento', 'al', 'alameda', 'analisis', 'aparece',
  'apoyo', 'asesor', 'asesora', 'atencion', 'avance', 'ayuda', 'biometria', 'buen', 'buenas', 'buenos',
  'call', 'cambiar', 'cancelada', 'center', 'cita', 'citas', 'clinica', 'clinicas', 'como',
  'confirmada', 'confirmar', 'consulta', 'consultar', 'continuar', 'con', 'cual', 'cuando',
  'de', 'del', 'demo', 'despues', 'dia', 'dias', 'donde', 'duda', 'el', 'elegir', 'ella',
  'en', 'esta', 'estado', 'estatus', 'este', 'estudio', 'estudios', 'examen', 'fecha',
  'general', 'glucosa', 'gustaria', 'hablar', 'hematica', 'hola', 'hora', 'horario', 'horarios',
  'hoy', 'humana', 'indicar', 'iniciar', 'ir', 'la', 'las', 'lipidos', 'lo', 'los', 'manana', 'mas',
  'me', 'menu', 'mi', 'mis', 'mirador', 'noche', 'noches', 'opciones', 'operador', 'operadora',
  'orina', 'para', 'pasado', 'paso', 'perfil', 'persona', 'por', 'preferencia', 'prefiero',
  'progreso', 'propuesta', 'proponer', 'proximo', 'puedo', 'que', 'quedo', 'quedamos', 'quiero',
  'radiografia', 'reanudar', 'recuperar', 'retomar', 'rio', 'saber', 'sede', 'sedes', 'seguimiento', 'seguir',
  'seleccionar', 'siguiente', 'simple', 'solicitud', 'solicitudes', 'sucursal', 'tarde', 'tardes',
  'terminar', 'toca', 'tramite', 'tu', 'ultrasonido', 'un', 'una', 'va', 'ver', 'y', 'zona',
]);
const sensitiveWords = /\b(contrasena|password|clave|secreto|otp|token|bearer|diagnostico|sintomas|historial clinico|codigo)\b/;

export function minimizeConversationMessage(message: string) {
  const scrubbed = message
    .replace(/[^\s@]+@[^\s@]+/g, ' ')
    .replace(/\b(?:sk-[\w-]+|eyJ[\w.-]+)\b/g, ' ');
  const normalized = normalizeSpanish(scrubbed);
  if (sensitiveWords.test(normalized)) return undefined;

  // Conserva solamente una fecha absoluta explícita. Los demás números y el texto ajeno a la agenda se descartan.
  const dates = scrubbed.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})(?![\w:+.-])/g) ?? [];
  const explicitScheduledAt = dates.length === 1 ? parseSchedule(dates[0])?.toISOString() ?? null : null;
  const text = (normalized.match(/[a-z]+/g) ?? []).filter((word) => operationalWords.has(word)).join(' ').slice(0, 400);
  return text || explicitScheduledAt ? { text, explicitScheduledAt } : undefined;
}
