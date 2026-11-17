import httpx
from app.config import TMDB_READ_TOKEN

TMDB_HEADERS = {
    "Authorization": f"Bearer {TMDB_READ_TOKEN}",
    "accept": "application/json",
}

async def fetch_tmdb(url: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=TMDB_HEADERS)
        return response.json()
