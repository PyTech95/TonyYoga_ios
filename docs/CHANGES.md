# Change record — TonYoga commerce update

Baseline: the two uploaded `TonyYoga_ios-main.zip` archives were byte-identical. Source archive SHA-256: `04d47a8dbc3c760f45d300d839a029cf6cd4bd246e01f861761c812255ac7591`.
Generated source modifications are listed with per-file before/after SHA-256 values in `UPDATE_MANIFEST.json`.

## iOS-only purchase policy

- New `commercePolicy.js`, `iosPlatform.js`, `iosCommerce.js`, `IOSPaymentButtons.jsx`, `IOSPrice.jsx`, and `IOSAmazonButton.jsx` centralize routing. No dynamic flag tells reviewers a different payment story.
- Existing `PaymentButtons` remains the web/Android component, but native iOS delegates to the new StoreKit/external-checkout component. The iOS API interceptor refuses old PayPal/Stripe checkout, credit redemption and gift-code endpoints for native checkout rather than silently bypassing IAP.
- Digital courses, ebooks, paid group classes, memberships and passes require a configured Apple product. There is no fallback to PayPal when StoreKit fails.
- Physical cart checkout is checked again on the server against actual product records. An ebook cannot be smuggled into the external payment cart merely by a client label.
- Private-session checkout uses the actual authenticated user's server-side booking. It represents one instructor and one customer; it must not be used for the user's 7–8-person Zoom groups.
- Only explicitly reviewed in-person workshops/training can use external checkout. The original mixed teacher-training package still contains online training and is not relabeled as physical.
- Amazon links require an allowlisted actual product ID and a verified physical-book URL. The original seeded ebook/Kindle URL is not approved as a printed book.

## Native StoreKit bridge / app UX

`TonYogaCommercePlugin.swift` registers through the new `TonYogaViewController` in SceneDelegate and Main.storyboard. Methods cover fetching Apple-localized prices, purchasing with an appAccountToken, unfinished transactions, Restore Purchases, finish-after-server-delivery, and approved HTTPS external browser checkout. Apple-pending and user-cancelled results do not unlock access.

- Native transaction updates and returning to the app retry unfinished transactions and refresh entitlements.
- Profile includes Restore and Apple's subscription management link. Deleting a TonYoga account does not silently claim to cancel Apple subscriptions.
- External PayPal opens the system browser. Only the order reference is stored for return/status checks. No password, bearer token or receipt is placed in a return URL. The return deep link is navigation only, never proof of payment.
- `/checkout/success` now supports an iOS return button after server confirmation. Users can also simply reopen the app.
- Cart now returns its newly created order ID directly to the payment handler instead of using a stale React state value on the first click.
- Native route startup gets a loading/retry screen; network errors do not erase an otherwise valid saved session. Runtime error boundary gives a recovery UI instead of a blank page.
- iOS uses the `capacitor` local scheme. Web backend URL remains `https://tonyoga.com` and the same user account remains authoritative.
- Existing app icon and splash artwork are untouched. Native Android files are untouched.

## Shared VPS/API — why this is included

A frontend-only "payment success" event is not adequate proof of a paid entitlement. This package adds server verification to the existing FastAPI service rather than creating a second backend.

New API routes:
- `GET /api/ios-commerce/offer`
- `GET /api/ios-commerce/amazon/{product_id}`
- `POST /api/ios-commerce/prepare`
- `POST /api/ios-commerce/verify`
- `POST /api/ios-commerce/notifications`
- `POST /api/ios-commerce/external-checkout`
- `GET /api/ios-commerce/external-status/{order_id}`
- `GET /api/ios-commerce/readiness`
- `GET /api/admin/ios-commerce/catalog-candidates` (admin only)

`routers/ios_commerce.py`, `ios_commerce_policy.py`, and `commerce_lock.py`:
- Use Apple's official verification library, public Apple roots, exact bundle/environment, and account/product-specific server purchase intents.
- Store Apple data separately in `ios_purchase_intents`, `ios_transactions`, `ios_notifications` and short-lived `commerce_locks`; grants/subscriptions/orders use existing application collections.
- Bind transactions to the TonYoga user who initiated checkout. A transaction replay under another account is refused.
- Use deterministic IDs and serialization for replay-safe delivery. Restore does not extend the purchased term or replenish spent class credits.
- Preserve refund/revocation state against stale JWS replay. Handle verified renewal/upgrades in the configured subscription group and Apple notification delivery.
- Do not finish StoreKit transactions until backend delivery is recorded. Network/verification/configuration failures remain pending for retry.
- No server API private key is shipped in the app. The `.p8` used by GitHub to upload builds remains unrelated to server signed-data verification.

## Existing payment security corrections

`routers/paypal.py` now verifies PayPal webhook signatures rather than treating missing verification configuration as acceptance. It verifies the provider's order/capture, account binding, amount, currency and completion status before fulfillment, and separates paid from delivered status. PayPal live and sandbox identities remain distinct.

`routers/payments.py` uses deterministic fulfillment references for passes, ebook orders and teacher-training registrations; protects workshop paid-in-full status and reduces duplicate stock/credit delivery from retried notifications. Existing application pricing/availability is still authoritative; this is not a rewrite of every legacy refund/credit operation.

`routers/printful.py` verifies a local paid order before confirmed fulfillment, adds an order lock and stable external order ID lookup, skips automatic real fulfillment for PayPal sandbox payments, and queries Printful for shipment data before trusting a shipment callback. No real Printful order was created during this work.

These shared backend fixes also affect eligible web/Android checkout. Although native Android code is unchanged, a regression test of web/Android payments is required before enabling the backend in production.

## Account/privacy/review hardening

- Removed returned plaintext password-reset/magic-login URL leakage when SMTP is unavailable; token consumption is single-use.
- Pending-deletion accounts cannot continue normal paid access. Status/cancel/auth are kept accessible as needed during the documented grace period.
- Added an opt-in hourly purge worker for due authenticated deletion requests, expanded cleanup collections and financial-record personal-data minimization. Cleanup failures do not report a successful purge. The feature must be deliberately enabled only after backup and retention review.
- Public email-only deletion requests still require identity verification/manual handling; they cannot automatically erase arbitrary users.
- Native AI consent precedes AI component/network initialization; optional voice use is explained. Consent/history cache is separated on account switches. AI is not presented as Tony himself or a medical professional.
- iOS first-party UsageTracker and LiveEditor overlays are disabled; this does not guarantee third-party embeds collect nothing.
- Push controls no longer claim native iOS background push exists when APNs is not configured.
- Native registration explicitly acknowledges the existing 16+ Terms/privacy notice. This is not age verification and does not automatically change App Store age rating.
- Privacy manifest, microphone usage text, Restore/Manage subscriptions, and legal purchase explanations were added. Existing legal owner/address/rights statements require owner confirmation; no legal certification is asserted.

## Build workflow

Preserves the existing seven GitHub secret names, macOS runner, Xcode 26 selection, API URL injection, SPM project, signing identity/profile checks and App Store upload.

Adds an explicit `IOS_COMMERCE_READY` repository **variable** gate, VPS readiness check, JS policy/iOS project resource tests, per-step secret environments, run+attempt build numbers, and preserving IPA artifacts even if upload subsequently fails.

**A green workflow is not proof that physical-device purchases or App Review will pass.**
