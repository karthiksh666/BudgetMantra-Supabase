# Contributing to Budget Mantra

Thank you for your interest in contributing to Budget Mantra! This document provides guidelines and instructions for contributing.

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18.x
- Python >= 3.9
- MongoDB >= 6.x
- Git
- Yarn (recommended)

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/budget-mantra.git
   cd budget-mantra
   ```

2. **Set up the backend**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Set up the frontend**
   ```bash
   cd ../frontend
   yarn install
   cp .env.example .env
   # Edit .env with your backend URL
   ```

4. **Start MongoDB**
   ```bash
   # Local MongoDB
   mongod --dbpath /path/to/data
   
   # Or use MongoDB Atlas (update .env with connection string)
   ```

5. **Run the application**
   ```bash
   # Terminal 1 - Backend
   cd backend && uvicorn server:app --reload --port 8001
   
   # Terminal 2 - Frontend
   cd frontend && yarn start
   ```

## 📝 Code Style

### Python (Backend)

- Follow PEP 8 guidelines
- Use type hints for function parameters and return values
- Use Pydantic models for data validation
- Keep functions small and focused

```python
# Good
async def get_user_emis(user_id: str) -> List[EMI]:
    """Fetch all EMIs for a specific user."""
    emis = await db.emis.find({"user_id": user_id}).to_list(100)
    return emis

# Avoid
async def get_stuff(id):
    return await db.emis.find({"user_id": id}).to_list(100)
```

### JavaScript/React (Frontend)

- Use functional components with hooks
- Use named exports for components, default exports for pages
- Keep components small (< 100 lines ideally)
- Use descriptive variable names

```jsx
// Good - Named export for reusable component
export const GoalCard = ({ goal, onContribute }) => {
  const progress = (goal.current_amount / goal.target_amount) * 100;
  return (
    <div data-testid={`goal-card-${goal.id}`}>
      {/* ... */}
    </div>
  );
};

// Good - Default export for page
const SavingsGoals = () => {
  // ...
};
export default SavingsGoals;
```

### CSS/Tailwind

- Use Tailwind utility classes
- Follow the design system in `index.css`
- Use CSS variables for theme colors
- Keep consistent spacing (use multiples of 4: p-4, p-6, p-8)

```jsx
// Good - Consistent with design system
<div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
  <h2 className="text-xl font-bold text-stone-900 font-['Outfit']">Title</h2>
</div>

// Avoid - Inconsistent styling
<div style={{ backgroundColor: 'white', padding: '25px' }}>
```

## 🧪 Testing

### Running Tests

```bash
# Backend tests
cd backend
pytest tests/ -v

# Frontend tests
cd frontend
yarn test
```

### Writing Tests

**Backend:**
```python
# tests/test_api.py
import pytest
from httpx import AsyncClient
from server import app

@pytest.mark.asyncio
async def test_create_savings_goal():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/savings-goals",
            json={"name": "Test Goal", "target_amount": 10000, "target_date": "2025-12-31"},
            headers={"Authorization": f"Bearer {test_token}"}
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Test Goal"
```

**Frontend:**
```jsx
// src/pages/__tests__/SavingsGoals.test.js
import { render, screen, fireEvent } from '@testing-library/react';
import SavingsGoals from '../SavingsGoals';

test('opens create goal modal when button clicked', async () => {
  render(<SavingsGoals />);
  
  fireEvent.click(screen.getByTestId('create-goal-btn'));
  
  expect(screen.getByTestId('create-goal-modal')).toBeInTheDocument();
});
```

### Test IDs

Always add `data-testid` attributes to interactive elements:

```jsx
<Button data-testid="submit-btn">Submit</Button>
<Input data-testid="amount-input" />
<div data-testid="loading-spinner" />
```

## 📁 File Structure Guidelines

### Adding a New Feature

1. **Backend**: Add models and routes in `server.py`
2. **Frontend**: Create page in `src/pages/`
3. **Route**: Add to `src/App.js`
4. **Navigation**: Add link in `src/components/Navigation.js`
5. **Tests**: Add tests for new functionality

### Example: Adding "Investment Tracker"

```
backend/server.py          # Add Investment model and /api/investments routes
frontend/src/pages/Investments.js  # New page component
frontend/src/App.js        # Add route
frontend/src/components/Navigation.js  # Add nav link
```

## 🔄 Git Workflow

### Branch Naming

```
feature/add-investment-tracker
bugfix/fix-emi-calculation
hotfix/security-patch
docs/update-readme
```

### Commit Messages

Use conventional commits:

```
feat: add investment tracker page
fix: correct EMI interest calculation
docs: update API documentation
style: format code with prettier
refactor: simplify auth context
test: add tests for savings goals
```

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Write/update tests
4. Run tests locally
5. Update documentation if needed
6. Create a Pull Request with:
   - Clear title describing the change
   - Description of what and why
   - Screenshots for UI changes
   - Link to related issue (if any)

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring

## Testing
- [ ] Tests pass locally
- [ ] New tests added (if applicable)

## Screenshots (for UI changes)
[Add screenshots here]
```

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Steps to reproduce**
2. **Expected behavior**
3. **Actual behavior**
4. **Screenshots** (if applicable)
5. **Environment** (browser, OS, versions)

## 💡 Feature Requests

For feature requests, please describe:

1. **The problem** you're trying to solve
2. **Your proposed solution**
3. **Alternatives** you've considered
4. **Additional context**

## 🔐 Security

If you discover a security vulnerability:

1. **DO NOT** open a public issue
2. Email the maintainers directly
3. Provide details about the vulnerability
4. Allow time for a fix before disclosure

## 📚 Documentation

- Update README.md for significant changes
- Add JSDoc/docstrings for new functions
- Update API documentation for new endpoints
- Keep inline comments minimal but helpful

## 🎨 Design Guidelines

Follow the "Digital Clay" design system:

- **Colors**: Use CSS variables from `index.css`
- **Typography**: Outfit for headings, Manrope for body
- **Spacing**: Use Tailwind's spacing scale (p-4, p-6, p-8)
- **Components**: Use Shadcn/UI components from `src/components/ui/`
- **Icons**: Use Lucide React icons

## 🤝 Code Review

### For Reviewers

- Be constructive and respectful
- Focus on code quality and maintainability
- Suggest improvements, don't demand
- Approve when code meets standards

### For Contributors

- Respond to feedback constructively
- Ask for clarification if needed
- Make requested changes promptly
- Thank reviewers for their time

---

## Questions?

If you have questions, feel free to:

1. Open a GitHub Discussion
2. Check existing issues
3. Reach out to maintainers

Thank you for contributing to Budget Mantra! 🙏
