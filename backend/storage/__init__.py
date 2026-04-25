"""Blob storage adapters (local + object-store boundary)."""

from backend.storage.artifact_repository import (
    ArtifactRepository,
    get_artifact_repository,
    reset_artifact_repository_singleton,
)
from backend.storage.blob_store import BlobStore, LocalBlobStore, ObjectStoreStub, get_blob_store

__all__ = [
    "ArtifactRepository",
    "BlobStore",
    "LocalBlobStore",
    "ObjectStoreStub",
    "get_artifact_repository",
    "get_blob_store",
    "reset_artifact_repository_singleton",
]
