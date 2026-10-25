import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_patient_otp_workflow(client: TestClient):
    # 1. Send OTP
    send_resp = client.post("/api/auth/patient/send-otp", json={"type": "email", "identifier": "patient.test@gmail.com"})
    assert send_resp.status_code == 200
    assert send_resp.json()["demo_otp"] == "123456"

    # 2. Verify Wrong OTP
    bad_verify = client.post("/api/auth/patient/verify-otp", json={
        "type": "email",
        "identifier": "patient.test@gmail.com",
        "code": "000000"
    })
    assert bad_verify.status_code == 400

    # 3. Verify Correct OTP
    good_verify = client.post("/api/auth/patient/verify-otp", json={
        "type": "email",
        "identifier": "patient.test@gmail.com",
        "code": "123456"
    })
    assert good_verify.status_code == 200
    data = good_verify.json()
    assert "access_token" in data
    assert data["role"] == "patient"
    assert data["domain"] == "patient"


def test_patient_google_login(client: TestClient):
    resp = client.post("/api/auth/patient/google-login", json={
        "email": "sarah.patient@gmail.com",
        "name": "Sarah Connor"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "patient"
    assert "access_token" in data


def test_institutional_dual_verification_hospital(client: TestClient):
    # Step 1: Bad password
    bad_step1 = client.post("/api/auth/institutional/step1-verify", json={
        "facility_id": "FAC-001",
        "email": "pharmacy@centralhospital.org",
        "password": "WrongPassword",
        "domain": "hospital"
    })
    assert bad_step1.status_code == 401

    # Step 1: Wrong Domain
    wrong_domain = client.post("/api/auth/institutional/step1-verify", json={
        "facility_id": "FAC-001",
        "email": "pharmacy@centralhospital.org",
        "password": "Hospital@2026",
        "domain": "chemist"
    })
    assert wrong_domain.status_code == 403

    # Step 1: Correct Credentials
    step1 = client.post("/api/auth/institutional/step1-verify", json={
        "facility_id": "FAC-001",
        "email": "pharmacy@centralhospital.org",
        "password": "Hospital@2026",
        "domain": "hospital"
    })
    assert step1.status_code == 200
    assert step1.json()["demo_code"] == "849201"

    # Step 2: Bad code
    bad_step2 = client.post("/api/auth/institutional/step2-confirm", json={
        "facility_id": "FAC-001",
        "email": "pharmacy@centralhospital.org",
        "code": "111111"
    })
    assert bad_step2.status_code == 400

    # Step 2: Valid code
    good_step2 = client.post("/api/auth/institutional/step2-confirm", json={
        "facility_id": "FAC-001",
        "email": "pharmacy@centralhospital.org",
        "code": "849201"
    })
    assert good_step2.status_code == 200
    token_data = good_step2.json()
    assert token_data["role"] == "Hospital"
    assert token_data["facility_id"] == "FAC-001"
    assert "access_token" in token_data


def test_institutional_chemist_and_supplier(client: TestClient):
    # Chemist
    c_s1 = client.post("/api/auth/institutional/step1-verify", json={
        "facility_id": "FAC-003",
        "email": "dispensary@apollochemist.com",
        "password": "Chemist@2026",
        "domain": "chemist"
    })
    assert c_s1.status_code == 200
    c_s2 = client.post("/api/auth/institutional/step2-confirm", json={
        "facility_id": "FAC-003",
        "email": "dispensary@apollochemist.com",
        "code": "849201"
    })
    assert c_s2.status_code == 200
    assert c_s2.json()["role"] == "Chemist"

    # Supplier
    s_s1 = client.post("/api/auth/institutional/step1-verify", json={
        "facility_id": "FAC-006",
        "email": "orders@apexdistributors.com",
        "password": "Supplier@2026",
        "domain": "supplier"
    })
    assert s_s1.status_code == 200
    s_s2 = client.post("/api/auth/institutional/step2-confirm", json={
        "facility_id": "FAC-006",
        "email": "orders@apexdistributors.com",
        "code": "849201"
    })
    assert s_s2.status_code == 200
    assert s_s2.json()["role"] == "Supplier"


def test_master_admin_hardened_gate(client: TestClient):
    # 1. Invalid email
    assert client.post("/api/auth/admin/login", json={
        "email": "hacker@evil.com",
        "password": "AdminMaster@2026",
        "pin": "990011"
    }).status_code == 401

    # 2. Invalid password
    assert client.post("/api/auth/admin/login", json={
        "email": "admin@medicycle.gov",
        "password": "WrongPassword",
        "pin": "990011"
    }).status_code == 401

    # 3. Invalid PIN
    assert client.post("/api/auth/admin/login", json={
        "email": "admin@medicycle.gov",
        "password": "AdminMaster@2026",
        "pin": "000000"
    }).status_code == 401

    # 4. Valid Master Admin
    res = client.post("/api/auth/admin/login", json={
        "email": "admin@medicycle.gov",
        "password": "AdminMaster@2026",
        "pin": "990011"
    })
    assert res.status_code == 200
    admin_data = res.json()
    assert admin_data["role"] == "Network Admin"
    assert admin_data["is_superadmin"] is True

    # 5. Verify /api/auth/me returns valid claims
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {admin_data['access_token']}"})
    assert me.status_code == 200
    assert me.json()["is_superadmin"] is True
