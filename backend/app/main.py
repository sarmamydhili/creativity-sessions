from __future__ import annotations

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, sessions, workflow
from app.core.config import get_settings
from app.db.mongo import lifespan_database


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    async with lifespan_database():
        yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Creativity Sessions API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(sessions.router)
    app.include_router(workflow.router)
    return app


app = create_app()
