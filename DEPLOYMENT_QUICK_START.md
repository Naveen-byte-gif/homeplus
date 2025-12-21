# Quick Start Deployment Guide

This is a condensed version of the full deployment guide. For detailed instructions, see [AWS_EC2_DEPLOYMENT.md](./AWS_EC2_DEPLOYMENT.md).

## Prerequisites Checklist

- [ ] AWS EC2 instance running Amazon Linux
- [ ] SSH access to EC2 instance
- [ ] MongoDB database (Atlas or self-hosted)
- [ ] Firebase project with service account key
- [ ] GitHub repository access

## Quick Deployment Steps

### 1. Connect to EC2

```bash
ssh -i "your-key.pem" ec2-user@YOUR_EC2_IP
```

### 2. Run Deployment Script

```bash
# Download and run setup script
curl -o- https://raw.githubusercontent.com/YOUR_USERNAME/apartment-sync-backend/main/deploy-ec2.sh | bash

# OR run locally if you've uploaded it
chmod +x deploy-ec2.sh
./deploy-ec2.sh
```

### 3. Clone Repository

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/apartment-sync-backend.git
cd apartment-sync-backend
```

### 4. Configure Environment

```bash
# Create .env file
cp .env.example .env
nano .env  # Edit with your values
```

**Required variables:**
- `MONGODB_URI` - Your MongoDB connection string
- `JWT_SECRET` - Strong secret key (min 32 chars)
- `FIREBASE_SERVICE_ACCOUNT_KEY` - Firebase JSON (single line, wrapped in quotes)
- `SOCKET_CORS_ORIGIN` - Your frontend URL
- `EMAIL_USER` & `EMAIL_PASS` - Email credentials

### 5. Install & Start

```bash
# Install dependencies
npm install --production

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow the command it outputs

# Verify
pm2 status
```

### 6. Configure Security Group

In AWS Console → EC2 → Security Groups:
- Open port **6500** (or your PORT) from 0.0.0.0/0
- Open port **22** (SSH) from your IP only

### 7. Verify Deployment

```bash
# Run verification script
chmod +x verify-deployment.sh
./verify-deployment.sh

# Or manually test
curl http://localhost:6500/health
```

### 8. (Optional) Setup Nginx

```bash
# Install Nginx
sudo dnf install -y nginx  # or sudo yum install -y nginx

# Copy configuration
sudo cp nginx.conf /etc/nginx/conf.d/apartmentsync.conf
sudo nano /etc/nginx/conf.d/apartmentsync.conf  # Edit server_name

# Start Nginx
sudo nginx -t
sudo systemctl start nginx
sudo systemctl enable nginx
```

## Access Your API

- **Direct:** `http://YOUR_EC2_IP:6500`
- **Health Check:** `http://YOUR_EC2_IP:6500/health`
- **With Nginx:** `http://YOUR_EC2_IP` or `http://your-domain.com`

## Common Commands

```bash
# PM2 Management
pm2 status                    # Check status
pm2 logs apartmentsync-backend  # View logs
pm2 restart apartmentsync-backend  # Restart
pm2 stop apartmentsync-backend    # Stop
pm2 monit                     # Monitor

# Update Application
cd ~/apartment-sync-backend
git pull
npm install --production
pm2 restart apartmentsync-backend

# View Logs
pm2 logs apartmentsync-backend --lines 100
tail -f logs/pm2-combined.log
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port not accessible | Check EC2 Security Group rules |
| App not starting | Check `pm2 logs apartmentsync-backend` |
| MongoDB connection failed | Verify `MONGODB_URI` and IP whitelist |
| Firebase not working | Check `FIREBASE_SERVICE_ACCOUNT_KEY` format |
| Nginx 502 error | Verify app is running on port 6500 |

## Next Steps

1. ✅ Configure domain name and SSL (Let's Encrypt)
2. ✅ Set up monitoring and alerts
3. ✅ Configure automated backups
4. ✅ Update frontend to use new API URL

## Need Help?

- Full guide: [AWS_EC2_DEPLOYMENT.md](./AWS_EC2_DEPLOYMENT.md)
- Check PM2 logs: `pm2 logs apartmentsync-backend`
- Verify deployment: `./verify-deployment.sh`

