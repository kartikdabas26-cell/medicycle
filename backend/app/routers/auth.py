from datetime import datetime, timedelta
from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuthVerificationToken, Facility, UserAccount
from ..services.security import decode_jwt_token, hash_password, issue_jwt_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

DEFAULT_PATIENT_OTP = "123456"
DEFAULT_INSTITUTIONAL_CODE = "849201"

ROLE_DISPLAY_MAP = {
    "hospital": "Hospital",
    "chemist": "Chemist",
    "supplier": "Supplier",
    "admin": "Network Admin",
    "patient": "patient",
}


# --- Request & Response Models ---

class PatientSendOtpRequest(BaseModel):
    type: Literal["email", "phone"]
    identifier: str = Field(..., min_length=3)


class PatientVerifyOtpRequest(BaseModel):
    identifier: str = Field(..., min_length=3)
    code: str = Field(..., min_length=6, max_length=6)
    type: Literal["email", "phone"]


class GoogleLoginRequest(BaseModel):
    email: str = Field(default="patient.demo@gmail.com")
    name: str = Field(default="Verified Patient")


class InstitutionalStep1Request(BaseModel):
    facility_id: str = Field(..., min_length=2)
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=4)
    domain: Literal["hospital", "chemist", "supplier"]


class InstitutionalStep2Request(BaseModel):
    facility_id: str = Field(..., min_length=2)
    email: str = Field(..., min_length=3)
    code: str = Field(..., min_length=6, max_length=6)


class AdminLoginRequest(BaseModel):
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=6)
    pin: str = Field(..., min_length=6, max_length=6)


# --- Endpoints ---

@router.post("/patient/send-otp")
def patient_send_otp(payload: PatientSendOtpRequest, db: Session = Depends(get_db)):
    """Generates and records a 6-digit OTP for patient authentication (demo auto-fill 123456)."""
    clean_identifier = payload.identifier.strip().lower()
    otp_code = DEFAULT_PATIENT_OTP

    # Save to AuthVerificationToken
    token_record = AuthVerificationToken(
        identifier=clean_identifier,
        code=otp_code,
        token_type="patient_otp",
        expires_at=datetime.now() + timedelta(minutes=10),
        is_used=False,
    )
    db.add(token_record)
    db.commit()

    return {
        "status": "sent",
        "demo_otp": otp_code,
        "type": payload.type,
        "identifier": clean_identifier,
        "message": f"6-digit OTP code {otp_code} has been dispatched to {payload.identifier}",
    }


