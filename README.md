![LNp2pBot](logo-600.png)

[![chat](https://img.shields.io/badge/chat-telegram-%2326A5E4)](https://t.me/lnp2pbot) [![MIT license](https://img.shields.io/badge/license-MIT-brightgreen)](./LICENSE)

# mnp2pBot

Telegram bot that allows people to trade using the **Monero network** with other people on Telegram. This is an open‑source project and anyone can create issues, submit a PR, fork it, modify it or create their own bot with the code.

## Try it out!

* **Website:** *unavailable*  
* **Bot:** `@mnp2pBot` 
* **Main channel offers:** *unavailable*

Wherever you are you can start using the bot, just need to have a Telegram account with a username and `/start` the bot.

---

### What is mnp2pBot?

mnp2pBot is written in Node.js and connects with a **Monero daemon** (via `monero‑javascript`).  
We wanted the Telegram bot to be able to receive Monero payments without being custodial. After some thinking we decided to use **integrated addresses + payment‑IDs** (instead of hold‑invoices) to keep the flow simple and trustless:

1. **Alice** creates a sell (or buy) order specifying the amount of XMR (in piconeros) and the fiat amount.  
2. The bot publishes the order in the public channel.  
3. **Bob** accepts the order and the bot generates a **unique integrated Monero address** (address + payment‑ID) for the transaction.  
4. The payer sends XMR to that address. The bot continuously polls the wallet until the payment is detected (the blockchain guarantees no replay attacks).  
5. Once the payment is confirmed, the bot shares the counterpart’s contact info so the fiat can be exchanged off‑chain.  
6. After the fiat transfer is acknowledged, the bot releases the XMR to the receiver (or refunds if something goes wrong).

If either party does not confirm within the configured timeout, the bot notifies the admins and a dispute can be opened.

---

## Creating a **sell** order

1. Alice tells the bot that she wants to sell **X piconeros** (≈ X XMR) for **N** fiat amount.  
2. The bot publishes a sell order in the bot channel.  
3. Bob accepts the order and the bot generates a **Monero integrated address** (address + payment‑ID).  
4. Bob sends the required XMR to that address. The bot detects the payment (no custodial hold‑invoice needed).  
5. After the bot sees the payment, Alice and Bob are put in contact.  
6. Bob sends the fiat to Alice and notifies the bot.  
7. When Alice confirms receipt, the bot **releases** the XMR to Bob (or refunds if the timeout expires).

---

## Creating a **buy** order

1. Alice wants to buy **X piconeros** of XMR.  
2. Alice publishes a buy order with the desired fiat amount.  
3. The bot shows the order in the public group.  
4. Bob takes the order; the bot generates a **Monero integrated address** for Alice to receive the XMR.  
5. Alice sends the fiat to Bob and notifies the bot.  
6. When Bob confirms receipt, the bot releases the XMR to Alice’s address.

If the timeout expires without confirmation, admins are alerted and a dispute can be opened.

---

## Cooperative cancel

Before another user takes an order, the creator can cancel it.  
If both parties agree to cancel after an order is taken, the funds are returned to the seller.

---

## Disputes

Either party can open a dispute at any moment. A **solver** (human moderator) is notified with all the information, contacts both parties and decides the outcome.

During a dispute each user’s `dispute` counter in the database is incremented. If a user is proven malicious, the solver can ban them, preventing further use of the bot.

---

## Incentive to release funds

A seller that doesn’t release the XMR after receiving fiat cannot open or take new orders, which harms their reputation and may lead to a dispute.

---

## Communities

Any Telegram group can add the bot (`@mnp2pBot`) to facilitate XMR trading among its members. The group admin earns a commission on transactions performed within the community and can set custom fee discounts.

---

# Financial Support

**mnp2pBot** is an open‑source project. We are not a company, we don’t do ICOs or hidden business models—we just want to bring open‑source money to people.

If you’d like to support further development, please consider sending Monero to the following address:
