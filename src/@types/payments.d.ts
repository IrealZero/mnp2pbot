// src/types/payment.d.ts

/**
 * Resultado exitoso de una petición de pago Monero.
 */
export interface SuccessPayment {
  /** Tx‑id (hash) de la transacción Monero */
  id: string;

  /** Tarifa estimada (en satoshis) */
  fee: number;

  /** Momento en que consideramos la transacción "confirmada" (ISO string) */
  confirmed_at: string;

  /** Opcionales – solo si quieres exponerlos más adelante */
  blockHeight?: number;
  timestamp?: number;
}

/**
 * Resultado de error (compatible con ambos mundos).
 */
export interface PayError {
  /** Código de error (ej.: 'TIMEOUT', 'INSUFFICIENT_BALANCE', 'UNKNOWN') */
  error: string;

  /** Mensaje descriptivo del error */
  message: string;
}

/**
 * Tipo que usan los mensajes de Lightning.
 *
 * Incluye **todos** los campos que Lightning espera, aunque muchos de ellos
 * no tengan sentido para Monero. Los rellenaremos con valores neutros.
 */
export interface PayViaPaymentRequestResult {
  /** Tx‑id (hash) */
  id: string;

  /** Fee en satoshis */
  fee: number;

  /** Fee en milisatoshis (string) */
  fee_mtokens: string;

  /** Monto total en msat (para Lightning = fee_mtokens) */
  mtokens: string;

  /** Monto total en satoshis (string) */
  tokens: string;

  /** Alias de fee (para compatibilidad) */
  safe_fee: number;

  /** Alias de tokens (para compatibilidad) */
  safe_tokens: number;

  /** Secret de la hold‑invoice (Lightning). Monero no tiene → '' */
  secret: string;

  /** Rutas (Lightning). Monero no tiene → [] */
  routes: any[];

  /** Marca de tiempo de confirmación (ISO). Monero lo tiene en `confirmed_at`. */
  confirmed_at: string;

  /** Número de hops (Lightning). Monero no tiene → '' */
  hops: string;

  /** Índice interno de la factura (Lightning). Monero no tiene → '' */
  index: string;

  /** Paths (Lightning). Monero no tiene → '' */
  paths: string;
}

/**
 * Tipo público que se devuelve de `payRequest`.
 * Es una unión discriminada por la presencia de la clave `error`.
 */
export type PayViaRequestResult = SuccessPayment | PayError;