@router.post("/patient/verify-otp")
def patient_verify_otp(payload: PatientVerifyOtpRequest, db: Session = Depends(get_db)):
    """Verifies OTP, provisions or retrieves the patient UserAccount, and returns a signed JWT."""
    clean_identifier = payload.identifier.strip().lower()
    code = payload.code.strip()

    # Verify code matches DEFAULT_PATIENT_OTP or active token in DB
    valid_token = db.query(AuthVerificationToken).filter(
        AuthVerificationToken.identifier == clean_identifier,
        AuthVerificationToken.token_type == "patient_otp",
        AuthVerificationToken.code == code,
        AuthVerificationToken.is_used == False,
        AuthVerificationToken.expires_at >= datetime.now(),
    ).first()

    if code != DEFAULT_PATIENT_OTP and not valid_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired 6-digit verification code. Please check and retry.",
        )

    if valid_token:
        valid_token.is_used = True
        db.commit()

    # Find or provision Patient UserAccount
    filter_expr = (UserAccount.email == clean_identifier) if payload.type == "email" else (UserAccount.phone == clean_identifier)
    user = db.query(UserAccount).filter(filter_expr).first()
    if not user:
        user = UserAccount(
            domain="patient",
            email=clean_identifier if payload.type == "email" else None,
            phone=clean_identifier if payload.type == "phone" else None,
            is_verified=True,
            is_superadmin=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = issue_jwt_token(
        sub=f"patient-{user.id}",
        role="patient",
        domain="patient",
        facility_id=None,
        email=user.email,
        is_superadmin=False,
        expires_hours=12,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "patient",
        "domain": "patient",
        "facility_id": None,
        "user": {
            "id": user.id,
            "identifier": clean_identifier,
            "type": payload.type,
            "domain": "patient",
            "is_verified": True,
        },
    }


@router.post("/patient/google-login")
def patient_google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    """1-Click simulated Google / Gmail OAuth handshake creating or loading patient session."""
    clean_email = payload.email.strip().lower()

    user = db.query(UserAccount).filter(UserAccount.email == clean_email).first()
    if not user:
        user = UserAccount(
            domain="patient",
            email=clean_email,
            is_verified=True,
            is_superadmin=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = issue_jwt_token(
        sub=f"patient-google-{user.id}",
        role="patient",
        domain="patient",
        facility_id=None,
        email=user.email,
        is_superadmin=False,
        expires_hours=12,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "patient",
        "domain": "patient",
        "facility_id": None,
        "user": {
            "id": user.id,
            "identifier": clean_email,
            "name": payload.name,
            "domain": "patient",
            "auth_provider": "google",
            "is_verified": True,
        },
    }


@router.post("/institutional/step1-verify")
def institutional_step1_verify(payload: InstitutionalStep1Request, db: Session = Depends(get_db)):
    """
    Step 1: Credential Verification
    Validates:
    1. Assigned Facility ID exists in facilities database.
    2. Registered Official Email matches on-file user account for that facility.
    3. Password matches stored PBKDF2 hash.
    4. Domain matches requested institutional portal (hospital, chemist, supplier).
    Generates 6-digit handshake verification code (849201).
    """
    facility_id = payload.facility_id.strip()
    clean_email = payload.email.strip().lower()
    req_domain = payload.domain.lower()

    # 1. Validate Facility ID exists
    facility = db.query(Facility).filter(Facility.id == facility_id).first()
    if not facility:
        # Check case-insensitive
        facility = db.query(Facility).filter(Facility.id.ilike(facility_id)).first()
    if not facility:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Facility ID '{facility_id}' not found in the national health facility registry.",
        )

    # 2. Check UserAccount for this facility & email
    user = db.query(UserAccount).filter(
        UserAccount.facility_id == facility.id,
        UserAccount.email == clean_email,
    ).first()

    # Also check fallback if email matches contact email or seeded facility mapping
    if not user:
        user = db.query(UserAccount).filter(
            UserAccount.email == clean_email,
            UserAccount.domain == req_domain,
        ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"No institutional account registered with email '{clean_email}' for facility '{facility_id}'.",
        )

    # 3. Domain match verification
    if user.domain != req_domain:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This account belongs to the '{user.domain.upper()}' domain. Please sign in via the appropriate portal.",
        )

    # 4. Password validation
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect institutional password for this facility.",
        )

    # Step 1 passed! Generate Step 2 verification code
    code = DEFAULT_INSTITUTIONAL_CODE
    token_record = AuthVerificationToken(
        identifier=clean_email,
        code=code,
        token_type="institutional_email_verify",
        expires_at=datetime.now() + timedelta(minutes=10),
        is_used=False,
    )
    db.add(token_record)
    db.commit()

    return {
        "status": "code_sent",
        "demo_code": code,
        "facility_id": facility.id,
        "facility_name": facility.name,
        "email": clean_email,
        "domain": req_domain,
        "message": f"Verification code {code} dispatched to official email {clean_email}.",
    }


@router.post("/institutional/step2-confirm")
def institutional_step2_confirm(payload: InstitutionalStep2Request, db: Session = Depends(get_db)):
    """
    Step 2: Email Handshake Verification
    Validates the 6-digit PIN (849201) and issues a 12-hour signed JWT containing role and facility_id.
    """
    facility_id = payload.facility_id.strip()
    clean_email = payload.email.strip().lower()
    code = payload.code.strip()

    valid_token = db.query(AuthVerificationToken).filter(
        AuthVerificationToken.identifier == clean_email,
        AuthVerificationToken.token_type == "institutional_email_verify",
        AuthVerificationToken.code == code,
        AuthVerificationToken.is_used == False,
        AuthVerificationToken.expires_at >= datetime.now(),
    ).first()

    if code != DEFAULT_INSTITUTIONAL_CODE and not valid_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification PIN. Please request a new code.",
        )

    if valid_token:
        valid_token.is_used = True
        db.commit()

    # Find the user account
    user = db.query(UserAccount).filter(
        UserAccount.facility_id == facility_id,
        UserAccount.email == clean_email,
    ).first()
    if not user:
        user = db.query(UserAccount).filter(UserAccount.email == clean_email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institutional user account could not be found.",
        )

    role_display = ROLE_DISPLAY_MAP.get(user.domain, user.domain.title())

    token = issue_jwt_token(
        sub=f"inst-{user.domain}-{facility_id}",
        role=role_display,
        domain=user.domain,
        facility_id=facility_id,
        email=clean_email,
        is_superadmin=False,
        expires_hours=12,
    )

    facility = db.query(Facility).filter(Facility.id == facility_id).first()

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": role_display,
        "domain": user.domain,
        "facility_id": facility_id,
        "facility_name": facility.name if facility else facility_id,
        "email": clean_email,
        "expires_in_hours": 12,
    }


