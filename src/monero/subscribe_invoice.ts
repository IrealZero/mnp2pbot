// src/monero/subscribe_invoice.ts
import { Order, User } from "../../models";
import { payToBuyer } from "./pay_request";
import * as messages from "../../bot/messages";
import * as ordersActions from "../../bot/ordersActions";
import { getUserI18nContext, getEmojiRate, decimalRound } from "../../util";
import { logger } from "../../logger";
import { HasTelegram } from "../../bot/start";
import { IOrder } from "../../models/order";
import { Mutex } from "async-mutex";

import {
  waitForPayment,          // ← nuevo método del wrapper Monero
  getInvoiceInfo,          // opcional, solo para logs/debug
} from "./client";

/* ------------------------------------------------------------------
   MUTEX POR ORDEN (idéntico al original)
   ------------------------------------------------------------------ */
type LockCountedMutex = {
  lockCount: number;
  mutex: Mutex;
};

class PerOrderIdMutex {
  private mutexes: Map<string, LockCountedMutex> = new Map();

  async runExclusive(orderId: string, callback: () => Promise<any>) {
    let mtx: LockCountedMutex;
    if (!this.mutexes.has(orderId)) {
      mtx = { lockCount: 1, mutex: new Mutex() };
      this.mutexes.set(orderId, mtx);
    } else {
      mtx = this.mutexes.get(orderId)!;
      mtx.lockCount++;
    }
    let ret: any;
    try {
      ret = await mtx.mutex.runExclusive(callback);
    } finally {
      mtx.lockCount--;
      if (mtx.lockCount === 0) this.mutexes.delete(orderId);
    }
    return ret;
  }

  static instance = new PerOrderIdMutex();
}

/* ------------------------------------------------------------------
   SUBSCRIBE INVOICE (polling)
   ------------------------------------------------------------------ */
const POLLING_INTERVAL_MS = 5_000; // 5 s

/**
 * `subscribeInvoice` inicia un *loop* que cada 5 s llama a
 * `waitForPayment(paymentId)`. Cuando la función devuelve `true`
 * se ejecuta la lógica de “invoice confirmed” (igual que en Lightning).
 *
 * @param bot   – instancia de Telegraf (para enviar mensajes)
 * @param id    – **paymentId** (antes era `invoice.id`)
 * @param resub – si es `true` significa que estamos re‑suscribiendo
 *               (no queremos volver a cambiar el estado a ACTIVE otra vez)
 */
