# Budget Mantra - Technical Documentation

## Project Overview

**Budget Mantra** is a full-stack fintech application for personal finance management, built with React frontend, FastAPI backend, and MongoDB database. It features AI-powered financial advice through a chatbot named "Chanakya" powered by Claude (Anthropic).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    React 18 SPA                          │   │
│  │  - Tailwind CSS + Shadcn/UI components                  │   │
│  │  - React Router v6 (client-side routing)                │   │
│  │  - Axios (HTTP client)                                  │   │
│  │  - Context API (auth state management)                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS / REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API LAYER                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   FastAPI (Python)                       │   │
│  │  - JWT Authentication (python-jose)                     │   │
│  │  - Password hashing (bcrypt via passlib)                │   │
│  │  - In-memory caching (cachetools TTLCache)              │   │
│  │  - Pydantic models (request/response validation)        │   │
│  │  - Motor (async MongoDB driver)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Async I/O
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                               │
│  ┌──────────────────────┐    ┌─────────────────────────────┐   │
│  │      MongoDB         │    │    External Services        │   │
│  │  - users             │    │  - Anthropic Claude API     │   │
│  │  - budget_categories │    │    (via emergentintegrations)│   │
│  │  - emis              │    │                             │   │
│  │  - transactions      │    │                             │   │
│  │  - savings_goals     │    │                             │   │
│  │  - family_groups     │    │                             │   │
│  └──────────────────────┘    └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI library |
| Tailwind CSS | 3.x | Utility-first CSS |
| Shadcn/UI | Latest | Component library |
| Lucide React | Latest | Icon library |
| React Router | 6.x | Client-side routing |
| Axios | 1.x | HTTP client |
| Sonner | Latest | Toast notifications |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| FastAPI | 0.100+ | Web framework |
| Motor | 3.x | Async MongoDB driver |
| Pydantic | 2.x | Data validation |
| python-jose | 3.x | JWT tokens |
| passlib | 1.7+ | Password hashing (bcrypt) |
| cachetools | 5.x | In-memory caching |
| emergentintegrations | Latest | LLM integration |

### Database
| Technology | Version | Purpose |
|------------|---------|---------|
| MongoDB | 6.x | Document database |

### AI Integration
| Service | Model | Purpose |
|---------|-------|---------|
| Anthropic Claude | claude-sonnet-4-5-20250929 | Chanakya chatbot |

---

## Database Schema

