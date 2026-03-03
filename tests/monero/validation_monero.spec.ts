const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
export {};

describe('Validación de facturas Monero', () => {
  let sandbox: any;
  let validateInvoice: any;
  let isValidInvoice: any;
  let parsePaymentRequestStub: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(process, 'env').value({
      MIN_PAYMENT_AMT: '100',
      INVOICE_EXPIRATION_WINDOW: '0',
    });

    const invoiceStub = {
      network: 'bc',
      destination: '03...',
      id: 'abc123',
      tokens: 20000,
      expiry: 3600,
      is_expired: false,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };

    const messagesStub = {
      minimunAmountInvoiceMessage: sinon.stub().resolves(),
      minimunExpirationTimeInvoiceMessage: sinon.stub().resolves(),
      expiredInvoiceMessage: sinon.stub().resolves(),
      requiredAddressInvoiceMessage: sinon.stub().resolves(),
      requiredHashInvoiceMessage: sinon.stub().resolves(),
      invoiceInvalidMessage: sinon.stub().resolves(),
      invoiceMustBeLargerMessage: sinon.stub().resolves(),
      invoiceExpiryTooShortMessage: sinon.stub().resolves(),
      invoiceHasExpiredMessage: sinon.stub().resolves(),
      invoiceHasWrongDestinationMessage: sinon.stub().resolves(),
    };

    parsePaymentRequestStub = sinon.stub().returns(invoiceStub);

    const validations = proxyquire('../../bot/validations', {
      './messages': messagesStub,
      invoices: {
        parsePaymentRequest: parsePaymentRequestStub,
      },
      '../util': {
        removeLightningPrefix: sinon.stub().callsFake((req: string) => req),
        isIso4217: sinon.stub().returns(true),
        isDisputeSolver: sinon.stub().returns(false),
        isOrderCreator: sinon.stub().returns(false),
      },
      '../lnurl/lnurl-pay': {
        existLightningAddress: sinon.stub().resolves(true),
      },
      '../logger': {
        logger: {
          error: sinon.stub(),
          debug: sinon.stub(),
        },
      },
      '../models': {
        Order: {},
        User: {},
        Community: {},
      },
      '../util/moneroInvoice': {
        parseMoneroInvoice: sinon.stub(),
      },
    });

    validateInvoice = validations.validateInvoice;
    isValidInvoice = validations.isValidInvoice;
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('acepta una factura Monero válida (validateInvoice)', async () => {
    const ctx: any = { reply: sinon.stub() };
    const result = await validateInvoice(ctx, 'lnbc1...');
    expect(result).to.be.an('object');
    expect(result.network).to.equal('bc');
    expect(result.tokens).to.equal(20000);
    expect(
      parsePaymentRequestStub.calledOnceWithExactly({ request: 'lnbc1...' }),
    ).to.be.true;
  });

  it('acepta una factura Monero válida (isValidInvoice)', async () => {
    const ctx: any = { reply: sinon.stub() };
    const { invoice, success } = await isValidInvoice(ctx, 'lnbc1...');
    expect(success).to.be.true;
    expect(invoice).to.be.an('object');
    expect(invoice.network).to.equal('bc');
    expect(invoice.tokens).to.equal(20000);
  });
});
