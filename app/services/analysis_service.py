import os
import tempfile
import datetime
from bson import ObjectId
from fastapi import HTTPException
from langchain_openai import ChatOpenAI
from markitdown import MarkItDown

from app.database import document_analysis_db, contents_db
from app.models import MindMap, Summary
from app.services import storage_service

# Define structured LLMs for analysis
mindmap_llm = ChatOpenAI(model="gpt-4.1-mini").with_structured_output(MindMap)
summary_llm = ChatOpenAI(model="gpt-4.1-mini").with_structured_output(Summary)

async def _get_document_text(content_doc: dict) -> str:
    """Helper to retrieve raw file bytes, process with MarkItDown, and return text."""
    checksum = content_doc.get("checksum")
    file_info = content_doc.get("fileInfo", {})
    suffix = file_info.get("suffix")

    if not checksum or not suffix:
        raise HTTPException(status_code=500, detail="Document metadata is incomplete.")

    file_bytes = await storage_service.get_file_bytes(checksum, suffix)
    
    tmp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        
        return MarkItDown().convert(tmp_path).text_content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract text from document: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

async def get_or_create_analysis(
    content_id: str,
    user_id: ObjectId,
    analysis_type: str, # "mindMap" or "summary"
    regenerate: bool = False
) -> dict:
    """Generic function to get or create a mind map or summary for a document."""
    cid = ObjectId(content_id)

    # 1. Handle regeneration by deleting the existing item first
    if regenerate:
        await document_analysis_db.delete_one({"contentId": cid, "userId": user_id, "type": analysis_type})
    else:
        # 2. If not regenerating, check for an existing item and return it
        existing = await document_analysis_db.find_one({"contentId": cid, "userId": user_id, "type": analysis_type})
        if existing:
            return existing

    # 3. Get the source document to extract its text
    content_doc = await contents_db.find_one({"_id": cid, "userId": user_id})
    if not content_doc:
        raise HTTPException(status_code=404, detail="Source document not found.")

    text_content = await _get_document_text(content_doc)
    
    # 4. Generate the new data using the appropriate LLM
    if analysis_type == "mindMap":
        prompt = f"Create a comprehensive, hierarchical mind map based on the following text. Identify the central topic and branch out into key concepts and sub-points.\n\nText:\n---\n{text_content}"
        generated_data = await mindmap_llm.ainvoke(prompt)
    elif analysis_type == "summary":
        prompt = f"Provide a concise yet comprehensive summary of the following text, capturing the main ideas and key arguments.\n\nText:\n---\n{text_content}"
        generated_data = await summary_llm.ainvoke(prompt)
    else:
        raise ValueError("Invalid analysis type specified.")

    # 5. Save the new analysis item to the database
    now = datetime.datetime.now(datetime.timezone.utc)
    new_doc = {
        "userId": user_id,
        "collectionId": content_doc["collectionId"],
        "contentId": cid,
        "type": analysis_type,
        "data": generated_data.model_dump(),
        "createdAt": now,
        "updatedAt": now
    }
    insert_result = await document_analysis_db.insert_one(new_doc)
    new_doc["_id"] = insert_result.inserted_id
    
    return new_doc

async def delete_document_mind_map(content_id: str, user_id: ObjectId):
    """Deletes a mind map for a specific document."""
    result = await document_analysis_db.delete_one({
        "contentId": ObjectId(content_id),
        "userId": user_id,
        "type": "mindMap"
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Mind map for this document not found.")
