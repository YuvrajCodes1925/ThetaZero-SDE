import datetime
import math
import random
from bson import ObjectId
from fastapi import HTTPException
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from qdrant_client import models
from pymongo import ReturnDocument

from app.database import reinforcement_db, qdrant_client, collections_db
from app.models import (
    MindMap, MCQSet, QuizSet, FlashcardSet, TeachMeBackData,
    TeachMeBackEvaluation, GenerationRequest, TeachMeBackQuestionRequest,
    TeachMeBackAnswerRequest, Question
)
from app.services.qdrant_service import get_full_text_from_collection

# Define structured LLMs once
mindmap_llm = ChatOpenAI(model="gpt-4.1-mini").with_structured_output(MindMap)
mcq_llm = ChatOpenAI(model="gpt-4.1-mini").with_structured_output(MCQSet)
quiz_llm = ChatOpenAI(model="gpt-4.1-mini").with_structured_output(QuizSet)
flashcard_llm = ChatOpenAI(model="gpt-4.1-mini").with_structured_output(FlashcardSet)
question_gen_llm = ChatOpenAI(model="gpt-4o").with_structured_output(Question)
evaluation_llm = ChatOpenAI(model="gpt-4o").with_structured_output(TeachMeBackEvaluation)

async def create_mind_map(collection_id: str, user_id: ObjectId, regenerate: bool = False) -> dict:
    cid = ObjectId(collection_id)

    if regenerate:
        await reinforcement_db.delete_one({"collectionId": cid, "userId": user_id, "type": "mindMap"})
    else:
        existing = await reinforcement_db.find_one({"collectionId": cid, "userId": user_id, "type": "mindMap"})
        if existing:
            return existing

    full_text = await get_full_text_from_collection(collection_id)
    prompt = f"""Based on the following text, which is compiled from numerous overlapping document chunks, create a comprehensive mind map. It is critical that you first synthesize the information to understand the core concepts and relationships, **ignoring any repetitive text that results from the overlapping chunks**. Your goal is to build a logically structured mind map of the unique topics present. The mind map must start with one or more root nodes representing the main topics. Each root node should branch out hierarchically into sub-topics and key concepts.

Here is the raw, overlapping content:
---
{full_text}
"""
    try:
        mindmap_data = await mindmap_llm.ainvoke(prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate mind map from LLM: {e}")
    
    now = datetime.datetime.now(datetime.timezone.utc)
    new_doc = {
        "type": "mindMap",
        "sourceType": "collection",
        "collectionId": cid,
        "userId": user_id,
        "data": mindmap_data.model_dump(),
        "createdAt": now,
        "difficulty": None
    }
    
    result = await reinforcement_db.insert_one(new_doc)
    new_doc["_id"] = result.inserted_id
    return new_doc

async def create_mcq_set(collection_id: str, request: GenerationRequest, user_id: ObjectId) -> dict:
    cid = ObjectId(collection_id)
    collection_doc = await collections_db.find_one({"_id": cid}) # Assumes ownership already checked
    full_text = await get_full_text_from_collection(collection_id)
    
    content_ceiling = collection_doc.get("totalChars", 0) // 2000
    num_to_generate = max(1, min(request.numberOfItems, content_ceiling))

    prompt = f"""
Based on the following text, which is compiled from overlapping document chunks, generate a set of {num_to_generate} Multiple Choice Questions (MCQs).
**First, synthesize the information to understand the core concepts, ignoring any repetitive text from the chunking process.**

The questions should be of **{request.difficulty}** difficulty.
- **easy**: Test basic recall of definitions and key facts directly stated in the text.
- **medium**: Require some inference or connection between different parts of the text.
- **hard**: Test deeper understanding, application of concepts, or synthesis of multiple ideas.

For each MCQ, provide:
1. A clear question.
2. Exactly four distinct options.
3. The single correct answer.

Here is the raw, overlapping content:
---
{full_text}
"""
    try:
        mcq_data = await mcq_llm.ainvoke(prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate MCQs from LLM: {e}")

    now = datetime.datetime.now(datetime.timezone.utc)
    new_doc = {
        "type": "mcq", "sourceType": "collection", "collectionId": cid, "userId": user_id,
        "difficulty": request.difficulty, "data": mcq_data.model_dump(), "createdAt": now
    }
    result = await reinforcement_db.insert_one(new_doc)
    new_doc["_id"] = result.inserted_id
    return new_doc


async def create_quiz_set(collection_id: str, request: GenerationRequest, user_id: ObjectId) -> dict:
    cid = ObjectId(collection_id)
    collection_doc = await collections_db.find_one({"_id": cid})
    full_text = await get_full_text_from_collection(collection_id)

    content_ceiling = collection_doc.get("totalChars", 0) // 1800
    total_questions = max(3, min(request.numberOfItems, content_ceiling))
    num_mcq = math.ceil(total_questions * 0.4)
    num_tf = math.ceil(total_questions * 0.3)
    num_sa = total_questions - num_mcq - num_tf

    prompt = f"""
Based on the following text, which is compiled from overlapping document chunks, generate a varied quiz to test a user's knowledge.
**First, synthesize the information to understand the core concepts, ignoring any repetitive text from the chunking process.**

The quiz should have a total of {total_questions} questions and be of **{request.difficulty}** difficulty.
The quiz must contain a mix of the following question types:
- Exactly {num_mcq} Multiple Choice questions (with 4 options each).
- Exactly {num_tf} True/False questions.
- Exactly {num_sa} Short Answer questions (provide an ideal answer for each).

Difficulty Guide:
- **easy**: Test basic recall of definitions and key facts directly stated in the text.
- **medium**: Require some inference or connection between different parts of the text.
- **hard**: Test deeper understanding, application of concepts, or synthesis of multiple ideas.

Here is the raw, overlapping content:
---
{full_text}
"""
    try:
        quiz_data = await quiz_llm.ainvoke(prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate quiz from LLM: {e}")

    now = datetime.datetime.now(datetime.timezone.utc)
    new_doc = {
        "type": "quiz", "sourceType": "collection", "collectionId": cid, "userId": user_id,
        "difficulty": request.difficulty, "data": quiz_data.model_dump(), "createdAt": now
    }
    result = await reinforcement_db.insert_one(new_doc)
    new_doc["_id"] = result.inserted_id
    return new_doc


async def create_flashcard_set(collection_id: str, request: GenerationRequest, user_id: ObjectId) -> dict:
    cid = ObjectId(collection_id)
    collection_doc = await collections_db.find_one({"_id": cid})
    full_text = await get_full_text_from_collection(collection_id)

    content_ceiling = collection_doc.get("totalChars", 0) // 1500
    num_to_generate = max(3, min(request.numberOfItems, content_ceiling))

    prompt = f"""
Based on the text below, which is compiled from overlapping chunks, generate {num_to_generate} flashcards of **{request.difficulty}** difficulty.
First, synthesize the information to understand the core concepts, ignoring any repetitive text.

For each flashcard:
- The 'front' should be a concise question, key term, or concept.
- The 'back' should be the corresponding answer or a comprehensive definition.

Difficulty Guide:
- **easy**: Focus on key definitions and straightforward facts.
- **medium**: Prompt for connections between ideas or explanations of processes.
- **hard**: Ask for synthesis of multiple concepts, comparisons, or implications.

Text:
---
{full_text}
"""
    try:
        flashcard_data = await flashcard_llm.ainvoke(prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate flashcards from LLM: {e}")

    now = datetime.datetime.now(datetime.timezone.utc)
    new_doc = {
        "type": "flashcardSet", "sourceType": "collection", "collectionId": cid, "userId": user_id,
        "difficulty": request.difficulty, "data": flashcard_data.model_dump(), "createdAt": now
    }
    result = await reinforcement_db.insert_one(new_doc)
    new_doc["_id"] = result.inserted_id
    return new_doc


async def create_teach_me_back_question(collection_id: str, request: TeachMeBackQuestionRequest, user_id: ObjectId) -> dict:
    cid = ObjectId(collection_id)
    await reinforcement_db.delete_one({"collectionId": cid, "userId": user_id, "type": "teachMeBack"})

    points, _ = qdrant_client.scroll(collection_name=collection_id, limit=100, with_payload=False, with_vectors=True)
    if not points:
        raise HTTPException(status_code=404, detail="Not enough content to generate a question.")

    random_point = random.choice(points)
    if not random_point.vector:
        raise HTTPException(status_code=500, detail="A random vector could not be retrieved.")

    hits = qdrant_client.search(collection_name=collection_id, query_vector=random_point.vector, limit=5, with_payload=True)
    context_str = "\n\n---\n\n".join([hit.payload.get("page_content", "") for hit in hits])
    if not context_str.strip():
        raise HTTPException(status_code=404, detail="Could not form a valid context from the cluster.")

    system_prompt = f"""
You are an expert educator creating a formal exam question.
Your task is to generate a single, open-ended question based on the user's provided text.

RULES:
1.  The question must test a student's understanding of the provided text at a '{request.difficulty}' difficulty level.
2.  The question must be completely self-contained, grammatically precise, and professional.
3.  **CRITICAL RULE: You MUST NOT mention the source text in the question itself. Do NOT use phrases like "Based on the text," "According to the passage," "as discussed in the text," or any similar phrasing. The question should be a pure, standalone question as if it were printed on an official exam paper.**
"""
    human_prompt = f"""
Here is the text to base the question on:
---
{context_str}
---
Now, generate the question.
"""
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=human_prompt)]
    generated_question_model = await question_gen_llm.ainvoke(messages)

    now = datetime.datetime.now(datetime.timezone.utc)
    tmb_data = TeachMeBackData(question=generated_question_model.question, context=context_str)
    new_doc = {
        "type": "teachMeBack", "sourceType": "collection", "collectionId": cid, "userId": user_id,
        "difficulty": request.difficulty, "data": tmb_data.model_dump(), "createdAt": now
    }
    result = await reinforcement_db.insert_one(new_doc)
    new_doc["_id"] = result.inserted_id
    return new_doc


async def evaluate_teach_me_back_answer(collection_id: str, request: TeachMeBackAnswerRequest, user_id: ObjectId) -> TeachMeBackEvaluation:
    cid = ObjectId(collection_id)
    tmb_doc = await reinforcement_db.find_one({"collectionId": cid, "userId": user_id, "type": "teachMeBack"})
    if not tmb_doc:
        raise HTTPException(status_code=404, detail="No active 'Teach Me Back' question found to evaluate.")

    tmb_data = TeachMeBackData(**tmb_doc['data'])
    difficulty = tmb_doc.get("difficulty", "medium")

    prompt = f"""
You are an expert AI teaching assistant. Your task is to evaluate a user's answer to a question based *only* on the provided source text.

The original question was designed to be of **{difficulty}** difficulty. Adjust your grading criteria accordingly:
- For 'easy' questions, be strict about factual recall.
- For 'medium' questions, focus on the correctness of the explanation and connections.
- For 'hard' questions, reward synthesis and logical inference based on the text.

You must provide:
1.  Constructive, helpful feedback.
2.  An objective accuracy_score from 0.0 (completely wrong) to 1.0 (perfectly correct and complete).
3.  A list of important `missed_points` from the source text.
4.  A list of `incorrect_points` from the user's answer.

The evaluation must be fair and strictly based on the provided context.

**Source Text:**
---
{tmb_data.context}
---

**Question Asked:**
"{tmb_data.question}"

**User's Answer:**
"{request.answer}"
"""
    try:
        evaluation = await evaluation_llm.ainvoke(prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get evaluation from LLM: {e}")

    update_result = await reinforcement_db.update_one(
        {"_id": tmb_doc["_id"]},
        {"$set": {"data.user_answer": request.answer, "data.evaluation": evaluation.model_dump()}}
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=500, detail="Failed to save evaluation.")

    return evaluation
