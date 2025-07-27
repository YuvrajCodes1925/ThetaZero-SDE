from fastapi import HTTPException
from app.database import qdrant_client

async def get_full_text_from_collection(collection_id: str) -> str:
    """Fetches and concatenates all text chunks from a Qdrant collection."""
    all_chunks_content = []
    try:
        next_offset = None
        while True:
            points, next_offset = qdrant_client.scroll(
                collection_name=collection_id,
                limit=256, with_payload=True, offset=next_offset
            )
            for point in points:
                if 'page_content' in point.payload:
                    all_chunks_content.append(point.payload['page_content'])
            if not next_offset:
                break
    except Exception as e:
        # This can happen if the collection doesn't exist in Qdrant.
        raise HTTPException(status_code=404, detail=f"Could not retrieve content from vector store: {e}")

    if not all_chunks_content:
        raise HTTPException(status_code=404, detail="No text content found in this collection.")
    
    return "\n\n".join(all_chunks_content)
