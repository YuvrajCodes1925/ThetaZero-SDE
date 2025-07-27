from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId

from app.database import users_db
from app.models import UserOut
from app.auth import get_current_user_id

router = APIRouter()

@router.get("/me", response_model=UserOut)
async def get_current_user_account(user_id: ObjectId = Depends(get_current_user_id)):
    """
    Retrieves the account details for the currently authenticated user.
    """
    user_doc = await users_db.find_one({"_id": user_id})
    if not user_doc:
        # This case is unlikely if auth is working, but it's a good safeguard.
        raise HTTPException(status_code=404, detail="User account not found.")

    return UserOut(**user_doc)
