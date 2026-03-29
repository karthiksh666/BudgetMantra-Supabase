# Backend - Budget Mantra API

FastAPI backend for Budget Mantra fintech application.

## 🛠️ Tech Stack

- **FastAPI** - Modern, fast web framework for building APIs
- **Motor** - Async MongoDB driver for Python
- **Pydantic** - Data validation using Python type annotations
- **python-jose** - JWT token implementation
- **passlib** - Password hashing with bcrypt
- **emergentintegrations** - LLM integration for Chanakya chatbot

## 📁 Project Structure

```
backend/
├── server.py           # Main application file
│   ├── Models          # Pydantic models (User, EMI, Transaction, etc.)
│   ├── Auth Routes     # /api/auth/* endpoints
│   ├── Budget Routes   # /api/categories, /api/budget-summary
│   ├── EMI Routes      # /api/emis/*
│   ├── Transaction     # /api/transactions
│   ├── Savings Goals   # /api/savings-goals/*
│   ├── AI Routes       # /api/chatbot, /api/financial-score
│   └── Family Routes   # /api/family/*
├── requirements.txt    # Python dependencies
├── .env               # Environment variables (not in git)
├── .env.example       # Example environment file
└── tests/             # Test files
    └── test_api.py
```

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- MongoDB 6.x+
- pip or pipenv

### Installation

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Install emergentintegrations for AI features
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
```

### Environment Setup

Create a `.env` file:

```env
# MongoDB
MONGO_URL="mongodb://localhost:27017"
DB_NAME="budget_mantra"

# JWT Security (generate a strong secret for production)
JWT_SECRET_KEY="your-super-secret-jwt-key-minimum-32-characters"

# CORS Origins (comma-separated or * for all)
CORS_ORIGINS="http://localhost:3000,https://yourdomain.com"

# AI Integration
# Option 1: Emergent LLM Key (works with Claude, GPT, Gemini)
EMERGENT_LLM_KEY="sk-emergent-xxxxx"

# Option 2: Direct Anthropic Key (requires code changes)
# ANTHROPIC_API_KEY="sk-ant-xxxxx"
```

### Run Development Server

```bash
# With hot reload
uvicorn server:app --reload --host 0.0.0.0 --port 8001

# Or with Python
python -m uvicorn server:app --reload --port 8001
```

Access API documentation at:
- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

## 📚 API Reference

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}

Response:
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": { "id": "...", "email": "...", "name": "..." }
}
```

### Protected Routes

All routes except `/api/auth/*` require authentication:

```http
Authorization: Bearer <access_token>
```

### Budget Categories

```http
# Get all categories
GET /api/categories

# Create category
POST /api/categories
{
  "name": "Groceries",
  "type": "expense",
  "allocated_amount": 10000
}

# Update category
PUT /api/categories/{id}
{
  "spent_amount": 5000
}

# Delete category
DELETE /api/categories/{id}

# Get budget summary
GET /api/budget-summary
Response: { "total_income": 50000, "total_expenses": 30000, "remaining_budget": 20000 }
```

### EMI Management

```http
# Get all EMIs
GET /api/emis

# Create EMI
POST /api/emis
{
  "loan_name": "Car Loan",
  "principal_amount": 500000,
  "interest_rate": 8.5,
  "tenure_months": 60,
  "start_date": "2024-01-01"
}

# Record payment
POST /api/emis/{id}/payment
{
  "amount": 10000,
  "extra_payment": 5000
}

# Get prepayment recommendations
GET /api/emis/recommendations
```

### Savings Goals

```http
# Get all goals
GET /api/savings-goals

# Create goal
POST /api/savings-goals
{
  "name": "New iPhone",
  "target_amount": 120000,
  "target_date": "2025-06-30",
  "category": "electronics",
  "priority": "high"
}

# Add contribution
POST /api/savings-goals/{id}/contribute
{
  "amount": 10000
}

# Get summary with smart alerts
GET /api/savings-goals-summary
```

### Chanakya AI Chatbot

