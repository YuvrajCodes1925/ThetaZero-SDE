from fastapi import APIRouter, Depends, HTTPException, Response
from bson import ObjectId

from app.database import chats_db, collections_db
from app.models import ChatSessionOut, ChatRequest, ChatMessage
from app.auth import get_current_user_id
from app.services import chat_service

router = APIRouter(
    prefix="/collections/{collection_id}/chat",
    tags=["Chat"]
)

@router.post("", response_model=ChatMessage)
async def chat_with_collection(collection_id: str, request: ChatRequest, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    
    if not await collections_db.find_one({"_id": ObjectId(collection_id), "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found or you do not have access.")

    assistant_message = await chat_service.get_chat_response(collection_id, request, user_id)
    return assistant_message

@router.get("_session", response_model=ChatSessionOut) # Using _session to avoid route collision with /chat
async def get_chat_session(collection_id: str, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    
    if not await collections_db.find_one({"_id": ObjectId(collection_id), "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found or you do not have access.")
        
    session_doc = await chats_db.find_one({"collectionId": ObjectId(collection_id), "userId": user_id})
    if not session_doc:
        raise HTTPException(status_code=404, detail="No chat session has been started for this collection.")
        
    return ChatSessionOut(**session_doc)

@router.delete("_session", status_code=204)
async def delete_chat_session(collection_id: str, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    cid = ObjectId(collection_id)

    if not await collections_db.find_one({"_id": cid, "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found or you do not have access.")
    
    await chats_db.delete_one({"collectionId": cid, "userId": user_id})
    return Response(status_code=204)
