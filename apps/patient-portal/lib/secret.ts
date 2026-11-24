import { inspect } from "node:util";

/**
 * Valor que no debe aparecer en registros, errores ni respuestas: la clave del canal y los permisos de trámite.
 * Solo `reveal()` lo entrega. Convertirlo a texto, a JSON o inspeccionarlo devuelve una marca.
 */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** Úsalo solo para escribir la cabecera de una petición al orquestador. */
  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return "[oculto]";
  }

  toJSON(): string {
    return "[oculto]";
  }

  [inspect.custom](): string {
    return "[oculto]";
  }
}