```http
POST /api/chatbot
{
  "message": "How can I save more money?",
  "conversation_history": [
    { "role": "user", "content": "previous message" },
    { "role": "assistant", "content": "previous response" }
  ]
}

Response:
{
  "response": "Based on your financial data...",
  "status": "success"
}
```

### Financial Health Score

```http
GET /api/financial-score

Response:
{
  "score": 75,
  "status": "green",
  "expense_ratio": 40,
  "emi_ratio": 20,
  "savings_ratio": 25,
  "message": "Your finances are healthy!",
  "recommendations": ["Consider increasing emergency fund", "..."]
}
```

## 🗃️ Database Schema

### Users Collection
```javascript
{
  "id": "uuid",
  "email": "user@example.com",
  "hashed_password": "bcrypt_hash",
  "name": "John Doe",
  "family_group_id": "uuid | null",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Budget Categories Collection
```javascript
{
  "id": "uuid",
  "user_id": "uuid",
  "family_group_id": "uuid | null",
  "name": "Groceries",
  "type": "expense | income",
  "allocated_amount": 10000,
  "spent_amount": 5000,
  "created_at": "2024-01-01T00:00:00Z"
}
```

### EMIs Collection
```javascript
{
  "id": "uuid",
  "user_id": "uuid",
  "loan_name": "Car Loan",
  "principal_amount": 500000,
  "interest_rate": 8.5,
  "tenure_months": 60,
  "monthly_payment": 10250,
  "remaining_balance": 400000,
  "paid_months": 10,
  "status": "active | completed",
  "start_date": "2024-01-01"
}
```

### Savings Goals Collection
```javascript
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "New iPhone",
  "target_amount": 120000,
  "current_amount": 25000,
  "target_date": "2025-06-30",
  "category": "electronics",
  "priority": "high",
  "status": "active | completed | paused",
  "created_at": "2024-01-01T00:00:00Z"
}
```

## 🧪 Testing

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=. --cov-report=html

# Test specific endpoint
pytest tests/test_api.py::test_auth_register -v
```

### Manual Testing with curl

```bash
# Set base URL
API_URL="http://localhost:8001/api"

# Register
curl -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","name":"Test"}'

# Login and get token
TOKEN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Use token for protected routes
curl "$API_URL/categories" -H "Authorization: Bearer $TOKEN"
```

## 🔐 Security Notes

1. **JWT Secret**: Use a strong, random secret (min 32 chars) in production
2. **CORS**: Configure specific origins in production, not `*`
3. **MongoDB**: Use authentication and TLS in production
4. **Rate Limiting**: Consider adding rate limiting for production
5. **Input Validation**: All inputs are validated via Pydantic models

## 🚢 Production Deployment

### Environment Variables for Production
```env
MONGO_URL="mongodb+srv://user:pass@cluster.mongodb.net/budget_mantra"
DB_NAME="budget_mantra_prod"
JWT_SECRET_KEY="<generate-strong-secret>"
CORS_ORIGINS="https://yourdomain.com"
EMERGENT_LLM_KEY="<your-key>"
```

### Run with Gunicorn
```bash
gunicorn server:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8001
```

### Docker
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
RUN pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
COPY . .
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
```

## 📝 Extending the API

### Adding a New Endpoint

1. Define Pydantic model in `server.py`:
```python
class NewFeature(BaseModel):
    name: str
    value: float
```

2. Add route:
```python
@api_router.post("/new-feature")
async def create_feature(input: NewFeature, current_user: dict = Depends(get_current_user)):
    # Your logic here
    return {"message": "Created"}
```

3. Update tests in `tests/test_api.py`

### Swapping AI Provider

To use your own Anthropic key instead of Emergent:

```python
# In server.py, replace emergentintegrations usage with:
from anthropic import Anthropic

client = Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))

# In chatbot endpoint:
response = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=1024,
    system=system_message,
    messages=[{"role": "user", "content": input.message}]
)
return {"response": response.content[0].text, "status": "success"}
```

---

For more details, see the main [README.md](../README.md).
