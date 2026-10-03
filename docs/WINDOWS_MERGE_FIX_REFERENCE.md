> Reference: नीचे पुरानी separate MergeFix ZIP instructions हैं. इस full package में वही helper `tools/tonyoga_safe_update.py` पर included है. Standalone setup के लिए `00_START_FULL_ZIP_HINDI.md` पढ़ें; helper चलाना आवश्यक नहीं.

# TonYoga — Windows-safe merge और GitHub branch push

यह छोटा ZIP application का नया replacement नहीं है. पहले से निकाले हुए
`C:\TonYogaUpdate\TonyYoga_ios-main` commerce package पर काम करने वाला नया helper है.

## क्या ठीक किया गया

पुराना helper raw-byte checksums compare करता था. Windows में CRLF line endings
की वजह से वही code LF baseline से अलग दिख सकता है. साथ में Capacitor-generated
`ios/App/App/public` files source update की conflict list में आ रही थीं.

नया helper केवल UTF-8 CRLF/LF का अंतर equivalent मानता है. Space, variable,
logic या दूसरे actual edits को ignore नहीं करता. Generated iOS copies को न copy
करता है न stage: वे React build के बाद `npx cap sync ios` से दोबारा बनेंगी.
असल content conflict आने पर कोई code/branch change या push नहीं होगा.

## निकालने की जगह

इस छोटे ZIP को `C:\TonYogaUpdate\MergeFix` में Extract All करें.
इस file का होना जरूरी है:
`C:\TonYogaUpdate\MergeFix\tonyoga_safe_update.py`

## PowerShell command

```powershell
py -3 "C:\TonYogaUpdate\MergeFix\tonyoga_safe_update.py" --source "C:\TonYogaUpdate\TonyYoga_ios-main" --target "C:\Users\Dheeraj\pytech\tony\tony2027" --apply --push
```

`py` न हो और `python` उपलब्ध हो तो `python` इस्तेमाल करें.
केवल dry run के लिए `--apply --push` हटाएँ.

## यह command क्या करेगी

1. Source manifest और हर selected source file का checksum verify करेगी.
2. Real conflicts, wrong Git root/remote, ongoing merge या पहले से staged files
   मिलने पर रुक जाएगी.
3. Project के बाहर नया timestamped `TonYogaBackup-...` folder बनाएगी.
4. `tonyoga-ios-commerce-...` नाम से अलग local Git branch बनाएगी.
5. 84 source-file entries में जो update जरूरी है वही apply करेगी; Android native
   files, `.env`, signing keys और generated assets नहीं बदलेगी.
6. 23-assertion JavaScript policy test और static iOS resource test चलाएगी.
7. केवल selected source paths stage और commit करके उसी existing
   `PyTech95/TonyYoga_ios` origin की नई branch push करेगी.

आपका GitHub login/permission आपके PC से लगेगा. Token/password chat में न भेजें.
Git login prompt आए तो अपने सामान्य browser/credential-manager authentication
से पूरा करें. Commit/push fail हो तो error और report का phase देखें; force-push न करें.

## क्या यह command नहीं करेगी

- main merge/reset/force-push नहीं.
- VPS deploy/restart या database access/change नहीं.
- `IOS_COMMERCE_READY` enable नहीं.
- Xcode archive, IPA upload या Apple review submission नहीं.
- Android build.gradle का आपका local modification stage नहीं.

### GitHub पर नया code कहाँ मिलेगा

Push successful हो तो terminal में branch name आएगा. Existing GitHub repository
में branch dropdown से उसी `tonyoga-ios-commerce-...` branch को चुनें.
सिर्फ main देखकर यह न मानें कि code नहीं आया. इस package का automatic push
workflow केवल main के लिए है; review branch push पर automatic TestFlight upload
अपेक्षित नहीं है.

## अगला release क्रम

Existing VPS पर reviewed backend patch/configuration, actual App Store IAP
products/catalog और sandbox setup पूरा करें. फिर branch review/merge और नया
TestFlight build चलाएँ. Real iPhone/iPad purchase, restore, login और permitted
PayPal flows test करें. अंत में नए tested build को App Review दें.
`IOS_COMMERCE_READY=true` केवल वास्तविक configuration तैयार होने के बाद करें;
सिर्फ build gate हटाने के लिए true न करें.

Version 1.0 रह सकती है; workflow नया build number generate करता है. पुराने
Build 15 को replace नहीं किया जाएगा. Apple approval/time की guarantee नहीं है.

## Backup

Backup में बदलने से पहले की source files, new-file list, original Git HEAD,
branch और execution phase का `UPDATE_REPORT.json` रहता है. Signing keys इस
backup में copy नहीं होतीं; उनका आपका separate secure backup बना रहना चाहिए.

## Tests

TEST_REPORT.txt देखें. Local Git fixtures और Windows-style line endings tested;
actual Windows executable run/GitHub push/VPS/Apple operations यहाँ नहीं किए गए.
