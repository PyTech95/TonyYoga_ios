# TonYoga — iOS commerce update

**Status: code package तैयार है; App Store पर अभी सीधे submit न करें।**
Apple products / VPS verification configuration और physical-device tests बाकी हैं.
इस package को Xcode/StoreKit/Sandbox में execute नहीं किया गया है. नीचे TEST_RESULTS में कौन से tests वास्तव में चले, साफ लिखा है.

## इसमें क्या है

Existing logo, splash, `com.tonyoga.app`, Team `B38XS68W4W`, उसी VPS/API और वही login/account बनाए रखे हैं.

| Item | iOS का नया route |
|---|---|
| Tony के साथ genuine live private 1-to-1 | बाहर browser में PayPal; server confirmation के बाद booking |
| Physical Printful/cart products | PayPal browser checkout → existing fulfillment; virtual/ebook cart बाहर नहीं जाएगा |
| Amazon printed book | केवल verified physical product + approved Amazon URL |
| Digital programs, ebooks, membership, passes, group Zoom | Apple StoreKit 2 → उसी VPS पर signed transaction verify → existing access |
| Workshop | reviewed in-person allowlist → PayPal; configured online group offer → IAP |
| Teacher training | uploaded package में online + residential mixed है; उस mixed purchase को iOS में PayPal पर नहीं भेजा गया. Owner को physical/digital products अलग करने होंगे. अभी checkout unavailable है. |

यह region-specific external-digital-payment scheme नहीं है. Digital purchases को सभी iOS storefronts में IAP path दिया गया है. US/EU entitlement/alternative fee programs इस version में implement नहीं किए गए हैं.

## 1. Local Windows project में update लगाएँ

पहले existing project, signing keys और working workflow का backup लें. Original ZIP और extracted new ZIP अलग folders में रखें. `.git`, `.env`, keystores, certificates, node_modules और build folders overwrite/delete न करें.

New ZIP को उदाहरण के लिए `C:\TonYogaUpdate` में extract करें. नीचे paths में actual extracted root चुनें:

```powershell
cd C:\TonYogaUpdate\TonyYoga_ios-main
python tools\apply_update.py --target C:\Users\Dheeraj\pytech\app\tony2027 --scope all
```

यह DRY RUN है. Conflict आए तो STOP — existing file नई/अलग है, manual merge चाहिए; `reset --hard` न करें.
Dry run सही हो तो:

```powershell
python tools\apply_update.py --target C:\Users\Dheeraj\pytech\app\tony2027 --scope all --apply --backup-dir C:\TonYogaBackups\before-ios-commerce
```

Backup directory नया होना चाहिए. Tool केवल manifest में listed code files बदलेगा, database या service नहीं.
`python` न हो तो installed Windows Python के `py` command से यही चलाएँ.

## 2. Existing VPS भी update करना आवश्यक है

**सिर्फ frontend से secure IAP verification नहीं होती. Backend patch उसी `/var/www/tony2027` और `tonyoga-api` में चलता है. दूसरा VPS नहीं चाहिए.**
Full/changes ZIP को `/root/tonyoga-update/` में extract करें, `/var/www` public folder में backup न रखें.
पहले hosting snapshot + MongoDB backup + `.env` का private backup बनाकर verify करें. नया code account cleanup/payment collections बदलता है; staging test पहले करें.

```bash
cd /root/tonyoga-update/TonyYoga_ios-main
python3 tools/apply_update.py --target /var/www/tony2027 --scope vps
# ONLY if the dry run has no conflicts:
python3 tools/apply_update.py --target /var/www/tony2027 --scope vps --apply --backup-dir /root/tonyoga-backups/before-ios-commerce
```

यह browser return-to-app page और updated legal/privacy text भी copies करता है. Web frontend rebuild step नीचे है.
Existing healthy backend virtualenv use करें; replacement या bulk upgrade न करें:

```bash
cd /var/www/tony2027
backend/venv/bin/python -m pip freeze > /root/tonyoga-backend-before-ios.txt
backend/venv/bin/python -m pip install -r backend/requirements-ios.txt
backend/venv/bin/python -m pip check
```

Dependency conflicts हों तो STOP. Existing working environment की copy/staging में resolve करें. `pip install -U` सभी packages पर न चलाएँ.

## 3. Apple products पहले तैयार करें

App Store Connect → TonYoga → Monetization → In-App Purchases / Subscriptions में वास्तविक products बनाएँ.
App ID, Paid Applications agreement, banking/tax details, availability, price, localization और review information भरें.
Product IDs **नीचे live catalog draft से चुनें**; IDs file में लिखने से Apple पर product create नहीं होता.

