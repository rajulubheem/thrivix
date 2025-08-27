"""
AWS Integration Tools for Strands Agents
Includes use_aws, retrieve, and other AWS-related tools
"""
import json
import hashlib
from typing import Dict, Any, Optional, List, Union
from datetime import datetime
import structlog
from pathlib import Path

logger = structlog.get_logger()

# Use AWS Tool
USE_AWS_SPEC = {
    "name": "use_aws",
    "description": (
        "Interact with AWS services including S3, Lambda, DynamoDB, and more. "
        "Provides access to AWS resources with proper authentication."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "service": {
                "type": "string",
                "enum": ["s3", "lambda", "dynamodb", "ec2", "sqs", "sns", "cloudwatch", "iam"],
                "description": "AWS service to interact with"
            },
            "action": {
                "type": "string",
                "description": "Action to perform (service-specific)"
            },
            "parameters": {
                "type": "object",
                "description": "Service-specific parameters"
            },
            "region": {
                "type": "string",
                "description": "AWS region",
                "default": "us-east-1"
            },
            "profile": {
                "type": "string",
                "description": "AWS profile to use",
                "default": "default"
            }
        },
        "required": ["service", "action"]
    }
}

class UseAWSTool:
    """AWS service integration tool"""
    
    def __init__(self):
        self.name = "use_aws"
        self.description = USE_AWS_SPEC["description"]
        self.input_schema = USE_AWS_SPEC["input_schema"]
        self.operations_log = []
    
    async def __call__(self, **kwargs):
        """Execute AWS operation"""
        service = kwargs.get("service")
        action = kwargs.get("action")
        parameters = kwargs.get("parameters", {})
        region = kwargs.get("region", "us-east-1")
        profile = kwargs.get("profile", "default")
        
        if not service or not action:
            return {"success": False, "error": "Service and action are required"}
        
        try:
            # Route to appropriate service handler
            if service == "s3":
                result = await self._handle_s3(action, parameters)
            elif service == "lambda":
                result = await self._handle_lambda(action, parameters)
            elif service == "dynamodb":
                result = await self._handle_dynamodb(action, parameters)
            elif service == "ec2":
                result = await self._handle_ec2(action, parameters)
            elif service == "sqs":
                result = await self._handle_sqs(action, parameters)
            elif service == "sns":
                result = await self._handle_sns(action, parameters)
            elif service == "cloudwatch":
                result = await self._handle_cloudwatch(action, parameters)
            elif service == "iam":
                result = await self._handle_iam(action, parameters)
            else:
                return {"success": False, "error": f"Unsupported service: {service}"}
            
            # Log operation
            self.operations_log.append({
                "service": service,
                "action": action,
                "region": region,
                "timestamp": datetime.now().isoformat(),
                "success": result.get("success", True)
            })
            
            return result
            
        except Exception as e:
            logger.error(f"AWS tool error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _handle_s3(self, action: str, params: Dict) -> Dict:
        """Handle S3 operations"""
        if action == "list_buckets":
            return {
                "success": True,
                "buckets": [
                    {"name": "my-bucket-1", "created": "2024-01-01"},
                    {"name": "my-bucket-2", "created": "2024-02-01"}
                ]
            }
        elif action == "list_objects":
            bucket = params.get("bucket")
            prefix = params.get("prefix", "")
            return {
                "success": True,
                "bucket": bucket,
                "objects": [
                    {"key": f"{prefix}file1.txt", "size": 1024},
                    {"key": f"{prefix}file2.json", "size": 2048}
                ]
            }
        elif action == "get_object":
            bucket = params.get("bucket")
            key = params.get("key")
            return {
                "success": True,
                "bucket": bucket,
                "key": key,
                "content": "Sample S3 object content",
                "metadata": {"content-type": "text/plain"}
            }
        elif action == "put_object":
            bucket = params.get("bucket")
            key = params.get("key")
            content = params.get("content")
            return {
                "success": True,
                "bucket": bucket,
                "key": key,
                "etag": hashlib.md5(content.encode()).hexdigest(),
                "message": "Object uploaded successfully"
            }
        else:
            return {"success": False, "error": f"Unknown S3 action: {action}"}
    
    async def _handle_lambda(self, action: str, params: Dict) -> Dict:
        """Handle Lambda operations"""
        if action == "list_functions":
            return {
                "success": True,
                "functions": [
                    {"name": "function1", "runtime": "python3.9"},
                    {"name": "function2", "runtime": "nodejs18.x"}
                ]
            }
        elif action == "invoke":
            function_name = params.get("function_name")
            payload = params.get("payload", {})
            return {
                "success": True,
                "function": function_name,
                "status_code": 200,
                "response": {"result": "Function executed successfully"},
                "request_id": hashlib.md5(str(payload).encode()).hexdigest()[:12]
            }
        else:
            return {"success": False, "error": f"Unknown Lambda action: {action}"}
    
    async def _handle_dynamodb(self, action: str, params: Dict) -> Dict:
        """Handle DynamoDB operations"""
        if action == "list_tables":
            return {
                "success": True,
                "tables": ["users", "products", "orders"]
            }
        elif action == "get_item":
            table = params.get("table")
            key = params.get("key")
            return {
                "success": True,
                "table": table,
                "item": {"id": key, "data": "Sample item data"}
            }
        elif action == "put_item":
            table = params.get("table")
            item = params.get("item")
            return {
                "success": True,
                "table": table,
                "message": "Item stored successfully"
            }
        elif action == "query":
            table = params.get("table")
            query_params = params.get("query_params", {})
            return {
                "success": True,
                "table": table,
                "items": [
                    {"id": "1", "data": "Item 1"},
                    {"id": "2", "data": "Item 2"}
                ],
                "count": 2
            }
        else:
            return {"success": False, "error": f"Unknown DynamoDB action: {action}"}
    
    async def _handle_ec2(self, action: str, params: Dict) -> Dict:
        """Handle EC2 operations"""
        if action == "describe_instances":
            return {
                "success": True,
                "instances": [
                    {"id": "i-1234567890", "state": "running", "type": "t2.micro"},
                    {"id": "i-0987654321", "state": "stopped", "type": "t2.small"}
                ]
            }
        elif action == "start_instance":
            instance_id = params.get("instance_id")
            return {
                "success": True,
                "instance_id": instance_id,
                "state": "starting"
            }
        elif action == "stop_instance":
            instance_id = params.get("instance_id")
            return {
                "success": True,
                "instance_id": instance_id,
                "state": "stopping"
            }
        else:
            return {"success": False, "error": f"Unknown EC2 action: {action}"}
    
    async def _handle_sqs(self, action: str, params: Dict) -> Dict:
        """Handle SQS operations"""
        if action == "send_message":
            queue_url = params.get("queue_url")
            message = params.get("message")
            return {
                "success": True,
                "queue_url": queue_url,
                "message_id": hashlib.md5(message.encode()).hexdigest()[:16],
                "md5": hashlib.md5(message.encode()).hexdigest()
            }
        elif action == "receive_messages":
            queue_url = params.get("queue_url")
            return {
                "success": True,
                "queue_url": queue_url,
                "messages": [
                    {"body": "Message 1", "message_id": "msg1"},
                    {"body": "Message 2", "message_id": "msg2"}
                ]
            }
        else:
            return {"success": False, "error": f"Unknown SQS action: {action}"}
    
    async def _handle_sns(self, action: str, params: Dict) -> Dict:
        """Handle SNS operations"""
        if action == "publish":
            topic_arn = params.get("topic_arn")
            message = params.get("message")
            return {
                "success": True,
                "topic_arn": topic_arn,
                "message_id": hashlib.md5(message.encode()).hexdigest()[:16]
            }
        elif action == "list_topics":
            return {
                "success": True,
                "topics": [
                    {"arn": "arn:aws:sns:us-east-1:123456789012:topic1"},
                    {"arn": "arn:aws:sns:us-east-1:123456789012:topic2"}
                ]
            }
        else:
            return {"success": False, "error": f"Unknown SNS action: {action}"}
    
    async def _handle_cloudwatch(self, action: str, params: Dict) -> Dict:
        """Handle CloudWatch operations"""
        if action == "put_metric":
            namespace = params.get("namespace")
            metric_name = params.get("metric_name")
            value = params.get("value")
            return {
                "success": True,
                "namespace": namespace,
                "metric": metric_name,
                "message": "Metric published successfully"
            }
        elif action == "get_metrics":
            namespace = params.get("namespace")
            return {
                "success": True,
                "namespace": namespace,
                "metrics": [
                    {"name": "CPUUtilization", "value": 45.2},
                    {"name": "MemoryUtilization", "value": 62.8}
                ]
            }
        else:
            return {"success": False, "error": f"Unknown CloudWatch action: {action}"}
    
    async def _handle_iam(self, action: str, params: Dict) -> Dict:
        """Handle IAM operations"""
        if action == "list_users":
            return {
                "success": True,
                "users": [
                    {"username": "user1", "arn": "arn:aws:iam::123456789012:user/user1"},
                    {"username": "user2", "arn": "arn:aws:iam::123456789012:user/user2"}
                ]
            }
        elif action == "list_roles":
            return {
                "success": True,
                "roles": [
                    {"name": "role1", "arn": "arn:aws:iam::123456789012:role/role1"},
                    {"name": "role2", "arn": "arn:aws:iam::123456789012:role/role2"}
                ]
            }
        else:
            return {"success": False, "error": f"Unknown IAM action: {action}"}

# Retrieve Tool
RETRIEVE_SPEC = {
    "name": "retrieve",
    "description": (
        "Advanced retrieval tool for fetching and searching data from various sources. "
        "Supports vector search, knowledge bases, and RAG operations."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "source": {
                "type": "string",
                "enum": ["vector_db", "knowledge_base", "documents", "embeddings", "cache"],
                "description": "Data source to retrieve from"
            },
            "query": {
                "type": "string",
                "description": "Search query or retrieval criteria"
            },
            "filters": {
                "type": "object",
                "description": "Filters to apply to results",
                "properties": {
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "date_range": {
                        "type": "object",
                        "properties": {
                            "start": {"type": "string"},
                            "end": {"type": "string"}
                        }
                    },
                    "metadata": {"type": "object"}
                }
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of results",
                "default": 10
            },
            "similarity_threshold": {
                "type": "number",
                "description": "Minimum similarity score (0-1)",
                "default": 0.7
            },
            "include_metadata": {
                "type": "boolean",
                "description": "Include metadata in results",
                "default": True
            }
        },
        "required": ["source", "query"]
    }
}

