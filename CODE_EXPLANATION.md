# Budget & EMI Manager - Complete Code Explanation Guide

## Table of Contents
1. [Overview & Architecture](#overview--architecture)
2. [Backend Code Explanation](#backend-code-explanation)
3. [Frontend Code Explanation](#frontend-code-explanation)
4. [Database Structure](#database-structure)
5. [Complete Flow Examples](#complete-flow-examples)
6. [Key Concepts Summary](#key-concepts-summary)

---

## Overview & Architecture

### What is this app?
The Budget & EMI Manager is a web application that helps you:
- Manage monthly budgets (income and expenses)
- Track loan EMIs (Equated Monthly Installments)
- Get smart recommendations on which EMI to close first
- Monitor your financial health

### Architecture (Restaurant Analogy)

Think of your app like a restaurant:

| Component | Role | Technology |
|-----------|------|------------|
| **Frontend** | Dining area where customers interact | React (JavaScript) |
| **Backend** | Kitchen that processes orders | FastAPI (Python) |
| **Database** | Storage room for ingredients | MongoDB |
| **API** | Waiter carrying orders between dining & kitchen | REST API |

```
┌─────────────┐         API Calls        ┌─────────────┐
│  Frontend   │ ◄──────────────────────► │   Backend   │
│   (React)   │    (HTTP Requests)       │  (FastAPI)  │
└─────────────┘                          └──────┬──────┘
                                                 │
                                                 │ Database Queries
                                                 ▼
                                          ┌─────────────┐
                                          │   MongoDB   │
                                          │  (Database) │
                                          └─────────────┘
```

---

## Backend Code Explanation

### File: `/app/backend/server.py`

### Section 1: Imports & Setup (Lines 1-26)

```python
from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import math

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")
```

**Explanation:**

1. **Line 1-12**: Import necessary libraries
   - `FastAPI`: Framework to create web APIs
   - `motor`: Async MongoDB driver for Python
   - `pydantic`: Data validation using Python type hints
   - `uuid`: Generate unique IDs
   - `datetime`: Handle dates and times

2. **Lines 14-15**: Load environment variables
   - Reads `.env` file to get secret configurations
   - Like database URL, passwords, etc.

3. **Lines 18-20**: Connect to MongoDB
   - `mongo_url`: Database connection string
   - `client`: Connection to MongoDB server
   - `db`: Access to specific database

4. **Lines 23-26**: Create FastAPI application
   - `app`: Main application
   - `api_router`: All routes will have `/api` prefix
   - Example: `/api/categories`, `/api/emis`

---

### Section 2: Data Models (Blueprints)

Models define the structure of your data. Think of them as forms with specific fields.

#### BudgetCategory Model

```python
class BudgetCategory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str  # 'income' or 'expense'
    allocated_amount: float
    spent_amount: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

**Field Explanations:**

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `id` | string | "abc-123-xyz" | Unique identifier (auto-generated) |
| `name` | string | "Salary", "Groceries" | Category name |
| `type` | string | "income" or "expense" | Category type |
| `allocated_amount` | number | 50000 | Budgeted amount in ₹ |
| `spent_amount` | number | 3000 | Amount actually spent |
| `created_at` | datetime | "2024-01-15T10:30:00" | When created |

**Real Example:**
```json
{
  "id": "cat-001",
  "name": "Salary",
  "type": "income",
  "allocated_amount": 50000,
  "spent_amount": 0,
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

#### EMI Model

```python
class EMI(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    loan_name: str
    principal_amount: float
    interest_rate: float  # Annual interest rate in percentage
    monthly_payment: float
    start_date: str  # YYYY-MM format
    tenure_months: int
    remaining_balance: float
    paid_months: int = 0
    status: str = "active"  # active, closed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

**Field Explanations:**

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `id` | string | "emi-456" | Unique identifier |
| `loan_name` | string | "Car Loan" | Name of the loan |
| `principal_amount` | number | 500000 | Total loan amount (₹) |
| `interest_rate` | number | 10.0 | Interest rate per year (%) |
| `monthly_payment` | number | 12000 | Monthly EMI amount (₹) |
| `start_date` | string | "2024-01" | When loan started |
| `tenure_months` | number | 48 | Total months to pay |
| `remaining_balance` | number | 492167 | Amount left to pay (₹) |
| `paid_months` | number | 1 | How many months paid |
| `status` | string | "active" | "active" or "closed" |

**Real Example:**
```json
{
  "id": "emi-001",
  "loan_name": "Car Loan",
  "principal_amount": 500000,
  "interest_rate": 10,
  "monthly_payment": 12000,
  "start_date": "2024-01",
  "tenure_months": 48,
  "remaining_balance": 492167,
  "paid_months": 1,
  "status": "active"
}
```

---

### Section 3: API Endpoints (Routes)

API endpoints are like menu items in a restaurant. Each one performs a specific task.

#### 3.1 Budget Category APIs

**Create Category**
```python
@api_router.post("/categories", response_model=BudgetCategory)
async def create_category(input: BudgetCategoryCreate):
    category = BudgetCategory(**input.model_dump())
    doc = category.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.budget_categories.insert_one(doc)
    return category
```

**What it does:**
1. Receives category data from frontend
2. Creates a BudgetCategory object
3. Saves it to MongoDB
4. Returns the created category

**Example Request:**
```
POST /api/categories
Body: {
  "name": "Salary",
  "type": "income",
  "allocated_amount": 50000
}
```

**Example Response:**
```json
{
  "id": "cat-001",
  "name": "Salary",
  "type": "income",
  "allocated_amount": 50000,
  "spent_amount": 0,
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

**Get All Categories**
```python
@api_router.get("/categories", response_model=List[BudgetCategory])
async def get_categories():
    categories = await db.budget_categories.find({}, {"_id": 0}).to_list(1000)
    for cat in categories:
        if isinstance(cat['created_at'], str):
            cat['created_at'] = datetime.fromisoformat(cat['created_at'])
    return categories
```

**What it does:**
1. Queries MongoDB for all categories
2. Excludes MongoDB's internal `_id` field
3. Converts date strings back to datetime objects
4. Returns list of all categories

**Example Request:**
```
GET /api/categories
```

**Example Response:**
```json
[
  {
    "id": "cat-001",
    "name": "Salary",
    "type": "income",
    "allocated_amount": 50000,
    "spent_amount": 0
  },
  {
    "id": "cat-002",
    "name": "Groceries",
    "type": "expense",
    "allocated_amount": 10000,
    "spent_amount": 3000
  }
]
```

---

**Budget Summary**
```python
@api_router.get("/budget-summary")
async def get_budget_summary():
    categories = await db.budget_categories.find({}, {"_id": 0}).to_list(1000)
    emis = await db.emis.find({"status": "active"}, {"_id": 0}).to_list(1000)
    
    total_income = sum(cat['allocated_amount'] for cat in categories if cat['type'] == 'income')
    total_expenses = sum(cat['allocated_amount'] for cat in categories if cat['type'] == 'expense')
    total_spent = sum(cat.get('spent_amount', 0) for cat in categories if cat['type'] == 'expense')
    total_emi = sum(emi['monthly_payment'] for emi in emis)
    
    remaining_budget = total_income - total_expenses - total_emi - total_spent
    
    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "total_spent": total_spent,
        "total_emi": total_emi,
        "remaining_budget": remaining_budget,
        "active_emis": len(emis)
    }
```

**What it does:**
1. Gets all budget categories
2. Gets all active EMIs
3. Calculates:
   - Total income
   - Total budgeted expenses
   - Total spent so far
   - Total EMI payments
   - Remaining budget = Income - Expenses - EMIs - Spent

**Calculation Example:**
```
Total Income:      ₹50,000 (Salary)
Total Expenses:    ₹15,000 (Groceries + Bills)
Total Spent:       ₹3,000  (Actual spending)
Total EMI:         ₹12,000 (Car Loan)
─────────────────────────────
Remaining Budget:  ₹20,000
```

---

#### 3.2 EMI APIs

**Create EMI**
```python
@api_router.post("/emis", response_model=EMI)
async def create_emi(input: EMICreate):
    emi = EMI(
        **input.model_dump(),
        remaining_balance=input.principal_amount
    )
    doc = emi.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.emis.insert_one(doc)
    return emi
```

**What it does:**
1. Receives EMI details
2. Sets `remaining_balance` = `principal_amount` (initially)
3. Saves to MongoDB
4. Returns created EMI

**Example Request:**
```
POST /api/emis
Body: {
  "loan_name": "Car Loan",
  "principal_amount": 500000,
  "interest_rate": 10,
  "monthly_payment": 12000,
  "start_date": "2024-01",
  "tenure_months": 48
}
```

---

**Record EMI Payment** (Most Important!)
```python
@api_router.post("/emis/{emi_id}/payment", response_model=EMIPayment)
async def record_emi_payment(emi_id: str, input: EMIPaymentCreate):
    emi_doc = await db.emis.find_one({"id": emi_id}, {"_id": 0})
    if not emi_doc:
        raise HTTPException(status_code=404, detail="EMI not found")
    
    # Calculate interest and principal components
    monthly_interest_rate = emi_doc['interest_rate'] / 12 / 100
    interest_paid = emi_doc['remaining_balance'] * monthly_interest_rate
    principal_paid = input.amount - interest_paid
    
    # Update EMI
    new_balance = max(0, emi_doc['remaining_balance'] - principal_paid)
    new_paid_months = emi_doc['paid_months'] + 1
    new_status = "closed" if new_balance <= 0 or new_paid_months >= emi_doc['tenure_months'] else "active"
    
    await db.emis.update_one(
        {"id": emi_id},
        {"$set": {
            "remaining_balance": new_balance,
            "paid_months": new_paid_months,
            "status": new_status
        }}
    )
    
    # Record payment
    payment = EMIPayment(
        emi_id=emi_id,
        amount=input.amount,
        payment_date=input.payment_date,
        principal_paid=principal_paid,
        interest_paid=interest_paid
    )
    doc = payment.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.emi_payments.insert_one(doc)
    
    return payment
```

**Step-by-Step Calculation:**

Let's say you're paying your first Car Loan EMI:

```
Given:
- Remaining Balance: ₹500,000
- Interest Rate: 10% per year
- Monthly Payment: ₹12,000

Step 1: Calculate monthly interest rate
monthly_interest_rate = 10 / 12 / 100 = 0.00833

Step 2: Calculate interest for this month
interest_paid = ₹500,000 × 0.00833 = ₹4,167

Step 3: Calculate principal paid
principal_paid = ₹12,000 - ₹4,167 = ₹7,833

Step 4: Calculate new balance
new_balance = ₹500,000 - ₹7,833 = ₹492,167

Step 5: Increment paid months
paid_months = 0 + 1 = 1

Step 6: Check if loan is complete
if new_balance <= 0 or paid_months >= 48:
    status = "closed"
else:
    status = "active"  ✓
```

**Visual Representation:**
```
Payment Breakdown (Month 1):
┌────────────────────────────┐
│ Total Payment: ₹12,000     │
├────────────────────────────┤
│ Interest:      ₹4,167  35% │ ████████
│ Principal:     ₹7,833  65% │ ████████████████
└────────────────────────────┘

After 1st Payment:
Original Balance:    ₹500,000 ████████████████████████
Remaining Balance:   ₹492,167 ███████████████████████░
Paid Off:            ₹7,833   █
```

---

**EMI Recommendations** (Smart Algorithm)
```python
@api_router.get("/emis/recommendations")
async def get_emi_recommendations():
    emis = await db.emis.find({"status": "active"}, {"_id": 0}).to_list(1000)
    
    recommendations = []
    for emi in emis:
        # Calculate total interest to be paid
        remaining_months = emi['tenure_months'] - emi['paid_months']
        total_interest = (emi['monthly_payment'] * remaining_months) - emi['remaining_balance']
        
        # Calculate savings if paid off now
        savings = total_interest
        
        recommendations.append({
            "emi_id": emi['id'],
            "loan_name": emi['loan_name'],
            "interest_rate": emi['interest_rate'],
            "remaining_balance": emi['remaining_balance'],
            "remaining_months": remaining_months,
            "monthly_payment": emi['monthly_payment'],
            "total_interest_remaining": total_interest,
            "savings_if_closed_now": savings,
            "priority_score": emi['interest_rate']
        })
    
    # Sort by interest rate (highest first)
    recommendations.sort(key=lambda x: x['priority_score'], reverse=True)
    
    return recommendations
```

**Example Scenario:**

You have 3 active loans:

```
Loan 1: Car Loan
- Interest Rate: 12%
- Remaining Balance: ₹300,000
- Remaining Months: 24
- Monthly Payment: ₹14,000

Calculation:
Total to pay = ₹14,000 × 24 = ₹336,000
Total interest = ₹336,000 - ₹300,000 = ₹36,000
Savings if closed now = ₹36,000

─────────────────────────────────────

Loan 2: Personal Loan
- Interest Rate: 15%
- Remaining Balance: ₹200,000
- Remaining Months: 18
- Monthly Payment: ₹12,000

Calculation:
Total to pay = ₹12,000 × 18 = ₹216,000
Total interest = ₹216,000 - ₹200,000 = ₹16,000
Savings if closed now = ₹16,000

─────────────────────────────────────

Loan 3: Home Loan
- Interest Rate: 8.5%
- Remaining Balance: ₹2,500,000
- Remaining Months: 180
- Monthly Payment: ₹25,000

Calculation:
Total to pay = ₹25,000 × 180 = ₹4,500,000
Total interest = ₹4,500,000 - ₹2,500,000 = ₹2,000,000
Savings if closed now = ₹2,000,000

─────────────────────────────────────

Recommendation Order (Highest Interest First):
1. ⭐ Personal Loan (15%) - Close this first!
2. Car Loan (12%) - Close this second
3. Home Loan (8.5%) - Close this last
```

**Why close highest interest first?**
- You save more money on interest
- Example: If you have ₹200,000 extra:
  - Closing Personal Loan saves ₹16,000 in interest
  - Putting same amount in Home Loan saves only ₹8,000

---

## Frontend Code Explanation

### File Structure
```
/app/frontend/src/
├── App.js              # Main router
├── App.css             # Global styles
├── pages/
│   ├── Dashboard.js    # Home page
│   ├── BudgetManager.js # Budget management
│   ├── EMIManager.js   # EMI management
│   └── Transactions.js # Transaction tracking
└── components/
    └── ui/             # Reusable UI components
```

---

### Section 1: App.js - Main Router

```javascript
import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import BudgetManager from "@/pages/BudgetManager";
import EMIManager from "@/pages/EMIManager";
import Transactions from "@/pages/Transactions";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/budget" element={<BudgetManager />} />
          <Route path="/emis" element={<EMIManager />} />
          <Route path="/transactions" element={<Transactions />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
```

**Explanation:**

| Code | What it does | Analogy |
|------|--------------|---------|
| `BrowserRouter` | Enables navigation | Building directory |
| `Routes` | Container for all routes | List of floors |
| `Route path="/"` | Maps URL to component | Floor 1 → Lobby |
| `BACKEND_URL` | Backend server address | Kitchen location |

**How routing works:**

```
User visits:              Browser shows:
─────────────────────────────────────────
http://app.com/           → Dashboard
http://app.com/budget     → BudgetManager
http://app.com/emis       → EMIManager
http://app.com/transactions → Transactions
```

---

### Section 2: Dashboard.js

```javascript
const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [emis, setEmis] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [summaryRes, emisRes, recsRes] = await Promise.all([
        axios.get(`${API}/budget-summary`),
        axios.get(`${API}/emis`),
        axios.get(`${API}/emis/recommendations`)
      ]);
      setSummary(summaryRes.data);
      setEmis(emisRes.data.filter(e => e.status === 'active'));
      setRecommendations(recsRes.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  return (
    // Display dashboard UI
  );
};
```

**Key Concepts:**

**1. useState - Creating Variables**
```javascript
const [summary, setSummary] = useState(null);
```
Think of it as creating a box:
- `summary`: The box that holds data
- `setSummary`: Function to put new data in the box
- `null`: Initial value (empty box)

**2. useEffect - Running Code on Page Load**
```javascript
useEffect(() => {
  fetchData();  // Runs when page loads
}, []);  // Empty array = run only once
```

**3. Promise.all - Multiple API Calls at Once**
```javascript
const [res1, res2, res3] = await Promise.all([
  axios.get('/api1'),  // Call 1
  axios.get('/api2'),  // Call 2
  axios.get('/api3')   // Call 3
]);
// All 3 calls happen simultaneously!
```

**Timing Comparison:**
```
Sequential (one after another):
Call 1: ████████ (2s)
Call 2:          ████████ (2s)
Call 3:                   ████████ (2s)
Total:  ████████████████████████ (6s)

Parallel (Promise.all):
Call 1: ████████ (2s)
Call 2: ████████ (2s)
Call 3: ████████ (2s)
Total:  ████████ (2s)  ← 3x faster!
```

---

### Section 3: BudgetManager.js

```javascript
const BudgetManager = () => {
  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    type: 'expense',
    allocated_amount: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/categories`, {
        name: formData.name,
        type: formData.type,
        allocated_amount: parseFloat(formData.allocated_amount)
      });
      toast.success('Category added successfully');
      setIsDialogOpen(false);
      setFormData({ name: '', type: 'expense', allocated_amount: '' });
      fetchCategories();
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Failed to add category');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/categories/${id}`);
      toast.success('Category deleted');
      fetchCategories();
    } catch (error) {
      toast.error('Failed to delete category');
    }
  };
};
```

**Form Handling Flow:**

```
Step 1: User fills form
┌──────────────────────────┐
│ Name: Groceries          │
│ Type: Expense ▼          │
│ Amount: 10000            │
│                          │
│      [Add Category]      │
└──────────────────────────┘

Step 2: User clicks "Add Category"
→ handleSubmit() is called

Step 3: Prevent default form submission
e.preventDefault()  // Don't reload page!

Step 4: Send data to backend
axios.post('/api/categories', {
  name: "Groceries",
  type: "expense",
  allocated_amount: 10000
})

Step 5: Backend processes and saves
→ MongoDB now has new category

Step 6: Show success message
toast.success('Category added')

Step 7: Clear form
setFormData({
  name: '',
  type: 'expense',
  allocated_amount: ''
})

Step 8: Refresh list
fetchCategories()  // Show updated list
```

---

### Section 4: EMIManager.js

```javascript
const handlePayment = async (e) => {
  e.preventDefault();
  try {
    await axios.post(`${API}/emis/${selectedEmi.id}/payment`, {
      amount: parseFloat(paymentData.amount),
      payment_date: paymentData.payment_date
    });
    toast.success('Payment recorded successfully');
    setIsPaymentDialogOpen(false);
    fetchEmis();
  } catch (error) {
    console.error('Error recording payment:', error);
    toast.error('Failed to record payment');
  }
};
```

**Recording Payment Flow:**

```
┌─────────────────────────────────────┐
│ Step 1: User clicks "Record Payment"│
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Step 2: Dialog opens with EMI info  │
│                                     │
│ Car Loan                            │
│ Monthly Payment: ₹12,000            │
│                                     │
│ Amount: [12000      ]               │
│ Date:   [2024-01-15 ]               │
│                                     │
│ [Record Payment] [Cancel]           │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Step 3: Submit to backend           │
│ POST /api/emis/emi-001/payment      │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Step 4: Backend calculates:         │
│ - Interest: ₹4,167                  │
│ - Principal: ₹7,833                 │
│ - New balance: ₹492,167             │
│ - Paid months: 1                    │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Step 5: Update UI                   │
│ - Show success toast                │
│ - Close dialog                      │
│ - Refresh EMI list                  │
│ - Progress bar updates              │
└─────────────────────────────────────┘
```

---

## Database Structure

Your MongoDB database has these collections (like Excel sheets):

### Collection 1: budget_categories
```json
{
  "_id": ObjectId("..."),  // MongoDB internal ID
  "id": "cat-001",
  "name": "Salary",
  "type": "income",
  "allocated_amount": 50000,
  "spent_amount": 0,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Collection 2: emis
```json
{
  "_id": ObjectId("..."),
  "id": "emi-001",
  "loan_name": "Car Loan",
  "principal_amount": 500000,
  "interest_rate": 10,
  "monthly_payment": 12000,
  "start_date": "2024-01",
  "tenure_months": 48,
  "remaining_balance": 492167,
  "paid_months": 1,
  "status": "active",
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Collection 3: emi_payments
```json
{
  "_id": ObjectId("..."),
  "id": "pay-001",
  "emi_id": "emi-001",
  "amount": 12000,
  "payment_date": "2024-01-15",
  "principal_paid": 7833,
  "interest_paid": 4167,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Collection 4: transactions
```json
{
  "_id": ObjectId("..."),
  "id": "txn-001",
  "category_id": "cat-002",
  "category_name": "Groceries",
  "amount": 3000,
  "description": "Weekly shopping",
  "type": "expense",
  "date": "2024-01-15",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

## Complete Flow Examples

### Example 1: First Time User Journey

```
┌──────────────────────────────────────────────────────────┐
│ 1. User opens app: http://localhost:3000                │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 2. Frontend (App.js) loads                              │
│    → Shows Dashboard component                          │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 3. Dashboard.js runs useEffect()                        │
│    → Calls fetchData()                                  │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 4. Makes 3 API calls simultaneously:                    │
│    ① GET /api/budget-summary                            │
│    ② GET /api/emis                                      │
│    ③ GET /api/emis/recommendations                      │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 5. Backend (server.py) processes requests              │
│    → Queries MongoDB                                    │
│    → Returns data (all empty for first time)           │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 6. Frontend receives responses:                         │
│    ① summary = {income: 0, expenses: 0, ...}            │
│    ② emis = []                                          │
│    ③ recommendations = []                               │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 7. Dashboard displays:                                  │
│    ┌────────────────────────────────────────┐          │
│    │ Total Income: ₹0                       │          │
│    │ Total Expenses: ₹0                     │          │
│    │ EMI Payments: ₹0                       │          │
│    │ Remaining Budget: ₹0                   │          │
│    │                                        │          │
│    │ Active EMIs (0)                        │          │
│    │ → No active EMIs                       │          │
│    │                                        │          │
│    │ Recommendations                         │          │
│    │ → No recommendations                    │          │
│    └────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

---

### Example 2: Adding First Budget Category

```
┌──────────────────────────────────────────────────────────┐
│ 1. User clicks "Budget" in navigation                   │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 2. Browser navigates to /budget                         │
│    → BudgetManager component loads                      │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 3. Page shows:                                          │
│    ┌────────────────────────────────────────┐          │
│    │ Budget Manager    [+ Add Category]     │          │
│    │                                        │          │
│    │ Income Sources                         │          │
│    │ → No income sources added              │          │
│    │                                        │          │
│    │ Expense Categories                     │          │
│    │ → No expense categories added          │          │
│    └────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 4. User clicks "Add Category" button                    │
│    → Dialog opens                                       │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 5. User fills form:                                     │
│    ┌────────────────────────────────────────┐          │
│    │ Add Budget Category                    │          │
│    │                                        │          │
│    │ Name: [Salary            ]             │          │
│    │ Type: [Income ▼          ]             │          │
│    │ Amount: [50000           ]             │          │
│    │                                        │          │
│    │ [Add Category] [Cancel]                │          │
│    └────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 6. User clicks "Add Category"                           │
│    → handleSubmit() is called                           │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 7. Frontend sends POST request:                         │
│    POST /api/categories                                 │
│    Body: {                                              │
│      name: "Salary",                                    │
│      type: "income",                                    │
│      allocated_amount: 50000                            │
│    }                                                    │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 8. Backend (create_category) receives request          │
│    → Creates BudgetCategory object:                     │
│      {                                                  │
│        id: "cat-001",                                   │
│        name: "Salary",                                  │
│        type: "income",                                  │
│        allocated_amount: 50000,                         │
│        spent_amount: 0,                                 │
│        created_at: "2024-01-15T10:30:00Z"               │
│      }                                                  │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 9. Backend saves to MongoDB:                            │
│    db.budget_categories.insert_one(...)                 │
│    → Document saved successfully                        │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 10. Backend returns success response:                   │
│     Status: 200 OK                                      │
│     Body: { id: "cat-001", name: "Salary", ... }        │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 11. Frontend receives response:                         │
│     → Shows success toast: "Category added"             │
│     → Closes dialog                                     │
│     → Clears form                                       │
│     → Calls fetchCategories()                           │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ 12. Page refreshes with new data:                       │
│     ┌────────────────────────────────────────┐          │
│     │ Income Sources                         │          │
│     │ ┌──────────────────────────────────┐  │          │
│     │ │ Salary              ₹50,000 [🗑]│  │          │
│     │ └──────────────────────────────────┘  │          │
│     └────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

---

### Example 3: Recording EMI Payment with Full Calculation

```
Starting State:
EMI: Car Loan
- Principal: ₹500,000 (original)
- Remaining: ₹500,000
- Interest Rate: 10% per year
- Monthly Payment: ₹12,000
- Paid Months: 0
- Status: active

┌──────────────────────────────────────────────────────────┐
│ Step 1: User clicks "Record Payment"                    │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Step 2: Dialog shows with prefilled amount              │
│         Amount: ₹12,000 (monthly payment)               │
│         Date: 2024-01-15 (today)                        │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Step 3: User clicks "Record Payment"                    │
│         → handlePayment() called                        │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Step 4: Frontend sends request                          │
│         POST /api/emis/emi-001/payment                  │
│         Body: {                                         │
│           amount: 12000,                                │
│           payment_date: "2024-01-15"                    │
│         }                                               │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Step 5: Backend retrieves EMI from database             │
│         db.emis.find_one({id: "emi-001"})               │
│         → Found EMI                                     │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Step 6: Backend calculates payment breakdown            │
│                                                         │
│ A. Monthly interest rate                               │
│    = Annual rate / 12 / 100                            │
│    = 10 / 12 / 100                                     │
│    = 0.00833 (0.833%)                                  │
│                                                         │
│ B. Interest for this month                             │
│    = Remaining balance × Monthly rate                  │
│    = ₹500,000 × 0.00833                                │
│    = ₹4,167                                            │
│                                                         │
│ C. Principal payment                                    │
│    = Total payment - Interest                          │
│    = ₹12,000 - ₹4,167                                  │
│    = ₹7,833                                            │
│                                                         │
│ D. New remaining balance                               │
│    = Old balance - Principal paid                      │
│    = ₹500,000 - ₹7,833                                 │
│    = ₹492,167                                          │
│                                                         │
│ E. New paid months                                     │
│    = Old paid months + 1                               │
│    = 0 + 1                                             │
│    = 1                                                 │
│                                                         │
│ F. Check status                                        │
│    if new_balance <= 0 or paid_months >= 48:          │
│       status = "closed"                                │
│    else:                                               │
│       status = "active" ✓                              │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Step 7: Backend updates EMI in database                │
│         db.emis.update_one(                             │
│           {id: "emi-001"},                              │
│           {$set: {                                      │
│             remaining_balance: 492167,                  │
│             paid_months: 1,                             │
│             status: "active"                            │
│           }}                                            │
│         )                                               │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Step 8: Backend records payment details                │
│         db.emi_payments.insert_one({                    │
│           id: "pay-001",                                │
│           emi_id: "emi-001",                            │
│           amount: 12000,                                │
│           payment_date: "2024-01-15",                   │
│           principal_paid: 7833,                         │
│           interest_paid: 4167,                          │
│           created_at: "2024-01-15T10:30:00Z"            │
│         })                                              │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Step 9: Backend returns success                         │
│         Status: 200 OK                                  │
│         Body: {                                         │
│           id: "pay-001",                                │
│           emi_id: "emi-001",                            │
│           amount: 12000,                                │
│           principal_paid: 7833,                         │
│           interest_paid: 4167,                          │
│           payment_date: "2024-01-15"                    │
│         }                                               │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Step 10: Frontend updates UI                            │
│          → Shows success toast                          │
│          → Closes dialog                                │
│          → Calls fetchEmis()                            │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Step 11: Updated EMI display                            │
│          ┌──────────────────────────────────┐           │
│          │ Car Loan                         │           │
│          │ Interest: 10% | Paid: 1/48 months│           │
│          │                                  │           │
│          │ Monthly: ₹12,000                 │           │
│          │ Remaining: ₹492,167              │           │
│          │ Progress: 2%                     │           │
│          │                                  │           │
│          │ ████░░░░░░░░░░░░░░░░░░░░░░      │           │
│          └──────────────────────────────────┘           │
└──────────────────────────────────────────────────────────┘

End State:
EMI: Car Loan
- Principal: ₹500,000 (original)
- Remaining: ₹492,167 ← UPDATED
- Interest Rate: 10% per year
- Monthly Payment: ₹12,000
- Paid Months: 1 ← UPDATED
- Status: active
```

---

## Key Concepts Summary

### 1. Frontend (React)
- **Component**: Reusable piece of UI
- **State**: Data that changes over time
- **Props**: Data passed from parent to child
- **Hooks**: Special functions (useState, useEffect)
- **Routing**: Navigation between pages

### 2. Backend (FastAPI)
- **Endpoint**: URL that performs a specific task
- **Request**: Data sent from frontend to backend
- **Response**: Data sent from backend to frontend
- **Model**: Structure/blueprint for data
- **Async**: Non-blocking operations (can handle multiple requests)

### 3. Database (MongoDB)
- **Collection**: Like a table in Excel
- **Document**: Like a row in Excel
- **Field**: Like a column in Excel
- **Query**: Search for specific data
- **Update**: Modify existing data

### 4. API Communication
```
Frontend                    Backend                   Database
   │                           │                          │
   │─── POST /api/emis ───────>│                          │
   │                           │                          │
   │                           │─── insert_one() ────────>│
   │                           │                          │
   │                           │<──── Success ────────────│
   │                           │                          │
   │<──── Response ────────────│                          │
   │     (status: 200)         │                          │
```

### 5. Important Terms

| Term | Meaning | Example |
|------|---------|---------|
| **CRUD** | Create, Read, Update, Delete | Basic database operations |
| **REST** | Representational State Transfer | Standard way to design APIs |
| **JSON** | JavaScript Object Notation | Data format: `{"name": "John"}` |
| **Async/Await** | Handle long-running operations | Database queries, API calls |
| **Token** | Success/error notification | "Category added successfully" |
| **Router** | Manages page navigation | Different URLs show different pages |

---

## API Reference Quick Guide

### Budget Categories

```
POST   /api/categories          Create new category
GET    /api/categories          Get all categories
DELETE /api/categories/{id}     Delete category
GET    /api/budget-summary      Get financial summary
```

### EMIs

```
POST   /api/emis                Create new EMI
GET    /api/emis                Get all EMIs
PUT    /api/emis/{id}           Update EMI
DELETE /api/emis/{id}           Delete EMI
POST   /api/emis/{id}/payment   Record payment
GET    /api/emis/recommendations Get prepayment advice
```

### Transactions

```
POST   /api/transactions        Create transaction
GET    /api/transactions        Get all transactions
```

---

## Troubleshooting Guide

### Issue: Page shows "Loading..." forever

**Cause**: Backend not responding

**Check**:
1. Is backend running? `sudo supervisorctl status backend`
2. Check logs: `tail -n 50 /var/log/supervisor/backend.err.log`
3. Is MongoDB running? `sudo supervisorctl status mongodb`

---

### Issue: "Failed to add category"

**Cause**: API call failed

**Check**:
1. Open browser console (F12)
2. Look for error messages
3. Check if backend URL is correct in `.env`
4. Verify MongoDB connection

---

### Issue: EMI calculation seems wrong

**Formula Check**:
```
Monthly Interest Rate = Annual Rate / 12 / 100
Interest This Month = Remaining Balance × Monthly Rate
Principal Paid = Payment Amount - Interest
New Balance = Old Balance - Principal Paid
```

---

## Conclusion

This Budget & EMI Manager app demonstrates:

1. **Full-stack development**: Frontend + Backend + Database
2. **RESTful API design**: Standard endpoints for CRUD operations
3. **Financial calculations**: Interest, principal, amortization
4. **State management**: React hooks for data handling
5. **Database operations**: MongoDB queries and updates
6. **User experience**: Responsive UI, toast notifications, real-time updates

The app helps you:
- Track income and expenses
- Manage multiple EMIs
- Get smart recommendations
- Monitor financial health
- Plan loan closures strategically

---

**End of Documentation**

*Generated: January 2024*
*Version: 1.0*
