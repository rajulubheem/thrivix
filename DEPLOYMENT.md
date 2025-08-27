# Deployment Guide

## Quick Start

### Local Development

```bash
# Run the setup script
./scripts/setup.sh

# Add your API keys to backend/.env
# Start backend: cd backend && python main.py
# Start frontend: cd frontend && npm start
```

### Docker Deployment

```bash
# Copy environment template
cp .env.production .env

# Edit .env with your API keys
# Required: OPENAI_API_KEY and TAVILY_API_KEY

# Run deployment script
./scripts/deploy.sh
```

## Deployment Options

### 1. Docker Compose (Recommended)

The easiest way to deploy the full stack:

```bash
docker-compose up -d
```

Access:
- Frontend: http://localhost
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### 2. Manual Deployment

#### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

#### Frontend

```bash
cd frontend
npm install
npm run build
npm install -g serve
serve -s build -l 3000
```

### 3. Cloud Deployment

#### AWS EC2

1. Launch EC2 instance (Ubuntu 22.04)
2. Install Docker and Docker Compose
3. Clone repository
4. Configure environment variables
5. Run docker-compose

#### Heroku

```bash
# Install Heroku CLI
# Create Heroku app
heroku create your-app-name

# Set environment variables
heroku config:set OPENAI_API_KEY=your-key
heroku config:set TAVILY_API_KEY=your-key

# Deploy
git push heroku main
```

#### DigitalOcean App Platform

1. Connect GitHub repository
2. Configure environment variables
3. Deploy with automatic builds

## Environment Variables

### Required

- `OPENAI_API_KEY`: Your OpenAI API key
- `TAVILY_API_KEY`: Your Tavily API key for web search

### Optional

- `AWS_REGION`: AWS region for Bedrock (default: us-west-2)
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `DEFAULT_MODEL_ID`: Default AI model (default: gpt-4o-mini)
- `MAX_HANDOFFS`: Maximum agent handoffs (default: 20)

## Production Considerations

### Security

1. **API Keys**: Never commit API keys to repository
2. **HTTPS**: Use reverse proxy (nginx/Caddy) with SSL
3. **Firewall**: Configure firewall rules
4. **Updates**: Keep dependencies updated

### Performance

1. **Database**: Consider PostgreSQL for production
2. **Redis**: Add Redis for caching and sessions
3. **CDN**: Use CDN for frontend assets
4. **Monitoring**: Add application monitoring

### Scaling

1. **Horizontal Scaling**: Use Kubernetes for orchestration
2. **Load Balancing**: Add load balancer for multiple instances
3. **Auto-scaling**: Configure based on CPU/memory usage

## SSL/TLS Setup

### Using Caddy (Automatic HTTPS)

```caddyfile
yourdomain.com {
    reverse_proxy frontend:80
}

api.yourdomain.com {
    reverse_proxy backend:8000
}
```

### Using Nginx with Certbot

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

## Monitoring

### Health Checks

- Backend: `GET /health`
- Frontend: `GET /`

### Logging

Logs are stored in:
- `./logs/` - Application logs
- Docker: `docker-compose logs -f`

### Metrics

Consider adding:
- Prometheus for metrics
- Grafana for visualization
- Sentry for error tracking

## Backup

### Database Backup

```bash
# SQLite backup
cp data/strands_swarm.db data/backup-$(date +%Y%m%d).db

# PostgreSQL backup
pg_dump strands_db > backup-$(date +%Y%m%d).sql
```

### Session Backup

```bash
tar -czf sessions-backup-$(date +%Y%m%d).tar.gz sessions/
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Find process using port
   lsof -i :8000
   # Kill process
   kill -9 <PID>
   ```

2. **Docker permissions**
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

3. **API key errors**
   - Verify keys in .env file
   - Check for typos or extra spaces
   - Ensure keys are active

### Debug Mode

Enable debug logging:
```bash
export DEBUG=true
export LOG_LEVEL=DEBUG
```

## Support

- GitHub Issues: [Report issues](https://github.com/yourusername/strands-ai-agent/issues)
- Documentation: Check README.md for usage
- API Docs: http://localhost:8000/docs when running