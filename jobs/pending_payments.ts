// src/jobs/pending_payments.ts
import { PendingPayment, Order, User, Community } from '../models';
import * as messages from '../bot/messages';
import { logger } from '../logger';
import { Telegraf } from 'telegraf';
import {
  payRequest,
  PayResult,
  isPendingPayment,
} from '../src/monero/pay_request'; // ← Wrapper Monero
import { I18nContext } from '@grammyjs/i18n';
import { getUserI18nContext } from '../util';
import { CommunityContext } from '../bot/modules/community/communityContext';
import { orderUpdated } from '../bot/modules/events/orders';
import { moneroSuccessToLightningResult } from '../src/monero/pay_request';
import {
  PayViaPaymentRequestResult as LightningPayResult,
} from 'lightning/lnd_methods/offchain/pay_via_payment_request';
import { SuccessPayment } from '../src/@types/payments';   // ← Tipo de éxito que devuelve nuestro wrapper Monero
/* -----------------------------------------------------------------
   ATTEMPT PENDING PAYMENTS (USERS)
   ----------------------------------------------------------------- */
export const attemptPendingPayments = async (
  bot: Telegraf<CommunityContext>,
): Promise<void> => {
  const pendingPayments = await PendingPayment.find({
    paid: false,
    attempts: { $lt: process.env.PAYMENT_ATTEMPTS },
    is_invoice_expired: false,
    community_id: null,
    next_retry: { $lte: new Date() },
  });

  for (const pending of pendingPayments) {
    const order = await Order.findOne({ _id: pending.order_id });
    try {
      if (!order) throw new Error('Order was not found in DB');

      // -----------------------------------------------------------------
      // I Incrementamos intentos y calculamos back‑off exponencial
      // -----------------------------------------------------------------
      pending.attempts++;
      const baseDelay = 5 * 60 * 1000; // 5 min
      const exponentialDelay = baseDelay * Math.pow(2, pending.attempts - 1);
      const maxDelay = 60 * 60 * 1000; // 1 h
      pending.next_retry = new Date(
        Date.now() + Math.min(exponentialDelay, maxDelay),
      );

      // Si la orden ya está marcada como SUCCESS, la marcamos como pagada y seguimos
      if (order.status === 'SUCCESS') {
        pending.paid = true;
        await pending.save();
        logger.info(`Order id: ${order._id} was already paid`);
        continue;
      }

      // -----------------------------------------------------------------
      // II Verificamos si hay pagos en curso (old y new)
      // -----------------------------------------------------------------
      const isPendingOldPayment = await isPendingPayment(order.buyer_invoice);
      const isPendingNewPayment = await isPendingPayment(pending.payment_request);
      if (isPendingOldPayment || isPendingNewPayment) continue; // nada que hacer ahora

      // -----------------------------------------------------------------
      // III  Intentamos pagar con Monero
      // -----------------------------------------------------------------
      const paymentResult: PayResult = await payRequest({
        amount: pending.amount,
        request: pending.payment_request,
      });

      const buyerUser = await User.findOne({ _id: order.buyer_id });
      if (!buyerUser) throw new Error('buyerUser was not found in DB');
      const i18nCtx: I18nContext = await getUserI18nContext(buyerUser);

      // -----------------------------------------------------------------
      // IIII  Caso de ÉXITO (SuccessPayment)
      // -----------------------------------------------------------------
      if ('confirmed_at' in paymentResult) {
        const success = paymentResult as SuccessPayment;

  // Convertimos al formato que esperan los mensajes de Lightning
  const payResultForMessages: LightningPayResult =
    moneroSuccessToLightningResult(success);

        // Actualizamos la orden y el registro pending
        order.status = 'SUCCESS';
        order.routing_fee = success.fee;
        pending.paid = true;
        pending.paid_at = new Date();

        // Estadísticas de usuarios
        buyerUser.trades_completed++;
        await buyerUser.save();
        const sellerUser = await User.findOne({ _id: order.seller_id });
        if (sellerUser) {
          sellerUser.trades_completed++;
          await sellerUser.save();
        }

        logger.info(`Invoice with hash: ${pending.hash} paid`);

        // ---------- MENSAJES ----------
        await messages.toAdminChannelPendingPaymentSuccessMessage(
          bot,
          buyerUser,
          order,
          pending,
          payResultForMessages,
          i18nCtx,
        );
        await messages.toBuyerPendingPaymentSuccessMessage(
          bot,
          buyerUser,
          order,
          payResultForMessages,
          i18nCtx,
        );
        await messages.rateUserMessage(bot, buyerUser, order, i18nCtx);
      } else {
        // -----------------------------------------------------------------
        // IIIII Caso de FALLA (ErrorPayment)
        // -----------------------------------------------------------------
        const errObj = paymentResult as { error: string; message: any };
        pending.last_error = errObj.error;

        if (errObj.error === 'TIMEOUT') {
          logger.warning(
            `Payment timeout for order ${order._id}, attempt ${pending.attempts}`,
          );
        } else if (errObj.error === 'ROUTING_FAILED') {
          logger.warning(
            `Routing failed for order ${order._id}, attempt ${pending.attempts}`,
          );
        } else {
          logger.error(
            `Payment failed for order ${order._id}, attempt ${pending.attempts}, error: ${errObj.error}`,
          );
        }

        // Si agotamos los intentos, notificamos al comprador
        if (
          process.env.PAYMENT_ATTEMPTS !== undefined &&
          pending.attempts >= parseInt(process.env.PAYMENT_ATTEMPTS)
        ) {
          order.paid_hold_buyer_invoice_updated = false;
          await messages.toBuyerPendingPaymentFailedMessage(
            bot,
            buyerUser,
            order,
            i18nCtx,
          );
        }
        await messages.toAdminChannelPendingPaymentFailedMessage(
          bot,
          buyerUser,
          order,
          pending,
          i18nCtx,
        );
      }
    } catch (error: any) {
      logger.error(`attemptPendingPayments catch error: ${error}`);
    } finally {
      if (order) {
        await order.save();
        orderUpdated(order);
      }
      await pending.save();
    }
  }
};

