# Test results — 3 October 2026

## Actually executed

| Check | Result | What it does NOT prove |
|---|---|---|
| `pytest tests/ios_commerce` | **69 passed** | Uses in-memory database doubles / mocked verified Apple payloads; not a real MongoDB or Apple sandbox integration |
| `node tools/test-commerce-policy.mjs` | **23 assertions passed** | Pure routing/URL/error policy only, not mounted React UI |
| JS/JSX parsing and local import resolution | **195 files passed** | TypeScript parser/static imports, not webpack/CRACO compilation or browser execution |
| Python parsing | **161 files passed** | Syntax only, not importing/starting the full production server |
| Native Swift source | `swiftc -frontend -parse` passed for the Swift files in App/ | Linux syntax check only; no StoreKit/UIKit/Capacitor SDK typecheck |
| Xcode project | `plutil -lint project.pbxproj` passed | Not an Xcode archive |
| iOS wiring / plist / privacy / asset catalog | Passed | Not visual/layout or App Store privacy approval |
| GitHub workflow YAML | Parsed; **21 embedded shell scripts** passed `bash -n`; original seven secret names preserved | Did not run on your GitHub account; secrets/account settings not checked |
| npm manifest/lockfile | Dependency and devDependency root definitions match | Does not prove remote package installation or security of every dependency |
| Existing resources | **77 native Android files** unchanged; **7 iOS icon/splash/catalog files** byte-identical | Does not prove runtime rendering |
| Source whitespace | `git diff --check` passed | Not an application test |

Backend cases include purchase replay, wrong account/product/bundle/type/quantity, disallowed sandbox account, refund/stale-restore safety, expiry and time windows, class-credit restore, subscription change group matching, failed delivery staying unfinished, PayPal capture mismatches, repeat stock delivery, supported physical-vs-digital routing and deletion failure/cancellation handling.

The tests deliberately do NOT contact Apple, PayPal, Printful or the VPS. Cryptographic verification is delegated to Apple's official library in deployment; tests substitute the verifier and assert failure behavior, not a real Apple certificate chain/OCSP check. No live subscription/order/payment/deletion was executed.

## Not executed / deployment gates

- `npm ci` / full React production build could not be completed in this environment: package registry/network access unavailable. Partial installation artifacts are excluded from the ZIP. Run the existing GitHub Mac workflow after setup.
- No macOS Xcode archive/typecheck, code signing, StoreKit sandbox/production purchase or real iPhone/iPad UI tests.
- No real MongoDB concurrency/lease/unique-index/failover tests. The production delivery lock is time-bounded; behavior under >5-minute pauses and network partitions must be tested/monitored.
- No real PayPal capture/webhook or Printful order/shipping integration tests. Keep Printful fulfillment disabled during sandbox QA.
- No end-to-end provider refund/financial credit reconciliation of every pre-existing legacy payment route.
- No complete codebase penetration test, signed media delivery/DRM implementation, or audit of external providers' retention/SDK privacy behavior.
- No Apple product creation, review submission, screenshots, live VPS updates, GitHub secret edits or repository push performed.

## Run locally

Use a dedicated test environment, not a production venv, for tests:

```bash
python -m venv .test-venv
.test-venv/bin/python -m pip install pytest pytest-asyncio fastapi pydantic email-validator
.test-venv/bin/python -m pytest tests/ios_commerce -q
node tools/test-commerce-policy.mjs
python tools/validate_ios_project.py
```

Windows uses `.test-venv\Scripts\python.exe`. The complete production app has its own `backend/requirements.txt`; the test dependencies above are only for isolated policy/handler tests.

After network dependencies are installed, syntax checker can load `typescript` from frontend node_modules, or use `TYPESCRIPT_JS_PATH` pointing to a local TypeScript installation. Its output is not a production-build pass.

## Packaging checks

The update helper is tested on a temporary copy of the submitted baseline: dry-run, apply, repeat/idempotence, and conflict refusal. All ZIP member paths are relative. Private signing/environment files, generated builds, node_modules, `.git`, caches and font files are excluded. SHA-256 manifest covers changed/new source files.
