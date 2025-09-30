"""
Tool Execution Endpoint
Provides API for executing tools with parameters
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Any, Dict, Optional
import logging
import json
import subprocess
import os
import tempfile
from datetime import datetime
from pathlib import Path

from app.core.security import get_current_user
from app.services.strands_tool_definitions import STRANDS_TOOL_SCHEMAS

logger = logging.getLogger(__name__)

router = APIRouter()


class ToolExecutionRequest(BaseModel):
    tool: str
    parameters: Dict[str, Any]


class ToolExecutionResponse(BaseModel):
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
    execution_time: float


@router.post("/execute", response_model=ToolExecutionResponse)
async def execute_tool(
    request: ToolExecutionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Execute a tool with the provided parameters
    """
    start_time = datetime.now()

    try:
        tool_name = request.tool
        parameters = request.parameters

        logger.info(f"Executing tool: {tool_name} with parameters: {parameters}")

        # Get tool schema to validate parameters
        tool_schema = STRANDS_TOOL_SCHEMAS.get(tool_name)
        if not tool_schema:
            raise HTTPException(status_code=404, detail=f"Tool {tool_name} not found")

        # Simple validation
        required_params = tool_schema["parameters"].get("required", [])
        for param in required_params:
            if param not in parameters:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing required parameter: {param}"
                )

        # Execute based on tool type
        result = await execute_tool_logic(tool_name, parameters)

        execution_time = (datetime.now() - start_time).total_seconds()

        return ToolExecutionResponse(
            success=True,
            result=result,
            execution_time=execution_time
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Tool execution failed: {str(e)}")
        execution_time = (datetime.now() - start_time).total_seconds()
        return ToolExecutionResponse(
            success=False,
            error=str(e),
            execution_time=execution_time
        )


async def execute_tool_logic(tool_name: str, parameters: Dict[str, Any]) -> Any:
    """
    Execute the actual tool logic based on the tool type
    """

    # Simple implementations for demo purposes
    # In production, these would integrate with actual tool implementations

    if tool_name == "python_repl":
        code = parameters.get("code", "")
        # Create a temporary file to execute the code
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(code)
            temp_file = f.name

        try:
            # Execute the Python code
            result = subprocess.run(
                ["python", temp_file],
                capture_output=True,
                text=True,
                timeout=30
            )
            os.unlink(temp_file)

            return {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode
            }
        except subprocess.TimeoutExpired:
            os.unlink(temp_file)
            raise Exception("Code execution timed out")
        except Exception as e:
            os.unlink(temp_file)
            raise

    elif tool_name == "file_read":
        path = parameters.get("path", "")
        import mimetypes
        import base64

        try:
            # Detect file type
            mime_type, _ = mimetypes.guess_type(path)
            file_extension = Path(path).suffix.lower()

            # Check file size first
            file_size = Path(path).stat().st_size
            max_size = 10 * 1024 * 1024  # 10MB limit

            if file_size > max_size:
                return {
                    "error": f"File too large: {file_size / 1024 / 1024:.2f}MB (max: 10MB)",
                    "path": path,
                    "size": file_size
                }

            # Handle different file types
            if mime_type and mime_type.startswith('image/'):
                # Handle images - return base64 for display
                with open(path, 'rb') as f:
                    image_data = base64.b64encode(f.read()).decode('utf-8')
                return {
                    "type": "image",
                    "mime_type": mime_type,
                    "path": path,
                    "data": f"data:{mime_type};base64,{image_data}",
                    "size": file_size,
                    "message": "Image file loaded successfully"
                }

            elif file_extension == '.pdf':
                # Handle PDF files
                try:
                    import PyPDF2
                    with open(path, 'rb') as f:
                        pdf_reader = PyPDF2.PdfReader(f)
                        num_pages = len(pdf_reader.pages)

                        # Extract text from first few pages
                        text_content = ""
                        pages_to_read = min(5, num_pages)  # Read max 5 pages

                        for i in range(pages_to_read):
                            text_content += pdf_reader.pages[i].extract_text()

                        return {
                            "type": "pdf",
                            "path": path,
                            "num_pages": num_pages,
                            "content": text_content[:5000],  # Limit text to 5000 chars
                            "size": file_size,
                            "message": f"PDF file with {num_pages} pages. Showing text from first {pages_to_read} pages."
                        }
                except ImportError:
                    # PyPDF2 not installed
                    return {
                        "type": "pdf",
                        "path": path,
                        "size": file_size,
                        "error": "PDF reading not available. File is binary.",
                        "message": "To read PDF files, install PyPDF2: pip install PyPDF2"
                    }
                except Exception as e:
                    return {
                        "type": "pdf",
                        "path": path,
                        "error": f"Could not read PDF: {str(e)}",
                        "size": file_size
                    }

            elif file_extension in ['.xlsx', '.xls', '.csv']:
                # Handle spreadsheet files
                try:
                    if file_extension == '.csv':
                        import pandas as pd
                        df = pd.read_csv(path, nrows=100)  # Read first 100 rows
                        return {
                            "type": "spreadsheet",
                            "format": "csv",
                            "path": path,
                            "shape": df.shape,
                            "columns": df.columns.tolist(),
                            "preview": df.head(10).to_dict(),
                            "content": df.to_string(max_rows=20),
                            "size": file_size,
                            "message": f"CSV file with {df.shape[0]} rows and {df.shape[1]} columns"
                        }
                    else:
                        import pandas as pd
                        df = pd.read_excel(path, nrows=100)
                        return {
                            "type": "spreadsheet",
                            "format": "excel",
                            "path": path,
                            "shape": df.shape,
                            "columns": df.columns.tolist(),
                            "preview": df.head(10).to_dict(),
                            "content": df.to_string(max_rows=20),
                            "size": file_size,
                            "message": f"Excel file with {df.shape[0]} rows and {df.shape[1]} columns"
                        }
                except ImportError:
                    return {
                        "type": "spreadsheet",
                        "path": path,
                        "error": "pandas not installed for spreadsheet reading",
                        "message": "Install pandas to read spreadsheet files: pip install pandas openpyxl"
                    }
                except Exception as e:
                    return {
                        "type": "spreadsheet",
                        "path": path,
                        "error": f"Could not read spreadsheet: {str(e)}"
                    }

            elif file_extension in ['.json', '.jsonl']:
                # Handle JSON files
                with open(path, 'r', encoding='utf-8') as f:
                    import json
                    try:
                        content = json.load(f)
                        return {
                            "type": "json",
                            "path": path,
                            "content": json.dumps(content, indent=2)[:5000],
                            "size": file_size,
                            "message": "JSON file loaded and formatted"
                        }
                    except json.JSONDecodeError as e:
                        # Try reading as plain text if JSON is invalid
                        f.seek(0)
                        content = f.read()
                        return {
                            "type": "json",
                            "path": path,
                            "content": content[:5000],
                            "error": f"Invalid JSON: {str(e)}",
                            "size": file_size
                        }

            else:
                # Try to read as text file
                try:
                    # Try UTF-8 first
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    # Limit content size for display
                    if len(content) > 50000:
                        content = content[:50000] + "\n\n... (truncated, file too large)"

                    return {
                        "type": "text",
                        "path": path,
                        "content": content,
                        "size": file_size,
                        "encoding": "utf-8"
                    }

                except UnicodeDecodeError:
                    # Try with different encodings
                    encodings = ['latin-1', 'cp1252', 'iso-8859-1']

                    for encoding in encodings:
                        try:
                            with open(path, 'r', encoding=encoding) as f:
                                content = f.read()

                            if len(content) > 50000:
                                content = content[:50000] + "\n\n... (truncated)"

                            return {
                                "type": "text",
                                "path": path,
                                "content": content,
                                "size": file_size,
                                "encoding": encoding,
                                "warning": f"File read with {encoding} encoding (not UTF-8)"
                            }
                        except UnicodeDecodeError:
                            continue

                    # If all text encodings fail, it's likely a binary file
                    return {
                        "type": "binary",
                        "path": path,
                        "size": file_size,
                        "error": "This appears to be a binary file that cannot be displayed as text",
                        "message": f"Binary file of type: {mime_type or 'unknown'}. Size: {file_size / 1024:.2f}KB"
                    }

        except FileNotFoundError:
            return {"error": f"File not found: {path}", "path": path}
        except PermissionError:
            return {"error": f"Permission denied: Cannot read {path}", "path": path}
        except Exception as e:
            return {"error": f"Unexpected error: {str(e)}", "path": path}

    elif tool_name == "file_write":
        path = parameters.get("path", "")
        content = parameters.get("content", "")
        try:
            # Create directory if it doesn't exist
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            with open(path, 'w') as f:
                f.write(content)
            return {"success": True, "path": path, "bytes_written": len(content)}
        except Exception as e:
            return {"error": str(e)}

    elif tool_name == "calculator":
        expression = parameters.get("expression", "")
        try:
            # Safe evaluation using eval with restricted namespace
            import math
            safe_dict = {
                'sin': math.sin,
                'cos': math.cos,
                'tan': math.tan,
                'sqrt': math.sqrt,
                'log': math.log,
                'exp': math.exp,
                'pi': math.pi,
                'e': math.e
            }
            result = eval(expression, {"__builtins__": {}}, safe_dict)
            return {"expression": expression, "result": result}
        except Exception as e:
            return {"error": f"Failed to evaluate: {str(e)}"}

    elif tool_name == "current_time":
        import pytz

        timezone = parameters.get("timezone", "UTC")
        try:
            tz = pytz.timezone(timezone)
            current_time = datetime.now(tz)
            return {
                "timezone": timezone,
                "time": current_time.isoformat(),
                "formatted": current_time.strftime("%Y-%m-%d %H:%M:%S %Z")
            }
        except Exception as e:
            return {"error": f"Invalid timezone: {timezone}"}

    elif tool_name == "shell":
        command = parameters.get("command", "")
        if isinstance(command, list):
            command = " && ".join(command)

        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            return {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode,
                "command": command
            }
        except subprocess.TimeoutExpired:
            return {"error": "Command execution timed out"}
        except Exception as e:
            return {"error": str(e)}

    elif tool_name == "http_request":
        import requests

        method = parameters.get("method", "GET")
        url = parameters.get("url", "")
        headers = parameters.get("headers", {})
        body = parameters.get("body", None)

        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                data=body,
                timeout=30
            )

            return {
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "body": response.text[:1000],  # Limit response size
                "url": url
            }
        except Exception as e:
            return {"error": f"Request failed: {str(e)}"}

    elif tool_name == "tavily_search":
        # Execute Tavily search
        try:
            import os
            import sys
            import requests

            # Get API key
            api_key = os.getenv("TAVILY_API_KEY")
            if not api_key:
                return {"error": "TAVILY_API_KEY environment variable is not set"}

            # Get the query parameter (required)
            query = parameters.get("query", "")
            if not query:
                return {"error": "Query parameter is required"}

            # Get optional parameters
            search_depth = parameters.get("search_depth", "basic")
            topic = parameters.get("topic", "general")
            max_results = parameters.get("max_results", 5)
            include_raw_content = parameters.get("include_raw_content", False)

            # Build API request
            api_payload = {
                "api_key": api_key,
                "query": query,
                "search_depth": search_depth,
                "max_results": min(max_results, 10),
                "include_answer": True,
                "include_raw_content": include_raw_content,
                "include_images": False
            }

            # Add topic if it's news
            if topic == "news":
                api_payload["topic"] = "news"

            # Make API request to Tavily
            response = requests.post(
                "https://api.tavily.com/search",
                json=api_payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )

            if response.status_code != 200:
                return {"error": f"Tavily API error: {response.status_code}"}

            data = response.json()
            results = data.get("results", [])
            answer = data.get("answer", "")

            # Format results
            formatted_results = []
            for i, result in enumerate(results, 1):
                formatted_results.append({
                    "index": i,
                    "title": result.get("title", "Untitled"),
                    "url": result.get("url", ""),
                    "content": result.get("content", "")[:500] if result.get("content") else "",
                    "score": result.get("score", 0)
                })

            # Return the result
            return {
                "success": True,
                "query": query,
                "answer": answer,
                "results": formatted_results,
                "total_results": len(results)
            }
        except requests.exceptions.Timeout:
            return {"error": "Tavily search request timed out"}
        except Exception as e:
            return {"error": f"Tavily search failed: {str(e)}"}

    else:
        # For other tools, return a mock response
        return {
            "message": f"Tool {tool_name} executed successfully",
            "parameters": parameters,
            "timestamp": datetime.now().isoformat()
        }


@router.get("/tools/{tool_name}/schema")
async def get_tool_schema(
    tool_name: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get the schema for a specific tool
    """
    schema = STRANDS_TOOL_SCHEMAS.get(tool_name)
    if not schema:
        raise HTTPException(status_code=404, detail=f"Tool {tool_name} not found")

    return schema


@router.get("/tools/schemas")
async def get_all_tool_schemas(
    current_user: dict = Depends(get_current_user)
):
    """
    Get schemas for all available tools
    """
    return STRANDS_TOOL_SCHEMAS
