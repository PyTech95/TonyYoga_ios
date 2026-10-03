"""Fetch public trust anchors directly from Apple; no private signing credentials needed.
Usage: backend/venv/bin/python tools/install_apple_roots.py /etc/tonyoga/apple-roots
"""
import sys, urllib.request
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes
if len(sys.argv)!=2: raise SystemExit('Usage: install_apple_roots.py DESTINATION_DIRECTORY')
dest=Path(sys.argv[1]);dest.mkdir(parents=True,exist_ok=True)
for name in ('AppleRootCA-G2.cer','AppleRootCA-G3.cer'):
    url='https://www.apple.com/certificateauthority/'+name
    with urllib.request.urlopen(url, timeout=30) as r:
        if not r.geturl().startswith('https://www.apple.com/certificateauthority/'):
            raise SystemExit('Unexpected download redirect; verify Apple PKI manually.')
        data=r.read(20001)
    if len(data)>20000: raise SystemExit('Unexpected certificate size')
    cert=x509.load_der_x509_certificate(data)
    if cert.issuer != cert.subject or not cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca:
        raise SystemExit('Downloaded certificate is not a self-issued CA')
    cert.verify_directly_issued_by(cert)
    target=dest/name
    if target.exists() and target.read_bytes()!=data: raise SystemExit(f'{target} differs; manual review required')
    target.write_bytes(data)
    print(name, 'SHA256:',cert.fingerprint(hashes.SHA256()).hex())
