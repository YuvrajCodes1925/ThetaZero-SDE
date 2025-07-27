import sys
from pymongo import ASCENDING
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import OperationFailure

# --- Collection Schema Definitions ---
SCHEMAS = {
    "User": {
        "$jsonSchema": {
            "bsonType": "object",
            "required": ["name", "email", "preferences", "status", "createdAt", "updatedAt"],
            "properties": {
                "name": {"bsonType": "string"},
                "email": {"bsonType": "string"},
                "preferences": {
                    "bsonType": "object",
                    "required": ["pacing", "preferredStudyTime", "notifications"],
                    "properties": {
                        "pacing": {"enum": ["fast", "balanced", "relaxed"]},
                        "preferredStudyTime": {"enum": ["morning", "evening", "flexible"]},
                        "notifications": {
                            "bsonType": "object",
                            "required": ["enabled", "frequency", "time"],
                            "properties": {
                                "enabled": {"bsonType": "bool"},
                                "frequency": {"enum": ["daily", "weekly"]},
                                "time": {"bsonType": "string"}
                            }
                        }
                    }
                },
                "status": {"enum": ["active", "archived", "deleted"]},
                "createdAt": {"bsonType": "date"},
                "updatedAt": {"bsonType": "date"}
            }
        }
    },
    "Collection": {
        "$jsonSchema": {
            "bsonType": "object",
            "required": ["userId", "name", "totalChars", "createdAt", "updatedAt"],
            "properties": {
                "userId": {"bsonType": "objectId", "description": "must be an ObjectId and is required"},
                "name": {"bsonType": "string", "description": "must be a string and is required"},
                "totalChars": {
                    "bsonType": ["long", "int"],
                    "description": "Total character count of all content in the collection. Defaults to 0."
                },
                "createdAt": {"bsonType": "date", "description": "must be a date and is required"},
                "updatedAt": {"bsonType": "date", "description": "must be a date and is required"}
            }
        }
    },
    "Content": {
        "$jsonSchema": {
            "bsonType": "object",
            "required": ["userId", "collectionId", "sourceType", "fileInfo", "checksum", "uploadedAt"],
            "properties": {
                "_id": {"bsonType": "objectId"},
                "userId": {"bsonType": "objectId", "description": "Must be an ObjectId and is required."},
                "collectionId": {"bsonType": "objectId", "description": "Must be an ObjectId and is required."},
                "sourceType": {
                    "enum": ["document", "youtube", "text", "audio"],
                    "description": "Can only be one of the enum values and is required."
                },
                "fileInfo": {
                    "bsonType": "object",
                    "required": ["filename", "format", "size", "location"],
                    "properties": {
                        "filename": {"bsonType": "string", "description": "Must be a string and is required."},
                        "format": {"bsonType": "string", "description": "Must be a string and is required."},
                        "size": {"bsonType": "number", "description": "Must be a number and is required."},
                        "location": {"bsonType": "string", "description": "Must be a string (URI/path) and is required."},
                        "suffix": {"bsonType": "string", "description": "The file extension, e.g., '.pdf'."}
                    }
                },
                "checksum": {"bsonType": "string", "description": "Must be a string and is required."},
                "uploadedAt": {"bsonType": "date", "description": "Must be a date and is required."}
            }
        }
    },
    "ChatSession": {
        "$jsonSchema": {
            "bsonType": "object",
            "required": ["collectionId", "userId", "messages", "status", "createdAt", "updatedAt"],
            "properties": {
                "_id": {"bsonType": "objectId"},
                "collectionId": {"bsonType": "objectId", "description": "Must be an ObjectId and is required."},
                "userId": {"bsonType": "objectId", "description": "Must be an ObjectId and is required."},
                "messages": {
                    "bsonType": "array",
                    "description": "Must be an array of message objects.",
                    "items": {
                        "bsonType": "object",
                        "required": ["role", "content", "timestamp"],
                        "properties": {
                            "role": {"enum": ["user", "assistant"], "description": "Can only be 'user' or 'assistant'."},
                            "content": {"bsonType": "string", "description": "Must be a string."},
                            "timestamp": {"bsonType": "date", "description": "Must be a date."}
                        }
                    }
                },
                "summary": {"bsonType": "string", "description": "Must be a string, if present."},
                "status": {"enum": ["active"], "description": "Must be 'active'."},
                "createdAt": {"bsonType": "date", "description": "Must be a date and is required."},
                "updatedAt": {"bsonType": "date", "description": "Must be a date and is required."}
            }
        }
    },
    "ReinforcementItem": {
         "$jsonSchema": {
            "bsonType": "object",
            "required": ["type", "sourceType", "collectionId", "userId", "data", "createdAt"],
            "properties": {
                "type": {"bsonType": "string", "enum": ["mindMap", "mcq", "quiz", "flashcardSet", "teachMeBack"]},
                "sourceType": {"bsonType": "string", "enum": ["collection"]},
                "collectionId": {"bsonType": "objectId"},
                "userId": {"bsonType": "objectId"},
                "difficulty": {"bsonType": ["string", "null"], "enum": ["easy", "medium", "hard", None]},
                "createdAt": {"bsonType": "date"},
                "data": {"bsonType": "object"}
            }
        }
    },
    "DocumentAnalysis": {
        "$jsonSchema": {
            "bsonType": "object",
            "required": ["userId", "collectionId", "contentId", "type", "data", "createdAt", "updatedAt"],
            "properties": {
                "userId": {"bsonType": "objectId"},
                "collectionId": {"bsonType": "objectId"},
                "contentId": {"bsonType": "objectId"},
                "type": {"bsonType": "string", "enum": ["mindMap", "summary"]},
                "data": {"bsonType": "object"},
                "createdAt": {"bsonType": "date"},
                "updatedAt": {"bsonType": "date"}
            }
        }
    }
}

