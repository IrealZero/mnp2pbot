// src/monero/pay_request.ts
import { logger, logTimeout, logOperationDuration } from "../../logger";
import { User, PendingPayment } from "../../models";
import { getUserI18nContext } from "../../util";
import * as messages from "../../bot/messages";
import * as OrderEvents from "../../bot/modules/events/orders";
import { IOrder } from "../../models/order";
import { HasTelegram } from "../../bot/start";

import {
  createInvoice,
  sendPayment,
  waitForPayment,
} from "./client";

/* -----------------------------------------------------------------
   TIPOS DE RESULTADO DE PAYREQUEST
   ----------------------------------------------------------------- */
export interface SuccessPayment {
  id: string;            // hash de la transacción Monero
  fee: number;           // tarifa estimada (no exacta)
  confirmed_at: string;  // timestamp ISO
}

export interface ErrorPayment {
  error: string;         // TIMEOUT, INSUFFICIENT_BALANCE, UNKNOWN, …
  message: any;
}

export type PayResult = SuccessPayment | ErrorPayment;

/* -----------------------------------------------------------------
   PARSE DE LA REQUEST
   ----------------------------------------------------------------- */
/**
 * En Lightning la request era una BOLT‑11 string.
 * En Monero la request es la **dirección integrada** (string) que
 * generamos en `createInvoice`. No lleva información de monto,
 * por lo que el monto se pasa por separado (en satoshis, como antes).
 *
 * Mantiene la firma original:
 *   payRequest({ request: string, amount: number })
 */
const payRequest = async ({
  request,
  amount,
}: {
  request: string; // dirección integrada Monero
  amount: number;  // satoshis (para cálculo de fee, etc.)
}): Promise<PayResult> => {
  const startTime = Date.now();
  const operationName = "payRequest";

  try {
    // -----------------------------------------------------------------
    // 1️⃣ Convertir satoshis → pico‑XMR (el mismo factor usado al crear la factura)
    // -----------------------------------------------------------------
    const amountPicoXmr = (() => {
      const priceSatPerXmr = Number(process.env.PRICE_SAT_PER_XMR ?? "1000");
      const picoPerXmr = 1_000_000_000_000n; // 1 XMR = 10¹² pico‑XMR
      return (BigInt(amount) * picoPerXmr) / BigInt(priceSatPerXmr);
    })();

    // -----------------------------------------------------------------
    // 2️⃣ Calcular máximo fee (simulamos la lógica de Lightning)
    // -----------------------------------------------------------------
    const maxRoutingFee = process.env.MAX_ROUTING_FEE;
    if (maxRoutingFee === undefined) {
      throw new Error("Environment variable MAX_ROUTING_FEE is not defined");
    }
    const maxFee = amount * parseFloat(maxRoutingFee);
    if (maxFee < 0) {
      throw new Error("Calculated max fee is negative – aborting payment");
    }

    // -----------------------------------------------------------------
    // 3️⃣ Enviar el pago
    // -----------------------------------------------------------------
    logger.info(
      `Starting Monero payment of ${amount} sat (~${amountPicoXmr} pico‑XMR) to ${request}`,
    );

    const txHash = await sendPayment({
      toAddress: request,
      amountPicoXmr,
    });

    // -----------------------------------------------------------------
    // 4️⃣ Construir el objeto de respuesta (similar al de Lightning)
    // -----------------------------------------------------------------
    const paymentResult: SuccessPayment = {
      id: txHash,
      fee: maxFee,
      confirmed_at: new Date().toISOString(),
    };

    logOperationDuration(operationName, startTime, true);
    return paymentResult;
  } catch (error: any) {
    const errorMessage = error.toString();

    logOperationDuration(operationName, startTime, false);

    // -----------------------------------------------------------------
    // Manejo de errores (adaptado a Monero)
    // -----------------------------------------------------------------
    if (errorMessage.includes("Timeout")) {
      logTimeout("payRequest", 0, error);
      logger.error(`payRequest timeout: ${errorMessage}`);
      return { error: "TIMEOUT", message: errorMessage };
    }

    if (errorMessage.includes("InsufficientBalance")) {
      logger.error(`payRequest insufficient balance: ${errorMessage}`);
      return { error: "INSUFFICIENT_BALANCE", message: errorMessage };
    }

    // Otros errores genéricos
    logger.error(`payRequest unexpected error: ${errorMessage}`);
    return { error: "UNKNOWN", message: errorMessage };
  }
};