/* -----------------------------------------------------------------
   ATTEMPT COMMUNITY PENDING PAYMENTS
   ----------------------------------------------------------------- */
export const attemptCommunitiesPendingPayments = async (
  bot: Telegraf<CommunityContext>,
): Promise<void> => {
  const pendingPayments = await PendingPayment.find({
    paid: false,
    attempts: { $lt: process.env.PAYMENT_ATTEMPTS },
    is_invoice_expired: false,
    community_id: { $ne: null },
    next_retry: { $lte: new Date() },
  });

  for (const pending of pendingPayments) {
    try {
      // -----------------------------------------------------------------
      //  Incrementamos intentos y calculamos back‑off exponencial
      // -----------------------------------------------------------------
      pending.attempts++;
      const baseDelay = 5 * 60 * 1000; // 5 min
      const exponentialDelay = baseDelay * Math.pow(2, pending.attempts - 1);
      const maxDelay = 60 * 60 * 1000; // 1 h
      pending.next_retry = new Date(
        Date.now() + Math.min(exponentialDelay, maxDelay),
      );

      // -----------------------------------------------------------------
      // II  Verificamos si ya hay un pago en curso
      // -----------------------------------------------------------------
      const isPending = await isPendingPayment(pending.payment_request);
      if (isPending) continue; // nada que hacer ahora

      // -----------------------------------------------------------------
      // III  Intentamos pagar con Monero
      // -----------------------------------------------------------------
      const paymentResult: PayResult = await payRequest({
        amount: pending.amount,
        request: pending.payment_request,
      });

      const user = await User.findById(pending.user_id);
      if (!user) throw new Error('User was not found in DB');
      const i18nCtx: I18nContext = await getUserI18nContext(user);

      // -----------------------------------------------------------------
      // IIII  Caso de ÉXITO (SuccessPayment)
      // -----------------------------------------------------------------
      if ('confirmed_at' in paymentResult) {
        const success = paymentResult as SuccessPayment;

        // Convertimos a la forma que esperan los mensajes (aunque aquí solo
        // enviamos un mensaje directo al usuario, lo usamos por consistencia)
        const payResultForMessages = moneroSuccessToLightningResult(success);

        pending.paid = true;
        pending.paid_at = new Date();

        const community = await Community.findById(pending.community_id);
        if (!community) throw new Error('Community was not found in DB');

        // Reiniciamos los contadores de la comunidad
        community.earnings = 0;
        community.orders_to_redeem = 0;
        await community.save();

        logger.info(
          `Community ${community.id} withdrew ${pending.amount} sats, invoice with hash: ${payResultForMessages.id} was paid`,
        );

        // Mensaje al usuario de la comunidad
        await bot.telegram.sendMessage(
          user.tg_id,
          i18nCtx.t('pending_payment_success', {
            id: community.id,
            amount: pending.amount,
            // En la versión Lightning se enviaba `payment.secret`. En Monero
            // usamos el hash de la transacción como “secret”.
            paymentSecret: payResultForMessages.id,
          }),
        );
      } else {
        // -----------------------------------------------------------------
        // IIIII  Caso de FALLA (ErrorPayment)
        // -----------------------------------------------------------------
        const errObj = paymentResult as { error: string; message: any };
        pending.last_error = errObj.error;

        const community = await Community.findById(pending.community_id);
        if (!community) throw new Error('Community was not found in DB');

        if (errObj.error === 'TIMEOUT') {
          logger.warning(`Timeout al retirar fondos de la comunidad ${community.id}`);
        } else if (errObj.error === 'ROUTING_FAILED') {
          logger.warning(`Routing falló al retirar fondos de la comunidad ${community.id}`);
        } else {
          logger.error(`Retiro falló en la comunidad ${community.id}: ${errObj.error}`);
        }

        // Si agotamos los intentos, avisamos al usuario
        if (
          process.env.PAYMENT_ATTEMPTS !== undefined &&
          pending.attempts >= parseInt(process.env.PAYMENT_ATTEMPTS)
        ) {
          await bot.telegram.sendMessage(
            user.tg_id,
            i18nCtx.t('pending_payment_failed', {
              attempts: pending.attempts,
            }),
          );
        }
      }
    } catch (error) {
      logger.error(`attemptCommunitiesPendingPayments catch error: ${error}`);
    } finally {
      await pending.save();
    }
  }
};