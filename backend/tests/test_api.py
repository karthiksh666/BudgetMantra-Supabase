"""
Backend API Tests for Budget Mantra
All tests are self-contained: a fresh user is registered per session.
Requires the server to be running at REACT_APP_BACKEND_URL.
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

# Unique credentials for this CI run — avoids collisions across parallel runs
_RUN_ID = uuid.uuid4().hex[:8]
TEST_EMAIL = f"ci_{_RUN_ID}@budgetmantra.test"
TEST_PASSWORD = "CItest_password_123"
TEST_NAME = "CI Test User"


# ─────────────────────────────────────────────────────────────────────────────
# Session-scoped fixture: register once, reuse token everywhere
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def auth_token():
    """Register a fresh test user and return its JWT token."""
    resp = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": TEST_EMAIL,
        "name": TEST_NAME,
        "password": TEST_PASSWORD,
    })
    assert resp.status_code == 200, f"Registration failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# ─────────────────────────────────────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────────────────────────────────────

class TestHealthCheck:
    def test_health_endpoint(self):
        resp = requests.get(f"{BASE_URL}/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "ok"
        print(f"✓ Health: {data}")

    def test_api_root(self):
        resp = requests.get(f"{BASE_URL}/api/")
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        print(f"✓ API root: {data['message']}")


# ─────────────────────────────────────────────────────────────────────────────
# Authentication
# ─────────────────────────────────────────────────────────────────────────────

class TestAuthentication:
    def test_login_success(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✓ Login OK for {TEST_EMAIL}")

    def test_login_invalid_credentials(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nobody@nowhere.test",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401
        print("✓ Invalid login rejected")

    def test_register_duplicate_email(self):
        resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_EMAIL,
            "name": "Duplicate",
            "password": "whatever",
        })
        assert resp.status_code == 400
        print("✓ Duplicate email rejected")

    def test_get_current_user(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == TEST_EMAIL
        print(f"✓ /me returned: {data['name']}")


# ─────────────────────────────────────────────────────────────────────────────
# Budget categories
# ─────────────────────────────────────────────────────────────────────────────

class TestBudgetCategories:
    def test_create_income_category(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/categories", headers=auth_headers, json={
            "name": f"CI_Salary_{_RUN_ID}",
            "type": "income",
            "allocated_amount": 50000,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "income"
        print(f"✓ Income category created: {data['name']}")

    def test_create_expense_category(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/categories", headers=auth_headers, json={
            "name": f"CI_Groceries_{_RUN_ID}",
            "type": "expense",
            "allocated_amount": 5000,
        })
        assert resp.status_code == 200
        assert resp.json()["type"] == "expense"
        print("✓ Expense category created")

    def test_get_categories(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/categories", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        print(f"✓ {len(resp.json())} categories retrieved")

    def test_get_budget_summary(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/budget-summary", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_income" in data
        assert "total_expenses" in data
        assert "remaining_budget" in data
        print(f"✓ Budget summary OK")


# ─────────────────────────────────────────────────────────────────────────────
# EMIs
# ─────────────────────────────────────────────────────────────────────────────

class TestEMIs:
    def test_create_emi(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/emis", headers=auth_headers, json={
            "loan_name": f"CI_CarLoan_{_RUN_ID}",
            "principal_amount": 500000,
            "interest_rate": 9.5,
            "monthly_payment": 10500,
            "start_date": "2024-01-01",
            "tenure_months": 60,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "active"
        print(f"✓ EMI created: {data['loan_name']}")

    def test_get_emis(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/emis", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        print(f"✓ {len(resp.json())} EMIs retrieved")

    def test_get_emi_recommendations(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/emis/recommendations", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        print("✓ EMI recommendations OK")


# ─────────────────────────────────────────────────────────────────────────────
# Financial score
# ─────────────────────────────────────────────────────────────────────────────

class TestFinancialScore:
    def test_get_financial_score(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/financial-score", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "score" in data
        assert data["status"] in ("green", "amber", "red")
        print(f"✓ Financial score: {data['score']} / {data['status']}")


# ─────────────────────────────────────────────────────────────────────────────
# When to Buy
# ─────────────────────────────────────────────────────────────────────────────

class TestWhenToBuy:
    def test_when_to_buy(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/when-to-buy", headers=auth_headers, json={
            "item_name": "New Laptop",
            "target_amount": 80000,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "can_buy" in data
        assert "message" in data
        print(f"✓ When-to-buy: {data['message']}")


# ─────────────────────────────────────────────────────────────────────────────
# Family groups
# ─────────────────────────────────────────────────────────────────────────────

class TestFamilyGroups:
    def test_get_family_members_no_group(self, auth_headers):
        """Fresh user has no family group — endpoint returns 200 or 404."""
        resp = requests.get(f"{BASE_URL}/api/family/members", headers=auth_headers)
        # Either 200 with empty/no group, or 404 if no group yet — both are acceptable
        assert resp.status_code in (200, 404)
        print(f"✓ Family members endpoint: {resp.status_code}")


# ─────────────────────────────────────────────────────────────────────────────
# Investments
# ─────────────────────────────────────────────────────────────────────────────

class TestInvestments:
    def test_get_investments_empty(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/investments", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        print(f"✓ Investments list OK ({len(resp.json())} items)")

    def test_create_investment(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/investments", headers=auth_headers, json={
            "name": "CI Test FD",
            "asset_type": "fd",
            "invested_amount": 100000,
            "current_value": 105000,
            "start_date": "2024-01-01",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "CI Test FD"
        print(f"✓ Investment created: {data['name']}")

    def test_get_investment_summary(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/investments/summary", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_invested" in data
        print(f"✓ Investment summary OK: ₹{data['total_invested']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
