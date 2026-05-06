![MNp2pBot](logo-600.png)

# MNp2pBot

Experimental Monero adaptation of [LNp2PBot](https://github.com/lnp2pBot/bot).

MNp2pBot is a Telegram bot for coordinating peer-to-peer Monero trades. This branch is an early **minimal adaptation** from Lightning Network settlement to Monero settlement.

The current goal is not to provide a finished production bot. The current goal is to validate the Monero payment flow, order states, payment detection, release/refund logic, and tests in a controlled environment.

---

## Current status

This branch is experimental.

Current direction:

- Monero support through `monero-javascript`
- Wallet RPC integration
- Stagenet-first testing
- Temporary custodial / semi-custodial flow
- Minimal compatibility with the original LNp2PBot structure
- Gradual replacement of Lightning-specific concepts

Not yet complete:

- Production-ready Monero escrow
- Non-custodial multisig flow
- Complete removal of Lightning naming/types
- Final economic/security model
- Mainnet deployment guarantees

The original LNp2PBot was built around Lightning hold invoices. Monero does not have a direct equivalent to Lightning hold invoices, so this project needs a different settlement model.

---

## Design decision

For now, this branch uses a **temporary custodial / semi-custodial model on Monero stagenet**.

That means:

1. The bot can generate a Monero receiving address for an order.
2. A user sends XMR to that address.
3. The bot watches the wallet for the payment.
4. After enough confirmations, the order can move to a funded/locked state.
5. The bot can later release or refund the funds according to the order/dispute flow.

This is not the final philosophical target. It is a practical experimental phase.

Future work may explore:

- Monero multisig
- Reduced-custody designs
- Reputation-only coordination
- Better dispute flows
- Cleaner separation between bot coordination and fund custody

---

## Why this exists

LNp2PBot uses Lightning invoices and hold invoices as a core primitive. Monero has different primitives:

- addresses
- subaddresses
- integrated addresses / payment IDs
- wallet RPC
- transaction confirmations
- wallet-controlled transfers

This branch tries to adapt the bot gradually instead of rewriting everything from zero.

The first goal is to answer:

> Can the existing LNp2PBot order flow be minimally adapted to Monero payment detection and release/refund semantics?

---

## Current Monero approach

The current code uses `monero-javascript`.

Early Monero primitives include:

- wallet RPC client
- integrated address / payment ID helpers
- payment detection by polling wallet transfers
- basic payment send wrapper
- tests for the Monero wrapper

The project may later prefer **subaddress-per-order** as the main receive model.

A possible future order payment model:

```text
order
→ unique subaddress
→ expected atomic XMR amount
→ payment detected
→ confirmations checked
→ escrow state updated
→ release/refund/dispute
```


---

## Suggested settlement model

The project should move toward explicit Monero-native domain objects instead of reusing Lightning naming forever.

Suggested concepts:

```text
PaymentIntent
EscrowDeposit
Release
Refund
Dispute
```

Suggested states:

```text
awaiting_deposit
deposit_seen
deposit_confirmed
awaiting_fiat
release_requested
released
refund_requested
refunded
disputed
expired
```

---

## Sell order flow

Experimental stagenet flow:

1. Alice creates a sell order.
    
2. Bob takes the order.
    
3. The bot generates a Monero payment destination for the order.
    
4. Bob sends XMR to that destination.
    
5. The bot detects the incoming transaction.
    
6. After enough confirmations, the order is marked as funded.
    
7. Bob sends fiat to Alice outside the bot.
    
8. Alice confirms fiat receipt.
    
9. The bot releases XMR to Bob, or opens/refers to dispute handling if something goes wrong.
    

---

## Buy order flow

Experimental stagenet flow:

1. Alice creates a buy order.
    
2. Bob takes the order.
    
3. The bot prepares a Monero settlement flow for the order.
    
4. Alice sends fiat to Bob outside the bot.
    
5. Bob confirms fiat receipt.
    
6. The bot releases/sends XMR according to the order state.
    

The exact buy/sell flow still needs cleanup because the original bot was designed around Lightning invoices.

---

## Disputes

Disputes are still inherited from the original LNp2PBot model.

The intended experimental model:

- either party can open a dispute
    
- a human solver/admin reviews the order
    
- the bot stores the relevant order/payment state
    
- the solver decides whether to release, refund, ban, or mark the order failed
    

This area is not final.

---

## Environment

Example Monero-related environment variables:

```env
MONERO_WALLET_RPC_URL=http://127.0.0.1:38082/json_rpc
MONERO_WALLET_USER=rpc_user
MONERO_WALLET_PASS=rpc_pass
MONERO_NETWORK=stagenet
```

The current `.env-sample` still contains many inherited Lightning variables. They are kept for compatibility during the minimal adaptation phase and should be cleaned up gradually.

---

## Running tests

```bash
npm install
npm test
```

Some tests are still inherited from LNp2PBot. Monero-specific tests should be expanded around:

- payment intent creation
    
- address/subaddress generation
    
- payment detection
    
- confirmation handling
    
- release/refund wrappers
    
- dispute transitions
    
- timeout behavior
    

---

## Development priorities

Near-term priorities:

1. Make the stagenet custodial/semi-custodial flow explicit.
    
2. Separate `checkPayment()` from `waitForPayment()`.
    
3. Store Monero payment metadata in the order model:
    
    - address
        
    - subaddress index or payment ID
        
    - expected atomic amount
        
    - tx hash
        
    - confirmations
        
    - escrow state
        
4. Prefer Monero-native names over Lightning names.
    
5. Keep compatibility wrappers only where needed.
    
6. Add full-flow tests:
    
    - create order
        
    - detect deposit
        
    - confirm deposit
        
    - release
        
    - refund
        
    - dispute
        
7. Clean README, `.env-sample`, package metadata and comments.
    

---

## Important warning

This branch is experimental and should not be used with mainnet funds.

Use Monero stagenet while developing.

Do not run this as a public bot until the custody model, wallet security, dispute flow, error handling and operational assumptions are clearly reviewed.

---

## License

MIT, inherited from the original LNp2PBot project.