const subscribeInvoice = async (
  bot: HasTelegram,
  id: string,          // aquí `id` es el paymentId (hash)
  resub: boolean = false,
) => {
  try {
    // 1️⃣ Obtenemos la orden asociada al paymentId.
    const order = await Order.findOne({ hash: id });
    if (!order) throw new Error("order was not found");

    // 2️⃣ Si la orden ya está en estado distinto a WAITING_PAYMENT,
    //    no hacemos nada (evita race conditions).
    if (order.status !== "WAITING_PAYMENT") {
      logger.info(
        `Order ${order._id} already processed (status=${order.status}) – skipping subscription`,
      );
      return;
    }

    // 3️⃣ Iniciamos el polling.
    const poll = async () => {
      try {
        // `waitForPayment` devuelve `true` tan pronto como la
        // paymentId aparece en los transfers confirmados.
        const paid = await waitForPayment(id, 0); // 0 = sin timeout (consulta inmediata)
        if (!paid) {
          // No está pagada aún → volvemos a intentar después del intervalo.
          setTimeout(poll, POLLING_INTERVAL_MS);
          return;
        }

        // -------------------------------------------------------------
        // 4️⃣ Pago recibido → lógica de “invoice confirmed”
        // -------------------------------------------------------------
        logger.info(
          `Order ${order._id} - Invoice with hash ${id} was settled!`,
        );

        // Si la orden estaba congelada, no hacemos nada.
        if (order.status === "FROZEN" && order.is_frozen) {
          logger.info(
            `Order ${order._id} - Order was frozen by ${order.action_by}!`,
          );
          return;
        }

        // En Lightning había una fase intermedia `PAID_HOLD_INVOICE`.
        // Aquí simplemente marcamos el estado y seguimos con el flujo.
        order.status = "PAID_HOLD_INVOICE";
        await order.save();

        // Ejecutamos la lógica que notifica a ambas partes y paga al comprador.
        await payHoldInvoice(bot, order);
      } catch (innerErr) {
        logger.error(`Polling error for invoice ${id}: ${innerErr}`);
        // Reintentamos después del intervalo en caso de error transitorio.
        setTimeout(poll, POLLING_INTERVAL_MS);
      }
    };

    // Si la orden ya estaba “held” (por ejemplo al reiniciar la app)
    // y `resub` es true, saltamos directamente al polling sin volver a
    // cambiar el estado a ACTIVE.
    if (resub) {
      logger.info(
        `Resubscribing held invoice ${id} for order ${order._id}`,
      );
      poll();
      return;
    }

    // -------------------------------------------------------------
    // 5️⃣ Primera vez que vemos la factura “held”
    // -------------------------------------------------------------
    // En Lightning se marcaba `status = 'ACTIVE'` y se enviaban mensajes.
    // Replicamos esa lógica aquí.
    await PerOrderIdMutex.instance.runExclusive(
      String(order._id),
      async () => {
        // Refrescamos la orden por si algún job la modificó.
        const fresh = await Order.findById(order._id);
        if (!fresh) throw new Error("order was not found after locking");

        if (fresh.status !== "WAITING_PAYMENT") {
          logger.error(
            `Order ${fresh._id} status is not WAITING_PAYMENT on subscribeInvoice. Actual status: ${fresh.status}`,
          );
          return;
        }

        logger.info(
          `Order ${fresh._id} Invoice with hash ${id} is being held!`,
        );

        const buyerUser = await User.findOne({ _id: fresh.buyer_id });
        const sellerUser = await User.findOne({ _id: fresh.seller_id });
        if (!buyerUser) throw new Error("buyerUser was not found");
        if (!sellerUser) throw new Error("sellerUser was not found");

        // Cambiamos el estado a ACTIVE (igual que en Lightning)
        fresh.status = "ACTIVE";
        const i18nCtxBuyer = await getUserI18nContext(buyerUser);
        const i18nCtxSeller = await getUserI18nContext(sellerUser);

        if (fresh.type === "sell") {
          await messages.onGoingTakeSellMessage(
            bot,
            sellerUser,
            buyerUser,
            fresh,
            i18nCtxBuyer,
            i18nCtxSeller,
          );
        } else if (fresh.type === "buy") {
          fresh.status = "WAITING_BUYER_INVOICE";
          const stars = getEmojiRate(sellerUser.total_rating);
          const roundedRating = decimalRound(sellerUser.total_rating, -1);
          const rate = `${roundedRating} ${stars} (${sellerUser.total_reviews})`;
          await messages.onGoingTakeBuyMessage(
            bot,
            sellerUser,
            buyerUser,
            fresh,
            i18nCtxBuyer,
            i18nCtxSeller,
            rate,
          );
        }

        fresh.invoice_held_at = new Date();
        await fresh.save();
      },
    );

    // Finalmente iniciamos el polling para detectar la confirmación.
    poll();
  } catch (error) {
    logger.error("subscribeInvoice catch:", error);
    return false;
  }
};

/* ------------------------------------------------------------------
   PAY HOLD INVOICE (igual que antes, solo se llama cuando la factura
   ha sido confirmada)
   ------------------------------------------------------------------ */
const payHoldInvoice = async (bot: HasTelegram, order: IOrder) => {
  try {
    order.status = "PAID_HOLD_INVOICE";
    await order.save();

    const buyerUser = await User.findOne({ _id: order.buyer_id });
    const sellerUser = await User.findOne({ _id: order.seller_id });
    if (!buyerUser) throw new Error("buyerUser was not found");
    if (!sellerUser) throw new Error("sellerUser was not found");

    const i18nCtxBuyer = await getUserI18nContext(buyerUser);
    const i18nCtxSeller = await getUserI18nContext(sellerUser);

    await messages.releasedSatsMessage(
      bot,
      sellerUser,
      buyerUser,
      i18nCtxBuyer,
      i18nCtxSeller,
    );

    // Si la orden pertenece a un rango, creamos la siguiente orden hija.
    const orderData = await ordersActions.getNewRangeOrderPayload(order);
    let i18nCtx;
    if (orderData) {
      let user;
      if (order.type === "sell") {
        user = sellerUser;
        i18nCtx = i18nCtxSeller;
      } else {
        user = buyerUser;
        i18nCtx = i18nCtxBuyer;
      }

      const newOrder = await ordersActions.createOrder(
        i18nCtx,
        bot,
        user,
        orderData,
      );

      if (newOrder) {
        if (order.type === "sell") {
          await messages.publishSellOrderMessage(
            bot,
            user,
            newOrder,
            i18nCtx,
            true,
          );
        } else {
          await messages.publishBuyOrderMessage(
            bot,
            user,
            newOrder,
            i18nCtx,
            true,
          );
        }
      }
    }

    // El vendedor recibe su reputación tras liberar fondos.
    await messages.rateUserMessage(bot, sellerUser, order, i18nCtxSeller);

    // Finalmente pagamos al comprador (buyer) con Monero.
    await payToBuyer(bot, order);
  } catch (error) {
    logger.error("payHoldInvoice catch:", error);
  }
};

export { subscribeInvoice, payHoldInvoice, PerOrderIdMutex };