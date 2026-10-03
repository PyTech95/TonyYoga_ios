# Remaining Apple-side requirements

The package does not submit changes to Apple, deploy the VPS, create App Store products, change your privacy declarations, purchase services or execute paid orders.

## Required account/configuration work

1. Configure each IAP product's ID, product type, localized name/description/price and availability in App Store Connect. Agree applicable paid-app terms and banking/tax details. Submit first IAP products with the app as required by the console.
2. Use your SAME application ID, developer team, distribution certificate and provisioning profile. Enable the In-App Purchase capability for the app where required by the portal. Do not recreate the app/signing identities to work around errors.
3. Review live DB product mapping, store duration, class limits/capacity, mixed training and physical/digital items. Unsupported/unavailable paid buttons are a submission blocker, not a workaround.
4. Enter the reviewed Notes, demo credentials and actual new-build physical-device screen recording. Keep reviewer account/backend available, include account deletion flow without deleting the demo account permanently.
5. Replace screenshots in every language/size with actual supported-device captures. iPad support is retained in this package. No screenshot ZIP was fabricated in this task.
6. App Privacy must reflect all actual collection and providers. Existing code has quiz/profile health-related answers, support/AI text, optional microphone processing, orders/shipping, purchase rights, progress and third-party content. Confirm the real provider behavior before ticking categories. If voice/audio is retained by a provider beyond real-time request service, Audio Data must be evaluated too.
7. Existing Terms/privacy are 16+, while earlier review metadata was 9+. Content suitability and contractual minimum age are different, but the owner must reconcile the declared audience and any necessary age override. An acknowledgement checkbox is not identity-based age assurance.
8. Leaderboards/challenges and displayed user names may require additional disclosure, privacy choices or moderation. Do not copy earlier blanket 'No' declarations without reviewing the enabled functionality.
9. Restore original credentials master key for encrypted provider settings. Renew expired credentials and confirm SMTP, media, Amazon/Printful links and live schedules. Native APNs is not integrated; don't advertise background push until it is.
10. Retention/external deletion/content rights/legal claims must reflect real operation, not just source text.

## Important limitations

- No approval/timeline guarantee. Apple may request changes beyond this focused commerce update.
- No universal web-PayPal digital checkout bypass. Regional alternative-payment entitlements/contracts/reporting are not implemented.
- No app-wide penetration test, full Android billing review, or live Apple/PayPal/Printful transaction testing was completed here.
- Existing backend has legacy business processes beyond these tests: capacity under concurrent purchases, credit/referral refunds, uploaded-media/third-party retention and direct file distribution need ongoing operation-specific QA.
- Shared backend security changes require web/Android payment regression testing even though Android native assets/build settings were not modified.
