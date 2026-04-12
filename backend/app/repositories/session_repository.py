from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


COLLECTION = "creative_sessions"


def _not_deleted() -> dict[str, Any]:
    return {
        "$and": [
            {"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
            {"$or": [{"deleted": {"$ne": True}}, {"deleted": {"$exists": False}}]},
        ]
    }


def _session_query(**kwargs: Any) -> dict[str, Any]:
    parts: list[dict[str, Any]] = [_not_deleted()]
    for k, v in kwargs.items():
        if v is not None:
            parts.append({k: v})
    if len(parts) == 1:
        return parts[0]
    return {"$and": parts}


class SessionRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._coll = db[COLLECTION]

    async def insert_session(self, doc: dict[str, Any]) -> None:
        await self._coll.insert_one(doc)

    async def find_by_session_id(self, session_id: str) -> dict[str, Any] | None:
        return await self._coll.find_one(_session_query(session_id=session_id))

    async def count_sessions(self, owner_id: str | None) -> int:
        return await self._coll.count_documents(_session_query(owner_id=owner_id))

    async def list_sessions(
        self,
        owner_id: str | None,
        limit: int,
        skip: int,
    ) -> list[dict[str, Any]]:
        cursor = (
            self._coll.find(_session_query(owner_id=owner_id))
            .sort("updated_at", -1)
            .skip(skip)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def delete_by_session_id(self, session_id: str) -> bool:
        """Remove the session document from the collection (hard delete)."""
        result = await self._coll.delete_one({"session_id": session_id})
        return result.deleted_count > 0

    async def append_history(
        self,
        session_id: str,
        history_entry: dict[str, Any],
        set_fields: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        update: dict[str, Any] = {
            "$push": {"history": history_entry},
            "$set": {"updated_at": _utcnow()},
        }
        if set_fields:
            update["$set"].update(set_fields)
        return await self._coll.find_one_and_update(
            _session_query(session_id=session_id),
            update,
            return_document=ReturnDocument.AFTER,
        )

    async def update_fields(
        self,
        session_id: str,
        set_fields: dict[str, Any],
    ) -> dict[str, Any] | None:
        set_fields = {**set_fields, "updated_at": _utcnow()}
        return await self._coll.find_one_and_update(
            _session_query(session_id=session_id),
            {"$set": set_fields},
            return_document=ReturnDocument.AFTER,
        )

    async def append_history_and_set(
        self,
        session_id: str,
        history_entry: dict[str, Any],
        set_fields: dict[str, Any],
    ) -> dict[str, Any] | None:
        set_fields = {**set_fields, "updated_at": _utcnow()}
        return await self._coll.find_one_and_update(
            _session_query(session_id=session_id),
            {"$push": {"history": history_entry}, "$set": set_fields},
            return_document=ReturnDocument.AFTER,
        )
