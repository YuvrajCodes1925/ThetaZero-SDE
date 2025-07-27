from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId

from app.auth import get_current_user_id
from app.database import contents_db
from app.models import DocumentChatRequest, ChatMessage
from app.services import chat_service

router = APIRouter(
    prefix="/collections/{collection_id}/sources/{source_id}",
    tags=["Document Chat"]
)

async def verify_source_ownership(
    collection_id: str,
    source_id: str,
    user_id: ObjectId = Depends(get_current_user_id)
):
    """Dependency to verify user owns the collection and the source belongs to it."""
    if not (ObjectId.is_valid(collection_id) and ObjectId.is_valid(source_id)):
        raise HTTPException(status_code=400, detail="Invalid ID format.")

    content_doc = await contents_db.find_one({
        "_id": ObjectId(source_id),
        "collectionId": ObjectId(collection_id),
        "userId": user_id
    })
    if not content_doc:
        raise HTTPException(status_code=404, detail="Source not found in this collection or access denied.")
    
    return user_id

@router.post("/chat", response_model=ChatMessage)
async def chat_with_document(
    collection_id: str,
    source_id: str,
    request: DocumentChatRequest,
    user_id: ObjectId = Depends(verify_source_ownership)
):
    """
    Handles a chat request for a single document.
    The client provides a session_id to maintain an ephemeral chat state.
    """
    # The service function now directly returns the ChatMessage model
    return await chat_service.get_document_chat_response(
        collection_id=collection_id,
        source_id=source_id,
        request=request,
        user_id=user_id
    )
