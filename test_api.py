#!/usr/bin/env python3
"""
Budget Mantra — API Test Suite
Usage:
    python test_api.py                        # tests against localhost:8000
    python test_api.py --url https://your.app # tests against production
    python test_api.py --url https://your.app --keep  # don't clean up test data
"""

import sys
import time
import json
import argparse
import requests
from datetime import date, datetime

# ── Config ────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--url",  default="http://localhost:8000", help="Base URL of the API")
parser.add_argument("--keep", action="store_true", help="Skip cleanup of test data")
args = parser.parse_args()

BASE   = args.url.rstrip("/") + "/api"
TODAY  = date.today().isoformat()
EMAIL  = f"test_runner_{int(time.time())}@testmail.dev"
PASS   = "TestPass123!"
NAME   = "Test Runner"

# ── Result tracking ───────────────────────────────────────────────────────────
results = []

def test(name, method, path, *, json=None, expected=None, headers=None, skip=False):
    """Run one API test and record result."""
    if skip:
        results.append(("SKIP", name, "-", "-"))
        return None

    url = BASE + path
    start = time.time()
    try:
        r = getattr(requests, method)(url, json=json, headers=headers, timeout=15)
        ms = int((time.time() - start) * 1000)
        ok_codes = expected if expected else [200, 201]
        status = "PASS" if r.status_code in ok_codes else "FAIL"
        results.append((status, name, r.status_code, f"{ms}ms"))
        if status == "FAIL":
            print(f"  ✗ {name}  [{r.status_code}]  {r.text[:200]}")
        return r
    except Exception as e:
        ms = int((time.time() - start) * 1000)
        results.append(("ERR", name, "???", f"{ms}ms"))
        print(f"  ✗ {name}  ERROR: {e}")
        return None

def h(token):
    return {"Authorization": f"Bearer {token}"}

# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"  Budget Mantra API Test Suite")
print(f"  Target : {BASE}")
print(f"  Account: {EMAIL}")
print(f"{'='*60}\n")

# ── 1. Health ─────────────────────────────────────────────────────────────────
print("[ Health ]")
test("GET /", "get", "/")

# ── 2. Auth ───────────────────────────────────────────────────────────────────
print("\n[ Auth ]")
r = test("Register", "post", "/auth/register",
         json={"email": EMAIL, "password": PASS, "name": NAME}, expected=[200, 201])
token = r.json().get("access_token") if r and r.ok else None

if not token:
    r = test("Login (fallback)", "post", "/auth/login",
             json={"email": EMAIL, "password": PASS})
    token = r.json().get("access_token") if r and r.ok else None

if not token:
    print("\n  FATAL: Could not obtain auth token. Aborting.\n")
    sys.exit(1)

test("GET /auth/me", "get", "/auth/me", headers=h(token))
test("PUT /auth/profile", "put", "/auth/profile",
     json={"name": NAME, "currency": "INR"}, headers=h(token))

# ── 3. Transactions ───────────────────────────────────────────────────────────
print("\n[ Transactions ]")
# Fetch categories first to get a valid category_id
_cats_r = requests.get(BASE + "/categories", headers=h(token), timeout=15)
_cat_id = next((c["id"] for c in (_cats_r.json() if _cats_r.ok else []) if c.get("type") == "expense"), None)
r = test("POST /transactions (expense)", "post", "/transactions",
         json={"description": "Test lunch", "amount": 250, "category_id": _cat_id,
               "date": TODAY}, headers=h(token), expected=[200, 201],
         skip=not _cat_id)
txn_id = r.json().get("id") if r and r.ok else None

test("GET /transactions", "get", "/transactions", headers=h(token))
test("GET /budget-summary", "get", "/budget-summary", headers=h(token))
test("GET /spending-breakdown", "get", "/spending-breakdown", headers=h(token))
test("GET /financial-score", "get", "/financial-score", headers=h(token))

if txn_id:
    test("DELETE /transactions/:id", "delete", f"/transactions/{txn_id}",
         headers=h(token), expected=[200, 204])

# ── 4. Categories ─────────────────────────────────────────────────────────────
print("\n[ Categories ]")
test("GET /categories", "get", "/categories", headers=h(token))
r = test("POST /categories", "post", "/categories",
         json={"name": "Test Category", "type": "expense", "allocated_amount": 5000}, headers=h(token), expected=[200, 201])
