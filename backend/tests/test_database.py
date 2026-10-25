import pytest

from backend.app.database import normalize_database_url


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        (
            "postgres://db-user@db.example.com/app",
            "postgresql+psycopg://db-user@db.example.com/app",
        ),
        (
            "postgresql://db-user@db.example.com/app",
            "postgresql+psycopg://db-user@db.example.com/app",
        ),
        (
            "postgresql+psycopg://db-user@db.example.com/app",
            "postgresql+psycopg://db-user@db.example.com/app",
        ),
        ("sqlite:///medicycle.db", "sqlite:///medicycle.db"),
    ],
)
def test_normalize_database_url(url: str, expected: str) -> None:
    assert normalize_database_url(url) == expected
