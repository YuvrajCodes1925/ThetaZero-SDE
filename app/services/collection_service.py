import os
import tempfile
import datetime
from fastapi import UploadFile, HTTPException
from bson import ObjectId
from markitdown import MarkItDown
from pymongo import ReturnDocument
from langchain_core.documents import Document
from langchain_text_splitters import TokenTextSplitter
from langchain_qdrant import QdrantVectorStore
from qdrant_client import models

from app.services import storage_service
from app.database import (
    contents_db, collections_db, qdrant_client, embeddings, openai_client,
    chats_db, reinforcement_db, document_analysis_db
)
from app.models import ContentOut
from app.utils import compute_checksum

ALLOWED_MIME_TYPES = {
    "application/pdf": {"suffix": ".pdf", "format": "pdf"},
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {"suffix": ".docx", "format": "docx"},
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {"suffix": ".xlsx", "format": "xlsx"},
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": {"suffix": ".pptx", "format": "pptx"},
    "audio/mpeg": {"suffix": ".mp3", "format": "audio"},
    "audio/wav": {"suffix": ".wav", "format": "audio"},
}

async def process_uploaded_files(
    collection_id: str,
    files: list[UploadFile],
    user_id: ObjectId
) -> list[ContentOut]:
    cid = ObjectId(collection_id)
    vector_store = QdrantVectorStore(client=qdrant_client, collection_name=collection_id, embedding=embeddings)
    processed_docs: list[ContentOut] = []

    for file in files:
        if file.content_type not in ALLOWED_MIME_TYPES:
            # In a real scenario, you might want to report which files failed
            # but for now we raise immediately.
            raise HTTPException(status_code=400, detail=f"Invalid file type for '{file.filename}'.")

        file_bytes = await file.read()
        checksum = compute_checksum(file_bytes)

        # Prevent adding the exact same file to the same collection twice
        if await contents_db.find_one({"collectionId": cid, "checksum": checksum}):
            continue  # Skip duplicate file

        file_details = ALLOWED_MIME_TYPES[file.content_type]
        file_suffix = file_details["suffix"]

        if not await contents_db.find_one({"checksum": checksum}):
            await storage_service.save_file(
                checksum=checksum,
                suffix=file_suffix,
                file_bytes=file_bytes
            )

        file_format = file_details["format"]
        tmp_path = ""
        text_content = ""

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=file_suffix) as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name

            if file_format == "audio":
                with open(tmp_path, "rb") as audio_file:
                    transcription = openai_client.audio.transcriptions.create(
                        file=audio_file,
                        model="whisper-1" # Or your preferred model
                    )
                    text_content = transcription.text
            else:
                text_content = MarkItDown().convert(tmp_path).text_content

        except Exception as e:
            print(f"Error processing file {file.filename}: {e}")
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
            continue # Skip to the next file on error
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)

        char_count = len(text_content)
        now = datetime.datetime.now(datetime.timezone.utc)
        content_doc = {
            "userId": user_id, "collectionId": cid, "sourceType": "document",
            "fileInfo": {
                "filename": file.filename, "format": file_details["format"], 
                "size": len(file_bytes), "location": f"blob/{checksum}",
                "suffix": file_suffix
            },
            "checksum": checksum, "charCount": char_count, "uploadedAt": now
        }
        
        insert_result = await contents_db.insert_one(content_doc)
        content_id = insert_result.inserted_id
        content_doc["_id"] = content_id

        doc = Document(page_content=text_content, metadata={"contentId": str(content_id), "filename": file.filename})
        chunks = TokenTextSplitter(model_name="text-embedding-3-large", chunk_size=800, chunk_overlap=100).split_documents([doc])
        await vector_store.aadd_documents(chunks)
        await collections_db.update_one({"_id": cid}, {"$inc": {"totalChars": char_count}})

        processed_docs.append(ContentOut(**content_doc))

    return processed_docs


async def process_youtube_url(
    collection_id: str,
    url: str,
    user_id: ObjectId
) -> ContentOut:
    cid = ObjectId(collection_id)
    try:
        markdown_result = MarkItDown().convert(url)
        text_content = markdown_result.text_content
        filename = (markdown_result.title or "YouTube Transcript") + ".txt"
        
        text_bytes = text_content.encode('utf-8')
        checksum = compute_checksum(text_bytes)

        if await contents_db.find_one({"collectionId": cid, "checksum": checksum}):
            raise HTTPException(status_code=409, detail="This YouTube video has already been added to the collection.")

        if not await contents_db.find_one({"checksum": checksum}):
            await storage_service.save_file(
                checksum=checksum,
                suffix=".txt",
                file_bytes=text_bytes
            )

        now = datetime.datetime.now(datetime.timezone.utc)
        char_count = len(text_content)
        content_doc = {
            "userId": user_id, "collectionId": cid, "sourceType": "youtube",
            "fileInfo": {
                "filename": filename + ".txt", "format": "youtube", 
                "size": len(text_bytes), "location": url,
                "suffix": ".txt"
            },
            "charCount": char_count, "checksum": checksum, "uploadedAt": now
        }

        insert_result = await contents_db.insert_one(content_doc)
        content_id = insert_result.inserted_id
        content_doc["_id"] = content_id

        await collections_db.update_one({"_id": cid}, {"$inc": {"totalChars": char_count}})
        
        vector_store = QdrantVectorStore(client=qdrant_client, collection_name=collection_id, embedding=embeddings)
        doc = Document(page_content=text_content, metadata={"contentId": str(content_id), "filename": filename})
        chunks = TokenTextSplitter(model_name="text-embedding-3-large", chunk_size=800, chunk_overlap=100).split_documents([doc])
        await vector_store.aadd_documents(chunks)
        
        return ContentOut(**content_doc)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not process YouTube URL. Error: {e}")

