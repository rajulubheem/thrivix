"""
Virtual Files API for checking created files
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, List, Any
import structlog

logger = structlog.get_logger()

router = APIRouter()

@router.get("/virtual-files")
async def list_virtual_files() -> Dict[str, Any]:
    """
    List all files in the virtual filesystem
    """
    try:
        # Import the service to access virtual files
        from app.services.enhanced_swarm_service import EnhancedSwarmService
        
        # Create a service instance to access virtual files
        service = EnhancedSwarmService()
        
        files_info = []
        for filename, content in service.virtual_files.items():
            files_info.append({
                "filename": filename,
                "size": len(content),
                "preview": content[:100] + "..." if len(content) > 100 else content,
                "language": _detect_language(filename)
            })
        
        return {
            "total_files": len(service.virtual_files),
            "files": files_info,
            "message": f"Found {len(service.virtual_files)} files in virtual filesystem"
        }
    except Exception as e:
        logger.error(f"Error listing virtual files: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/virtual-files/{filename}")
async def get_virtual_file(filename: str) -> Dict[str, Any]:
    """
    Get content of a specific virtual file
    """
    try:
        from app.services.enhanced_swarm_service import EnhancedSwarmService
        
        service = EnhancedSwarmService()
        
        if filename not in service.virtual_files:
            raise HTTPException(status_code=404, detail=f"File '{filename}' not found")
        
        content = service.virtual_files[filename]
        
        return {
            "filename": filename,
            "content": content,
            "size": len(content),
            "language": _detect_language(filename)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting virtual file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def _detect_language(filename: str) -> str:
    """Detect language from filename extension"""
    ext_map = {
        ".py": "python",
        ".js": "javascript",
        ".ts": "typescript",
        ".jsx": "jsx",
        ".tsx": "tsx",
        ".html": "html",
        ".css": "css",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".md": "markdown",
        ".txt": "text"
    }
    
    for ext, lang in ext_map.items():
        if filename.endswith(ext):
            return lang
    
    return "text"