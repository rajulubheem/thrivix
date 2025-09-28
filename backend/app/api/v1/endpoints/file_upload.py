"""
File Upload Endpoint
Handles file uploads for tools
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import Optional
import os
import shutil
import tempfile
from pathlib import Path
import uuid
from datetime import datetime

from app.core.security import get_current_user

router = APIRouter()

# Upload directory
UPLOAD_DIR = Path(tempfile.gettempdir()) / "tool_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a file for use with tools
    """
    try:
        # Create user-specific directory
        user_id = current_user.get("sub", "anonymous")
        user_dir = UPLOAD_DIR / user_id
        user_dir.mkdir(exist_ok=True)

        # Generate unique filename to prevent collisions
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_id = str(uuid.uuid4())[:8]
        file_extension = Path(file.filename).suffix
        safe_filename = f"{timestamp}_{file_id}{file_extension}"

        # Full path for the uploaded file
        file_path = user_dir / safe_filename

        # Save the uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Return both the full path and relative info
        return {
            "success": True,
            "filename": file.filename,
            "safe_filename": safe_filename,
            "path": str(file_path),
            "size": os.path.getsize(file_path),
            "upload_time": datetime.now().isoformat()
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")
    finally:
        file.file.close()


@router.delete("/upload/{filename}")
async def delete_uploaded_file(
    filename: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete an uploaded file
    """
    try:
        user_id = current_user.get("sub", "anonymous")
        file_path = UPLOAD_DIR / user_id / filename

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        os.remove(file_path)

        return {"success": True, "message": "File deleted successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")


@router.get("/uploads")
async def list_uploaded_files(
    current_user: dict = Depends(get_current_user)
):
    """
    List all uploaded files for the current user
    """
    try:
        user_id = current_user.get("sub", "anonymous")
        user_dir = UPLOAD_DIR / user_id

        if not user_dir.exists():
            return {"files": []}

        files = []
        for file_path in user_dir.iterdir():
            if file_path.is_file():
                files.append({
                    "filename": file_path.name,
                    "path": str(file_path),
                    "size": os.path.getsize(file_path),
                    "modified": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
                })

        return {"files": files}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")