"""
File Viewer API
View and download files created by agents
"""
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import PlainTextResponse, JSONResponse
from typing import Dict, Any, List, Optional
import structlog

router = APIRouter()
logger = structlog.get_logger()

# Import the global virtual filesystem
from app.services.enhanced_swarm_service import GLOBAL_VIRTUAL_FILES

@router.get("/list")
async def list_files() -> Dict[str, Any]:
    """List all files in the virtual filesystem"""
    files = []
    for path, content in GLOBAL_VIRTUAL_FILES.items():
        files.append({
            "path": path,
            "size": len(content),
            "lines": len(content.split('\n')),
            "preview": content[:200] + "..." if len(content) > 200 else content
        })
    
    return {
        "total_files": len(files),
        "files": files
    }

@router.get("/view/{file_path:path}")
async def view_file(file_path: str, format: Optional[str] = "text") -> Response:
    """
    View the full content of a file
    
    Args:
        file_path: Path to the file
        format: Response format - 'text', 'json', or 'html'
    """
    if file_path not in GLOBAL_VIRTUAL_FILES:
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    
    content = GLOBAL_VIRTUAL_FILES[file_path]
    
    if format == "json":
        return JSONResponse({
            "path": file_path,
            "content": content,
            "size": len(content),
            "lines": len(content.split('\n'))
        })
    elif format == "html":
        # Return HTML with proper formatting
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>{file_path}</title>
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 20px;
                    background: #f5f5f5;
                }}
                .container {{
                    max-width: 1200px;
                    margin: 0 auto;
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }}
                .header {{
                    border-bottom: 2px solid #eee;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }}
                h1 {{
                    color: #333;
                    margin: 0;
                }}
                .meta {{
                    color: #666;
                    font-size: 14px;
                    margin-top: 5px;
                }}
                .content {{
                    white-space: pre-wrap;
                    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
                    font-size: 14px;
                    line-height: 1.6;
                    color: #333;
                }}
                .download-btn {{
                    display: inline-block;
                    padding: 8px 16px;
                    background: #007bff;
                    color: white;
                    text-decoration: none;
                    border-radius: 4px;
                    margin-top: 10px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📄 {file_path}</h1>
                    <div class="meta">
                        Size: {len(content)} bytes | Lines: {len(content.splitlines())}
                    </div>
                    <a href="/api/v1/file-viewer/download/{file_path}" class="download-btn">
                        ⬇️ Download File
                    </a>
                </div>
                <pre class="content">{content}</pre>
            </div>
        </body>
        </html>
        """
        return Response(content=html_content, media_type="text/html")
    else:
        # Return plain text (default)
        return PlainTextResponse(content, headers={
            "Content-Disposition": f"inline; filename={file_path}"
        })

@router.get("/download/{file_path:path}")
async def download_file(file_path: str) -> Response:
    """Download a file from the virtual filesystem"""
    if file_path not in GLOBAL_VIRTUAL_FILES:
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    
    content = GLOBAL_VIRTUAL_FILES[file_path]
    
    # Determine content type based on file extension
    if file_path.endswith('.json'):
        media_type = "application/json"
    elif file_path.endswith('.txt'):
        media_type = "text/plain"
    elif file_path.endswith('.md'):
        media_type = "text/markdown"
    elif file_path.endswith('.csv'):
        media_type = "text/csv"
    elif file_path.endswith('.html'):
        media_type = "text/html"
    else:
        media_type = "application/octet-stream"
    
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={file_path}",
            "Content-Length": str(len(content))
        }
    )

@router.delete("/delete/{file_path:path}")
async def delete_file(file_path: str) -> Dict[str, Any]:
    """Delete a file from the virtual filesystem"""
    if file_path not in GLOBAL_VIRTUAL_FILES:
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    
    del GLOBAL_VIRTUAL_FILES[file_path]
    logger.info(f"🗑️ Deleted file: {file_path}")
    
    return {
        "status": "success",
        "message": f"File {file_path} deleted",
        "remaining_files": len(GLOBAL_VIRTUAL_FILES)
    }

@router.delete("/clear")
async def clear_all_files() -> Dict[str, Any]:
    """Clear all files from the virtual filesystem"""
    count = len(GLOBAL_VIRTUAL_FILES)
    GLOBAL_VIRTUAL_FILES.clear()
    logger.info(f"🗑️ Cleared all {count} files from virtual filesystem")
    
    return {
        "status": "success",
        "message": f"Cleared {count} files",
        "remaining_files": 0
    }