# TonYoga — Full Updated Source ZIP

यह COMPLETE SOURCE package है, patch-only ZIP नहीं.
यह आपके पहले दिए source ZIP पर बने iOS commerce update और बाद में दिए Windows-safe optional helper को एक package में रखता है.
आपके PC पर मौजूद बाद के local changes इसमें automatically merge नहीं किए गए हैं.

## नया folder वाला तरीका

1. इस ZIP को अलग नए folder में Extract All करें, जैसे C:\TonYogaFullUpdate.
2. `TonyYoga_ios-main` अंदर का project root है. GitHub repository root में इसके CONTENTS होने चाहिए, ZIP file या extra wrapper folder नहीं.
3. उसी existing `PyTech95/TonyYoga_ios` repository की अलग working clone/branch रखें; Git history वाला `.git` folder न हटाएँ और force-push न करें.
4. पुराने working project, Android signing/version changes, `.env` और signing keys अलग सुरक्षित रखें. इन्हें इस ZIP से replace नहीं करना है.
5. GitHub में staged files review करें. `.env`, `key.properties`, `.jks`, `.p12`, `.p8`, private keys, node_modules और build outputs commit न करें.

इस standalone route में `apply_update.py` या merge-fix script चलाना आवश्यक नहीं.
पुराने START_HERE_HINDI.md का section 1 existing-folder patch route है; fresh-folder route में उसे skip करें. Configuration के लिए section 2 onward पढ़ें.
Optional Windows-safe helper `tools/tonyoga_safe_update.py` भी साथ है, लेकिन वह genuine local conflicts को force overwrite नहीं करता.

## अभी क्या pending है

- उसी existing VPS पर reviewed backend patch/dependency/configuration deployment.
- Actual App Store Connect IAP product IDs, pricing, availability, catalog mapping और sandbox accounts.
- GitHub Actions repository variable `IOS_COMMERCE_READY=true` केवल इन settings के तैयार होने के बाद. Gate को केवल upload चलाने के लिए bypass न करें.
- Mixed teacher-training offer, Amazon physical-book allowlist, original CREDENTIALS_MASTER_KEY और अन्य pending owner decisions: START_HERE_HINDI.md के अंत में देखें.
- Full React production build, Xcode archive और actual iPhone/iPad Apple/PayPal payments की testing.

ZIP में कोई configured live merchant secret/private signing key नहीं है. Code GitHub पर push होना VPS deploy या App Store submission नहीं है.
Version metadata इस existing workflow में 1.0 रहती है; workflow अलग build number देता है. App Store version अपने-आप नया marketing version नहीं बनता.

## Package checks

इस consolidation में application/frontend/backend/native iOS/workflow code मूल commerce-update ZIP से नहीं बदला.
पिछला optional Windows merge helper और यह fresh-folder guide एक साथ जोड़े हैं.
इस package पर दो local checks दोबारा चले:
- `node tools/test-commerce-policy.mjs`: 23 assertions passed.
- `python tools/validate_ios_project.py`: static iOS resource/config checks passed.
यह live purchase, production build या Apple review approval का प्रमाण नहीं है.
`docs/TEST_RESULTS.md` में original test scope और बाकी tests दर्ज हैं.
`FULL_PACKAGE_FILES_SHA256.json` इस consolidated package की files का checksum inventory है, inventory file को छोड़कर.

Apple approval या 1–2 दिन में publication की guarantee नहीं है. पुराना working app सुरक्षित रखते हुए configure, test, फिर submit करें.