cat_id = r.json().get("id") if r and r.ok else None
if cat_id:
    test("DELETE /categories/:id", "delete", f"/categories/{cat_id}",
         headers=h(token), expected=[200, 204])

# ── 5. Income ─────────────────────────────────────────────────────────────────
print("\n[ Income ]")
test("GET /income-entries", "get", "/income-entries", headers=h(token))

# ── 6. EMIs ───────────────────────────────────────────────────────────────────
print("\n[ EMIs ]")
r = test("POST /emis", "post", "/emis",
         json={"loan_name": "Test Loan", "principal_amount": 100000, "interest_rate": 10,
               "tenure_months": 12, "monthly_payment": 8792,
               "start_date": TODAY, "status": "active"}, headers=h(token), expected=[200, 201])
emi_id = r.json().get("id") if r and r.ok else None
test("GET /emis", "get", "/emis", headers=h(token))
if emi_id:
    test("PUT /emis/:id", "put", f"/emis/{emi_id}",
         json={"loan_name": "Test Loan Updated", "monthly_payment": 8792}, headers=h(token))
    test("POST /emis/:id/payment", "post", f"/emis/{emi_id}/payment",
         json={"amount": 8792, "date": TODAY, "note": "test payment"}, headers=h(token), expected=[200, 201])
    test("DELETE /emis/:id", "delete", f"/emis/{emi_id}",
         headers=h(token), expected=[200, 204])

# ── 7. Savings Goals ──────────────────────────────────────────────────────────
print("\n[ Savings Goals ]")
r = test("POST /savings-goals", "post", "/savings-goals",
         json={"name": "Test Goal", "target_amount": 50000,
               "target_date": "2026-12-31", "priority": "medium"}, headers=h(token), expected=[200, 201])
goal_id = r.json().get("id") if r and r.ok else None
test("GET /savings-goals", "get", "/savings-goals", headers=h(token))
test("GET /savings-goals-summary", "get", "/savings-goals-summary", headers=h(token))
if goal_id:
    test("GET /savings-goals/:id", "get", f"/savings-goals/{goal_id}", headers=h(token))
    test("POST /savings-goals/:id/contribute", "post", f"/savings-goals/{goal_id}/contribute",
         json={"amount": 1000, "note": "test contribution"}, headers=h(token), expected=[200, 201])
    test("DELETE /savings-goals/:id", "delete", f"/savings-goals/{goal_id}",
         headers=h(token), expected=[200, 204])

# ── 8. Investments ────────────────────────────────────────────────────────────
print("\n[ Investments ]")
r = test("POST /investments", "post", "/investments",
         json={"name": "Test MF", "type": "mutual_funds", "invested_amount": 10000,
               "current_value": 11000, "date": TODAY}, headers=h(token), expected=[200, 201])
inv_id = r.json().get("id") if r and r.ok else None
test("GET /investments", "get", "/investments", headers=h(token))
if inv_id:
    test("DELETE /investments/:id", "delete", f"/investments/{inv_id}",
         headers=h(token), expected=[200, 204])

# ── 9. Hand Loans ─────────────────────────────────────────────────────────────
print("\n[ Hand Loans ]")
r = test("POST /hand-loans", "post", "/hand-loans",
         json={"person_name": "Test Person", "amount": 5000, "type": "lent",
               "date": TODAY, "reason": "test"}, headers=h(token), expected=[200, 201])
loan_id = r.json().get("id") if r and r.ok else None
test("GET /hand-loans", "get", "/hand-loans", headers=h(token))
if loan_id:
    test("DELETE /hand-loans/:id", "delete", f"/hand-loans/{loan_id}",
         headers=h(token), expected=[200, 204])

# ── 10. Credit Cards ──────────────────────────────────────────────────────────
print("\n[ Credit Cards ]")
r = test("POST /credit-cards", "post", "/credit-cards",
         json={"bank_name": "Test Bank", "card_name": "Test Card",
               "credit_limit": 100000, "outstanding_balance": 5000,
               "due_date": 15, "is_active": True}, headers=h(token), expected=[200, 201])
cc_id = r.json().get("id") if r and r.ok else None
test("GET /credit-cards", "get", "/credit-cards", headers=h(token))
if cc_id:
    test("DELETE /credit-cards/:id", "delete", f"/credit-cards/{cc_id}",
         headers=h(token), expected=[200, 204])

