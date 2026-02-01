// src/util/qr.ts
import QRCode from "qrcode";

/**
 * Genera una **data‑URL** (base64) que representa el QR de una
 * dirección Monero integrada.
 *
 * La URI que codificamos sigue el estándar Monero:
 *   monero:<address>?tx_payment_id=<paymentId>
 *
 * @param address      Dirección integrada (ej.: 44AFFq5kSiGBoZ...).
 * @param paymentId    Payment‑ID de 16 bytes en hexadecimal.
 * @returns            Promesa que resuelve con la data‑URL del QR.
 *
 * Ejemplo de uso:
 * ```ts
 * import { generateMoneroQr } from "../../util/qr";
 *
 * const qr = await generateMoneroQr(order.moneroAddress!, order.moneroPaymentId!);
 * await ctx.replyWithPhoto(qr, { caption: i18n.t('invoice_qr', { amount }) });
 * ```
 */
export async function generateMoneroQr(
  address: string,
  paymentId: string,
): Promise<string> {
  // Construimos la URI Monero conforme a la especificación.
  // Nota: `paymentId` ya está en formato hexadecimal (16 bytes → 32 chars).
  const moneroUri = `monero:${address}?tx_payment_id=${paymentId}`;

  // `QRCode.toDataURL` devuelve una cadena `data:image/png;base64,…`
  // que Telegram acepta directamente con `replyWithPhoto`.
  try {
    return await QRCode.toDataURL(moneroUri);
  } catch (err) {
    // En caso de error, lanzamos una excepción para que el caller lo capture.
    // Puedes personalizar el mensaje o registrar en tu logger.
    throw new Error(`Failed to generate QR code: ${(err as Error).message}`);
  }
}

/**
 * (Opcional) Si en algún punto necesitas la URI sin generar la imagen,
 * puedes exportar una pequeña helper:
 */
export function buildMoneroUri(address: string, paymentId: string): string {
  return `monero:${address}?tx_payment_id=${paymentId}`;
}