@router.post("/admin/login")
def admin_login(payload: AdminLoginRequest, db: Session = Depends(get_db)):
    """
    Hardened Authentication Gate for Master Platform Owner:
    - Master Admin Identifier (admin@medicycle.gov)
    - Master Admin Password (AdminMaster@2026)
    - 6-Digit Owner Security PIN (990011)
    Returns super-admin JWT with role: "Network Admin" and is_superadmin: true.
    """
    clean_email = payload.email.strip().lower()
    pin = payload.pin.strip()

    admin_user = db.query(UserAccount).filter(
        UserAccount.domain == "admin",
        UserAccount.email == clean_email,
    ).first()

    if not admin_user or clean_email != "admin@medicycle.gov":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access Denied: Invalid Master Admin identifier.",
        )

    if not verify_password(payload.password, admin_user.hashed_password) and payload.password != "AdminMaster@2026":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access Denied: Master Admin password challenge failed.",
        )

    if pin != "990011" and admin_user.pin != pin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access Denied: 6-Digit Owner Security PIN challenge failed.",
        )

    token = issue_jwt_token(
        sub="admin-platform-owner",
        role="Network Admin",
        domain="admin",
        facility_id=None,
        email=clean_email,
        is_superadmin=True,
        expires_hours=12,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "Network Admin",
        "domain": "admin",
        "facility_id": None,
        "is_superadmin": True,
        "email": clean_email,
        "expires_in_hours": 12,
    }


@router.get("/me")
def get_current_user_profile(authorization: str | None = Header(default=None)):
    """Inspects the currently presented JWT bearer token and returns session claims."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No active bearer token provided.")
    token_str = authorization.removeprefix("Bearer ")
    try:
        claims = decode_jwt_token(token_str)
        return {
            "authenticated": True,
            "role": claims.get("role"),
            "domain": claims.get("domain"),
            "facility_id": claims.get("facility_id"),
            "email": claims.get("email"),
            "is_superadmin": claims.get("is_superadmin", False),
            "exp": claims.get("exp"),
        }
    except Exception as err:
        raise HTTPException(status_code=401, detail=f"Invalid session token: {str(err)}")


@router.get("/demo-credentials")
def get_demo_credentials():
    """Provides the active seeded demo credentials for quick 1-click evaluation buttons."""
    return {
        "admin": {
            "title": "Master Platform Owner",
            "email": "admin@medicycle.gov",
            "password": "AdminMaster@2026",
            "pin": "990011",
            "role": "Network Admin",
            "domain": "admin",
        },
        "hospital": {
            "title": "Central Hospital Command",
            "facility_id": "FAC-001",
            "facility_name": "Apex Central Hospital",
            "email": "pharmacy@centralhospital.org",
            "password": "Hospital@2026",
            "demo_code": "849201",
            "role": "Hospital",
            "domain": "hospital",
        },
        "chemist": {
            "title": "Retail Chemist & Dispensary",
            "facility_id": "FAC-003",
            "facility_name": "Valley Community Clinic",
            "email": "dispensary@apollochemist.com",
            "password": "Chemist@2026",
            "demo_code": "849201",
            "role": "Chemist",
            "domain": "chemist",
        },
        "supplier": {
            "title": "Medical Supplier & Logistics",
            "facility_id": "FAC-006",
            "facility_name": "Harbor Medical Center",
            "email": "orders@apexdistributors.com",
            "password": "Supplier@2026",
            "demo_code": "849201",
            "role": "Supplier",
            "domain": "supplier",
        },
        "patient": {
            "title": "Patient & Family Portal",
            "email": "patient.demo@gmail.com",
            "phone": "5550198234",
            "otp": "123456",
            "role": "patient",
            "domain": "patient",
        },
    }
