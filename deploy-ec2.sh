#!/bin/bash

# ApartmentSync Backend - EC2 Deployment Script
# This script sets up the server environment for deploying the Node.js backend

set -e  # Exit on error

echo "🚀 Starting ApartmentSync Backend Deployment on EC2..."
echo ""

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "❌ Cannot detect OS. Exiting."
    exit 1
fi

echo "📦 Detected OS: $OS"
echo ""

# Update system packages
echo "📦 Updating system packages..."
if [[ "$OS" == "amzn" ]] || [[ "$OS" == "amazon" ]]; then
    # Amazon Linux 2023 uses dnf, Amazon Linux 2 uses yum
    if command -v dnf &> /dev/null; then
        sudo dnf update -y
        sudo dnf install -y git curl wget
    else
        sudo yum update -y
        sudo yum install -y git curl wget
    fi
else
    echo "⚠️  This script is optimized for Amazon Linux. Proceeding anyway..."
    sudo yum update -y || sudo dnf update -y
    sudo yum install -y git curl wget || sudo dnf install -y git curl wget
fi

echo "✅ System packages updated"
echo ""

# Install NVM (Node Version Manager)
echo "📦 Installing NVM..."
if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    echo "✅ NVM installed"
else
    echo "✅ NVM already installed"
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# Install Node.js LTS
echo "📦 Installing Node.js LTS..."
nvm install --lts
nvm use --lts
nvm alias default node

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
echo "✅ Node.js installed: $NODE_VERSION"
echo "✅ npm installed: $NPM_VERSION"
echo ""

# Install PM2 globally
echo "📦 Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    echo "✅ PM2 installed"
else
    PM2_VERSION=$(pm2 --version)
    echo "✅ PM2 already installed: v$PM2_VERSION"
fi
echo ""

# Add NVM to bashrc for persistence
if ! grep -q "NVM_DIR" ~/.bashrc; then
    echo '' >> ~/.bashrc
    echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
    echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
    echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> ~/.bashrc
    echo "✅ NVM added to ~/.bashrc"
fi

echo ""
echo "✅ Server environment setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Clone your repository:"
echo "   cd ~ && git clone https://github.com/YOUR_USERNAME/apartment-sync-backend.git"
echo ""
echo "2. Navigate to project:"
echo "   cd ~/apartment-sync-backend"
echo ""
echo "3. Create .env file:"
echo "   cp .env.example .env"
echo "   nano .env  # Edit with your configuration"
echo ""
echo "4. Install dependencies:"
echo "   npm install --production"
echo ""
echo "5. Start with PM2:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo "   pm2 startup  # Follow the command it outputs"
echo ""
echo "6. Configure EC2 Security Group to open port 6500"
echo ""
echo "7. (Optional) Install and configure Nginx:"
echo "   sudo dnf install -y nginx  # or sudo yum install -y nginx"
echo "   sudo cp nginx.conf /etc/nginx/conf.d/apartmentsync.conf"
echo "   sudo systemctl start nginx && sudo systemctl enable nginx"
echo ""
echo "🎉 Deployment script completed successfully!"

