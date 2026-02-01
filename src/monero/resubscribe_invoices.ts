// src/monero/resubscribe_invoices.ts
import { Order } from "../../models";
import { logger } from "../../logger";
import { CommunityContext } from "../../bot/modules/community/communityContext";
import { Telegraf } from "telegraf";
import { subscribeInvoice } from "./subscribe_invoice";

/**
 * Resuscribe (re‑inicia) el polling de todas las órdenes que siguen
 * esperando el pago del comprador.
 *
 * - Busca en la BD las órdenes con `status === 'WAITING_PAYMENT'`.
 * - Cada orden debe tener un `hash` (paymentId) o `moneroPaymentId`.
 * - Lanza `subscribeInvoice` en modo *resub* (no vuelve a cambiar el estado a ACTIVE).
 *
 * Esta función se llama habitualmente al arrancar el bot o después de
 * un reinicio del proceso, para que no se pierdan facturas pendientes.
 */
export const resubscribeInvoices = async (
  bot: Telegraf<CommunityContext>,
) => {
  try {
    let invoicesReSubscribed = 0;

    // -----------------------------------------------------------------
    // 1️⃣  Buscar órdenes pendientes de pago
    // -----------------------------------------------------------------
    const pendingOrders = await Order.find({
      status: "WAITING_PAYMENT",
      // Nos aseguramos de que exista algún identificador de pago.
      $or: [{ hash: { $exists: true, $ne: null } }, { moneroPaymentId: { $exists: true, $ne: null } }],
    }).select("_id hash moneroPaymentId");

    if (pendingOrders.length === 0) {
      logger.info("No pending Monero invoices to resubscribe.");
      return true;
    }

    // -----------------------------------------------------------------
    // 2️⃣  Lanzar suscripciones en paralelo (más rápido)
    // -----------------------------------------------------------------
    const subscriptionPromises = pendingOrders.map(async (ord) => {
      // Preferimos `moneroPaymentId` si está presente; si no, usamos `hash`.
      const paymentId = (ord as any).moneroPaymentId ?? ord.hash;
      if (!paymentId) {
        logger.warn(`Order ${ord._id} has no payment identifier – skipping.`);
        return;
      }

      await subscribeInvoice(bot, paymentId, true);
      invoicesReSubscribed += 1;
    });

    // Esperamos a que todas las suscripciones se hayan iniciado.
    await Promise.all(subscriptionPromises);

    logger.info(`Invoices resubscribed: ${invoicesReSubscribed}`);
    return true;
  } catch (error: any) {
    logger.error(`ResubscribeInvoices catch: ${error.toString()}`);
    return false;
  }
};