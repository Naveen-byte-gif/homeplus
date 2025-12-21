# AWS EC2 Deployment Guide for ApartmentSync Backend

This guide will walk you through deploying the ApartmentSync Node.js backend on AWS EC2 using Amazon Linux.

## Prerequisites

- AWS Account
- GitHub repository access
- Firebase project with service account key
- MongoDB database (MongoDB Atlas or self-hosted)

## Step 1: Create EC2 Instance

1. **Launch EC2 Instance:**
   - Go to AWS Console → EC2 → Launch Instance
   - Choose **Amazon Linux 2023** (or Amazon Linux 2)
   - Select instance type (t2.micro for testing, t3.small+ for production)
   - Create or select a key pair for SSH access
   - Configure security group (we'll update this later):
     - SSH (22) from your IP
     - Custom TCP (6500) from anywhere (or specific IPs)
     - HTTP (80) from anywhere (if using Nginx)
     - HTTPS (443) from anywhere (if using SSL)

2. **Launch and Note:**
   - Public IP address
   - Private IP address (if needed)
   - Instance ID

## Step 2: Connect to EC2 Instance

### Using SSH (Windows PowerShell or Git Bash):

```bash
# Replace with your key file path and instance IP
ssh -i "path/to/your-key.pem" ec2-user@YOUR_EC2_PUBLIC_IP
```

### Using AWS Systems Manager Session Manager (if configured):
- Go to EC2 Console → Select instance → Connect → Session Manager

## Step 3: Initial Server Setup

Once connected, run the deployment script:

```bash
# Download and run the deployment script
curl -o- https://raw.githubusercontent.com/YOUR_USERNAME/apartment-sync-backend/main/deploy-ec2.sh | bash

# OR manually run the commands from deploy-ec2.sh
```

Or follow the manual steps below:

### 3.1 Update System Packages

```bash
sudo dnf update -y  # For Amazon Linux 2023
# OR
sudo yum update -y  # For Amazon Linux 2
```

### 3.2 Install Required System Packages

```bash
# Amazon Linux 2023
sudo dnf install -y git curl wget

# Amazon Linux 2
sudo yum install -y git curl wget
```

### 3.3 Install Node.js using NVM

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell configuration
source ~/.bashrc

# Install Node.js LTS version
nvm install --lts
nvm use --lts
nvm alias default node

# Verify installation
node --version
npm --version
```

### 3.4 Install PM2 (Process Manager)

```bash
npm install -g pm2
```

## Step 4: Clone Repository

```bash
# Navigate to home directory
cd ~

# Clone your repository
git clone https://github.com/YOUR_USERNAME/apartment-sync-backend.git

# Navigate to project directory
cd apartment-sync-backend
```

## Step 5: Configure Environment Variables

### 5.1 Create .env File

```bash
# Copy the example file
cp .env.example .env

# Edit the .env file
nano .env
# OR
vi .env
```

### 5.2 Required Environment Variables

Fill in all the required variables in `.env`:

```env
# Server Configuration
NODE_ENV=production
PORT=6500

# Database (MongoDB Atlas or self-hosted)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/apartmentsync?retryWrites=true&w=majority

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars
JWT_EXPIRE=30d

# CORS - Update with your frontend URL
SOCKET_CORS_ORIGIN=https://your-frontend-domain.com

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-specific-password

# Support Contact
SUPPORT_EMAIL=support@apartmentsync.com
ADMIN_EMAIL=admin@apartmentsync.com
SUPPORT_PHONE=+91-XXXXXX-XXXX

# Frontend URL
FRONTEND_URL=https://your-frontend-domain.com

# Firebase Configuration
# Option 1: Service Account Key (Recommended - Single line JSON)
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}'

# Option 2: Individual credentials (Alternative)
# FIREBASE_PROJECT_ID=your-project-id
# FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
# FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour\nPrivate\nKey\nHere\n-----END PRIVATE KEY-----\n"
```

### 5.3 Get Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click ⚙️ (Settings) → Project Settings
4. Go to "Service Accounts" tab
5. Click "Generate New Private Key"
6. Download the JSON file
7. Copy the entire JSON content and paste it as `FIREBASE_SERVICE_ACCOUNT_KEY` in `.env`
   - Wrap in single quotes: `FIREBASE_SERVICE_ACCOUNT_KEY='{...}'`
   - Keep it on one line

## Step 6: Install Dependencies

```bash
# Install npm packages
npm install --production
```

## Step 7: Start Application with PM2

### 7.1 Using PM2 Ecosystem File (Recommended)

```bash
# Start using ecosystem file
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system reboot
pm2 startup
# Follow the command it outputs (usually: sudo env PATH=$PATH:... pm2 startup systemd -u ec2-user --hp /home/ec2-user)
```

### 7.2 Using PM2 Directly

```bash
# Start the application
pm2 start server.js --name apartmentsync-backend

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system reboot
pm2 startup
```

### 7.3 PM2 Useful Commands

```bash
# Check status
pm2 status

# View logs
pm2 logs apartmentsync-backend

# Restart application
pm2 restart apartmentsync-backend

