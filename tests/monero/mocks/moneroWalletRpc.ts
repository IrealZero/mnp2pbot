import { EventEmitter } from 'events';
const sinon = require('sinon');

/**
 * Devuelve un objeto que simula `MoneroWalletFull`.
 * Cada método es un stub de Sinon que puedes configurar por prueba.
 */
export function getMockMoneroWallet() {
  const wallet: any = new EventEmitter();

  // Métodos/Stubs que utiliza el wrapper
  wallet.getInfo = sinon.stub().resolves({ height: 300_000 });
  wallet.getBalance = sinon.stub().resolves({ unlocked_balance: '1000000000000' }); // 1 XMR
  wallet.createIntegratedAddress = sinon.stub();
  wallet.getAccounts = sinon.stub();
  wallet.createSubaddress = sinon.stub();
  wallet.getIncomingTransfers = sinon.stub();
  wallet.createTx = sinon.stub();
  wallet.submitTx = sinon.stub();

  /**
 * Tipo interno que describe el mock del wallet.
 * Cada método que usamos en los tests es un any.
 * Además tiene un método `reset()` para limpiar los stubs.
 */
type MockMoneroWallet = {
  // Métodos que realmente usamos en el código del fork
  getInfo: any;
  getBalance: any;
  createIntegratedAddress: any;
  getAccounts: any;
  createSubaddress: any;
  getIncomingTransfers: any;
  createTx: any;
  submitTx: any;

  // Helper que usamos sólo en los tests
  reset: () => void;
};

  // Resetear todos los stubs entre tests

  wallet.reset = () => {
    // Recorremos todas las propiedades del objeto.
    // Si la propiedad es any, limpiamos su historial.
    Object.values(wallet).forEach(fn => {
      // Los stubs de Sinon tienen la función `resetHistory`.
      if (typeof (fn as any)?.resetHistory === 'function') {
        (fn as any).resetHistory();
      }
    });
  };

// Devolvemos el mock tipado (aunque los métodos son `any`).
  return wallet as MockMoneroWallet;
}