#!/bin/bash

# Budget Mantra - Local Setup Script
# Run this script after cloning the repository

set -e  # Exit on error

echo "🚀 Budget Mantra - Local Setup"
echo "================================"
echo ""

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        echo "   $2"
        exit 1
    else
        echo "✅ $1 found"
    fi
}

echo "Checking prerequisites..."
check_command "node" "Download from: https://nodejs.org"
check_command "python3" "Download from: https://python.org"
check_command "yarn" "Install with: npm install -g yarn"

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ required. You have $(node -v)"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(sys.version_info.minor)')
if [ "$PYTHON_VERSION" -lt 9 ]; then
    echo "❌ Python 3.9+ required."
    exit 1
fi

echo ""
echo "📦 Setting up Backend..."
echo "------------------------"

cd backend

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt --quiet

# Install emergentintegrations for AI features
echo "Installing AI integration library..."
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ --quiet 2>/dev/null || echo "⚠️  emergentintegrations install failed (optional for AI chatbot)"

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating backend .env file..."
    cp .env.example .env
    echo "⚠️  Please edit backend/.env with your settings"
fi

cd ..

echo ""
echo "🎨 Setting up Frontend..."
echo "-------------------------"

cd frontend

# Install dependencies
echo "Installing Node dependencies (this may take a minute)..."
yarn install --silent

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating frontend .env file..."
    cp .env.example .env
fi

cd ..

echo ""
echo "✅ Setup Complete!"
echo ""
echo "================================"
echo "📋 Next Steps:"
echo "================================"
echo ""
echo "1. Start MongoDB:"
echo "   - Mac:     brew services start mongodb-community"
echo "   - Linux:   sudo systemctl start mongod"
echo "   - Windows: net start MongoDB"
echo "   - Or use MongoDB Atlas (update backend/.env with connection string)"
echo ""
echo "2. Configure environment variables:"
echo "   - Edit backend/.env  (MongoDB URL, JWT secret)"
echo "   - Edit frontend/.env (Backend URL)"
echo ""
echo "3. Start the application:"
echo ""
echo "   Terminal 1 (Backend):"
echo "   cd backend && source venv/bin/activate && uvicorn server:app --reload --port 8001"
echo ""
echo "   Terminal 2 (Frontend):"
echo "   cd frontend && yarn start"
echo ""
echo "4. Open http://localhost:3000 in your browser"
echo ""
echo "================================"
echo "🎉 Happy coding!"
echo "================================"
