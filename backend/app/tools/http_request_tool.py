"""
HTTP Request Tool for Strands Agents
Makes API requests with comprehensive authentication support
"""
import aiohttp
import json
from typing import Dict, Any, Optional, List
import structlog
from bs4 import BeautifulSoup
import html2text

logger = structlog.get_logger()

TOOL_SPEC = {
    "name": "http_request",
    "description": (
        "Make HTTP/HTTPS requests to APIs and websites. "
        "Supports GET, POST, PUT, DELETE, PATCH methods with authentication. "
        "Can convert HTML responses to markdown for better readability."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "method": {
                "type": "string",
                "enum": ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
                "description": "HTTP method to use"
            },
            "url": {
                "type": "string",
                "description": "The URL to make the request to"
            },
            "headers": {
                "type": "object",
                "description": "Optional HTTP headers",
                "additionalProperties": {"type": "string"}
            },
            "body": {
                "type": ["string", "object"],
                "description": "Request body (for POST, PUT, PATCH)"
            },
            "params": {
                "type": "object",
                "description": "URL query parameters",
                "additionalProperties": {"type": "string"}
            },
            "auth_type": {
                "type": "string",
                "enum": ["Bearer", "Basic", "API-Key"],
                "description": "Authentication type"
            },
            "auth_token": {
                "type": "string",
                "description": "Authentication token/credentials"
            },
            "timeout": {
                "type": "integer",
                "description": "Request timeout in seconds",
                "default": 30
            },
            "convert_to_markdown": {
                "type": "boolean",
                "description": "Convert HTML responses to markdown",
                "default": False
            }
        },
        "required": ["method", "url"]
    }
}

class HTTPRequestTool:
    """HTTP request tool for making API calls"""
    
    def __init__(self):
        self.name = "http_request"
        self.description = TOOL_SPEC["description"]
        self.input_schema = TOOL_SPEC["input_schema"]
    
    async def __call__(self, **kwargs):
        """Execute HTTP request"""
        method = kwargs.get("method", "GET")
        url = kwargs.get("url")
        headers = kwargs.get("headers", {})
        body = kwargs.get("body")
        params = kwargs.get("params")
        auth_type = kwargs.get("auth_type")
        auth_token = kwargs.get("auth_token")
        timeout = kwargs.get("timeout", 30)
        convert_to_markdown = kwargs.get("convert_to_markdown", False)
        
        if not url:
            return {"success": False, "error": "URL is required"}
        
        # Add authentication headers if provided
        if auth_type and auth_token:
            if auth_type == "Bearer":
                headers["Authorization"] = f"Bearer {auth_token}"
            elif auth_type == "Basic":
                headers["Authorization"] = f"Basic {auth_token}"
            elif auth_type == "API-Key":
                headers["X-API-Key"] = auth_token
        
        try:
            async with aiohttp.ClientSession() as session:
                # Prepare request data
                request_kwargs = {
                    "method": method,
                    "url": url,
                    "headers": headers,
                    "params": params,
                    "timeout": aiohttp.ClientTimeout(total=timeout)
                }
                
                # Add body for appropriate methods
                if method in ["POST", "PUT", "PATCH"] and body:
                    if isinstance(body, dict):
                        request_kwargs["json"] = body
                        if "Content-Type" not in headers:
                            headers["Content-Type"] = "application/json"
                    else:
                        request_kwargs["data"] = body
                
                logger.info(f"🌐 Making {method} request to {url}")
                
                async with session.request(**request_kwargs) as response:
                    # Get response content
                    content_type = response.headers.get("Content-Type", "")
                    
                    if "application/json" in content_type:
                        response_data = await response.json()
                    elif "text/html" in content_type:
                        html_content = await response.text()
                        if convert_to_markdown:
                            # Convert HTML to markdown
                            h = html2text.HTML2Text()
                            h.ignore_links = False
                            h.ignore_images = False
                            response_data = h.handle(html_content)
                        else:
                            # Return first 5000 chars of HTML
                            response_data = html_content[:5000]
                            if len(html_content) > 5000:
                                response_data += "\n... (truncated)"
                    else:
                        response_data = await response.text()
                    
                    result = {
                        "success": response.status < 400,
                        "status_code": response.status,
                        "headers": dict(response.headers),
                        "data": response_data,
                        "url": str(response.url),
                        "method": method
                    }
                    
                    if response.status >= 400:
                        result["error"] = f"HTTP {response.status}: {response.reason}"
                    
                    logger.info(f"✅ Request completed: {response.status}")
                    return result
                    
        except aiohttp.ClientTimeout:
            return {
                "success": False,
                "error": f"Request timed out after {timeout} seconds",
                "url": url,
                "method": method
            }
        except aiohttp.ClientError as e:
            return {
                "success": False,
                "error": f"Request failed: {str(e)}",
                "url": url,
                "method": method
            }
        except Exception as e:
            logger.error(f"HTTP request error: {e}")
            return {
                "success": False,
                "error": str(e),
                "url": url,
                "method": method
            }

# Export for use
http_request = HTTPRequestTool()

__all__ = ["http_request", "HTTPRequestTool", "TOOL_SPEC"]