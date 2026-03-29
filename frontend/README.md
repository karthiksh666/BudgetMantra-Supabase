# Frontend - Budget Mantra

React frontend for Budget Mantra fintech application.

## 🛠️ Tech Stack

- **React 18** - UI library with hooks
- **Tailwind CSS** - Utility-first CSS framework
- **Shadcn/UI** - Accessible component library
- **Lucide React** - Beautiful icon library
- **React Router v6** - Client-side routing
- **Axios** - HTTP client
- **Sonner** - Toast notifications

## 📁 Project Structure

```
frontend/
├── public/
│   ├── index.html
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── ui/              # Shadcn/UI components
│   │   │   ├── button.jsx
│   │   │   ├── input.jsx
│   │   │   ├── card.jsx
│   │   │   ├── sonner.tsx   # Toast provider
│   │   │   └── ...
│   │   ├── Navigation.js    # Main navigation bar
│   │   ├── FinancialHealthScore.js
│   │   └── VoiceInput.js
│   ├── pages/
│   │   ├── LandingPage.js   # Public landing page
│   │   ├── LoginPage.js     # Auth - login
│   │   ├── SignupPage.js    # Auth - register
│   │   ├── Dashboard.js     # Main dashboard
│   │   ├── BudgetManager.js # Budget categories
│   │   ├── EMIManager.js    # EMI tracking
│   │   ├── Transactions.js  # Transaction history
│   │   ├── SavingsGoals.js  # Savings goals tracker
│   │   ├── Chatbot.js       # Chanakya AI chatbot
│   │   ├── WhenToBuy.js     # Purchase advisor
│   │   └── FamilyManagement.js
│   ├── context/
│   │   └── AuthContext.js   # Authentication state
│   ├── App.js               # Main app & routing
│   ├── App.css              # Legacy styles (being migrated)
│   └── index.css            # Tailwind & CSS variables
├── package.json
├── tailwind.config.js
├── jsconfig.json            # Path aliases (@/)
└── .env
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Yarn (recommended) or npm

### Installation

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies (use yarn to avoid conflicts)
yarn install

# Or with npm
npm install
```

### Environment Setup

Create a `.env` file:

```env
# Backend API URL
REACT_APP_BACKEND_URL=http://localhost:8001
```

### Run Development Server

```bash
# With yarn
yarn start

# Or with npm
npm start
```

Access the app at http://localhost:3000

## 🎨 Design System

### Theme: "Digital Clay"

The app uses a warm, professional fintech aesthetic.

### CSS Variables (index.css)

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

```css
/* Headings - Outfit */
h1, h2, h3, h4, h5, h6 {
  font-family: 'Outfit', sans-serif;
}

/* Body - Manrope */
body {
  font-family: 'Manrope', sans-serif;
}
```

Fonts are imported from Google Fonts in `index.css`.

### Using Shadcn Components

Components are pre-installed in `src/components/ui/`:

```jsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

// Usage
<Button variant="default">Click me</Button>
<Button variant="outline">Secondary</Button>
<Button variant="ghost">Ghost</Button>
```

### Common Patterns

#### Gradient Buttons
```jsx
<Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl shadow-lg shadow-orange-500/25">
  Primary Action
</Button>
```

#### Cards
```jsx
<div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100 hover:shadow-md transition-shadow">
  {/* Content */}
</div>
```

#### Page Background
```jsx
<div className="min-h-screen bg-gradient-to-br from-[#fffaf5] to-stone-50">
  {/* Page content */}
</div>
```

## 🔐 Authentication

Authentication is managed via `AuthContext`:

```jsx
import { useAuth } from '@/context/AuthContext';

function MyComponent() {
  const { user, login, logout, register, loading } = useAuth();
  
  // Check if user is logged in
  if (!user) return <Navigate to="/login" />;
  
  return <div>Welcome, {user.name}!</div>;
}
```

### Protected Routes

Routes requiring auth use the `ProtectedRoute` wrapper in `App.js`:

```jsx
<Route path="/dashboard" element={
  <ProtectedRoute>
    <Dashboard />
  </ProtectedRoute>
} />
```

