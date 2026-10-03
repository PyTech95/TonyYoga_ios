# Implementation/policy references

Checked 3 October 2026. Source ZIP supplied by the user is the basis for routes/data models; these external references inform payment classification and signed transaction handling. Policy can change; verify at submission time.

- Apple App Review Guidelines, especially 2.1, 2.3, 3.1.1, 3.1.3(d)/(e), 5.1:
  https://developer.apple.com/app-store/review/guidelines/
- Apple App Store Server Library (Python), verification/root certificate instructions:
  https://github.com/apple/app-store-server-library-python
- Apple security fix for stale OCSP verification, fixed in server library 3.1.2:
  https://github.com/apple/app-store-server-library-python/security/advisories/GHSA-8f6j-263m-g72x
- StoreKit AppStore / Product / Transaction documentation:
  https://developer.apple.com/documentation/storekit/appstore
  https://developer.apple.com/documentation/storekit/product/purchase(options:)
  https://developer.apple.com/documentation/storekit/transaction
- Apple privacy manifest / App Store privacy reporting:
  https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
  https://developer.apple.com/app-store/app-privacy-details/
- PayPal Orders v2 and webhook signature verification:
  https://developer.paypal.com/docs/api/orders/v2/
  https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature_post
- Printful API order IDs, confirmation and order retrieval:
  https://developers.printful.com/docs/

This package implements a conservative IAP-based digital-commerce route, not every allowed regional external-purchase alternative. No policy reference is an approval guarantee.
