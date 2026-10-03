"""Static asset/project wiring checks. Does not compile or sign iOS binaries."""
from pathlib import Path
import json, plistlib
root=Path(__file__).resolve().parents[1]
f=root/'frontend'; app=f/'ios/App/App'; project=f/'ios/App/App.xcodeproj/project.pbxproj'
cfg=json.loads((f/'capacitor.config.json').read_text())
assert cfg['appId']=='com.tonyoga.app'
assert cfg['server']['iosScheme']=='capacitor'
s=project.read_text()
for needle in ['TonYogaCommercePlugin.swift in Sources','PrivacyInfo.xcprivacy in Resources','com.tonyoga.app']:
    assert needle in s,needle
p=plistlib.loads((app/'Info.plist').read_bytes())
assert p['NSMicrophoneUsageDescription']
assert any('com.tonyoga.app' in d.get('CFBundleURLSchemes',[]) for d in p['CFBundleURLTypes'])
assert 'TonYogaViewController()' in (app/'SceneDelegate.swift').read_text()
manifest=plistlib.loads((app/'PrivacyInfo.xcprivacy').read_bytes())
assert manifest['NSPrivacyTracking'] is False
for row in manifest['NSPrivacyCollectedDataTypes']:
    assert set(row)=={'NSPrivacyCollectedDataType','NSPrivacyCollectedDataTypeLinked','NSPrivacyCollectedDataTypeTracking','NSPrivacyCollectedDataTypePurposes'}
for catalog in (app/'Assets.xcassets').rglob('Contents.json'):
    for image in json.loads(catalog.read_text()).get('images',[]):
        if image.get('filename'): assert (catalog.parent/image['filename']).is_file(), image['filename']
print('iOS config, URL scheme, native plugin, privacy resource and image catalog references: PASS')
