// src/monero/info.ts
import { logger } from "../../logger";
import { getWallet } from "./client";

/**
 * Obtiene información básica del wallet Monero.
 * Equivalente a `lightning.getWalletInfo`.
 * Devuelve un objeto con los campos que el bot necesita (balance,
 * sincronización, etc.).
 */
const getInfo = async () => {
  try {
    const wallet = await getWallet();

    // Balance total (desbloqueado + bloqueado)
    const balance = await wallet.getBalance();

        // Información de alto nivel
    const info = await wallet.getInfo();

    // Versión del daemon (para logs/debug)
    const version = info.daemon_version ?? info.version ?? "unknown";

    // Construimos un objeto parecido al que devolvía LND
    return {
      alias: info.getAlias(),                 // nombre del nodo (opcional)
      public_key: info.getPublicKey(),        // no existe en Monero, lo dejamos vacío
      version,
      block_height: info.getBlockHeight(),
      synced_to_chain: info.isSynced(),
      testnet: info.isTestnet(),
      // Balance en piconeros → convertimos a satoshis usando el mismo factor
      // que usamos en `createInvoice`. Si no tienes PRICE_SAT_PER_XMR,
      // simplemente devolvemos el balance crudo.
      balance: Number(balance.unlocked.balance) / 1_000_000_000_000, // XMR → sat (aprox.)
    };
  } catch (err) {
    logger.error(`Monero getInfo error: ${(err as Error).message}`);
    throw err;
  }
};

export { getInfo };