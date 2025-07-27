from bson import ObjectId

async def get_current_user_id() -> ObjectId:
    """
    Gets the current user's ID. 
    Replace with your actual auth logic (e.g., decoding a JWT token).
    """
    return ObjectId("6849b5a2922ebe923169e328")
