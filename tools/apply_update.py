"""Apply reviewed source changes only. Default is a dry-run; secrets/data are never copied.
Example: python tools/apply_update.py --target C:\\project --scope all
Then:    python tools/apply_update.py --target C:\\project --scope all --apply --backup-dir C:\\Backups\\TonYoga-before-commerce
If live files differ from the supplied baseline AND update, stop for a manual merge.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None

def selected(path, scope):
    if scope == 'all': return True
    common = path.startswith(('tools/', 'docs/', 'tests/ios_commerce/')) or path in ('START_HERE_HINDI.md', '.gitignore')
    if scope == 'vps': return common or path.startswith(('backend/', 'frontend/src/'))
    return common or path.startswith(('frontend/', '.github/'))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', required=True)
    parser.add_argument('--scope', choices=('all', 'ios', 'vps'), default='all')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--backup-dir')
    args = parser.parse_args()
    target = Path(args.target).expanduser().resolve()
    if not (target/'frontend/package.json').is_file(): raise SystemExit('Target must be the existing TonYoga repository ROOT, not frontend/.')
    if target == SOURCE: raise SystemExit('Do not apply the update onto the extracted update package itself.')
    manifest = json.loads((SOURCE/'UPDATE_MANIFEST.json').read_text(encoding='utf-8'))
    pending, conflicts = [], []
    for entry in manifest['files']:
        name = entry['path']
        if not selected(name, args.scope): continue
        rel = Path(name)
        if rel.is_absolute() or '..' in rel.parts: raise SystemExit('Unsafe manifest path')
        src, dst = SOURCE/rel, target/rel
        if not dst.resolve().is_relative_to(target): raise SystemExit('Target contains an unexpected symlink; review manually: '+name)
        if sha(src) != entry['updated_sha256']: raise SystemExit('Update source missing or modified: '+name)
        current = sha(dst)
        if current == entry['updated_sha256']: continue
        if current != entry['original_sha256']:
            conflicts.append(name)
        else: pending.append((src, dst, name))
    if conflicts:
        print('STOP: these live files differ from the supplied ZIP baseline. No files were changed.')
        for name in conflicts: print('  CONFLICT '+name)
        raise SystemExit('Use a manual diff/merge; do not reset the server or overwrite its local fixes.')
    print(f'{len(pending)} source files would change; matching updated files are skipped.')
    for _, _, name in pending: print('  '+name)
    if not args.apply:
        print('DRY RUN ONLY. Re-run with --apply --backup-dir <new safe folder> after reviewing.')
        return
    if not pending: print('Already up to date.'); return
    if not args.backup_dir: raise SystemExit('--backup-dir is required when applying')
    backup = Path(args.backup_dir).expanduser().resolve()
    if backup.exists(): raise SystemExit('Choose a NEW backup directory; existing backups will not be overwritten.')
    if backup.is_relative_to(target) or backup.is_relative_to(SOURCE): raise SystemExit('Backup must be outside both source and target projects/public web roots.')
    backup.mkdir(parents=True)
    for _, dst, name in pending:
        if dst.is_file():
            saved = backup/name; saved.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(dst, saved)
    (backup/'APPLIED_FILES.json').write_text(json.dumps([n for _,_,n in pending], indent=2),encoding='utf-8')
    for src, dst, _ in pending:
        dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src,dst)
    print('Source update applied. Backup:', backup)
    print('No service was restarted; no database, .env, certificate, key or Git remote was changed.')

if __name__ == '__main__': main()