# ── 11. Trips ─────────────────────────────────────────────────────────────────
print("\n[ Trips ]")
r = test("POST /trips", "post", "/trips",
         json={"name": "Test Goa Trip", "destination": "Goa", "start_date": "2026-12-01",
               "end_date": "2026-12-05", "budget": 30000,
               "members": ["Test Runner", "Friend"]}, headers=h(token), expected=[200, 201])
trip_id = r.json().get("id") if r and r.ok else None
test("GET /trips", "get", "/trips", headers=h(token))
if trip_id:
    test("GET /trips/:id", "get", f"/trips/{trip_id}", headers=h(token))
    test("POST /trips/:id/expenses", "post", f"/trips/{trip_id}/expenses",
         json={"description": "Hotel", "amount": 8000, "category": "Accommodation",
               "paid_by": "Test Runner", "date": TODAY}, headers=h(token), expected=[200, 201])
    test("DELETE /trips/:id", "delete", f"/trips/{trip_id}",
         headers=h(token), expected=[200, 204])

# ── 12. Group Expenses ────────────────────────────────────────────────────────
print("\n[ Group Expenses ]")
r = test("POST /expense-groups", "post", "/expense-groups",
         json={"name": "Test Group", "members": ["Alice", "Bob", "Test Runner"],
               "description": "API test group"}, headers=h(token), expected=[200, 201])
grp_id = r.json().get("id") if r and r.ok else None
test("GET /expense-groups", "get", "/expense-groups", headers=h(token))
if grp_id:
    r2 = test("POST /expense-groups/:id/expenses", "post", f"/expense-groups/{grp_id}/expenses",
              json={"description": "Dinner", "amount": 1200, "paid_by": "Alice",
                    "split_among": ["Alice", "Bob", "Test Runner"],
                    "category": "Food", "notes": "test"}, headers=h(token), expected=[200, 201])
    exp_id = r2.json().get("id") if r2 and r2.ok else None
    test("GET /expense-groups/:id/expenses", "get", f"/expense-groups/{grp_id}/expenses", headers=h(token))
    test("GET /expense-groups/:id/balances", "get", f"/expense-groups/{grp_id}/balances", headers=h(token))
    test("GET /expense-groups/:id/settlements", "get", f"/expense-groups/{grp_id}/settlements", headers=h(token))
    if exp_id:
        test("PUT /expense-groups/:id/expenses/:eid", "put",
             f"/expense-groups/{grp_id}/expenses/{exp_id}",
             json={"description": "Dinner (edited)", "amount": 1200, "paid_by": "Alice",
                   "split_among": ["Alice", "Bob", "Test Runner"], "category": "Food"}, headers=h(token))
        test("DELETE /expense-groups/:id/expenses/:eid", "delete",
             f"/expense-groups/{grp_id}/expenses/{exp_id}",
             headers=h(token), expected=[200, 204])
    test("POST /expense-groups/:id/settle", "post", f"/expense-groups/{grp_id}/settle",
         json={"paid_by": "Bob", "paid_to": "Alice", "amount": 400, "note": "cash"}, headers=h(token), expected=[200, 201])
    test("DELETE /expense-groups/:id", "delete", f"/expense-groups/{grp_id}",
         headers=h(token), expected=[200, 204])

# ── 13. Calendar ──────────────────────────────────────────────────────────────
print("\n[ Calendar ]")
month = date.today().strftime("%Y-%m")
test("GET /calendar", "get", f"/calendar?month={month}", headers=h(token))
r = test("POST /calendar", "post", "/calendar",
         json={"title": "Test Event", "date": TODAY, "type": "custom"}, headers=h(token), expected=[200, 201])
cal_id = r.json().get("id") if r and r.ok else None
if cal_id:
    test("DELETE /calendar/:id", "delete", f"/calendar/{cal_id}",
         headers=h(token), expected=[200, 204])

# ── 14. Notifications ─────────────────────────────────────────────────────────
print("\n[ Notifications ]")
test("GET /notifications/prefs", "get", "/notifications/prefs", headers=h(token))
test("PUT /notifications/prefs", "put", "/notifications/prefs",
     json={"emi_reminders": True, "budget_alerts": True, "goal_nudges": True,
           "weekly_summary": False, "notify_via_chat": True}, headers=h(token))
test("GET /notifications/unread", "get", "/notifications/unread", headers=h(token))

# ── 15. Chanakya / Chatbot ────────────────────────────────────────────────────
print("\n[ Chatbot ]")
test("GET /chatbot/history", "get", "/chatbot/history", headers=h(token))
test("GET /chatbot/usage", "get", "/chatbot/usage", headers=h(token))
test("GET /chanakya/suggestions", "get", "/chanakya/suggestions", headers=h(token))

