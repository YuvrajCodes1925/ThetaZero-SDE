import hashlib
from langchain_core.documents import Document

def compute_checksum(file_bytes: bytes) -> str:
    """Computes the SHA256 checksum of a byte string."""
    return hashlib.sha256(file_bytes).hexdigest()

def format_docs(docs: list[Document]) -> str:
    """Helper function to format retrieved documents into a single string."""
    return "\n\n".join(doc.page_content for doc in docs)