### Collection: `users`
```javascript
{
  "id": "uuid-v4",                    // Primary key
  "email": "user@example.com",        // Unique, indexed
  "name": "John Doe",
  "password_hash": "bcrypt_hash",     // bcrypt hashed
  "family_group_id": "uuid | null",   // FK to family_groups
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Collection: `budget_categories`
```javascript
{
  "id": "uuid-v4",
  "user_id": "uuid",                  // FK to users
  "family_group_id": "uuid | null",   // For shared budgets
  "name": "Groceries",
  "type": "expense | income",
  "allocated_amount": 10000,          // Monthly budget
  "spent_amount": 5000,               // Current spending
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Collection: `emis`
```javascript
{
  "id": "uuid-v4",
  "user_id": "uuid",
  "family_group_id": "uuid | null",
  "loan_name": "Car Loan",
  "principal_amount": 500000,
  "interest_rate": 8.5,               // Annual percentage
  "tenure_months": 60,
  "monthly_payment": 10250,           // Calculated EMI
  "remaining_balance": 400000,
  "paid_months": 10,
  "status": "active | completed",
  "start_date": "2024-01-01",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Collection: `transactions`
```javascript
{
  "id": "uuid-v4",
  "user_id": "uuid",
  "family_group_id": "uuid | null",
  "category_id": "uuid",              // FK to budget_categories
  "category_name": "Groceries",       // Denormalized for performance
  "amount": 500,
  "description": "Weekly groceries",
  "type": "expense | income",
  "date": "2024-01-15",
  "source": "manual | sms | voice",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Collection: `savings_goals`
```javascript
{
  "id": "uuid-v4",
  "user_id": "uuid",
  "family_group_id": "uuid | null",
  "name": "New iPhone",
  "target_amount": 120000,
  "current_amount": 25000,
  "target_date": "2025-06-30",        // YYYY-MM-DD
  "category": "electronics | travel | home | vehicle | education | emergency | general | other",
  "priority": "low | medium | high",
  "notes": "Optional notes",
  "status": "active | completed | paused",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Collection: `family_groups`
```javascript
{
  "id": "uuid-v4",
  "name": "Sharma Family",
  "owner_id": "uuid",                 // FK to users
  "members": [
    {
      "user_id": "uuid",
      "email": "member@example.com",
      "role": "owner | admin | member",
      "status": "active | pending"
    }
  ],
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

## API Endpoints

### Authentication
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login, returns JWT | No |
| GET | `/api/auth/me` | Get current user | Yes |

### Budget Categories
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/categories` | List all categories | Yes |
| POST | `/api/categories` | Create category | Yes |
| PUT | `/api/categories/{id}` | Update category | Yes |
| DELETE | `/api/categories/{id}` | Delete category | Yes |
| GET | `/api/budget-summary` | Get financial summary | Yes |

### EMI Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/emis` | List all EMIs | Yes |
| POST | `/api/emis` | Create EMI | Yes |
| DELETE | `/api/emis/{id}` | Delete EMI | Yes |
| POST | `/api/emis/{id}/payment` | Record payment | Yes |
| GET | `/api/emis/recommendations` | Get prepayment tips | Yes |

### Transactions
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/transactions` | List transactions | Yes |
| POST | `/api/transactions` | Create transaction | Yes |
| DELETE | `/api/transactions/{id}` | Delete transaction | Yes |

### Savings Goals
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/savings-goals` | List all goals | Yes |
| POST | `/api/savings-goals` | Create goal | Yes |
| GET | `/api/savings-goals/{id}` | Get goal with progress | Yes |
| PUT | `/api/savings-goals/{id}` | Update goal | Yes |
| POST | `/api/savings-goals/{id}/contribute` | Add contribution | Yes |
| DELETE | `/api/savings-goals/{id}` | Delete goal | Yes |
| GET | `/api/savings-goals-summary` | Summary with AI alerts | Yes |

### AI & Analytics
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/chatbot` | Chat with Chanakya AI | Yes |
| GET | `/api/financial-score` | Get health score | Yes |
| POST | `/api/when-to-buy` | Purchase timing advice | Yes |
| POST | `/api/sms/parse` | Parse transaction SMS | Yes |

### Family Sharing
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/family/create` | Create family group | Yes |
| POST | `/api/family/invite` | Invite member | Yes |
| POST | `/api/family/join/{id}` | Join family group | Yes |
| GET | `/api/family` | Get family details | Yes |

### System
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/` | Health check | No |
| GET | `/api/cache-stats` | Cache statistics | No |

---

## Authentication Flow

```
┌──────────┐     POST /api/auth/login      ┌──────────┐
│  Client  │ ─────────────────────────────▶│  Server  │
│          │  {email, password}            │          │
└──────────┘                               └──────────┘
                                                 │
                                                 │ 1. Find user by email
                                                 │ 2. Verify password (bcrypt)
                                                 │ 3. Generate JWT token
                                                 │
┌──────────┐     {access_token, user}      ┌──────────┐
│  Client  │ ◀─────────────────────────────│  Server  │
│          │                               │          │
└──────────┘                               └──────────┘
     │
     │ Store token in localStorage
     │ Set axios default header
     │
     ▼
┌──────────┐  GET /api/categories          ┌──────────┐
│  Client  │ ─────────────────────────────▶│  Server  │
│          │  Authorization: Bearer <JWT>  │          │
└──────────┘                               └──────────┘
```

### JWT Token Structure
```javascript
{
  "sub": "user_id",           // Subject (user ID)
  "email": "user@example.com",
  "name": "John Doe",
  "exp": 1234567890           // Expiration (7 days)
}
```

---

## Caching Implementation

### Strategy: TTL-based In-Memory Cache

```python
from cachetools import TTLCache

# Cache configurations
budget_summary_cache = TTLCache(maxsize=1000, ttl=300)      # 5 min
financial_score_cache = TTLCache(maxsize=1000, ttl=300)    # 5 min
emi_recommendations_cache = TTLCache(maxsize=1000, ttl=600) # 10 min
savings_summary_cache = TTLCache(maxsize=1000, ttl=300)    # 5 min
```

### Cache Key Pattern
```
{prefix}:{user_id}
Example: "budget_summary:550e8400-e29b-41d4-a716-446655440000"
```

### Cache Invalidation
Caches are invalidated when user performs write operations:
- Create/Update/Delete category
- Create/Delete EMI
- Record EMI payment
- Create/Update/Delete savings goal
- Add contribution to goal

```python
def invalidate_user_cache(user_id: str):
    """Invalidate all caches for a user"""
    for cache in [budget_summary_cache, financial_score_cache, ...]:
        for key in list(cache.keys()):
            if user_id in key:
                cache.pop(key, None)
```

---

## AI Chatbot (Chanakya)

### Integration
- **Provider**: Anthropic Claude
- **Model**: claude-sonnet-4-5-20250929
- **Library**: emergentintegrations (Emergent's wrapper)

### Context Injection
The chatbot receives user's financial context:

```python
financial_context = f"""
User's Financial Summary:
- Monthly Income: ₹{total_income:,.0f}
- Monthly Expenses: ₹{total_expenses:,.0f}
- EMI Payments: ₹{total_emi:,.0f}
- Remaining Budget: ₹{remaining:,.0f}
- Active EMIs: {len(emis)}
- Active Savings Goals: {len(savings_goals)}

Active EMI Details:
- Car Loan: ₹10,000/month at 8.5% APR, ₹400,000 remaining

Savings Goals:
- New iPhone: ₹25,000/₹120,000 (21% complete), 126 days left
"""
```

### System Prompt
```
You are Chanakya, a wise and friendly AI financial advisor for Budget Mantra app.
You provide practical, actionable financial advice tailored to Indian users.

Your personality:
- Wise and knowledgeable like the ancient Indian strategist Chanakya
- Friendly and approachable
- Practical and realistic with advice
- Uses simple language, avoids jargon

Your expertise includes:
- Budget planning and expense optimization
- EMI management and prepayment strategies
- Savings and investment guidance
- Financial goal planning
```

---

## Frontend Structure

```
frontend/src/
├── components/
│   ├── ui/                     # Shadcn/UI components
│   │   ├── button.jsx
│   │   ├── input.jsx
│   │   ├── card.jsx
│   │   ├── label.jsx
│   │   ├── sonner.tsx          # Toast provider
│   │   └── ...
│   ├── Navigation.js           # Main nav bar
│   ├── FinancialHealthScore.js # Health score widget
│   └── VoiceInput.js           # Voice input component
├── pages/
│   ├── LandingPage.js          # Public landing page
│   ├── LoginPage.js            # Auth - login
│   ├── SignupPage.js           # Auth - register
│   ├── Dashboard.js            # Main dashboard
│   ├── BudgetManager.js        # Budget categories
│   ├── EMIManager.js           # EMI tracking
│   ├── Transactions.js         # Transaction history
│   ├── SavingsGoals.js         # Savings goals
│   ├── Chatbot.js              # Chanakya AI chat
│   ├── WhenToBuy.js            # Purchase advisor
│   └── FamilyManagement.js     # Family sharing
├── context/
│   └── AuthContext.js          # Auth state & methods
├── App.js                      # Routes & providers
├── App.css                     # Legacy styles
└── index.css                   # Tailwind & CSS vars
```

### Routing
```javascript
// Public routes
<Route path="/" element={<LandingPage />} />
<Route path="/login" element={<LoginPage />} />
<Route path="/signup" element={<SignupPage />} />

// Protected routes (require auth)
<Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
<Route path="/budget" element={<ProtectedRoute><BudgetManager /></ProtectedRoute>} />
<Route path="/emis" element={<ProtectedRoute><EMIManager /></ProtectedRoute>} />
<Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
<Route path="/savings-goals" element={<ProtectedRoute><SavingsGoals /></ProtectedRoute>} />
<Route path="/chatbot" element={<ProtectedRoute><Chatbot /></ProtectedRoute>} />
```

---

## Design System

### Theme: "Digital Clay"

```css
:root {
  /* Primary - Burnt Orange */
  --primary: 21 90% 48%;           /* #ea580c */
  --primary-foreground: 0 0% 100%;
  
  /* Background - Warm Off-White */
  --background: 30 100% 99%;       /* #fffaf5 */
  --foreground: 24 10% 10%;
  
  /* Secondary - Deep Obsidian */
  --secondary: 222 47% 11%;
  
  /* Health Score Colors */
  --health-good: 84 81% 44%;       /* Green */
  --health-avg: 48 96% 53%;        /* Amber */
  --health-bad: 0 84% 60%;         /* Red */
}
```

### Typography
- **Headings**: Outfit (Google Fonts)
- **Body**: Manrope (Google Fonts)

### Component Patterns
```jsx
// Card pattern
<div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">

// Primary button
<Button className="bg-gradient-to-r from-orange-500 to-orange-600 
  hover:from-orange-600 hover:to-orange-700 text-white rounded-xl 
  shadow-lg shadow-orange-500/25">

// Page background
<div className="min-h-screen bg-gradient-to-br from-[#fffaf5] to-stone-50">
```

---

## Key Features Implementation

### 1. Financial Health Score
Calculates a 0-100 score based on:
- **Expense Ratio**: Total expenses / Total income
- **EMI Burden**: Total EMI / Total income
- **Savings Rate**: Remaining / Total income

```python
def calculate_financial_score(summary):
    expense_ratio = (expenses / income) * 100
    emi_ratio = (emi / income) * 100
    savings_ratio = (remaining / income) * 100
    
    # Scoring logic
    if expense_ratio < 50 and emi_ratio < 40:
        status = "green"
    elif expense_ratio < 70 and emi_ratio < 50:
        status = "amber"
    else:
        status = "red"
```

### 2. Smart Savings Alerts
AI-generated alerts based on:
- Goal deadline approaching
- Pace warnings (monthly savings vs surplus)
- Goal completion celebrations
- Overdue reminders

### 3. EMI Prepayment Recommendations
Prioritizes EMIs by:
- Interest rate (highest first)
- Remaining balance
- Potential interest savings

---

## Environment Variables

### Backend (.env)
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=budget_mantra
JWT_SECRET_KEY=your-secret-key-min-32-chars
CORS_ORIGINS=http://localhost:3000
EMERGENT_LLM_KEY=sk-emergent-xxxxx  # For AI chatbot
```

### Frontend (.env)
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

---

## File Structure

```
budget-mantra/
├── backend/
│   ├── server.py              # Main FastAPI app (all routes)
│   ├── requirements.txt       # Python dependencies
│   ├── .env                   # Environment variables
│   └── .env.example           # Template
├── frontend/
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── pages/             # Page components
│   │   ├── context/           # React context
│   │   ├── App.js             # Main app
│   │   └── index.css          # Styles
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── .env
├── memory/
│   └── PRD.md                 # Product requirements
├── setup.sh                   # Mac/Linux setup
├── setup.bat                  # Windows setup
├── README.md                  # Project documentation
├── CONTRIBUTING.md            # Contributor guide
└── LICENSE                    # MIT License
```

---

## Running Locally

```bash
# Terminal 1: Backend
cd backend
source venv/bin/activate
uvicorn server:app --reload --port 8001

# Terminal 2: Frontend
cd frontend
yarn start
```

**URLs:**
- Frontend: http://localhost:3000
- Backend: http://localhost:8001
- API Docs: http://localhost:8001/docs

---

## Deployment

The app is deployment-ready for:
- **Emergent Platform**: One-click deploy
- **Docker**: Containerized deployment
- **AWS**: ECS/Fargate + MongoDB Atlas
- **Vercel + Railway**: Frontend + Backend split

---

## Version History

| Date | Changes |
|------|---------|
| 2024-02-24 | Initial MVP with auth, budget, EMI tracking |
| 2024-02-24 | Added "Digital Clay" UI theme |
| 2024-02-24 | Implemented Chanakya AI chatbot (Claude) |
| 2024-02-24 | Added Savings Goals with smart alerts |
| 2024-02-24 | Implemented in-memory caching (TTLCache) |
| 2024-02-24 | Removed watermark, added SEO meta tags |

---

## Future Roadmap

### P1 (High Priority)
- [ ] Auto-EMI payment scheduling (background jobs)
- [ ] Voice input for transactions
- [ ] Homepage video showcase

### P2 (Medium Priority)
- [ ] Pricing page for premium features
- [ ] WhatsApp notifications (Twilio)
- [ ] Advanced expense analytics

### P3 (Low Priority)
- [ ] Bank integration (Plaid)
- [ ] Mobile app (React Native)
- [ ] Multi-currency support

---

*Last updated: February 2024*
