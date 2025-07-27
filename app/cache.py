import time
from typing import Any

# _chat_sessions stores: { "session_id": {"user_id": str, "history": list, "last_access": float} }
_chat_sessions: dict[str, dict[str, Any]] = {}
# _user_to_session_map stores: { "user_id": "current_session_id" }
_user_to_session_map: dict[str, str] = {}

SESSION_TTL_SECONDS = 6 * 60 * 60  # 6 hours
MAX_HISTORY_PAIRS = 5  # 5 pairs of user/assistant messages (10 total)

def _purge_session(session_id: str):
    """Safely removes a session from the cache."""
    if session_id in _chat_sessions:
        del _chat_sessions[session_id]

def get_or_create_session_history(session_id: str, user_id: str) -> list:
    """
    Handles the core session logic.
    - Purges any previous session associated with the user.
    - Creates a new session if the provided session_id is new.
    - Returns the history for the current valid session.
    """
    # 1. Check if this user has an existing session and if it's different from the new one.
    old_session_id = _user_to_session_map.get(user_id)
    if old_session_id and old_session_id != session_id:
        _purge_session(old_session_id)

    # 2. Update the user-to-session map to the new session_id
    _user_to_session_map[user_id] = session_id
    
    # 3. Check if the session for the new ID already exists
    if session_id in _chat_sessions:
        # Session exists, check for expiration and ownership
        session = _chat_sessions[session_id]
        if time.time() - session["last_access"] > SESSION_TTL_SECONDS:
            # Expired, treat as a new session
            _purge_session(session_id)
            # Fall through to create a new session below
        elif session["user_id"] != user_id:
            # Session ID collision with another user (highly unlikely with UUIDs, but good practice)
            # Treat as a new session for the current user
            _purge_session(session_id)
            # Fall through
        else:
            # Valid, existing session for this user
            session["last_access"] = time.time()
            return session["history"]

    # 4. If we've reached here, we need to create a new session entry
    _chat_sessions[session_id] = {
        "user_id": user_id,
        "history": [],
        "last_access": time.time()
    }
    return _chat_sessions[session_id]["history"]

def add_messages_to_history(session_id: str, messages: list):
    """Adds new messages to a session's history and trims it."""
    if session_id in _chat_sessions:
        history = _chat_sessions[session_id]["history"]
        history.extend(messages)
        
        max_len = MAX_HISTORY_PAIRS * 2
        if len(history) > max_len:
            _chat_sessions[session_id]["history"] = history[-max_len:]
        
        _chat_sessions[session_id]["last_access"] = time.time()