## 📱 Pages Overview

### Public Pages
| Page | Path | Description |
|------|------|-------------|
| LandingPage | `/` | Marketing landing page |
| LoginPage | `/login` | User login |
| SignupPage | `/signup` | User registration |

### Protected Pages
| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/dashboard` | Financial overview |
| BudgetManager | `/budget` | Manage budget categories |
| EMIManager | `/emis` | Track EMIs & payments |
| Transactions | `/transactions` | Transaction history |
| SavingsGoals | `/savings-goals` | Track savings goals |
| Chatbot | `/chatbot` | Chanakya AI assistant |
| WhenToBuy | `/when-to-buy` | Purchase advisor |
| FamilyManagement | `/family` | Family sharing |

## 🧩 Key Components

### Navigation.js
Main navigation bar with responsive mobile menu:
- Desktop: Horizontal nav links
- Mobile: Hamburger menu with grid layout
- User info and logout button

### FinancialHealthScore.js
Displays user's financial health:
- Score (0-100)
- Status badge (Green/Amber/Red)
- Metric bars (Expense Ratio, EMI Burden, Savings Rate)
- AI-generated recommendations

### Chatbot.js
AI chatbot interface:
- Message history with auto-scroll
- User/Assistant message bubbles
- Loading indicator
- Suggested questions

### SavingsGoals.js
Full-featured goals tracker:
- Summary cards (Active Goals, Total Saved, Progress)
- Smart Alerts from Chanakya
- Goal cards with progress bars
- Create goal modal
- Add contribution modal

## 🔗 API Integration

API calls use Axios with the base URL from environment:

```jsx
import axios from 'axios';
import { API } from '@/App';

// API is defined as:
export const API = process.env.REACT_APP_BACKEND_URL + '/api';

// Example API call
const fetchData = async () => {
  try {
    const response = await axios.get(`${API}/categories`);
    setCategories(response.data);
  } catch (error) {
    console.error('Error:', error);
    toast.error('Failed to fetch data');
  }
};
```

### Auth Token

Token is automatically added to requests in `AuthContext`:

```jsx
// In AuthContext.js
useEffect(() => {
  const token = localStorage.getItem('token');
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
}, []);
```

## 🧪 Testing

### Run Tests
```bash
yarn test

# With coverage
yarn test --coverage
```

### Testing Components

```jsx
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './pages/Dashboard';

test('renders dashboard', () => {
  render(
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );
  expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
});
```

### Test IDs

All interactive elements have `data-testid` attributes:

```jsx
<Button data-testid="create-goal-btn">New Goal</Button>
<Input data-testid="goal-name-input" />
```

## 📦 Adding New Features

### 1. Create a New Page

```jsx
// src/pages/MyNewPage.js
import Navigation from '@/components/Navigation';

const MyNewPage = () => {
  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-[#fffaf5] to-stone-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-8">
          <h1 className="text-3xl font-bold text-stone-900 font-['Outfit']">
            My New Page
          </h1>
          {/* Content */}
        </div>
      </div>
    </>
  );
};

export default MyNewPage;
```

### 2. Add Route in App.js

```jsx
import MyNewPage from '@/pages/MyNewPage';

// In Routes
<Route path="/my-new-page" element={
  <ProtectedRoute>
    <MyNewPage />
  </ProtectedRoute>
} />
```

### 3. Add to Navigation

```jsx
// In Navigation.js
const navLinks = [
  // ... existing links
  { to: '/my-new-page', label: 'New Page', icon: SomeIcon },
];
```

## 🚢 Production Build

```bash
# Create production build
yarn build

# Build output is in /build directory
# Deploy to any static hosting (Vercel, Netlify, S3, etc.)
```

### Environment for Production

```env
REACT_APP_BACKEND_URL=https://api.yourdomain.com
```

## 🔧 Configuration Files

### tailwind.config.js
Customizes Tailwind with app colors and fonts.

### jsconfig.json
Enables `@/` path alias for cleaner imports:
```json
{
  "compilerOptions": {
    "baseUrl": "src",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

---

For more details, see the main [README.md](../README.md).
