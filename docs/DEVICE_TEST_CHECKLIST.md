# Release gate — real-device and provider tests

Do not submit until this is filled from actual tests of the new build. No item below was executed against your live accounts in this environment.

## Prerequisites
- DB and environment backup verified. Existing credentials/master encryption key restored. Real PayPal webhook ID and approved Apple products/config loaded.
- Matching Apple Distribution certificate/profile and seven GitHub secrets retained. `IOS_COMMERCE_READY` enabled only after setup.
- TestFlight uses a sandbox transaction environment. Approve the reviewer/QA TonYoga account email in `sandbox_user_emails`. This permits Apple-signed sandbox purchases only, not a client-supplied success flag.
- Printful auto-fulfillment OFF in test mode; prevent accidental manufacturing charges. Use a dedicated PayPal sandbox configuration rather than changing live customer configuration mid-session.

## App and account — physical iPhone AND iPad
- Cold launch, correct icon/splash, safe areas, Home, Schedule, Programs, Library, Shop, Profile, rotation/background/foreground.
- Register, log in, log out, reset password via real email, expired/wrong magic link, offline start/retry, no white screen.
- Privacy/Terms/support accessible without paid entitlement. No non-iOS store buttons/status bars or invented screenshot content.
- Same account on web/iPhone sees the same purchased rights; no other user's purchases or AI messages leak after logout/switch.
- AI: no assistant calls before agreement; decline still permits app use; voice microphone purpose and consent; answers disclaimer; revoke consent.

## Apple payment matrix (Apple sandbox only)
- Each enabled SKU: actual localized price, exact benefits and duration, correct subscription period and renewal disclosure.
- Buy success → VPS cryptographic verification → database access → visible purchased content without restarting.
- Cancel purchase, Ask to Buy/pending, offline after payment, server unavailable after payment, repeated callback, kill/relaunch before fulfillment.
- Restore on same/new device; wrong TonYoga account refusal; used consumable class credits never refill on restore.
- Membership renew, expire, cancel, refund/revocation, restore after refund, out-of-order notification, and supported subscription change within real Apple group.
- Class one-time purchase tied to selected available date; passes consumed exactly once by booking; online workshop deposit and later balance don't downgrade status.
- Ebook opens only for paid owner; downloading/storage access protection reviewed. App has no DRM or signed expiring ebook file URLs added by this patch.
- Unknown product / disabled catalog / incorrect App Store type must not charge; correct all visible unconfigured offers before submission.
- Apple Sandbox + Production notification endpoints registered. Test App Store Server Notifications; monitor/replay failed or unmatched notifications. There is no full scheduled Server API transaction-history reconciliation added here.
- Keep Family Sharing, promotional offers and Billing Grace Period OFF pending additional implementation/testing.

## PayPal / physical fulfillment
- Private 1-to-1: owned booking, correct price/currency, browser PayPal, cancellation, return/reopen, server paid+fulfilled status and Zoom details.
- Genuine in-person workshop: reviewed allowlist; digital/hybrid package cannot take that path.
- Physical cart first click receives actual order ID; address/quantities/variants/stock/shipping cost and tax correct; mixed ebook cart rejected.
- PayPal webhook missing signature/incorrect ID/forged amount/duplicate event refused or safely handled; completed order can retry delivery after a database failure.
- Printful external order reference stable on callback/retry; no duplicate order, sandbox does not auto-create a paid Printful order, known server-fetched tracking only.
- Printed Amazon link opens correct paperback/hardcover, not ebook/Kindle or arbitrary site.
- Web and Android regression tests: checkout, refunds, passes, bookings, stock and existing payment provider configuration. Android billing-policy review remains separate.

## Deletion, data, review
- On a disposable test account: request deletion with password, immediate deactivation, status, explicit cancellation before deadline, request again.
- Advance only test-fixture due dates and run purge in staging; verify related data, financial minimization, failure retry, no cancellation race.
- External provider records, uploaded media, backups, legal retention/manual public deletion requests have an operator runbook.
- App Store privacy answers match actual quiz/health/goals, messages, audio retention, purchase identifiers, shipping data, third-party video/AI/provider activity. The privacy manifest alone does not update App Store Connect labels.
- Review real public leaderboards/challenges and name visibility/UGC moderation. Previous "No contests/No user content" declarations must be re-evaluated against active features.
- Owner signs off mixed teacher training redesign, actual maximum Zoom participants, all content rights, legal entity/address, refund policy, support mailbox and age-rating consistency.
- Record NEW build on supported physical devices, registration/login/deletion/paid-content flow. Do not delete the reviewer account used for App Review.
