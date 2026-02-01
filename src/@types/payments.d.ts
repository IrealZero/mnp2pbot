// src/types/payments.d.ts   (puedes crear este archivo)
export interface PayViaPaymentRequestResult {
  /** Identificador de la transacción (hash en Monero) */
  id: string;
  /** Fee estimado en satoshis */
  fee: number;
  /** Fee en milisatoshis (para compatibilidad con Lightning) */
  fee_mtokens?: string;
  /** Tokens totales (en msats) */
  mtokens?: string;
  /** Tokens en satoshis (para compatibilidad) */
  tokens?: string;
  /** Fee “seguro” (usado por Lightning) – lo rellenamos con el mismo fee */
  safe_fee?: number;
  /** Tokens “seguros” – lo rellenamos con el monto original en satoshis */
  safe_tokens?: number;
  /** Secret (no existe en Monero, lo dejamos vacío) */
  secret?: string;
  /** Rutas (Lightning) – no aplicable, lo dejamos vacío */
  routes?: any[];
  /** Otros campos opcionales que puedan existir en la definición original */
  [key: string]: any;
}