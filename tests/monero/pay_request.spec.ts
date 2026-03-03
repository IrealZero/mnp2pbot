const sinon = require('sinon');
const { expect } = require('chai');
const proxyquire = require('proxyquire');
export {};

describe('Flujo de pay-request (src/monero/pay_request.ts)', () => {
  let sandbox: any;
  let payMod: any;
  let clientStub: any;
  let loggerStub: any;
  let logOperationDurationStub: any;
  let logTimeoutStub: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    sandbox.stub(process, 'env').value({
      MAX_ROUTING_FEE: '0.01',
      PRICE_SAT_PER_XMR: '1000',
    });

    clientStub = {
      createInvoice: sinon.stub(),
      sendPayment: sinon.stub(),
      waitForPayment: sinon.stub(),
    };
    loggerStub = {
      error: sinon.stub(),
      notice: sinon.stub(),
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
    };
    logOperationDurationStub = sinon.stub();
    logTimeoutStub = sinon.stub();

    payMod = proxyquire('../../src/monero/pay_request', {
      './client': clientStub,
      '../../logger': {
        logger: loggerStub,
        logTimeout: logTimeoutStub,
        logOperationDuration: logOperationDurationStub,
      },
      '../../models': {
        User: { findOne: sinon.stub() },
        PendingPayment: {},
      },
      '../../util': {
        getUserI18nContext: sinon.stub(),
      },
      '../../bot/messages': {},
      '../../bot/modules/events/orders': {},
      '../../models/order': {},
      '../../bot/start': {},
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('payRequest devuelve SuccessPayment cuando sendPayment responde txHash', async () => {
    clientStub.sendPayment.resolves('txHash123');
    const { payRequest } = payMod;

    const result = await payRequest({
      request: '44AFFq5kSiGBoZ...',
      amount: 5000,
    });

    expect(clientStub.sendPayment.calledOnce).to.be.true;
    expect(result).to.have.property('id').that.is.a('string');
    expect(result).to.have.property('fee').that.is.a('number');
    expect(result).to.have.property('confirmed_at').that.is.a('string');
    expect(result.id).to.equal('txHash123');
    expect(result.fee).to.equal(50);
    expect(logOperationDurationStub.calledOnce).to.be.true;
  });

  it('payRequest devuelve TIMEOUT cuando sendPayment falla por timeout', async () => {
    clientStub.sendPayment.rejects(new Error('Timeout while sending tx'));
    const { payRequest } = payMod;

    const result = await payRequest({
      request: '44AFFq5kSiGBoZ...',
      amount: 5000,
    });

    expect(result).to.deep.equal({
      error: 'TIMEOUT',
      message: 'Error: Timeout while sending tx',
    });
    expect(logTimeoutStub.calledOnce).to.be.true;
  });
});
