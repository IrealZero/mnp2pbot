// src/monero/client.ts
import { MoneroWalletFull } from "monero-javascript";
import crypto from "crypto";
import { logger } from "../../logger";

interface MoneroInvoice {
  address: string;          // dirección integrada (address + paymentId)
  paymentId: string;        // 16‑byte hex
  amountPicoXmr: bigint;    // 1 piconero = 10⁻¹² XMR
}

/** Obtiene una instancia del wallet‑rpc */
export async function getWallet(): Promise<MoneroWalletFull> {
  const rpcUrl = process.env.MONERO_WALLET_RPC_URL;
  const user   = process.env.MONERO_WALLET_USER;
  const pass   = process.env.MONERO_WALLET_PASS;

  if (!rpcUrl || !user || !pass) {
    throw new Error(
      "Missing MONERO_WALLET_* env vars (RPC URL, USER, PASS)"
    );
  }

  logger.info(`Connecting to Monero wallet RPC at ${rpcUrl}`);
  return await MoneroWalletFull.createWalletRpc({
    uri: rpcUrl,
    username: user,
    password: pass,
  });
}

/** Convierte satoshis → piconeros usando PRICE_SAT_PER_XMR */
function satToPicoXmr(sat: number): bigint {
  const priceSatPerXmr = Number(process.env.PRICE_SAT_PER_XMR ?? "1000");
  if (priceSatPerXmr <= 0) throw new Error("Invalid PRICE_SAT_PER_XMR");
  const picoPerXmr = 1_000_000_000_000n; // 1 XMR = 10¹² pico‑XMR
  return (BigInt(sat) * picoPerXmr) / BigInt(priceSatPerXmr);
}

/** Crea una “factura” Monero (dirección integrada + paymentId) */
export async function createInvoice({
  description,
  amount,
}: {
  description: string;   // solo para logging, no se guarda en la cadena
  amount: number;        // en satoshis (para mantener compatibilidad)
}): Promise<MoneroInvoice & { hash: string }> {
  const wallet = await getWallet();

  // 1️⃣ Convertir monto
  const amountPicoXmr = satToPicoXmr(amount);

  // 2️⃣ Generar paymentId (16 bytes hex)
  const paymentId = crypto.randomBytes(8).toString("hex");

  // 3️⃣ Crear dirección integrada (address + paymentId)
  const integrated = await wallet.createIntegratedAddress({ paymentId });
  const address = integrated.getAddress();

  logger.info(
    `Monero invoice created – ${amount} sat (~${amountPicoXmr} pico‑XMR) ` +
    `addr=${address} pid=${paymentId}`
  );

  // Para que el resto del código siga esperando un “hash”, devolvemos el paymentId
  return { address, paymentId, amountPicoXmr, hash: paymentId };
}

/** Espera (polling) a que la paymentId sea pagada */
export async function waitForPayment(
  paymentId: string,
  timeoutSec = 7200, // 2 h por defecto (igual que en LN)
): Promise<boolean> {
  const wallet = await getWallet();
  const deadline = Date.now() + timeoutSec * 1000;

  logger.info(`Waiting for Monero paymentId ${paymentId}`);

  while (Date.now() < deadline) {
    const incoming = await wallet.getIncomingTransfers({
      isPending: false,
      filterByPaymentId: paymentId,
    });

    if (incoming.length > 0) {
      logger.info(`Payment received for paymentId ${paymentId}`);
      return true;
    }

    // 5 s de intervalo
    await new Promise(r => setTimeout(r, 5_000));
  }

  logger.warn(`Timeout waiting for paymentId ${paymentId}`);
  return false;
}

/** Envía XMR a una dirección (pago al vendedor) */
export async function sendPayment({
  toAddress,
  amountPicoXmr,
}: {
  toAddress: string;
  amountPicoXmr: bigint;
}): Promise<string> {
  const wallet = await getWallet();

  logger.info(
    `Sending ${amountPicoXmr} pico‑XMR to ${toAddress}`
  );

  const tx = await wallet.createTx({
    address: toAddress,
    amount: amountPicoXmr,
  });

  const submitted = await wallet.submitTx(tx);
  const txHash = submitted.getTxHash();

  logger.info(`Monero payment sent – txHash=${txHash}`);
  return txHash;
}

/** Opcional: cancelar una factura (solo marca en BD) */
export async function cancelInvoice(paymentId: string): Promise<void> {
  // No hay forma de “revertir” en cadena. La función solo sirve
  // para que el código de la app pueda registrar el estado CANCELLED.
  logger.warn(`Cancel request for paymentId ${paymentId} – no on‑chain action`);
}

/** Obtener información de una factura (solo para logs) */
export async function getInvoiceInfo(paymentId: string): Promise<any> {
  const wallet = await getWallet();
  const incoming = await wallet.getIncomingTransfers({
    filterByPaymentId: paymentId,
  });
  return incoming;
}