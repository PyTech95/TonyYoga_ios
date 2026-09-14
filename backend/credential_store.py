"""Encrypt integration secrets with a persistent, environment-owned key."""
import os
from cryptography.fernet import Fernet

PREFIX = "encrypted:v1:"


def encrypt_secret(value):
    if not value or str(value).startswith(PREFIX):
        return value
    return PREFIX + Fernet(os.environ["CREDENTIALS_MASTER_KEY"].encode()).encrypt(str(value).encode()).decode()


def decrypt_secret(value):
    if isinstance(value, str) and value.startswith(PREFIX):
        return Fernet(os.environ["CREDENTIALS_MASTER_KEY"].encode()).decrypt(value[len(PREFIX):].encode()).decode()
    return value  # Existing plaintext settings are migrated once during startup.


async def migrate_credentials(db, secret_fields):
    doc = await db.app_settings.find_one({"_id": "global"}, {"_id": 0}) or {}
    for key in secret_fields:
        old = doc.get(key)
        if old and not str(old).startswith(PREFIX):
            await db.app_settings.update_one({"_id": "global", key: old}, {"$set": {key: encrypt_secret(old)}})