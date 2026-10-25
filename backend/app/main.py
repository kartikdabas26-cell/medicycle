import asyncio
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .database import engine, Base, SessionLocal
from .seed_data import seed_database
from .db.seed_auth import seed_auth_accounts
from .routers import inventory, forecast, risks, transfers, reorder, facilities, demo, ai, network, auth

logger = logging.getLogger(__name__)


async def _expire_transfer_handshakes():
    while True:
        await asyncio.sleep(1)
        db = SessionLocal()
        try:
            transfers.process_expired_handshakes(db)
        except Exception:
            logger.exception("Failed to process expired bilateral transfer offers")
        finally:
            db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables and seed deterministic demo data on startup
    Base.metadata.create_all(bind=engine)
    seed_database(reset=False)
    db = SessionLocal()
    try:
        network.seed_network_data(db)
        seed_auth_accounts(db)
    finally:
        db.close()
    expiry_task = None
    if os.getenv("VERCEL") != "1":
        expiry_task = asyncio.create_task(_expire_transfer_handshakes())
    try:
        yield
    finally:
        if expiry_task:
            expiry_task.cancel()
            try:
                await expiry_task
            except asyncio.CancelledError:
                pass

app = FastAPI(
    title="MEDICYCLE Supply Network API",
    description="Multi-role healthcare supply network, inventory redistribution and procurement platform",
    version="2.0.0",
    lifespan=lifespan
)

# Enable CORS for local Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(auth.router)
app.include_router(inventory.router)
app.include_router(forecast.router)
app.include_router(risks.router)
app.include_router(transfers.router)
app.include_router(reorder.router)
app.include_router(facilities.router)
app.include_router(demo.router)
app.include_router(ai.router)
app.include_router(network.router)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "MEDICYCLE Supply Network",
        "version": "2.0.0",
        "mode": "Network Demonstration"
    }

@app.get("/")
def root():
    return {
        "platform": "MEDICYCLE",
        "description": "Multi-role healthcare supply chain network platform",
        "docs_url": "/docs",
        "health_url": "/api/health"
    }
