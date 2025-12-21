#!/bin/bash

# ApartmentSync Backend - Deployment Verification Script
# Run this script after deployment to verify everything is working

set -e

echo "🔍 Verifying ApartmentSync Backend Deployment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
    fi
}

# Check if PM2 is installed
echo "📦 Checking PM2 installation..."
if command -v pm2 &> /dev/null; then
    print_status 0 "PM2 is installed"
    PM2_VERSION=$(pm2 --version)
    echo "   Version: $PM2_VERSION"
else
    print_status 1 "PM2 is not installed"
    exit 1
fi
echo ""

# Check if application is running in PM2
echo "📦 Checking PM2 application status..."
if pm2 list | grep -q "apartmentsync-backend"; then
    APP_STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="apartmentsync-backend") | .pm2_env.status')
    if [ "$APP_STATUS" == "online" ]; then
        print_status 0 "Application is running in PM2"
    else
        print_status 1 "Application is not running (Status: $APP_STATUS)"
    fi
else
    print_status 1 "Application not found in PM2"
fi
echo ""

# Check if .env file exists
echo "📦 Checking environment configuration..."
if [ -f .env ]; then
    print_status 0 ".env file exists"
    
    # Check for required variables
    REQUIRED_VARS=("MONGODB_URI" "JWT_SECRET" "PORT")
    MISSING_VARS=()
    
    for var in "${REQUIRED_VARS[@]}"; do
        if ! grep -q "^${var}=" .env || [ -z "$(grep "^${var}=" .env | cut -d '=' -f2)" ]; then
            MISSING_VARS+=("$var")
        fi
    done
    
    if [ ${#MISSING_VARS[@]} -eq 0 ]; then
        print_status 0 "Required environment variables are set"
    else
        print_status 1 "Missing required environment variables: ${MISSING_VARS[*]}"
    fi
else
    print_status 1 ".env file not found"
fi
echo ""

# Check if port is listening
echo "📦 Checking if application port is listening..."
PORT=$(grep "^PORT=" .env 2>/dev/null | cut -d '=' -f2 || echo "6500")
if netstat -tuln 2>/dev/null | grep -q ":$PORT " || ss -tuln 2>/dev/null | grep -q ":$PORT "; then
    print_status 0 "Port $PORT is listening"
else
    print_status 1 "Port $PORT is not listening"
fi
echo ""

# Test health endpoint
echo "📦 Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/health || echo "000")
if [ "$HEALTH_RESPONSE" == "200" ]; then
    print_status 0 "Health endpoint is responding"
    HEALTH_BODY=$(curl -s http://localhost:$PORT/health)
    echo "   Response: $HEALTH_BODY"
else
    print_status 1 "Health endpoint is not responding (HTTP $HEALTH_RESPONSE)"
fi
echo ""

# Check MongoDB connection (if MONGODB_URI is set)
echo "📦 Checking MongoDB connection..."
if [ -f .env ] && grep -q "^MONGODB_URI=" .env; then
    MONGODB_URI=$(grep "^MONGODB_URI=" .env | cut -d '=' -f2)
    if [ -n "$MONGODB_URI" ]; then
        # Try to connect (this is a simple check)
        print_status 0 "MongoDB URI is configured"
        echo "   (Connection test requires MongoDB client tools)"
    else
        print_status 1 "MongoDB URI is empty"
    fi
else
    print_status 1 "MongoDB URI not found in .env"
fi
echo ""

# Check Firebase configuration
echo "📦 Checking Firebase configuration..."
if [ -f .env ]; then
    if grep -q "^FIREBASE_SERVICE_ACCOUNT_KEY=" .env || grep -q "^FIREBASE_PROJECT_ID=" .env; then
        print_status 0 "Firebase configuration found"
    else
        print_status 1 "Firebase configuration not found (push notifications will be disabled)"
    fi
else
    print_status 1 "Cannot check Firebase (no .env file)"
fi
echo ""

# Check Nginx (if installed)
echo "📦 Checking Nginx configuration..."
if command -v nginx &> /dev/null; then
    if systemctl is-active --quiet nginx; then
        print_status 0 "Nginx is running"
        
        # Test Nginx configuration
        if sudo nginx -t 2>&1 | grep -q "successful"; then
            print_status 0 "Nginx configuration is valid"
        else
            print_status 1 "Nginx configuration has errors"
        fi
    else
        print_status 1 "Nginx is not running"
    fi
else
    echo -e "${YELLOW}ℹ️  Nginx is not installed (optional)${NC}"
fi
echo ""

# Check system resources
echo "📦 Checking system resources..."
if command -v free &> /dev/null; then
    MEMORY=$(free -h | awk '/^Mem:/ {print $3 "/" $2}')
    echo "   Memory usage: $MEMORY"
fi

if command -v df &> /dev/null; then
    DISK=$(df -h / | awk 'NR==2 {print $5 " used (" $3 "/" $2 ")"}')
    echo "   Disk usage: $DISK"
fi
echo ""

# Check recent PM2 logs for errors
echo "📦 Checking recent application logs..."
if pm2 logs apartmentsync-backend --lines 20 --nostream 2>/dev/null | grep -qi "error\|failed\|exception"; then
    echo -e "${YELLOW}⚠️  Found potential errors in recent logs${NC}"
    echo "   Run 'pm2 logs apartmentsync-backend' to see details"
else
    print_status 0 "No obvious errors in recent logs"
fi
echo ""

# Summary
echo "=========================================="
echo "📊 Deployment Verification Summary"
echo "=========================================="
echo ""
echo "If all checks passed, your deployment is ready!"
echo ""
echo "🌐 Access your API at:"
echo "   - Direct: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_EC2_IP'):$PORT"
echo "   - Health: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_EC2_IP'):$PORT/health"
echo ""
echo "📝 Useful commands:"
echo "   - View logs: pm2 logs apartmentsync-backend"
echo "   - Restart: pm2 restart apartmentsync-backend"
echo "   - Status: pm2 status"
echo "   - Monitor: pm2 monit"
echo ""
echo "✅ Verification complete!"