# --- Index Definitions ---
# This dictionary defines the indexes needed for each collection to ensure
# efficient queries. The format is { "collection_name": [index_definitions] }.
INDEXES = {
    "Collection": [
        [("userId", ASCENDING)]  # To quickly find all collections for a user.
    ],
    "Content": [
        [("collectionId", ASCENDING)],  # To quickly find all content in a collection.
        [("checksum", ASCENDING), ("collectionId", ASCENDING)] # Compound index to quickly check for duplicates within a collection.
    ],
    "ChatSession": [
        [("collectionId", ASCENDING), ("userId", ASCENDING)] # Compound index to quickly find a specific user's chat session in a collection.
    ],
    "ReinforcementItem": [
        [("collectionId", ASCENDING), ("userId", ASCENDING)],
        (
            [("collectionId", ASCENDING), ("userId", ASCENDING), ("type", ASCENDING)],
            {
                "unique": True,
                "partialFilterExpression": {"type": {"$in": ["mindMap", "teachMeBack"]}}
            }
        )
    ],
    "DocumentAnalysis": [
        (
            [("contentId", ASCENDING), ("userId", ASCENDING), ("type", ASCENDING)],
            {"unique": True} # Enforces one mindmap/summary per user per document
        )
    ]
}


async def check_admin_rights(db: AsyncDatabase) -> bool:
    """
    Checks if the current user has dbAdmin rights on the connected database
    using the connectionStatus command.
    """
    try:
        status = await db.command('connectionStatus')
        auth_info = status.get('authInfo', {})
        
        if not auth_info.get('authenticatedUsers'):
            print("⚠️ WARNING: No authenticated user found for this connection.")
            return False
            
        user = auth_info['authenticatedUsers'][0]
        roles = auth_info.get('authenticatedUserRoles', [])
        
        for role in roles:
            if role.get('role') == 'dbAdmin' and role.get('db') == db.name:
                print(f"✅ User '{user['user']}' has 'dbAdmin' rights on database '{db.name}'.")
                return True
        
        print(f"⚠️ WARNING: User '{user['user']}' does not have 'dbAdmin' rights on database '{db.name}'. Cannot create collections.")
        return False
    except OperationFailure as e:
        print(f"❌ ERROR: Could not verify user permissions. Command failed: {e.details.get('errmsg', e)}")
        return False
    except Exception as e:
        print(f"❌ An unexpected error occurred while checking admin rights: {e}")
        return False


async def run_migrations(db: AsyncDatabase):
    """
    Checks for existing collections and creates them with validators if they don't exist.
    Also ensures that all necessary indexes are created for each collection.
    """
    print("\n--- Starting Database Migration Check ---")
    
    if not await check_admin_rights(db):
        print("--- Migration check failed due to insufficient permissions. ---")
        return

    # 1. Create Collections with Schema Validation
    try:
        existing_collections = await db.list_collection_names()
        print(f"Found existing collections: {existing_collections}")
        for name, validator in SCHEMAS.items():
            if name not in existing_collections:
                print(f"Collection '{name}' not found. Attempting to create...")
                await db.create_collection(name, validator=validator)
                print(f"👍 Collection '{name}' created successfully with validation schema.")
    except Exception as e:
        print(f"❌ ERROR during collection creation. Aborting migration. Error: {e}")
        return

    # --- 2. Create Indexes for Performance ---
    print("\n--- Verifying Database Indexes ---")
    for collection_name, index_list in INDEXES.items():
        collection = db[collection_name]
        for idx in index_list:
            try:
                if isinstance(idx, tuple):
                    # idx == (keys, opts)
                    keys, opts = idx
                    await collection.create_index(keys, **opts)
                    print(f"✔️ Index on '{collection_name}' with keys={keys} and options={opts} is present.")
                else:
                    # idx == keys only
                    await collection.create_index(idx)
                    print(f"✔️ Index on '{collection_name}' with keys={idx} is present.")
            except Exception as e:
                print(f"❌ FAILED to create index on '{collection_name}' for spec {idx!r}. Error: {e}")
    print("--- Database Migration Check Complete ---\n")
