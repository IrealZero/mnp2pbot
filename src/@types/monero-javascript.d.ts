declare module "monero-javascript" {
  // … (todo lo que ya teníamos antes) …

  export class MoneroWalletFull {
    // ---------- FACTORY ----------
    static createWalletRpc(options: {
      uri: string;
      username: string;
      password: string;
    }): Promise<MoneroWalletFull>;

    /** --------------------------------------------------------------
     *  MÉTODOS BÁSICOS DE CONSULTA
     * -------------------------------------------------------------- */
    /** Información general de la wallet (altura, sincronización, etc.). */
    getInfo(): Promise<any>;

    /** Balance total (después de aplicar la política de “locked”). */
    getBalance(): Promise<any>;


    /** --------------------------------------------------------------
     *  DIRECCIONES
     * -------------------------------------------------------------- */
    /**
     * Crea una dirección integrada (address + paymentId).
     * Devuelve un objeto con método `getAddress()`.
     */
    createIntegratedAddress(opts: { paymentId: string }): Promise<IntegratedAddressResult>;

    /**
     * (Opcional) Crea una sub‑address dentro de la cuenta indicada.
     */
    createSubaddress(
      accountIndex: number,
      subaddressIndex: number,
      label?: string
    ): Promise<SubaddressResult>;

    // <-- NUEVO: obtener cuentas y sub‑addresses -->
    getAccounts(): Promise<MoneroAccount[]>;

    /** --------------------------------------------------------------
     *  TRANSFERENCIAS ENTRANTES
     * -------------------------------------------------------------- */
    /**
     * Obtiene transferencias entrantes.
     *
     * Parámetros disponibles:
     *  - isPending?: boolean – true para transfers aún no confirmadas.
     *  - filterByPaymentId?: string – filtra por paymentId (cuando usas
     *    direcciones integradas).
     *  - address?: string – filtra por sub‑address o dirección integrada.
     */
    getIncomingTransfers(opts: {
      isPending?: boolean;
      filterByPaymentId?: string;
      address?: string;
    }): Promise<MoneroIncomingTransfer[]>;

       /** --------------------------------------------------------------
     *  TRANSFERENCIAS SALIENTES (opcional, para futuras extensiones)
     * -------------------------------------------------------------- */
    getOutgoingTransfers?(opts: {
      isPending?: boolean;
      address?: string;
    }): Promise<MoneroOutgoingTransfer[]>;


    // Creacion y envio de transacciones
    // Crea una transacción sin enviarla todavía, `amount` debe expresarse en piconeros (bigint).
    createTx(opts: { address: string; amount: bigint }): Promise<MoneroTx>;

    // Envía (submite) una transacción previamente creada con `createTx`, devuelve un objeto que contiene el hash de la tx.
    submitTx(tx: MoneroTx): Promise<SubmittedTxResult>;

    // ...añade aquí cualquier otro método que vayamos a usar.
  }

  // ------------------------------------------------------------------
  // TIPOS AUXILIARES
  // ------------------------------------------------------------------

  /** Resultado de createIntegratedAddress */
  export interface IntegratedAddressResult {
  /** Dirección completa en formato `monero:<address>?tx_payment_id=…` */
    getAddress(): string;
  }

  /** Resultado de createSubaddress */
  export interface SubaddressResult {
    /** Dirección de la sub‑address recién creada */
    getAddress(): string;
    /** Índice de la cuenta (normalmente 0) */
    getAccountIndex(): number;
    /** Índice de la sub‑address dentro de la cuenta */
    getSubaddressIndex(): number;
    /** Etiqueta opcional asignada al crear la sub‑address */
    getLabel(): string | undefined;
  }

  /** Representa una cuenta completa (con sus sub‑addresses) */
  export interface MoneroAccount {
    /** Índice de la cuenta (0, 1, …) */
    getAccountIndex(): number;
    /** Balance total de la cuenta (piconeros) */
    getBalance(): string;
    /** Lista de sub‑addresses pertenecientes a esta cuenta */
    getSubaddresses(): MoneroSubaddress[];
  }

  /** Representa una sub‑address dentro de una cuenta */
  export interface MoneroSubaddress {
    /** Índice de la sub‑address dentro de su cuenta */
    getSubaddressIndex(): number;
    /** Dirección en formato string */
    getAddress(): string;
    /** Etiqueta opcional asignada al crear la sub‑address */
    getLabel(): string | undefined;
    /** Balance de la sub‑address (piconeros) */
    getBalance(): string;
    /** Indica si la sub‑address está etiquetada como “used” */
    isUsed(): boolean;
  }

  /** Representa una transferencia entrante (un UTXO de Monero). */
  export interface MoneroIncomingTransfer {
    /** Número de confirmaciones actuales (0 = pendiente). */
    getNumConfirmations(): Promise<number>;

    /** Hash de la transacción que originó esta transferencia. */
    getTxHash(): string;

    /** Key image asociada a la salida (única por cada gasto). */
    getKeyImage(): string;

    /** Cantidad recibida, expresada en piconeros (string para evitar overflow). */
    getAmount(): string;

    /** Dirección que recibió la transferencia (puede ser sub‑address o integrada). */
    getAddress(): string;

    /** Payment ID asociado (vacío si la dirección es una sub‑address). */
    getPaymentId(): string | undefined;
  }

  /** Representa una transferencia saliente. */
  export interface MoneroOutgoingTransfer {
    getNumConfirmations(): Promise<number>;
    getTxHash(): string;
    getKeyImage(): string;
    getAmount(): string;
    getDestinationAddress(): string;
  }

  /** Objeto devuelto por `createTx`. */
  export interface MoneroTx {
    /** Hash provisional (puede ser undefined hasta que se envíe). */
    getTxHash(): string | undefined;

    /** Serializa la transacción para inspección/debug. */
    toHex(): string;
  }

  /** Resultado de `submitTx`. */
  export interface SubmittedTxResult {
    /** Hash definitivo de la transacción aceptada por la red. */
    getTxHash(): string;

    /** Información adicional (por ejemplo, fee). */
    getFee(): string;

  // (puedes seguir añadiendo más tipos según se necesite)
 }
}
