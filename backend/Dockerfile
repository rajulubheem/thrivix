# Multi-stage Dockerfile for Thrivix Backend - ARM64 Architecture
# Optimized for Amazon Bedrock AgentCore

# Stage 1: Builder
FROM --platform=linux/arm64 python:3.12-slim AS builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt requirements-prod.txt* ./

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM --platform=linux/arm64 python:3.12-slim

# Accept build argument for Bedrock VPC endpoint
ARG BEDROCK_ENDPOINT_URL

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080 \
    HOST=0.0.0.0 \
    AWS_ENDPOINT_URL_BEDROCK_RUNTIME=${BEDROCK_ENDPOINT_URL}

# AWS Best Practice: Create non-root user for security
RUN groupadd -r thrivix && useradd -r -g thrivix thrivix && \
    mkdir -p /home/thrivix && \
    chown -R thrivix:thrivix /home/thrivix

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code with proper ownership
COPY --chown=thrivix:thrivix app/ ./app/
COPY --chown=thrivix:thrivix main.py ./
COPY --chown=thrivix:thrivix app_settings.json* ./
COPY --chown=thrivix:thrivix mcp_servers_config.json* ./

# Create necessary directories with proper ownership
RUN mkdir -p logs sessions ai_workflow_sessions browser_screenshots repl_state research_sessions slack_events published_articles && \
    chown -R thrivix:thrivix /app

# AWS Best Practice: Switch to non-root user before running application
USER thrivix

# Health check endpoint (required by AgentCore)
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Expose port
EXPOSE 8080

# Run the application with uvicorn as non-root user
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
