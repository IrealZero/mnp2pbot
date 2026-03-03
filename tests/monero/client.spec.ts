const { getMockMoneroWallet } = require('./mocks/moneroWalletRpc');
const sinon = require('sinon');
const { expect } = require('chai');
const proxyquire = require('proxyquire');

describe('Monero client (src/monero/client.ts)', () => {
  let sandbox: any;
  let walletMock: any;
  let client: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    walletMock = getMockMoneroWallet();

    sandbox.stub(process, 'env').value({
      MONERO_WALLET_RPC_URL: 'http://localhost:18081/json_rpc',
      MONERO_WALLET_USER: 'user',
      MONERO_WALLET_PASS: 'pass',
      PRICE_SAT_PER_XMR: '1000',
    });

    const loggerStub = {
      error: sinon.stub(),
      notice: sinon.stub(),
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
    };

    client = proxyquire('../../src/monero/client', {
      'monero-javascript': {
        MoneroWalletFull: {
          createWalletRpc: sinon.stub().resolves(walletMock),
        },
      },
      '../../logger': { logger: loggerStub },
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('crea una dirección integrada con paymentId aleatorio', async () => {
    const fakeAddr = '4A1...abcd?tx_payment_id=deadbeefdeadbeef';
    walletMock.createIntegratedAddress.resolves({ getAddress: () => fakeAddr });

    const result = await client.createInvoice({
      description: 'test invoice',
      amount: 1000,
    });

    expect(result).to.have.property('address', fakeAddr);
    expect(result)
      .to.have.property('paymentId')
      .that.matches(/^[0-9a-f]{16}$/);
    expect(result.hash).to.equal(result.paymentId);
    expect(result.amountPicoXmr).to.equal(1_000_000_000_000n);
    expect(walletMock.createIntegratedAddress.calledOnce).to.be.true;
  });

  it('espera a que llegue el pago y devuelve true', async () => {
    const paymentId = 'deadbeefdeadbeef';
    const clock = sandbox.useFakeTimers();

    walletMock.getIncomingTransfers.onCall(0).resolves([]);
    walletMock.getIncomingTransfers.onCall(1).resolves([{}]);

    const waitPromise = client.waitForPayment(paymentId, 6);
    await Promise.resolve();
    await clock.tickAsync(5000);
    const ok = await waitPromise;

    expect(ok).to.be.true;
    expect(walletMock.getIncomingTransfers.calledTwice).to.be.true;
    expect(
      walletMock.getIncomingTransfers.firstCall.calledWithExactly({
        isPending: false,
        filterByPaymentId: paymentId,
      }),
    ).to.be.true;
  });

  it('devuelve false cuando se agota el timeout', async () => {
    const paymentId = 'deadbeefdeadbeef';
    const clock = sandbox.useFakeTimers();

    walletMock.getIncomingTransfers.resolves([]);

    const waitPromise = client.waitForPayment(paymentId, 1);
    await Promise.resolve();
    await clock.tickAsync(5000);
    const ok = await waitPromise;

    expect(ok).to.be.false;
  });

  it('crea y envía una transacción', async () => {
    const address = '44AFFq5kSiGBoZ...';
    const amount = BigInt(1_000_000_000_000);

    const fakeTx = { toHex: () => 'deadbeef' };
    walletMock.createTx.resolves(fakeTx);
    walletMock.submitTx.resolves({ getTxHash: () => 'txHash123' });

    const txHash = await client.sendPayment({
      toAddress: address,
      amountPicoXmr: amount,
    });

    expect(txHash).to.equal('txHash123');
    expect(walletMock.createTx.calledOnceWithExactly({ address, amount })).to.be
      .true;
    expect(walletMock.submitTx.calledOnceWithExactly(fakeTx)).to.be.true;
  });

  it('devuelve undefined (no on-chain action) al cancelar', async () => {
    const result = await client.cancelInvoice('cualquier-id');
    expect(result).to.be.undefined;
  });
});
