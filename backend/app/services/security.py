import base64
import hashlib
import hmac
import json
import os
import time

JWT_SECRET = os.getenv("MEDICYCLE_JWT_SECRET")
if os.getenv("VERCEL") == "1" and (not JWT_SECRET or len(JWT_SECRET) < 32):
    raise RuntimeError("Set MEDICYCLE_JWT_SECRET to at least 32 characters for Vercel deployments")
JWT_SECRET = JWT_SECRET or "medicycle-v2-local-demo-secret-change-before-deployment"


def hash_password(password: str) -> str:
    """Hashes a password using PBKDF2-HMAC-SHA256 with a 16-byte cryptographically secure salt."""
    salt = os.urandom(16).hex()
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
    return f"pbkdf2:sha256:100000${salt}${hashed}"


def verify_password(password: str, hashed_password: str | None) -> bool:
    """Verifies a plain password against the stored PBKDF2 hash, with demo fallback."""
    if not hashed_password:
        return False
    # Fallback if plaintext stored in demo mode
    if "$" not in hashed_password:
        return hmac.compare_digest(password, hashed_password)
    try:
        parts = hashed_password.split("$")
        if len(parts) == 3:
            _, salt, expected_hash = parts
            computed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
            return hmac.compare_digest(computed, expected_hash)
    except Exception:
        return False
    return False


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def issue_jwt_token(
    sub: str,
    role: str,
    domain: str,
    facility_id: str | None = None,
    email: str | None = None,
    is_superadmin: bool = False,
    expires_hours: int = 12,
) -> str:
    """Issues a tamper-proof HMAC-SHA256 signed JWT containing domain and facility claims."""
    now = int(time.time())
    header_json = json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode("utf-8")
    header_b64 = _b64url_encode(header_json)

    payload_data = {
        "sub": sub,
        "role": role,
        "domain": domain,
        "facility_id": facility_id,
        "email": email,
        "is_superadmin": is_superadmin,
        "iat": now,
        "exp": now + (expires_hours * 3600),
    }
    payload_json = json.dumps(payload_data, separators=(",", ":")).encode("utf-8")
    payload_b64 = _b64url_encode(payload_json)

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    sig_b64 = _b64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{sig_b64}"


def decode_jwt_token(token: str) -> dict:
    """Validates signature, expiration, and returns the claims payload."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT structure")
    signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
    expected_sig = _b64url_encode(hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest())
    if not hmac.compare_digest(expected_sig, parts[2]):
        raise ValueError("Invalid JWT signature")

    payload_bytes = _b64url_decode(parts[1])
    payload = json.loads(payload_bytes.decode("utf-8"))

    if payload.get("exp", 0) <= int(time.time()):
        raise ValueError("Token has expired")

    return payload