/* -----------------------------------------------------------------
   payToBuyer – lógica de negocio
   ----------------------------------------------------------------- */
const payToBuyer = async (bot: HasTelegram, order: IOrder) => {
  try {
    // -----------------------------------------------------------------
    // 1️⃣ Verificar si ya se pagó (Monero → waitForPayment)
    // -----------------------------------------------------------------
    const alreadyPaid = await waitForPayment(order.buyer_invoice, 0);
    if (alreadyPaid) {
      // Ya está pagado, no hacemos nada.
      return;
    }

    // -----------------------------------------------------------------
    // 2️⃣ Intentar pagar al comprador (el vendedor paga al comprador)
    // -----------------------------------------------------------------
    const payment = await payRequest({
      request: order.buyer_invoice, // dirección integrada del comprador
      amount: order.amount,
    });

    const buyerUser = await User.findOne({ _id: order.buyer_id });
    if (!buyerUser) throw new Error("buyerUser was not found");

    const i18nCtx = await getUserI18nContext(buyerUser);

    // -----------------------------------------------------------------
    // 3️⃣ Caso de invoice expirada (no aplica en Monero, pero lo mantenemos)
    // -----------------------------------------------------------------
    if ((payment as any).is_expired) {
      await messages.expiredInvoiceOnPendingMessage(
        bot,
        buyerUser,
        order,
        i18nCtx,
      );
      return;
    }

    const sellerUser = await User.findOne({ _id: order.seller_id });
    if (!sellerUser) throw new Error("sellerUser was not found");

    // -----------------------------------------------------------------
    // 4️⃣ Pago exitoso
    // -----------------------------------------------------------------
    if ("confirmed_at" in payment) {
      // Aquí TypeScript sabe que `payment` es SuccessPayment
      logger.info(
        `Order ${order._id} - Monero payment txHash: ${payment.id} sent`,
      );
      order.status = "SUCCESS";
      // En Monero no disponemos de una tarifa exacta; usamos la estimada.
      order.routing_fee = payment.fee ?? 0;
    } else {
      // Este bloque nunca debería ejecutarse, pero lo dejamos por seguridad.
      logger.warn(
        `Order ${order._id} - Payment succeeded but missing tx id`,
      );
      order.status = "SUCCESS";
      order.routing_fee = 0;
    }

    // -----------------------------------------------------------------
    // 5️⃣ Persistir cambios y notificar
    // -----------------------------------------------------------------
    await order.save();
    OrderEvents.orderUpdated(order);

    await messages.buyerReceivedSatsMessage(
      bot,
      buyerUser,
      sellerUser,
      i18nCtx,
    );
    await messages.rateUserMessage(bot, buyerUser, order, i18nCtx);
  } catch (error) {
    logger.error(`payToBuyer catch: ${(error as Error).message}`);
  }
};

/* -----------------------------------------------------------------
   isPendingPayment – verifica si una factura (dirección integrada) ya está pagada.
   ----------------------------------------------------------------- */
const isPendingPayment = async (request: string) => {
  try {
    // `request` es la dirección integrada (contiene paymentId)
    const paid = await waitForPayment(request, 0);
    return paid;
  } catch (error: any) {
    const message = error.toString();
    logger.error(`isPendingPayment catch error: ${message}`);
    return false;
  }
};

export { payRequest, payToBuyer, isPendingPayment };