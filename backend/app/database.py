import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "medicycle.db")


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


configured_database_url = os.getenv("DATABASE_URL")
if os.getenv("VERCEL") == "1":
    if not configured_database_url:
        raise RuntimeError("DATABASE_URL must be configured for persistent Vercel deployments")
    if not configured_database_url.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
        raise RuntimeError("Vercel deployments require a PostgreSQL DATABASE_URL")

SQLALCHEMY_DATABASE_URL = normalize_database_url(
    configured_database_url or f"sqlite:///{DATABASE_FILE}"
)

engine_options = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
