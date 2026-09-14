"""Image/file uploads in MongoDB GridFS, using the existing database connection."""
import inspect
import os
import uuid
import logging
from fastapi import Request, UploadFile, File, HTTPException, Response
from gridfs.errors import NoFile
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from core import api, db, now_utc, gen_id, require_role

_logger = logging.getLogger("tony-yoga.uploads")

MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))  # 10 MB

storage = AsyncIOMotorGridFSBucket(db, bucket_name="uploaded_objects")
APP_NAME = "tony-yoga"

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp",
}

DOC_MIME_TYPES = {
    "pdf": "application/pdf",
    "epub": "application/epub+zip",
}
MAX_DOC_BYTES = int(os.environ.get("MAX_DOC_BYTES", str(50 * 1024 * 1024)))  # 50 MB for eBooks

async def _put_object(path: str, data: bytes, content_type: str) -> dict:
    await storage.upload_from_stream_with_id(
        path, path, data, metadata={"content_type": content_type})
    return {"path": path, "size": len(data)}


async def _get_object(path: str) -> tuple[bytes, str]:
    stream = await storage.open_download_stream(path)
    try:
        return await stream.read(), (stream.metadata or {}).get("content_type", "application/octet-stream")
    finally:
        close_result = stream.close()
        if inspect.isawaitable(close_result):
            await close_result


@api.post("/admin/uploads")
async def upload_image(request: Request, file: UploadFile = File(...)):
    """Admin uploads an image; returns a public URL under /api/files/{path}."""
    await require_role(request, ["admin"])
    ext = (file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin").lower()
    is_doc = ext in DOC_MIME_TYPES
    if not is_doc and ext not in MIME_TYPES:
        raise HTTPException(400, "Only image (jpg, png, gif, webp) or document (pdf, epub) files are allowed.")
    content_type = DOC_MIME_TYPES[ext] if is_doc else MIME_TYPES[ext]
    folder = "books" if is_doc else "retreats"
    path = f"{APP_NAME}/{folder}/{uuid.uuid4()}.{ext}"
    cap = MAX_DOC_BYTES if is_doc else MAX_UPLOAD_BYTES
    try:
        data = await file.read(cap + 1)
    finally:
        await file.close()
    if len(data) > cap:
        raise HTTPException(413, f"File too large — max {cap // (1024*1024)} MB.")
    try:
        result = await _put_object(path, data, content_type)
    except Exception as e:
        _logger.error("Upload failed (%s)", type(e).__name__)
        raise HTTPException(502, "Upload failed — please try again.")
    stored_path = result["path"]
    try:
        await db.uploaded_files.insert_one({
            "id": gen_id(),
            "storage_path": stored_path,
            "original_filename": file.filename,
            "content_type": content_type,
            "size": result.get("size"),
            "is_deleted": False,
            "created_at": now_utc().isoformat(),
        })
    except Exception as e:
        await storage.delete(stored_path)
        _logger.error("Upload metadata failed (%s)", type(e).__name__)
        raise HTTPException(502, "Upload failed — please try again.")
    return {"url": f"/api/files/{stored_path}", "path": stored_path}


@api.get("/files/{path:path}")
async def serve_file(path: str):
    """Public serve — retreat photos are public marketing content."""
    record = await db.uploaded_files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(404, "File not found")
    try:
        data, content_type = await _get_object(path)
    except NoFile:
        raise HTTPException(404, "File not found")
    except Exception as e:
        _logger.error("File retrieval failed (%s)", type(e).__name__)
        raise HTTPException(502, "Could not load file")
    return Response(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={"Cache-Control": "public, max-age=86400"},
    )