# ── 16. Gifts ─────────────────────────────────────────────────────────────────
print("\n[ Gifts ]")
test("GET /gifts", "get", "/gifts", headers=h(token))
r = test("POST /gift-people", "post", "/gift-people",
         json={"name": "Test Person", "relation": "friend"}, headers=h(token), expected=[200, 201])
gp_id = r.json().get("id") if r and r.ok else None
test("GET /gift-people", "get", "/gift-people", headers=h(token))
if gp_id:
    r3 = test("POST /gifts", "post", "/gifts",
              json={"person_id": gp_id, "occasion": "Birthday", "item": "Book",
                    "amount": 500, "date": TODAY, "status": "planned"}, headers=h(token), expected=[200, 201])
    gift_id = r3.json().get("id") if r3 and r3.ok else None
    if gift_id:
        test("DELETE /gifts/:id", "delete", f"/gifts/{gift_id}",
             headers=h(token), expected=[200, 204])
    test("DELETE /gift-people/:id", "delete", f"/gift-people/{gp_id}",
         headers=h(token), expected=[200, 204])

# ── 17. Subscriptions ─────────────────────────────────────────────────────────
print("\n[ Subscriptions ]")
test("GET /subscriptions", "get", "/subscriptions", headers=h(token))
r = test("POST /subscriptions", "post", "/subscriptions",
         json={"name": "Test Sub", "amount": 199, "billing_cycle": "monthly",
               "next_billing_date": "2026-04-01", "category": "Entertainment"}, headers=h(token), expected=[200, 201])
sub_id = r.json().get("id") if r and r.ok else None
if sub_id:
    test("DELETE /subscriptions/:id", "delete", f"/subscriptions/{sub_id}",
         headers=h(token), expected=[200, 204])

# ── 18. Import / Export ───────────────────────────────────────────────────────
print("\n[ Import / Export ]")
test("GET /export/excel", "get", "/export/excel", headers=h(token))

# ── 19. Misc ──────────────────────────────────────────────────────────────────
print("\n[ Misc ]")
test("GET /preferences/daily-limit", "get", "/preferences/daily-limit", headers=h(token))
test("GET /cache-stats", "get", "/cache-stats", headers=h(token))
test("GET /paychecks", "get", "/paychecks", headers=h(token))
test("GET /jobs", "get", "/jobs", headers=h(token))
test("GET /timeline", "get", "/timeline", headers=h(token))
test("GET /events", "get", "/events", headers=h(token))
test("GET /piggy-bank", "get", "/piggy-bank", headers=h(token))

# ── 20. Auth cleanup ──────────────────────────────────────────────────────────
if not args.keep:
    print("\n[ Cleanup ]")
    test("DELETE /auth/account", "delete", "/auth/account", headers=h(token), expected=[200, 204])

# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"  RESULTS")
print(f"{'='*60}")

col_w = [6, 46, 6, 8]
header = f"{'Status':<{col_w[0]}}  {'Test':<{col_w[1]}}  {'Code':<{col_w[2]}}  {'Time':<{col_w[3]}}"
print(header)
print("-" * (sum(col_w) + 6))

passed = failed = skipped = errors = 0
for status, name, code, timing in results:
    marker = {"PASS": "✓", "FAIL": "✗", "SKIP": "–", "ERR": "!"}.get(status, "?")
    color  = {"PASS": "\033[32m", "FAIL": "\033[31m", "SKIP": "\033[90m", "ERR": "\033[33m"}.get(status, "")
    reset  = "\033[0m"
    print(f"{color}{marker} {status:<{col_w[0]}}  {name:<{col_w[1]}}  {str(code):<{col_w[2]}}  {timing:<{col_w[3]}}{reset}")
    if status == "PASS":   passed  += 1
    elif status == "FAIL": failed  += 1
    elif status == "SKIP": skipped += 1
    elif status == "ERR":  errors  += 1

total = passed + failed + errors
print("-" * (sum(col_w) + 6))
print(f"\n  Passed : {passed}/{total}   Failed: {failed}   Errors: {errors}   Skipped: {skipped}")

if failed or errors:
    print(f"\n  \033[31m⚠  {failed + errors} issue(s) need attention\033[0m\n")
    sys.exit(1)
else:
    print(f"\n  \033[32m✓  All {passed} tests passed!\033[0m\n")
