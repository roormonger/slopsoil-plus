"""Encryption utilities for sensitive data storage."""

from __future__ import annotations

import os
import base64
import logging
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

log = logging.getLogger(__name__)

# Generate or load encryption key from environment
# In production, this should be set via environment variable and never hardcoded
# For development, we'll generate one if not present
_ENCRYPTION_KEY = None

def _get_or_create_key() -> bytes:
    """Get or create the encryption key."""
    global _ENCRYPTION_KEY
    
    if _ENCRYPTION_KEY is not None:
        return _ENCRYPTION_KEY
    
    # Try to get key from environment
    key_env = os.environ.get('SLOPSOIL_ENCRYPTION_KEY')
    
    if key_env:
        try:
            _ENCRYPTION_KEY = key_env.encode()
            # Validate it's a proper Fernet key
            Fernet(_ENCRYPTION_KEY)
            log.info("Loaded encryption key from environment")
            return _ENCRYPTION_KEY
        except Exception:
            log.warning("Invalid encryption key in environment, generating new one")
    
    # Generate a new key
    _ENCRYPTION_KEY = Fernet.generate_key()
    log.warning("Generated new encryption key - set SLOPSOIL_ENCRYPTION_KEY environment variable to persist!")
    log.warning(f"Key (save this!): {_ENCRYPTION_KEY.decode()}")
    
    return _ENCRYPTION_KEY

def get_fernet() -> Fernet:
    """Get a Fernet instance with the current key."""
    return Fernet(_get_or_create_key())

def encrypt_value(value: str | None) -> str | None:
    """Encrypt a string value. Returns None if input is None."""
    if value is None:
        return None
    
    if not value:
        return value
    
    try:
        f = get_fernet()
        encrypted = f.encrypt(value.encode('utf-8'))
        return base64.urlsafe_b64encode(encrypted).decode('utf-8')
    except Exception as e:
        log.error(f"Encryption failed: {e}")
        raise

def decrypt_value(encrypted_value: str | None) -> str | None:
    """Decrypt an encrypted string value. Returns None if input is None."""
    if encrypted_value is None:
        return None
    
    if not encrypted_value:
        return encrypted_value
    
    try:
        f = get_fernet()
        # Decode from URL-safe base64
        encrypted_bytes = base64.urlsafe_b64decode(encrypted_value.encode('utf-8'))
        decrypted = f.decrypt(encrypted_bytes)
        return decrypted.decode('utf-8')
    except Exception as e:
        log.error(f"Decryption failed: {e}")
        raise

def is_encrypted(value: str | None) -> bool:
    """Check if a value appears to be encrypted (starts with encryption prefix)."""
    if not value:
        return False
    
    # Fernet tokens start with 'gAAAAA' (base64 encoded version of 'gAAAA' magic bytes)
    # Our base64 encoding makes it URL-safe but keeps the pattern
    try:
        decoded = base64.urlsafe_b64decode(value.encode('utf-8'))
        return decoded.startswith(b'gAAAA')
    except Exception:
        return False
