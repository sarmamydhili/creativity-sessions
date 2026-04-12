from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import get_settings

_client: Optional[AsyncIOMotorClient] = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        raise RuntimeError("MongoDB client not initialized")
    return _client


async def connect() -> None:
    global _client
    settings = get_settings()
    _client = AsyncIOMotorClient(settings.mongodb_uri)


async def disconnect() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def get_database() -> AsyncIOMotorDatabase:
    settings = get_settings()
    return get_client()[settings.db_name]


@asynccontextmanager
async def lifespan_database() -> AsyncIterator[None]:
    await connect()
    db = get_database()
    coll = db["creative_sessions"]
    await coll.create_index("session_id", unique=True)
    await coll.create_index([("owner_id", 1), ("updated_at", -1)])
    try:
        yield
    finally:
        await disconnect()
