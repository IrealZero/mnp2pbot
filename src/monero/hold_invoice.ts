// src/monero/hold_invoice.ts
import {
  createInvoice,
  waitForPayment,
  cancelInvoice,
  getInvoiceInfo,
} from "./client";
import { logger } from "../../logger";

/**
 * Crea una “hold‑invoice” simulada.
 * - `description` solo se registra en logs (no forma parte de la cadena Monero).
 * - `amount` sigue siendo satoshis (para mantener compatibilidad con la UI).
 *
 * Devuelve:
 *   request: dirección integrada (para generar QR)
 *   hash:    paymentId (usado como identificador interno)
 *   secret:  (no existe en Monero) → devolvemos una cadena vacía para que
 *            los tests que esperan un secret no fallen.
 */
const createHoldInvoice = async ({
  description,
  amount,
}: {
  description: string;
  amount: number;
}) => {
  try {
    const invoice = await createInvoice({ description, amount });

    // En Lightning el campo `request` era la BOLT‑11 string.
    // En Monero usamos la dirección integrada completa.
    const request = invoice.address; // será codificada como QR

    // Devolvemos la misma forma que antes:
    return {
      request,
      hash: invoice.hash,                // == paymentId
      secret: "",                        // no aplicable
    };
  } catch (err) {
    logger.error(err);
    throw err;
  }
};

/**
 * “Liquidar” la hold‑invoice.
 * En Monero no hay operación de liquidación; simplemente esperamos
 * que la paymentId haya sido pagada y devolvemos true/false.
 *
 * Para que el resto del código siga llamando a `settleHoldInvoice`,
 * devolvemos una promesa que se resuelve cuando la confirmación llega.
 */
const settleHoldInvoice = async ({
  secret, // Ignorado (no existe)
  hash,   // paymentId
}: {
  secret: string;
  hash: string | null;

}) => {
  try {
    if (hash == null) {
      throw new Error("The hash cannot be null.");
    }

    const paid = await waitForPayment(hash);
    if (!paid) {
      logger.warn(`Attempted to settle invoice ${hash} but payment not received`);
    } 
    return paid;
  } catch (err) {
    logger.error(err);
    throw err;
  }
};

/**
 * Cancelar una hold‑invoice.
 * Sólo marcamos la factura como cancelada en la BD (no hay on‑chain).
 */
const cancelHoldInvoice = async ({
  hash,
}: {
  hash: string;
}) => {
  try {
    await cancelInvoice(hash);
  } catch (err) {
    logger.error(err);
    throw err;
  }
};

/**
 * Obtener información de la factura (principalmente para debug).
 */
const getInvoice = async ({
  hash,
}: {
  hash: string;
}) => {
  try {
    const info = await getInvoiceInfo(hash);
    return info;
  } catch (err) {
    logger.error(err);
    throw err;
  }
};

export {
  createHoldInvoice,
  settleHoldInvoice,
  cancelHoldInvoice,
  getInvoice,
};