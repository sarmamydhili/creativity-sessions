"""
Optional dev seed: sample session matching the SPARK workflow schema.
Run from backend/:  python scripts/seed_hydrating_jogger.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from uuid import uuid4

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


async def main() -> None:
    uri = os.environ.get("MONGODB_URI", "mongodb://127.0.0.1:27017")
    db_name = os.environ.get("DB_NAME", "creative_spark")
    client = AsyncIOMotorClient(uri)
    db = client[db_name]
    coll = db["creative_sessions"]
    session_id = str(uuid4())
    now = datetime.now(timezone.utc)
    problem = (
        "How can I help joggers stay hydrated more effectively while running?"
    )
    doc = {
        "session_id": session_id,
        "title": "Hydrating Jogger",
        "problem_statement": problem,
        "owner_id": None,
        "status": "active",
        "current_step": "session_created",
        "current_iteration": 1,
        "spark_state": None,
        "variations": {},
        "tool_applications": [],
        "perspectives": [],
        "inventions": [],
        "insights": [],
        "invention": None,
        "enlightenment": None,
        "history": [
            {
                "entry_id": str(uuid4()),
                "kind": "session_created",
                "payload": {"title": "Hydrating Jogger", "problem_statement": problem},
                "created_at": now,
            }
        ],
        "created_at": now,
        "updated_at": now,
        "deleted": False,
        "deleted_at": None,
    }
    await coll.insert_one(doc)
    print(f"Seeded session_id={session_id}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
