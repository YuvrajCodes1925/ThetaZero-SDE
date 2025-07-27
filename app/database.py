import os
from pymongo import AsyncMongoClient
from qdrant_client import QdrantClient
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# --- Centralized Setup & Configuration ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MONGO_ENDPOINT = os.getenv("MONGO_ENDPOINT")
QDRANT_ENDPOINT = os.getenv("QDRANT_ENDPOINT")

if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY not found in environment variables.")

# Initialize clients once
llm = ChatOpenAI(model="gpt-4o")
embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
qdrant_client = QdrantClient(url=QDRANT_ENDPOINT, prefer_grpc=True)

# Use the native PyMongo async client, not motor
mongo_client = AsyncMongoClient(MONGO_ENDPOINT)
openai_client = OpenAI(api_key=OPENAI_API_KEY) # For audio transcription

# Get the async database object
db = mongo_client.get_default_database()

# Add a check to ensure a database was specified in the URI
if db is None:
    raise ValueError("No database specified in MONGO_ENDPOINT. Please add it to your connection string (e.g., /mydatabase).")

# Expose database collection objects for services to use
collections_db = db["Collection"]
contents_db = db["Content"]
chats_db = db["ChatSession"]
reinforcement_db = db["ReinforcementItem"]
document_analysis_db = db["DocumentAnalysis"]
users_db = db["User"]