# Stop application
pm2 stop apartmentsync-backend

# Monitor
pm2 monit
```

## Step 8: Configure EC2 Security Group

1. Go to AWS Console → EC2 → Security Groups
2. Select your instance's security group
3. Edit inbound rules:
   - **SSH (22)**: Your IP only
   - **Custom TCP (6500)**: 0.0.0.0/0 (or specific IPs for security)
   - **HTTP (80)**: 0.0.0.0/0 (if using Nginx)
   - **HTTPS (443)**: 0.0.0.0/0 (if using SSL)

## Step 9: (Optional) Configure Nginx as Reverse Proxy

### 9.1 Install Nginx

```bash
# Amazon Linux 2023
sudo dnf install -y nginx

# Amazon Linux 2
sudo yum install -y nginx
```

### 9.2 Configure Nginx

```bash
# Create Nginx configuration
sudo nano /etc/nginx/conf.d/apartmentsync.conf
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain or EC2 IP

    location / {
        proxy_pass http://localhost:6500;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket support for Socket.IO
        proxy_set_header Connection "upgrade";
    }
}
```

### 9.3 Start Nginx

```bash
# Test Nginx configuration
sudo nginx -t

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

## Step 10: Verify Deployment

### 10.1 Check Application Health

```bash
# From EC2 instance
curl http://localhost:6500/health

# From your local machine (replace with EC2 IP)
curl http://YOUR_EC2_PUBLIC_IP:6500/health

# If using Nginx
curl http://YOUR_EC2_PUBLIC_IP/health
```

Expected response:
```json
{
  "success": true,
  "message": "ApartmentSync API is running",
  "timestamp": "2025-01-XX...",
  "environment": "production"
}
```

### 10.2 Check PM2 Status

```bash
pm2 status
pm2 logs apartmentsync-backend --lines 50
```

### 10.3 Test API Endpoints

```bash
# Test health endpoint
curl http://YOUR_EC2_PUBLIC_IP:6500/health

# Test API endpoint (if you have one)
curl http://YOUR_EC2_PUBLIC_IP:6500/api/auth/me
```

## Step 11: (Optional) Setup SSL with Let's Encrypt

If you have a domain name:

```bash
# Install Certbot
sudo dnf install -y certbot python3-certbot-nginx
# OR for Amazon Linux 2
sudo yum install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
```

## Troubleshooting

### Application Not Starting

```bash
# Check PM2 logs
pm2 logs apartmentsync-backend

# Check if port is in use
sudo netstat -tulpn | grep 6500

# Check environment variables
pm2 env 0
```

### MongoDB Connection Issues

- Verify `MONGODB_URI` in `.env` is correct
- Check MongoDB Atlas IP whitelist includes EC2 IP
- Test connection: `curl http://localhost:6500/health`

### Firebase Not Working

- Verify `FIREBASE_SERVICE_ACCOUNT_KEY` is correctly formatted in `.env`
- Check PM2 logs for Firebase initialization messages
- Ensure JSON is on one line and wrapped in single quotes

### Port Not Accessible

- Check EC2 Security Group rules
- Verify application is running: `pm2 status`
- Check firewall: `sudo firewall-cmd --list-all` (if enabled)

### Nginx Issues

```bash
# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

## Updating the Application

```bash
# Navigate to project directory
cd ~/apartment-sync-backend

# Pull latest changes
git pull origin main

# Install new dependencies (if any)
npm install --production

# Restart application
pm2 restart apartmentsync-backend

# Check logs
pm2 logs apartmentsync-backend
```

## Monitoring

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# View metrics
pm2 show apartmentsync-backend
```

### System Monitoring

```bash
# Check system resources
htop
# OR
top

# Check disk space
df -h

# Check memory
free -h
```

## Security Best Practices

1. **Keep .env file secure:**
   - Never commit `.env` to git
   - Use proper file permissions: `chmod 600 .env`

2. **Firewall:**
   - Only open necessary ports
   - Restrict SSH access to your IP
   - Use security groups effectively

3. **Regular Updates:**
   - Keep system packages updated: `sudo dnf update -y`
   - Keep Node.js updated: `nvm install --lts && nvm use --lts`
   - Keep dependencies updated: `npm audit fix`

4. **Backup:**
   - Regularly backup your `.env` file
   - Backup MongoDB database
   - Consider using AWS Backup for EC2 snapshots

## Access URLs

After deployment, your API will be accessible at:

- **Direct access:** `http://YOUR_EC2_PUBLIC_IP:6500`
- **With Nginx:** `http://YOUR_EC2_PUBLIC_IP` or `http://your-domain.com`
- **With SSL:** `https://your-domain.com`

## Health Check Endpoint

- `/health` - Returns server status and timestamp

## Next Steps

1. Configure your frontend to point to the EC2 API URL
2. Set up domain name and SSL certificate
3. Configure monitoring and alerting
4. Set up automated backups
5. Configure log rotation for PM2

## Support

For issues or questions:
- Check PM2 logs: `pm2 logs apartmentsync-backend`
- Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
- Review this deployment guide
- Check application logs in PM2