async def rename_source_in_dbs(collection_id: str, source_id: str, new_name: str) -> dict:
    cid = ObjectId(collection_id)
    sid = ObjectId(source_id)

    updated_doc = await contents_db.find_one_and_update(
        {"_id": sid, "collectionId": cid},
        {"$set": {"fileInfo.filename": new_name}},
        return_document=True
    )
    if not updated_doc:
        raise HTTPException(status_code=404, detail="Source document not found in this collection.")

    try:
        points, _ = qdrant_client.scroll(
            collection_name=collection_id,
            scroll_filter=models.Filter(must=[models.FieldCondition(key="metadata.contentId", match=models.MatchValue(value=source_id))]),
            limit=10000,
            with_payload=False, with_vectors=False,
        )
        point_ids = [point.id for point in points]
        if point_ids:
            qdrant_client.set_payload(
                collection_name=collection_id,
                payload={"metadata.filename": new_name},
                points=point_ids,
                wait=True,
            )
    except Exception as e:
        # Ideally, you'd implement a rollback for the DB change here.
        raise HTTPException(status_code=500, detail=f"Failed to update Qdrant index: {e}")
    
    return updated_doc

async def delete_source_from_dbs(collection_id: str, source_id: str):
    cid = ObjectId(collection_id)
    sid = ObjectId(source_id)

    source_doc = await contents_db.find_one({"_id": sid, "collectionId": cid})
    if not source_doc:
        raise HTTPException(status_code=404, detail="Source document not found.")

    user_id = source_doc.get("userId")
    checksum = source_doc.get("checksum")
    file_info = source_doc.get("fileInfo", {})
    suffix = file_info.get("suffix")

    delete_result = await contents_db.delete_one({"_id": sid})
    if delete_result.deleted_count == 0:
        # This case is unlikely if find_one succeeded, but good practice.
        raise HTTPException(status_code=404, detail="Source document not found for deletion.")
    
    if checksum and suffix:
        await storage_service.delete_file_if_unreferenced(checksum=checksum, suffix=suffix)
    else:
        print(f"WARN: Cannot perform storage cleanup for source {source_id}. Missing checksum or suffix.")
        
    chars_to_remove = source_doc.get("charCount", 0)
    if chars_to_remove > 0:
        await collections_db.update_one({"_id": cid}, {"$inc": {"totalChars": -chars_to_remove}})

    try:
        qdrant_client.delete(
            collection_name=collection_id,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[models.FieldCondition(key="metadata.contentId", match=models.MatchValue(value=source_id))]
                )
            ),
            wait=True,
        )
    except Exception as e:
        # The primary record is gone, but log the Qdrant failure for manual cleanup.
        print(f"WARN: Failed to delete points for source {source_id} from Qdrant collection {collection_id}: {e}")
    
    if user_id:
        await document_analysis_db.delete_many({
            "contentId": sid,
            "userId": user_id
        })

async def rename_collection(collection_id: str, new_name: str, user_id: ObjectId) -> dict:
    """Renames a collection in the database."""
    cid = ObjectId(collection_id)
    now = datetime.datetime.now(datetime.timezone.utc)
    updated_doc = await collections_db.find_one_and_update(
        {"_id": cid, "userId": user_id},
        {"$set": {"name": new_name, "updatedAt": now}},
        return_document=ReturnDocument.AFTER
    )
    if not updated_doc:
        raise HTTPException(status_code=404, detail="Collection not found or user does not have access.")
    return updated_doc

async def delete_collection_and_dependents(collection_id: str, user_id: ObjectId):
    """Deletes a collection and all its associated data from all databases."""
    cid = ObjectId(collection_id)

    # 1. Verify the collection exists and belongs to the user
    collection_to_delete = await collections_db.find_one({"_id": cid, "userId": user_id})
    if not collection_to_delete:
        raise HTTPException(status_code=404, detail="Collection not found or user does not have access.")

    # When deleting a whole collection, trigger cleanup for all its files
    async for content_doc in contents_db.find({"collectionId": cid}):
        checksum = content_doc.get("checksum")
        file_info = content_doc.get("fileInfo", {})
        suffix = file_info.get("suffix")
        
        # We must delete the doc *first* so the reference count is correct
        await contents_db.delete_one({"_id": content_doc["_id"]})
        
        if checksum and suffix:
            await storage_service.delete_file_if_unreferenced(checksum, suffix)

    # 2. Delete all dependent documents from MongoDB
    await contents_db.delete_many({"collectionId": cid})
    await chats_db.delete_many({"collectionId": cid})
    await reinforcement_db.delete_many({"collectionId": cid})

    # 3. Delete the collection from Qdrant
    try:
        qdrant_client.delete_collection(collection_name=collection_id)
    except Exception as e:
        # Log the error but proceed, as the primary data is being deleted.
        # The Qdrant collection is now orphaned and may need manual cleanup.
        print(f"WARNING: Failed to delete Qdrant collection '{collection_id}'. Error: {e}")

    # 4. Delete the main collection document from MongoDB
    await collections_db.delete_one({"_id": cid})
