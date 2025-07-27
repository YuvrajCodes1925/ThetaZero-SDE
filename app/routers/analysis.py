from fastapi import APIRouter, Depends, HTTPException, Query, Response
from bson import ObjectId

from app.auth import get_current_user_id
from app.database import contents_db
from app.models import DocumentAnalysisOut
from app.services import analysis_service

router = APIRouter(
    prefix="/collections/{collection_id}/sources/{source_id}/analysis",
    tags=["Document Analysis"]
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

@router.get("/mindmap", response_model=DocumentAnalysisOut)
async def get_or_create_document_mindmap(
    source_id: str,
    user_id: ObjectId = Depends(verify_source_ownership),
    regenerate: bool = Query(False, description="Set to true to force regeneration.")
):
    """
    Gets the mind map for a single document.
    Generates a new one if it doesn't exist or if regeneration is requested.
    """
    mindmap_doc = await analysis_service.get_or_create_analysis(
        content_id=source_id,
        user_id=user_id,
        analysis_type="mindMap",
        regenerate=regenerate
    )
    return DocumentAnalysisOut(**mindmap_doc)

@router.delete("/mindmap", status_code=204)
async def delete_document_mindmap(
    source_id: str,
    user_id: ObjectId = Depends(verify_source_ownership)
):
    """Deletes the mind map for a single document."""
    await analysis_service.delete_document_mind_map(source_id, user_id)
    return Response(status_code=204)

@router.get("/summary", response_model=DocumentAnalysisOut)
async def get_or_create_document_summary(
    source_id: str,
    user_id: ObjectId = Depends(verify_source_ownership),
    regenerate: bool = Query(False, description="Set to true to force regeneration.")
):
    """
    Gets the summary for a single document.
    Generates a new one if it doesn't exist or if regeneration is requested.
    Summaries cannot be deleted directly.
    """
    summary_doc = await analysis_service.get_or_create_analysis(
        content_id=source_id,
        user_id=user_id,
        analysis_type="summary",
        regenerate=regenerate
    )
    return DocumentAnalysisOut(**summary_doc)
