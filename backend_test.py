import requests
import sys
import json
from datetime import datetime

class BudgetAPITester:
    def __init__(self, base_url="https://fintech-planner-2.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.created_items = {
            'categories': [],
            'emis': [],
            'transactions': []
        }

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict) and 'id' in response_data:
                        print(f"   Response ID: {response_data['id']}")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Response text: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API", "GET", "", 200)

    def test_budget_categories(self):
        """Test budget category operations"""
        print("\n📊 Testing Budget Categories...")
        
        # Test creating income category
        income_data = {
            "name": "Test Salary",
            "type": "income",
            "allocated_amount": 50000
        }
        success, response = self.run_test("Create Income Category", "POST", "categories", 200, income_data)
        if success and 'id' in response:
            self.created_items['categories'].append(response['id'])
        
        # Test creating expense category
        expense_data = {
            "name": "Test Groceries",
            "type": "expense",
            "allocated_amount": 10000
        }
        success, response = self.run_test("Create Expense Category", "POST", "categories", 200, expense_data)
        if success and 'id' in response:
            self.created_items['categories'].append(response['id'])
        
        # Test getting categories
        self.run_test("Get Categories", "GET", "categories", 200)
        
        return len(self.created_items['categories']) > 0

    def test_budget_summary(self):
        """Test budget summary endpoint"""
        return self.run_test("Get Budget Summary", "GET", "budget-summary", 200)

    def test_emis(self):
        """Test EMI operations"""
        print("\n🏦 Testing EMI Management...")
        
        # Test creating EMI
        emi_data = {
            "loan_name": "Test Home Loan",
            "principal_amount": 500000,
            "interest_rate": 8.5,
            "monthly_payment": 15000,
            "start_date": "2024-01",
            "tenure_months": 60
        }
        success, response = self.run_test("Create EMI", "POST", "emis", 200, emi_data)
        emi_id = None
        if success and 'id' in response:
            emi_id = response['id']
            self.created_items['emis'].append(emi_id)
        
        # Test getting EMIs
        self.run_test("Get EMIs", "GET", "emis", 200)
        
        # Test EMI payment if EMI was created
        if emi_id:
            payment_data = {
                "amount": 15000,
                "payment_date": "2024-08-15"
            }
            self.run_test("Record EMI Payment", "POST", f"emis/{emi_id}/payment", 200, payment_data)
        
        # Test EMI recommendations
        self.run_test("Get EMI Recommendations", "GET", "emis/recommendations", 200)
        
        return emi_id is not None

    def test_transactions(self):
        """Test transaction operations"""
        print("\n💳 Testing Transactions...")
        
        # Need a category first
        if not self.created_items['categories']:
            print("⚠️  No categories available for transaction test")
            return False
        
        category_id = self.created_items['categories'][0]
        transaction_data = {
            "category_id": category_id,
            "amount": 5000,
            "description": "Test transaction",
            "date": "2024-08-15"
        }
        success, response = self.run_test("Create Transaction", "POST", "transactions", 200, transaction_data)
        if success and 'id' in response:
            self.created_items['transactions'].append(response['id'])
        
        # Test getting transactions
        self.run_test("Get Transactions", "GET", "transactions", 200)
        
        return success

    def test_delete_operations(self):
        """Test delete operations for cleanup"""
        print("\n🗑️  Testing Delete Operations...")
        
        # Delete EMIs
        for emi_id in self.created_items['emis']:
            self.run_test(f"Delete EMI {emi_id}", "DELETE", f"emis/{emi_id}", 200)
        
        # Delete categories
        for cat_id in self.created_items['categories']:
            self.run_test(f"Delete Category {cat_id}", "DELETE", f"categories/{cat_id}", 200)

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Budget API Tests...")
        print(f"Base URL: {self.base_url}")
        
        # Test basic connectivity
        if not self.test_root_endpoint()[0]:
            print("❌ Root endpoint failed, stopping tests")
            return False
        
        # Test budget categories
        if not self.test_budget_categories():
            print("❌ Budget categories failed")
            return False
        
        # Test budget summary
        self.test_budget_summary()
        
        # Test EMIs
        self.test_emis()
        
        # Test transactions
        self.test_transactions()
        
        # Test delete operations
        self.test_delete_operations()
        
        # Print final results
        print(f"\n📊 Final Results: {self.tests_passed}/{self.tests_run} tests passed")
        success_rate = (self.tests_passed / self.tests_run) * 100 if self.tests_run > 0 else 0
        print(f"Success Rate: {success_rate:.1f}%")
        
        return success_rate >= 80

def main():
    tester = BudgetAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())