import datetime
from bson import ObjectId
from langchain_qdrant import QdrantVectorStore
from qdrant_client import models as qdrant_models
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.output_parsers import StrOutputParser

from app.database import chats_db, qdrant_client, embeddings, llm
from app.models import ChatMessage, ChatRequest, DocumentChatRequest
from app.utils import format_docs
from app import cache

async def _get_or_create_chat_session(collection_id: ObjectId, user_id: ObjectId) -> dict:
    now = datetime.datetime.now(datetime.timezone.utc)
    session = await chats_db.find_one({"collectionId": collection_id, "userId": user_id})
    if session:
        return session
    new_session_doc = {"collectionId": collection_id, "userId": user_id, "messages": [], "status": "active", "createdAt": now, "updatedAt": now}
    insert_result = await chats_db.insert_one(new_session_doc)
    new_session_doc["_id"] = insert_result.inserted_id
    return new_session_doc

async def _save_chat_messages(session_id: ObjectId, user_message: ChatMessage, assistant_message: ChatMessage):
    await chats_db.update_one(
        {"_id": session_id},
        {"$push": {"messages": {"$each": [user_message.model_dump(), assistant_message.model_dump()]}},
         "$set": {"updatedAt": datetime.datetime.now(datetime.timezone.utc)}}
    )

async def get_chat_response(collection_id: str, request: ChatRequest, user_id: ObjectId) -> ChatMessage:
    cid = ObjectId(collection_id)
    session = await _get_or_create_chat_session(cid, user_id)
    
    vector_store = QdrantVectorStore(client=qdrant_client, collection_name=collection_id, embedding=embeddings)
    retriever = vector_store.as_retriever(search_kwargs={"k": 3})

    retrieved_docs = await retriever.ainvoke(request.query)
    context_str = format_docs(retrieved_docs)

    user_prompt_content = f"""Use the below context to answer the subsequent question. If the answer cannot be found in the context, write "I don't know."

Context:
\"\"\"
{context_str}
\"\"\"

Question: {request.query}
"""
    recent_messages_dicts = session.get("messages", [])[-10:]
    chat_history_messages = []
    for msg in recent_messages_dicts:
        role = msg.get("role")
        content = msg.get("content")
        if role == "user":
            chat_history_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            chat_history_messages.append(AIMessage(content=content))
    
    final_messages = [
        SystemMessage(content="You are a helpful and concise study assistant."),
        *chat_history_messages,
        HumanMessage(content=user_prompt_content)
    ]

    chain = llm | StrOutputParser()
    llm_response = await chain.ainvoke(final_messages)

    user_msg = ChatMessage(role="user", content=request.query)
    assistant_msg = ChatMessage(role="assistant", content=llm_response)
    await _save_chat_messages(session["_id"], user_msg, assistant_msg)

    return assistant_msg

async def get_document_chat_response(
    collection_id: str,
    source_id: str,
    request: DocumentChatRequest,
    user_id: ObjectId
) -> ChatMessage:
    """Handles the logic for a single-document chat session (ephemeral)."""
    user_id_str = str(user_id)
    session_id = request.session_id
    
    # 1. Get history from the cache. This handles all session creation and purging logic.
    history = cache.get_or_create_session_history(session_id, user_id_str)
    
    # 2. Retrieve context from Qdrant using metadata filter
    vector_store = QdrantVectorStore(client=qdrant_client, collection_name=collection_id, embedding=embeddings)
    retriever = vector_store.as_retriever(
        search_kwargs={
            "k": 3,
            "filter": qdrant_models.Filter(
                must=[qdrant_models.FieldCondition(key="metadata.contentId", match=qdrant_models.MatchValue(value=source_id))]
            )
        }
    )
    retrieved_docs = await retriever.ainvoke(request.query)
    context_str = format_docs(retrieved_docs)

    # 3. Construct the prompt with history
    user_prompt_content = f"Use the context below to answer the question. If you don't know, say that.\n\nContext:\n\"\"\"\n{context_str}\n\"\"\"\n\nQuestion: {request.query}"
    
    chat_history_messages = []
    for msg_data in history:
        # history is a list of model dicts, convert back to LangChain messages
        msg = ChatMessage(**msg_data)
        if msg.role == "user":
            chat_history_messages.append(HumanMessage(content=msg.content))
        else:
            chat_history_messages.append(AIMessage(content=msg.content))

    final_messages = [
        SystemMessage(content="You are a helpful and concise study assistant for a specific document."),
        *chat_history_messages,
        HumanMessage(content=user_prompt_content)
    ]

    # 4. Get LLM response
    chain = llm | StrOutputParser()
    llm_response = await chain.ainvoke(final_messages)

    # 5. Save messages to cache
    user_msg = ChatMessage(role="user", content=request.query)
    assistant_msg = ChatMessage(role="assistant", content=llm_response)
    cache.add_messages_to_history(session_id, [user_msg.model_dump(), assistant_msg.model_dump()])

    return assistant_msg
