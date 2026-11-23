/**
 * Rejilla de horarios de demostración. La API no ofrece disponibilidad real,
 * así que estos valores son la única fuente de los horarios que muestra el portal.
 */
export const SCHEDULE = {
  /** Zona horaria en la que se muestran y se envían los horarios. */
  timeZone: "America/Mexico_City",
  /** Días naturales ofrecidos, contando desde hoy. */
  days: 14,
  /** Primer horario del día. */
  opensAt: "08:00",
  /** Hora de cierre. El último horario empieza un intervalo antes. */
  closesAt: "18:00",
  /** Minutos entre un horario y el siguiente. */
  stepMinutes: 30,
} as const;
