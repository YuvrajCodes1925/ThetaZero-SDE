import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from bson import ObjectId
from qdrant_client import models
from qdrant_client.http.models import VectorParams, Distance

from app.database import collections_db, contents_db, qdrant_client
from app.models import CollectionOut, ContentOut, RenameSourceRequest, YoutubeRequest, RenameCollectionRequest
from app.auth import get_current_user_id
from app.services import collection_service
from app.services import storage_service
from app.services.collection_service import ALLOWED_MIME_TYPES

router = APIRouter(
    prefix="/collections",
    tags=["Collections & Sources"]
)

@router.get("", response_model=list[CollectionOut])
async def get_all_collections(user_id: ObjectId = Depends(get_current_user_id)):
    collections_list = []
    cursor = collections_db.find({"userId": user_id})
    async for doc in cursor:
        collections_list.append(CollectionOut(**doc))
    return collections_list

@router.post("", response_model=CollectionOut, status_code=201)
async def create_collection(name: str, user_id: ObjectId = Depends(get_current_user_id)):
    now = datetime.datetime.now(datetime.timezone.utc)
    new_collection = {"userId": user_id, "name": name, "totalChars": 0, "createdAt": now, "updatedAt": now}
    result = await collections_db.insert_one(new_collection)
    collection_id = result.inserted_id
    
    # Ensure Qdrant collection is created
    qdrant_client.recreate_collection(
        collection_name=str(collection_id),
        vectors_config=VectorParams(size=3072, distance=Distance.COSINE)
    )
    
    new_collection["_id"] = collection_id
    return new_collection

@router.get("/{collection_id}", response_model=CollectionOut)
async def get_single_collection(collection_id: str, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    
    collection_doc = await collections_db.find_one({"_id": ObjectId(collection_id), "userId": user_id})
    if not collection_doc:
        raise HTTPException(status_code=404, detail="Collection not found or you do not have access.")
    return CollectionOut(**collection_doc)

@router.patch("/{collection_id}", response_model=CollectionOut)
async def rename_collection(collection_id: str, request: RenameCollectionRequest, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    
    updated_doc = await collection_service.rename_collection(collection_id, request.newName, user_id)
    return CollectionOut(**updated_doc)

@router.delete("/{collection_id}", status_code=204)
async def delete_collection(collection_id: str, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
        
    await collection_service.delete_collection_and_dependents(collection_id, user_id)
    return Response(status_code=204)

@router.get("/{collection_id}/sources", response_model=list[ContentOut])
async def get_collection_sources(collection_id: str, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    cid = ObjectId(collection_id)
    
    if not await collections_db.find_one({"_id": cid, "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found or you do not have access.")
        
    sources_list = []
    cursor = contents_db.find({"collectionId": cid})
    async for doc in cursor:
        sources_list.append(ContentOut(**doc))
    return sources_list

@router.post("/{collection_id}/upload", response_model=list[ContentOut], status_code=201)
async def upload_multiple_files(collection_id: str, files: list[UploadFile] = File(...), user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    cid = ObjectId(collection_id)

    if not await collections_db.find_one({"_id": cid, "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found or you do not have access.")

    current_doc_count = await contents_db.count_documents({"collectionId": cid})
    if current_doc_count + len(files) > 20:
        raise HTTPException(
            status_code=413,
            detail=f"This upload would exceed the 20 document limit. You have {current_doc_count} documents."
        )

    processed_docs = await collection_service.process_uploaded_files(collection_id, files, user_id)
    return processed_docs

@router.post("/{collection_id}/upload/youtube", response_model=ContentOut, status_code=201)
async def upload_youtube_url(collection_id: str, request: YoutubeRequest, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    cid = ObjectId(collection_id)

    if not await collections_db.find_one({"_id": cid, "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found or you do not have access.")

    current_doc_count = await contents_db.count_documents({"collectionId": cid})
    if current_doc_count + 1 > 20:
        raise HTTPException(status_code=413, detail="This upload would exceed the 20 document limit.")

    content_doc = await collection_service.process_youtube_url(collection_id, request.url, user_id)
    return content_doc

@router.patch("/{collection_id}/sources/{source_id}", response_model=ContentOut)
async def rename_source(collection_id: str, source_id: str, request: RenameSourceRequest, user_id: ObjectId = Depends(get_current_user_id)):
    if not (ObjectId.is_valid(collection_id) and ObjectId.is_valid(source_id)):
        raise HTTPException(status_code=400, detail="Invalid ID format.")

    if not await collections_db.find_one({"_id": ObjectId(collection_id), "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found or you do not have access.")
    
    updated_doc = await collection_service.rename_source_in_dbs(collection_id, source_id, request.newName)
    return ContentOut(**updated_doc)

@router.delete("/{collection_id}/sources/{source_id}", status_code=204)
async def delete_source(collection_id: str, source_id: str, user_id: ObjectId = Depends(get_current_user_id)):
    if not (ObjectId.is_valid(collection_id) and ObjectId.is_valid(source_id)):
        raise HTTPException(status_code=400, detail="Invalid ID format.")

    if not await collections_db.find_one({"_id": ObjectId(collection_id), "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found or you do not have access.")

    await collection_service.delete_source_from_dbs(collection_id, source_id)
    return Response(status_code=204)

@router.get("/{collection_id}/sources/{source_id}/file")
async def get_source_file(collection_id: str, source_id: str, user_id: ObjectId = Depends(get_current_user_id)):
    """
    Retrieves the actual file content for a source document.
    This is used for previewing the file on the frontend.
    """
    if not (ObjectId.is_valid(collection_id) and ObjectId.is_valid(source_id)):
        raise HTTPException(status_code=400, detail="Invalid ID format.")

    # Verify ownership and get the document in a single database call
    source_doc = await contents_db.find_one({
        "_id": ObjectId(source_id),
        "collectionId": ObjectId(collection_id),
        "userId": user_id
    })

    if not source_doc:
        raise HTTPException(status_code=404, detail="Source not found or access denied.")

    file_info = source_doc.get("fileInfo", {})
    checksum = source_doc.get("checksum")
    suffix = file_info.get("suffix")
    doc_format = file_info.get("format")

    if not checksum or not suffix or not doc_format:
        raise HTTPException(status_code=500, detail="Document metadata is incomplete and file cannot be retrieved.")

    # Determine the correct MIME type based on the format stored in the database
    media_type = "application/octet-stream"  # Default fallback
    for mime, details in ALLOWED_MIME_TYPES.items():
        if details["format"] == doc_format:
            media_type = mime
            break
    
    file_bytes = await storage_service.get_file_bytes(checksum, suffix)

    return Response(content=file_bytes, media_type=media_type)
