import os
from pathlib import Path
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def required_setting(name: str) -> str:
	value = os.getenv(name)
	if not value:
		raise RuntimeError(f"{name} environment variable is missing")
	return value


MONGO_URI = required_setting("MONGO_URI")
TMDB_READ_TOKEN = required_setting("TMDB_READ_TOKEN")
TMDB_API_BASE_URL = os.getenv("TMDB_API_BASE_URL", "https://api.themoviedb.org/3")
TMDB_API_URL = os.getenv("TMDB_API_URL", f"{TMDB_API_BASE_URL}/search/multi")

# Signs/verifies login (JWT) tokens and password-reset/verification tokens.
# Required — the app raises on startup if it's missing. Keep it secret and
# never commit it; rotating it invalidates every existing login session.
JWT_SECRET = required_setting("JWT_SECRET")