VPS पर अपने actual DB IDs का read-only draft लें:

```bash
cd /var/www/tony2027
backend/venv/bin/python tools/export_ios_catalog.py --output /root/tonyoga-catalog-draft.json
```

यह database बदलता नहीं और हर product `enabled:false` रखता है. Paired `.inventory.json` में live item IDs और terms मिलेंगे.
`backend/ios-commerce.catalog.example.json` केवल structure का example है, live configuration नहीं.

- Fixed 30-day course: **Non-Renewing Subscription**, `duration_days` actual course term से match.
- Recurring monthly/yearly membership: **Auto-Renewable Subscription**, App Store का real numeric `subscription_group_id` भरें. हर duration/offering का अलग TonYoga plan ID रखें.
- Ebook: **Non-Consumable**. Correct ebook file/rights verify करें.
- One selected group Zoom class: **Consumable**, `class_one_time` item ID = class template ID; actual date user booking से चुनी जाती है.
- Class credits: **Consumable**, `drop_in` / `class_pack`. IAP credits expire नहीं किए गए हैं. Existing refunds/cancellation booking rules business owner verify करे.
- Online workshop deposit/balance: separate configured Apple consumables, actual workshop ID map करें.
- Bundle terms/dates अलग हों तो पहले offering redesign करें; mixed-duration bundle को arbitrary one-price lifetime access न बनाएँ.

Initial release में Family Sharing, promotional offers और Billing Grace Period enable न करें: इनके लिए extra entitlement/business handling और tests चाहिए.
Courses/memberships जिनको website customers iOS में access करते हैं, corresponding valid IAP offerings भी configure करें; incomplete catalog के साथ submit न करें.

## 4. Apple trust roots, server config और callbacks

```bash
cd /var/www/tony2027
sudo mkdir -p /etc/tonyoga/apple-roots
backend/venv/bin/python tools/install_apple_roots.py /etc/tonyoga/apple-roots
```

Tool Apple PKI से public CA certificates fetch करता है. `.p8/.p12` mobile app/backend public folder में नहीं डालना.
Reviewed catalog `/etc/tonyoga/ios-commerce.json` में save करें; actual configured Apple products ही `enabled:true` करें.

Existing `backend/.env` में `backend/ios-commerce.env.example` की settings **add/merge** करें, पूरी `.env` replace नहीं:

```dotenv
IOS_COMMERCE_ENABLED=true
IOS_COMMERCE_CATALOG_FILE=/etc/tonyoga/ios-commerce.json
IOS_APPLE_ROOT_CERTS_DIR=/etc/tonyoga/apple-roots
IOS_APPLE_APP_ID=YOUR_REAL_NUMERIC_APPLE_ID
IOS_IAP_ALLOW_SANDBOX=true
ACCOUNT_DELETION_PURGE_ENABLED=true
PAYPAL_WEBHOOK_ID=YOUR_REAL_PAYPAL_REST_APP_WEBHOOK_ID
```

- Numeric Apple ID App Store Connect → App Information से लें; Team/Bundle ID नहीं. `.env` placeholder valid value नहीं.
- `sandbox_user_emails` array में real QA/reviewer accounts रखें. Apple-review/TestFlight transactions Sandbox होते हैं. केवल verified sandbox transaction + allowlisted account से access मिलता है; live users को forged sandbox receipt से access नहीं.
- Apple Server Notifications **V2**, Production और Sandbox दोनों URLs:
  `https://tonyoga.com/api/ios-commerce/notifications`
- App Store Server signed verification `.p8` API key use नहीं करती. Existing GitHub upload API key अलग purpose है और वही 7 secrets रखे गए हैं.
- PayPal में existing webhook URL `/api/webhook/paypal` को वास्तविक REST application से register/check करें; webhook ID admin setting `paypal_webhook_id` या ENV से आता है. पुरानी गलत admin setting ENV पर priority ले सकती है. Live/sandbox IDs अलग हैं.
- Printful testing में `printful_fulfill_enabled=false` रखें; verified real order test के बाद ही live fulfillment enable करें. Live confirmation Printful charges/production trigger कर सकता है.
- `CREDENTIALS_MASTER_KEY` error को पहले resolve करें. Existing encrypted records के लिए **वही original matching key** चाहिए; नई random key बनाकर पुराने credentials destroy न करें.
- `ACCOUNT_DELETION_PURGE_ENABLED=true` केवल DB backup और cleanup review के बाद. Existing 30-day deletion promise के लिए hourly purge चलना आवश्यक है. Financial/external-provider/backups retention owner तय करे.
- Existing CORS में दोनों mobile origins बचाएँ:
  `https://tonyoga.com,https://www.tonyoga.com,https://localhost,capacitor://localhost`

