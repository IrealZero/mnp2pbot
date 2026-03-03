const sinon = require('sinon');
const { expect } = require('chai');
const proxyquire = require('proxyquire');
export {};

describe('Flujo de hold-invoice (src/monero/hold_invoice.ts)', () => {
  let sandbox: any;
  let holdInvoice: any;
  let clientStub: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clientStub = {
      createInvoice: sinon.stub(),
      waitForPayment: sinon.stub(),
      cancelInvoice: sinon.stub().resolves(),
      getInvoiceInfo: sinon.stub(),
    };

    holdInvoice = proxyquire('../../src/monero/hold_invoice', {
      './client': clientStub,
      '../../logger': {
        logger: {
          error: sinon.stub(),
          warn: sinon.stub(),
          info: sinon.stub(),
          debug: sinon.stub(),
        },
      },
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('crea una hold-invoice con request/hash/secret', async () => {
    clientStub.createInvoice.resolves({
      address: '4A1...abcd?tx_payment_id=deadbeefdeadbeef',
      hash: 'deadbeefdeadbeef',
    });

    const { createHoldInvoice } = holdInvoice;

    const invoice = await createHoldInvoice({
      description: 'Test hold',
      amount: 100_000,
    });

    expect(invoice).to.deep.equal({
      request: '4A1...abcd?tx_payment_id=deadbeefdeadbeef',
      hash: 'deadbeefdeadbeef',
      secret: '',
    });
    expect(
      clientStub.createInvoice.calledOnceWithExactly({
        description: 'Test hold',
        amount: 100_000,
      }),
    ).to.be.true;
  });

  it('settleHoldInvoice devuelve true cuando waitForPayment confirma', async () => {
    clientStub.waitForPayment.resolves(true);
    const { settleHoldInvoice } = holdInvoice;

    const settled = await settleHoldInvoice({
      secret: '',
      hash: 'deadbeefdeadbeef',
    });

    expect(settled).to.equal(true);
    expect(clientStub.waitForPayment.calledOnceWithExactly('deadbeefdeadbeef')).to
      .be.true;
  });

  it('settleHoldInvoice lanza error si hash es null', async () => {
    const { settleHoldInvoice } = holdInvoice;

    let err;
    try {
      await settleHoldInvoice({ secret: '', hash: null });
    } catch (e: any) {
      err = e;
    }

    expect(err).to.be.instanceOf(Error);
    expect(err.message).to.equal('The hash cannot be null.');
  });

  it('cancelHoldInvoice delega en cancelInvoice', async () => {
    const { cancelHoldInvoice } = holdInvoice;
    await cancelHoldInvoice({ hash: 'deadbeefdeadbeef' });

    expect(clientStub.cancelInvoice.calledOnceWithExactly('deadbeefdeadbeef')).to
      .be.true;
  });
});
