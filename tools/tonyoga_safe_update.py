#!/usr/bin/env python3
"""TonYoga Windows-aware update. Dry-run by default; never force-replaces conflicts.

--apply makes an isolated Git branch and backs up the selected original files.
--push additionally runs two LOCAL checks, stages only manifest source files,
commits and pushes the NEW branch to the existing TonyYoga_ios origin.
It never merges main, enables commerce, restarts the VPS or submits to Apple.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys

MANIFEST_SHA256 = 'bd35a027f51217e45fa6ae676d7569b906bc0d178b1f59647f7a811fd56e4a18'
GENERATED_PREFIXES = ('frontend/ios/App/App/public/', 'frontend/ios/capacitor-cordova-ios-plugins/')
GENERATED_EXACT = {'frontend/ios/App/App/capacitor.config.json', 'frontend/ios/App/App/config.xml'}
SECRET_SUFFIXES = ('.jks', '.keystore', '.p12', '.p8', '.pem', '.key', '.mobileprovision', '.env')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def lf_digest(data):
    """Accept ONLY UTF-8 text line-ending equivalence; no whitespace/code cleanup."""
    if data is None or b'\0' in data:
        return None
    try:
        data.decode('utf-8')
    except UnicodeDecodeError:
        return None
    return digest(data.replace(b'\r\n', b'\n'))


def matches(data, expected):
    if data is None:
        return expected is None
    return expected is not None and (digest(data) == expected or lf_digest(data) == expected)


def within(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def safe_path(root, name):
    rel = PurePosixPath(name)
    if (not name or rel.is_absolute() or '..' in rel.parts or '\\' in name
            or ':' in name or '.git' in rel.parts):
        raise RuntimeError('Unsafe manifest path: ' + name)
    p = root
    for part in rel.parts:
        p = p / part
        if p.is_symlink():
            raise RuntimeError('Symlink requires manual review: ' + name)
    if not within(p.resolve(), root):
        raise RuntimeError('Path escapes the project: ' + name)
    return p


def git(root, *args, capture=True, check=True):
    cp = subprocess.run(['git', '-C', str(root), *args], capture_output=capture)
    if check and cp.returncode:
        if capture:
            message = (cp.stderr or cp.stdout).decode('utf-8', 'replace').strip()
            raise RuntimeError('Git command failed (' + args[0] + '): ' + message)
        raise RuntimeError('Git command failed: ' + args[0])
    if capture:
        return cp.stdout.decode('utf-8', 'replace').strip() if check else cp
    return cp


def inspect(source, target):
    mf = (source / 'UPDATE_MANIFEST.json').read_bytes()
    if digest(mf) != MANIFEST_SHA256:
        raise RuntimeError('This is not the unchanged TonYoga commerce package. STOP; do not override this check.')
    manifest = json.loads(mf.decode('utf-8'))
    pending, conflicts, generated, eol_matches, same = [], [], [], [], []
    seen = set()
    for entry in manifest['files']:
        name = entry['path']
        if name in seen:
            raise RuntimeError('Duplicate manifest entry: ' + name)
        seen.add(name)
        src, dst = safe_path(source, name), safe_path(target, name)
        if name.startswith(GENERATED_PREFIXES) or name in GENERATED_EXACT:
            generated.append(name)
            continue
        base = Path(name).name.lower()
        if (name.startswith('frontend/android/') or base == 'key.properties'
                or name.lower().endswith(SECRET_SUFFIXES) or base.startswith('.env')):
            raise RuntimeError('Private/Android file refused by update helper: ' + name)
        if not src.is_file():
            raise RuntimeError('Update source missing: ' + name)
        updated = src.read_bytes()
        if not matches(updated, entry['updated_sha256']):
            raise RuntimeError('Update source has been edited: ' + name)
        if dst.exists() and not dst.is_file():
            raise RuntimeError('Destination is not a regular file: ' + name)
        original = dst.read_bytes() if dst.is_file() else None
        if matches(original, entry['updated_sha256']):
            same.append(name)
            continue
        if not matches(original, entry['original_sha256']):
            conflicts.append(name)
            continue
        if original is not None and digest(original) != entry['original_sha256']:
            eol_matches.append(name)
        pending.append((name, dst, original, updated))
    return pending, conflicts, generated, eol_matches, same


def verify_git(target):
    actual = Path(git(target, 'rev-parse', '--show-toplevel')).resolve()
    if os.path.normcase(str(actual)) != os.path.normcase(str(target)):
        raise RuntimeError('Wrong Git root; refusing to operate in a parent/home repository.')
    for marker in ('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'):
        p = Path(git(target, 'rev-parse', '--path-format=absolute', '--git-path', marker))
        if p.exists():
            raise RuntimeError('Finish the existing Git merge/rebase first.')
    if git(target, 'diff', '--cached', '--name-only'):
        raise RuntimeError('Git already has staged files. Review/commit those separately first; nothing was unstaged.')
    origin = git(target, 'remote', 'get-url', 'origin')
    if origin.lower().rstrip('/') not in {
        'https://github.com/pytech95/tonyyoga_ios.git', 'https://github.com/pytech95/tonyyoga_ios',
        'git@github.com:pytech95/tonyyoga_ios.git', 'git@github.com:pytech95/tonyyoga_ios',
    }:
        raise RuntimeError('origin must be the existing PyTech95/TonyYoga_ios repository. No remote was changed.')
    return git(target, 'rev-parse', 'HEAD')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', required=True, help='Extracted updated package ROOT')
    p.add_argument('--target', required=True, help='Existing local repository ROOT')
    p.add_argument('--apply', action='store_true')
    p.add_argument('--push', action='store_true', help='After applying, check/commit/push a NEW branch only')
    p.add_argument('--backup-dir', help='Optional NEW backup folder, outside source and target')
    args = p.parse_args()
    if args.push and not args.apply:
        p.error('--push requires --apply')
    source, target = Path(args.source).expanduser().resolve(), Path(args.target).expanduser().resolve()
    if source == target or within(source, target) or within(target, source):
        raise RuntimeError('Source and target must be separate, non-nested folders.')
    if not (target / 'frontend/package.json').is_file():
        raise RuntimeError('Target must be the existing TonYoga project ROOT, not frontend.')
    pending, conflicts, generated, eols, same = inspect(source, target)
    print('\n===== TONYOGA SAFE UPDATE =====')
    print('Windows line-ending-only matches:', len(eols))
    print('Generated iOS assets left untouched:', len(generated))
    print('Already updated source files:', len(same))
    print('Source files ready to update:', len(pending))
    print('Real content conflicts:', len(conflicts))
    if conflicts:
        for name in conflicts:
            print('  CONFLICT ' + name)
        raise RuntimeError('No code or Git branch changed. These are REAL differences, not only CRLF. Manual merge is required.')
    if not pending:
        print('Source files are already updated. No new branch, commit or push was made.')
        print('If a previous push failed, inspect the existing update branch and retry its normal push.')
        return
    if not args.apply:
        print('DRY RUN PASSED. No files or Git state changed.')
        print('Use --apply for a backed-up branch update, and --push to check/commit/push that branch.')
        return

    head = verify_git(target)
    if args.push:
        if not shutil.which('node'):
            raise RuntimeError('Node.js is needed for the local policy check. Install/configure Node before applying with --push.')
        git(target, 'var', 'GIT_AUTHOR_IDENT')
        git(target, 'var', 'GIT_COMMITTER_IDENT')
    stamp = dt.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    branch = 'tonyoga-ios-commerce-' + stamp
    backup = (Path(args.backup_dir).expanduser().resolve() if args.backup_dir
              else target.parent / ('TonYogaBackup-' + stamp))
    if within(backup, target) or within(backup, source) or backup.exists():
        raise RuntimeError('Backup must be a NEW folder outside source and target.')
    # Re-read every planned target before making any mutation.
    for name, dst, original, _ in pending:
        now = dst.read_bytes() if dst.is_file() else None
        if now != original:
            raise RuntimeError('File changed during preflight; close editors/retry: ' + name)
    backup.mkdir(parents=True)
    for name, _, original, _ in pending:
        if original is not None:
            out = backup / 'original-files' / name
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(original)
    record = {
        'target': str(target), 'source': str(source), 'git_head_before': head,
        'branch': branch, 'files': [x[0] for x in pending],
        'new_files': [x[0] for x in pending if x[2] is None],
        'line_endings_only': eols, 'generated_skipped': generated,
        'working_tree_status_before': git(target, 'status', '--short'),
        'phase': 'backed_up',
    }
    report = backup / 'UPDATE_REPORT.json'
    def save_report(phase):
        record['phase'] = phase
        report.write_text(json.dumps(record, indent=2), encoding='utf-8')
    save_report('backed_up')
    git(target, 'switch', '-c', branch, capture=False)
    print('Backup:', backup)
    written = []
    try:
        for name, dst, original, updated in pending:
            now = dst.read_bytes() if dst.is_file() else None
            if now != original:
                raise RuntimeError('Concurrent edit detected: ' + name)
            dst.parent.mkdir(parents=True, exist_ok=True)
            written.append((name, dst, original))
            dst.write_bytes(updated)
    except Exception:
        # Restore only files written by this process; no broad reset or clean.
        for name, dst, original in reversed(written):
            if original is None:
                if dst.is_file():
                    dst.unlink()
            else:
                dst.write_bytes(original)
        save_report('copy_failed_original_files_restored')
        raise
    save_report('source_applied_on_new_branch')
    print('Source update APPLIED on branch:', branch)
    print('Android files, .env, signing keys and services were not changed.')
    if not args.push:
        print('No commit or push requested. Review the branch and run the package checks.')
        return
    try:
        print('\n===== LOCAL CHECKS =====', flush=True)
        subprocess.run(['node', 'tools/test-commerce-policy.mjs'], cwd=target, check=True)
        # Force UTF-8 on Windows for project/plist source checks.
        subprocess.run([sys.executable, '-X', 'utf8', 'tools/validate_ios_project.py'], cwd=target, check=True)
        # Stage ONLY the reviewed source list; no git add . / -A / forced add.
        names = [x[0] for x in pending]
        for i in range(0, len(names), 15):
            git(target, 'add', '--', *names[i:i + 15])
        staged = set(git(target, 'diff', '--cached', '--name-only').splitlines())
        if staged - set(names):
            raise RuntimeError('Unexpected staged files detected. Review index before any commit.')
        for name in staged:
            if name.startswith('frontend/android/') or name.lower().endswith(SECRET_SUFFIXES) or Path(name).name == 'key.properties':
                raise RuntimeError('Protected file found in Git index. No commit was made.')
        if not staged:
            raise RuntimeError('No staged update. Review Git status; nothing pushed.')
        git(target, 'commit', '-m', 'Apply TonYoga iOS commerce update (review branch)', capture=False)
        save_report('committed_new_branch')
        print('\n===== PUSH NEW BRANCH ONLY =====', flush=True)
        git(target, 'push', '-u', 'origin', branch, capture=False)
        save_report('pushed_new_branch')
    except Exception:
        print('\nSTOP: code is on the new local branch; main/VPS were not changed.')
        print('Backup and operation phase:', report)
        print('Do not reset or force-push. Share the error (without secrets).')
        raise
    print('\nSUCCESS: NEW CODE PUSHED TO GITHUB BRANCH:', branch)
    print('Main branch has NOT been merged or force-pushed.')
    print('No Apple upload/submission or VPS deployment was performed.')
    print('Keep IOS_COMMERCE_READY unchanged until Apple products + VPS verification are configured.')
    print('Next: review branch, configure the existing VPS/IAP, run the new TestFlight build, test on-device, then submit.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        print('\nERROR:', exc, file=sys.stderr)
        sys.exit(1)
