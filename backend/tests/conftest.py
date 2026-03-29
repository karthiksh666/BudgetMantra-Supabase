"""
Shared pytest fixtures for Budget Mantra backend tests.
The session-scoped fixtures defined here are available to all test classes.
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

_RUN_ID = uuid.uuid4().hex[:8]
TEST_EMAIL = f"ci_{_RUN_ID}@budgetmantra.test"
TEST_PASSWORD = "CItest_password_123"
TEST_NAME = "CI Test User"


@pytest.fixture(scope="session")
def auth_token():
    """Register a unique test user once per session and return its JWT."""
    resp = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": TEST_EMAIL,
        "name": TEST_NAME,
        "password": TEST_PASSWORD,
    })
    assert resp.status_code == 200, f"Test user registration failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}