```bash
cd /var/www/tony2027/frontend
export REACT_APP_BACKEND_URL=https://tonyoga.com
export CI=false
npm ci --legacy-peer-deps
npm run build
# Build successful होने पर ही:
sudo systemctl restart tonyoga-api
sudo systemctl status tonyoga-api --no-pager -l
curl --fail https://tonyoga.com/api/health
curl --fail https://tonyoga.com/api/ios-commerce/readiness
curl -i -X OPTIONS https://tonyoga.com/api/auth/login \
 -H 'Origin: capacitor://localhost' \
 -H 'Access-Control-Request-Method: POST' \
 -H 'Access-Control-Request-Headers: content-type,authorization'
```

Server lockfile existing package.json से mismatch हो तो blindly npm force न करें: extracted full source के matching `frontend/package.json` + `package-lock.json` compare करें. Live build overwrite से पहले current `frontend/build` private backup करें. Nginx configuration नहीं बदली; सामान्यतः reload आवश्यक नहीं.
Readiness response config initialization check है, full payment proof नहीं.

## 5. Existing GitHub Actions से IPA

अब local modified project में:

```powershell
cd C:\Users\Dheeraj\pytech\app\tony2027
node tools\test-commerce-policy.mjs
python tools\validate_ios_project.py
git status --short
```

Diff review करके relevant frontend/backend/tools/docs/workflow files stage/commit करें. **`git add .` से secrets stage न करें.** Original signing secrets वही हैं. `.jks`, `.p12`, `.p8`, `.env`, key.properties कभी push न करें.

GitHub → TonyYoga_ios → Settings → Secrets and variables → Actions → **Variables** में:
`IOS_COMMERCE_READY = true`.

यह नया variable config तैयार होने के बाद ही set करें. Default में workflow जानबूझकर early stop करता है ताकि unconfigured purchases वाला app गलती से upload न हो.
Updated workflow frontend build/sync, iOS wiring check, Apple signing और TestFlight upload करता है. Version remains1.0; buildnumber अब `run_number.run_attempt` है. Old builds replace नहीं होते.

## 6. Testing और App Review

`docs/DEVICE_TEST_CHECKLIST.md` पूरा करें. Sandbox Apple payments, real devices, iPad layout, PayPal return, correct content entitlement, restore/refund/renewal, deleted accounts, physical delivery सभी verify करें.
**यहाँ React full build / Xcode typecheck / StoreKit network purchase / physical device tests नहीं चल सके; pass claim नहीं किया गया है.**
Actual iPhone/iPad screenshots लें — Android status bar, AI-generated UI, browser/desktop mockup को iPad capture बताकर upload न करें.
New tested build और refreshed physical-device recording ही reviewer को दें. `docs/APP_REVIEW_REPLY_TEMPLATE.md` में placeholders actual test के बाद भरें.
Approval 1–2 दिन में हो सकता है, लेकिन निर्णय/समय Apple का है; यह package guarantee नहीं करता.

## Before release — unresolved configuration/business decisions

1. सारे visible paid products की Apple products/mappings ready हों; unavailable/broken checkout के साथ submission नहीं.
2. Existing **hybrid teacher training** को owner-approved physical vs digital offerings में split करें. Code ने hidden PayPal bypass नहीं बनाया.
3. Printed Amazon product IDs/URLs confirm; current seeded book URL में ebook शब्द था. Kindle/eBook को printbook न घोषित करें.
4. Price/deposit balances, group size maximum, age16terms बनाम earlier9+ listing, consumer rights और content ownership owner verify करे.
5. Existing uploaded recordings/files का retention और direct public ebook file URLs अधिक hardening चाहते हैं. No DRM/private signed file delivery added here.
6. Live coach/podcast/media availability, external provider credentials, APNs(background push not configured), privacy provider declarations and protected content licenses verify करें.
7. Public leaderboards/challenges/names visibility पर user consent/report/block/moderation policy review करें; यह ZIP complete UGC moderation system नहीं जोड़ता.

पूरा changes map: `docs/CHANGES.md`; executed checks: `docs/TEST_RESULTS.md`; source references: `docs/SOURCES.md`.
