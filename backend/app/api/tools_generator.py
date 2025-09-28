"""
API endpoint for dynamic tool generation
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from services.dynamic_tool_generator import DynamicToolGenerator, ToolSpecification

router = APIRouter(prefix="/api/v1/tools", tags=["tools"])

# Initialize the tool generator
generator = DynamicToolGenerator(tools_directory="./generated_tools")


class ToolGenerationRequest(BaseModel):
    """Request model for tool generation"""
    tool_name: str
    description: Optional[str] = None
    parameters: Optional[List[Dict[str, Any]]] = None
    category: Optional[str] = "generic"
    implementation_hint: Optional[str] = None
    validate: bool = True


class ToolValidationRequest(BaseModel):
    """Request to validate if tools are available"""
    required_tools: List[str]
    available_tools: List[str]


class GenerateMissingToolsRequest(BaseModel):
    """Request to generate missing tools for a workflow"""
    workflow_name: str
    required_tools: List[str]
    available_tools: List[str]
    auto_generate: bool = False


@router.post("/generate")
async def generate_tool(request: ToolGenerationRequest):
    """Generate a new tool based on specification"""
    try:
        spec = ToolSpecification(
            name=request.tool_name,
            description=request.description or f"Auto-generated tool for {request.tool_name}",
            parameters=request.parameters or [],
            category=request.category,
            implementation_hint=request.implementation_hint or ""
        )

        tool_path = generator.generate_tool(spec, validate=request.validate)

        return {
            "status": "success",
            "tool_name": request.tool_name,
            "tool_path": tool_path,
            "message": f"Tool {request.tool_name} generated successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate")
async def validate_tools(request: ToolValidationRequest):
    """Validate if required tools are available"""
    missing_tools = set(request.required_tools) - set(request.available_tools)

    return {
        "is_valid": len(missing_tools) == 0,
        "missing_tools": list(missing_tools),
        "available_count": len(request.available_tools),
        "required_count": len(request.required_tools)
    }


@router.post("/generate-missing")
async def generate_missing_tools(request: GenerateMissingToolsRequest):
    """Generate missing tools for a workflow"""
    try:
        missing_tools = set(request.required_tools) - set(request.available_tools)

        if not missing_tools:
            return {
                "status": "success",
                "message": "All required tools are available",
                "generated_tools": []
            }

        if not request.auto_generate:
            return {
                "status": "missing_tools",
                "missing_tools": list(missing_tools),
                "message": f"Workflow requires {len(missing_tools)} missing tools",
                "suggested_action": "Set auto_generate=true to generate missing tools"
            }

        # Generate missing tools
        generated = generator.generate_missing_tools(
            request.required_tools,
            request.available_tools
        )

        return {
            "status": "success",
            "generated_tools": list(generated.keys()),
            "tool_paths": generated,
            "message": f"Generated {len(generated)} missing tools for {request.workflow_name}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/suggestions/{tool_name}")
async def get_tool_suggestions(tool_name: str):
    """Get implementation suggestions for a tool"""

    # Common tool implementations
    suggestions = {
        "sentiment_analyzer": {
            "description": "Analyze sentiment of text",
            "parameters": [
                {"name": "text", "type": "str", "description": "Text to analyze"},
                {"name": "language", "type": "str", "default": "en", "description": "Language code"}
            ],
            "category": "data_processing",
            "example_output": {
                "sentiment": "positive",
                "confidence": 0.85,
                "scores": {"positive": 0.85, "neutral": 0.10, "negative": 0.05}
            }
        },
        "object_detection": {
            "description": "Detect objects in images",
            "parameters": [
                {"name": "image_path", "type": "str", "description": "Path to image file"},
                {"name": "threshold", "type": "float", "default": 0.5, "description": "Detection threshold"}
            ],
            "category": "ml_operation",
            "example_output": {
                "objects": [
                    {"label": "person", "confidence": 0.95, "bbox": [100, 100, 200, 300]},
                    {"label": "car", "confidence": 0.87, "bbox": [400, 200, 600, 400]}
                ]
            }
        },
        "text_extraction": {
            "description": "Extract text from documents",
            "parameters": [
                {"name": "document_path", "type": "str", "description": "Path to document"},
                {"name": "format", "type": "str", "default": "pdf", "description": "Document format"}
            ],
            "category": "file_operation",
            "example_output": {
                "text": "Extracted text content...",
                "pages": 5,
                "metadata": {"title": "Document", "author": "Unknown"}
            }
        }
    }

    if tool_name in suggestions:
        return {
            "tool_name": tool_name,
            "suggestion": suggestions[tool_name],
            "can_generate": True
        }
    else:
        # Infer from tool name
        spec = generator._infer_tool_spec(tool_name)
        if spec:
            return {
                "tool_name": tool_name,
                "suggestion": {
                    "description": spec.description,
                    "parameters": spec.parameters,
                    "category": spec.category
                },
                "can_generate": True,
                "inferred": True
            }
        else:
            return {
                "tool_name": tool_name,
                "suggestion": None,
                "can_generate": False,
                "message": "No suggestion available for this tool"
            }


@router.post("/bulk-generate")
async def bulk_generate_tools(tools: List[str]):
    """Generate multiple tools at once"""
    results = {}

    for tool_name in tools:
        try:
            spec = generator._infer_tool_spec(tool_name)
            if spec:
                tool_path = generator.generate_tool(spec, validate=False)
                results[tool_name] = {
                    "status": "generated",
                    "path": tool_path
                }
            else:
                results[tool_name] = {
                    "status": "failed",
                    "error": "Could not infer tool specification"
                }
        except Exception as e:
            results[tool_name] = {
                "status": "error",
                "error": str(e)
            }

    return {
        "generated": [k for k, v in results.items() if v["status"] == "generated"],
        "failed": [k for k, v in results.items() if v["status"] != "generated"],
        "details": results
    }