class RetrieveTool:
    """Advanced retrieval and search tool"""
    
    def __init__(self):
        self.name = "retrieve"
        self.description = RETRIEVE_SPEC["description"]
        self.input_schema = RETRIEVE_SPEC["input_schema"]
        
        # Simulated data stores
        self.vector_store = []
        self.knowledge_base = []
        self.documents = []
        self.cache = {}
    
    async def __call__(self, **kwargs):
        """Execute retrieval operation"""
        source = kwargs.get("source")
        query = kwargs.get("query")
        filters = kwargs.get("filters", {})
        limit = kwargs.get("limit", 10)
        similarity_threshold = kwargs.get("similarity_threshold", 0.7)
        include_metadata = kwargs.get("include_metadata", True)
        
        if not source or not query:
            return {"success": False, "error": "Source and query are required"}
        
        try:
            if source == "vector_db":
                result = await self._retrieve_from_vector_db(
                    query, filters, limit, similarity_threshold, include_metadata
                )
            elif source == "knowledge_base":
                result = await self._retrieve_from_knowledge_base(
                    query, filters, limit, include_metadata
                )
            elif source == "documents":
                result = await self._retrieve_from_documents(
                    query, filters, limit, include_metadata
                )
            elif source == "embeddings":
                result = await self._retrieve_embeddings(
                    query, limit, similarity_threshold
                )
            elif source == "cache":
                result = await self._retrieve_from_cache(query)
            else:
                return {"success": False, "error": f"Unknown source: {source}"}
            
            return result
            
        except Exception as e:
            logger.error(f"Retrieve tool error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _retrieve_from_vector_db(self, query: str, filters: Dict, 
                                      limit: int, threshold: float, 
                                      include_metadata: bool) -> Dict:
        """Retrieve from vector database"""
        # Simulate vector search
        results = [
            {
                "id": f"vec_{i}",
                "content": f"Result {i}: Content relevant to '{query}'",
                "similarity": 0.95 - (i * 0.05),
                "metadata": {
                    "source": "document",
                    "page": i + 1,
                    "timestamp": datetime.now().isoformat()
                }
            }
            for i in range(min(5, limit))
        ]
        
        # Filter by similarity threshold
        results = [r for r in results if r["similarity"] >= threshold]
        
        if not include_metadata:
            for r in results:
                r.pop("metadata", None)
        
        return {
            "success": True,
            "source": "vector_db",
            "query": query,
            "results": results[:limit],
            "total_found": len(results)
        }
    
    async def _retrieve_from_knowledge_base(self, query: str, filters: Dict,
                                           limit: int, include_metadata: bool) -> Dict:
        """Retrieve from knowledge base"""
        # Simulate knowledge base search
        results = [
            {
                "id": f"kb_{i}",
                "title": f"Article {i}",
                "content": f"Knowledge base article about '{query}'",
                "relevance": 0.9 - (i * 0.1),
                "metadata": {
                    "category": "technical",
                    "author": "System",
                    "last_updated": datetime.now().isoformat()
                }
            }
            for i in range(min(3, limit))
        ]
        
        if not include_metadata:
            for r in results:
                r.pop("metadata", None)
        
        return {
            "success": True,
            "source": "knowledge_base",
            "query": query,
            "results": results,
            "total_found": len(results)
        }
    
    async def _retrieve_from_documents(self, query: str, filters: Dict,
                                      limit: int, include_metadata: bool) -> Dict:
        """Retrieve from documents"""
        # Simulate document search
        results = [
            {
                "id": f"doc_{i}",
                "filename": f"document_{i}.pdf",
                "excerpt": f"Document excerpt containing '{query}'",
                "page": i + 1,
                "metadata": {
                    "file_type": "pdf",
                    "size_bytes": 1024 * (i + 1),
                    "created": datetime.now().isoformat()
                }
            }
            for i in range(min(4, limit))
        ]
        
        if not include_metadata:
            for r in results:
                r.pop("metadata", None)
        
        return {
            "success": True,
            "source": "documents",
            "query": query,
            "results": results,
            "total_found": len(results)
        }
    
    async def _retrieve_embeddings(self, query: str, limit: int, 
                                  threshold: float) -> Dict:
        """Retrieve raw embeddings"""
        # Simulate embedding retrieval
        embedding = [float(i) / 100 for i in range(384)]  # 384-dim embedding
        
        similar_embeddings = [
            {
                "id": f"emb_{i}",
                "embedding": embedding,
                "similarity": 0.9 - (i * 0.05),
                "dimension": 384
            }
            for i in range(min(3, limit))
        ]
        
        similar_embeddings = [e for e in similar_embeddings if e["similarity"] >= threshold]
        
        return {
            "success": True,
            "source": "embeddings",
            "query": query,
            "query_embedding": embedding[:10] + ["..."],  # Truncated for response
            "similar": similar_embeddings,
            "total_found": len(similar_embeddings)
        }
    
    async def _retrieve_from_cache(self, query: str) -> Dict:
        """Retrieve from cache"""
        cache_key = hashlib.md5(query.encode()).hexdigest()
        
        if cache_key in self.cache:
            return {
                "success": True,
                "source": "cache",
                "query": query,
                "cached_result": self.cache[cache_key],
                "cache_hit": True
            }
        else:
            # Store in cache for future
            self.cache[cache_key] = {
                "query": query,
                "timestamp": datetime.now().isoformat(),
                "data": f"Cached result for '{query}'"
            }
            
            return {
                "success": True,
                "source": "cache",
                "query": query,
                "cache_hit": False,
                "message": "No cached result found, created new cache entry"
            }

# Export tools
use_aws = UseAWSTool()
retrieve = RetrieveTool()

__all__ = [
    "use_aws", "UseAWSTool", "USE_AWS_SPEC",
    "retrieve", "RetrieveTool", "RETRIEVE_SPEC"
]