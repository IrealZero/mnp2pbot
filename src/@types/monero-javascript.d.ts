// src/@types/monero-javascript.d.ts
declare module "monero-javascript" {
  /**
   * Exportamos los símbolos que usamos en el proyecto.
   * Si en algún momento necesitas tipos más precisos, puedes ir
   * ampliando estas interfaces.
   */
  export class MoneroWalletFull {
    static createWalletRpc(options: {
      uri: string;
      username: string;
      password: string;
    }): Promise<MoneroWalletFull>;

    // Métodos que usamos en el wrapper:
    getInfo(): Promise<any>;
    getBalance(): Promise<any>;
    createIntegratedAddress(opts: { paymentId: string }): Promise<any>;
    getIncomingTransfers(opts: {
      isPending?: boolean;
      filterByPaymentId?: string;
    }): Promise<any[]>;
    createTx(opts: {
      address: string;
      amount: bigint;
    }): Promise<any>;
    submitTx(tx: any): Promise<any>;
  }

  // Si usas otras clases/utilidades de la lib, añádelas aquí.
}