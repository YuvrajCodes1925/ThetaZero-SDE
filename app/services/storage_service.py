import os
from azure.storage.blob.aio import BlobServiceClient
from azure.core.exceptions import ResourceNotFoundError
from fastapi import HTTPException

from app.database import contents_db

# ─── Environment Configuration ────────────────────────────────────────────────
AZURE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AZURE_CONTAINER_NAME = os.getenv("AZURE_CONTAINER_NAME")
LOCAL_STORAGE_PATH = os.getenv("LOCAL_STORAGE_PATH", "local_storage")

# ─── Client Initialization ────────────────────────────────────────────────────
blob_service_client = None
storage_mode = "local"

if AZURE_CONNECTION_STRING and AZURE_CONTAINER_NAME:
    try:
        blob_service_client = BlobServiceClient.from_connection_string(AZURE_CONNECTION_STRING)
        storage_mode = "azure"
        print("✅ Storage Service: Connected to Azure Blob Storage.")
    except Exception as e:
        print(f"❌ Storage Service: Failed to connect to Azure. Falling back to local. Error: {e}")
        storage_mode = "local"
else:
    print(f"⚠️  Storage Service: Azure credentials not set. Using local storage at '{LOCAL_STORAGE_PATH}'.")

if storage_mode == "local":
    os.makedirs(LOCAL_STORAGE_PATH, exist_ok=True)


async def save_file(checksum: str, suffix: str, file_bytes: bytes) -> str:
    """
    Saves a file to the configured storage (Azure or Local) using its checksum as the name.
    Returns the name of the stored file.
    """
    if not suffix:
        raise HTTPException(status_code=500, detail="Cannot save file without a file extension suffix.")
        
    storage_filename = f"{checksum}{suffix}"

    if storage_mode == "azure":
        container_client = blob_service_client.get_container_client(AZURE_CONTAINER_NAME)
        blob_client = container_client.get_blob_client(storage_filename)
        await blob_client.upload_blob(file_bytes, overwrite=True)
    else:  # local
        file_path = os.path.join(LOCAL_STORAGE_PATH, storage_filename)
        with open(file_path, "wb") as f:
            f.write(file_bytes)
            
    print(f"INFO: Saved file '{storage_filename}' to {storage_mode} storage.")
    return storage_filename


async def delete_file_if_unreferenced(checksum: str, suffix: str):
    """
    Deletes a file from storage if no other MongoDB documents reference its checksum.
    """
    # Check if any other document in the database references this checksum.
    # This is called *after* the primary document has been deleted.
    if await contents_db.count_documents({"checksum": checksum}) > 0:
        print(f"INFO: Checksum '{checksum}' is still referenced. File will not be deleted.")
        return

    # No references found, proceed with deletion from storage
    storage_filename = f"{checksum}{suffix}"
    print(f"INFO: Checksum '{checksum}' is no longer referenced. Deleting '{storage_filename}'.")

    if storage_mode == "azure":
        try:
            container_client = blob_service_client.get_container_client(AZURE_CONTAINER_NAME)
            blob_client = container_client.get_blob_client(storage_filename)
            await blob_client.delete_blob(delete_snapshots="include")
        except ResourceNotFoundError:
            print(f"WARN: Blob '{storage_filename}' not found in Azure container '{AZURE_CONTAINER_NAME}'. It may have been deleted already.")
        except Exception as e:
            print(f"ERROR: Failed to delete blob '{storage_filename}' from Azure. Error: {e}")
    else:  # local
        file_path = os.path.join(LOCAL_STORAGE_PATH, storage_filename)
        if os.path.exists(file_path):
            os.remove(file_path)
        else:
            print(f"WARN: File '{file_path}' not found in local storage. It may have been deleted already.")

async def get_file_bytes(checksum: str, suffix: str) -> bytes:
    """
    Retrieves the raw bytes of a file from the configured storage (Azure or Local)
    using its checksum and suffix.
    """
    if not suffix:
        raise ValueError("Cannot retrieve file without a suffix.")

    storage_filename = f"{checksum}{suffix}"

    try:
        if storage_mode == "azure":
            container_client = blob_service_client.get_container_client(AZURE_CONTAINER_NAME)
            blob_client = container_client.get_blob_client(storage_filename)
            downloader = await blob_client.download_blob()
            return await downloader.readall()
        else: # local
            file_path = os.path.join(LOCAL_STORAGE_PATH, storage_filename)
            with open(file_path, "rb") as f:
                return f.read()
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail=f"File '{storage_filename}' not found in {storage_mode} storage.")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File '{storage_filename}' not found in {storage_mode} storage.")
    except Exception as e:
        print(f"ERROR: Could not read file '{storage_filename}'. Error: {e}")
        raise HTTPException(status_code=500, detail="Could not read source file from storage.")
