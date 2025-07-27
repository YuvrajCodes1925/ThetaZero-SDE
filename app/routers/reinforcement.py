from fastapi import APIRouter, Depends, HTTPException, Response, Query
from bson import ObjectId

from app.database import reinforcement_db, collections_db
from app.models import (
    ReinforcementItemOut, GenerationRequest, TeachMeBackQuestionRequest,
    TeachMeBackAnswerRequest, TeachMeBackEvaluation
)
from app.auth import get_current_user_id
from app.services import generation_service

router = APIRouter(
    prefix="/collections/{collection_id}",
    tags=["Reinforcement Tools"]
)

# Generic Reinforcement Item Management
@router.get("/reinforcements", response_model=list[ReinforcementItemOut])
async def get_all_reinforcement_items(collection_id: str, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    cid = ObjectId(collection_id)
    if not await collections_db.find_one({"_id": cid, "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found.")

    items = []
    cursor = reinforcement_db.find({"collectionId": cid, "userId": user_id})
    async for doc in cursor:
        items.append(ReinforcementItemOut(**doc))
    return items

@router.get("/reinforcements/{reinforcement_id}", response_model=ReinforcementItemOut)
async def get_reinforcement_item(collection_id: str, reinforcement_id: str, user_id: ObjectId = Depends(get_current_user_id)):
    if not (ObjectId.is_valid(collection_id) and ObjectId.is_valid(reinforcement_id)):
        raise HTTPException(status_code=400, detail="Invalid ID format.")
    
    item = await reinforcement_db.find_one({
        "_id": ObjectId(reinforcement_id),
        "collectionId": ObjectId(collection_id),
        "userId": user_id
    })
    if not item:
        raise HTTPException(status_code=404, detail="Reinforcement item not found.")
    return ReinforcementItemOut(**item)

@router.delete("/reinforcements/{reinforcement_id}", status_code=204)
async def delete_reinforcement_item(collection_id: str, reinforcement_id: str, user_id: ObjectId = Depends(get_current_user_id)):
    if not (ObjectId.is_valid(collection_id) and ObjectId.is_valid(reinforcement_id)):
        raise HTTPException(status_code=400, detail="Invalid ID format.")
        
    delete_result = await reinforcement_db.delete_one({
        "_id": ObjectId(reinforcement_id),
        "collectionId": ObjectId(collection_id),
        "userId": user_id
    })
    if delete_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reinforcement item not found.")
    return Response(status_code=204)

# Specific Generation Endpoints
@router.get("/mindmap", response_model=ReinforcementItemOut)
async def get_or_create_mindmap(
    collection_id: str, 
    user_id: ObjectId = Depends(get_current_user_id),
    regenerate: bool = Query(False, description="Set to true to force regeneration of the mind map.")
):
    """
    Gets the existing mind map for a collection.
    If no mind map exists, it generates, saves, and returns a new one.
    If regenerate=true, it deletes the existing mind map and generates a new one.
    """
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    if not await collections_db.find_one({"_id": ObjectId(collection_id), "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found.")
    
    # MODIFICATION: Pass the regenerate flag to the service function
    mindmap_doc = await generation_service.create_mind_map(collection_id, user_id, regenerate=regenerate)
    return ReinforcementItemOut(**mindmap_doc)

@router.delete("/mindmap", status_code=204)
async def delete_mindmap(collection_id: str, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    cid = ObjectId(collection_id)
    if not await collections_db.find_one({"_id": cid, "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found.")

    await reinforcement_db.delete_one({"collectionId": cid, "userId": user_id, "type": "mindMap"})
    return Response(status_code=204)

@router.post("/mcq", response_model=ReinforcementItemOut, status_code=201)
async def create_mcq(collection_id: str, request: GenerationRequest, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID.")
    if not await collections_db.find_one({"_id": ObjectId(collection_id), "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found.")
        
    mcq_doc = await generation_service.create_mcq_set(collection_id, request, user_id)
    return ReinforcementItemOut(**mcq_doc)

@router.post("/quiz", response_model=ReinforcementItemOut, status_code=201)
async def create_quiz(collection_id: str, request: GenerationRequest, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID.")
    if not await collections_db.find_one({"_id": ObjectId(collection_id), "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found.")

    quiz_doc = await generation_service.create_quiz_set(collection_id, request, user_id)
    return ReinforcementItemOut(**quiz_doc)

@router.post("/flashcards", response_model=ReinforcementItemOut, status_code=201)
async def create_flashcards(collection_id: str, request: GenerationRequest, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID.")
    if not await collections_db.find_one({"_id": ObjectId(collection_id), "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found.")
    
    flashcard_doc = await generation_service.create_flashcard_set(collection_id, request, user_id)
    return ReinforcementItemOut(**flashcard_doc)

# Teach Me Back Endpoints
@router.post("/teachmeback", response_model=ReinforcementItemOut, status_code=201)
async def create_or_replace_teach_me_back(collection_id: str, request: TeachMeBackQuestionRequest, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    if not await collections_db.find_one({"_id": ObjectId(collection_id), "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found.")
        
    tmb_doc = await generation_service.create_teach_me_back_question(collection_id, request, user_id)
    return ReinforcementItemOut(**tmb_doc)

@router.get("/teachmeback", response_model=ReinforcementItemOut)
async def get_teach_me_back_item(collection_id: str, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    cid = ObjectId(collection_id)
    if not await collections_db.find_one({"_id": cid, "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found.")
        
    existing_item = await reinforcement_db.find_one({"collectionId": cid, "userId": user_id, "type": "teachMeBack"})
    if not existing_item:
        raise HTTPException(status_code=404, detail="No active 'Teach Me Back' item found.")
    return ReinforcementItemOut(**existing_item)

@router.post("/teachmeback/evaluate", response_model=TeachMeBackEvaluation)
async def evaluate_teach_me_back_answer(collection_id: str, request: TeachMeBackAnswerRequest, user_id: ObjectId = Depends(get_current_user_id)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=400, detail="Invalid collection ID format.")
    if not await collections_db.find_one({"_id": ObjectId(collection_id), "userId": user_id}):
        raise HTTPException(status_code=404, detail="Collection not found.")

    evaluation = await generation_service.evaluate_teach_me_back_answer(collection_id, request, user_id)
    return evaluation
