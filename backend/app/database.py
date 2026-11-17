from pymongo import AsyncMongoClient
from beanie import init_beanie
from app.models.lane import Lane
from app.models.user import User
from app.models.friendship import Friendship
from app.config import MONGO_URI

async def init_db():
    client = AsyncMongoClient(MONGO_URI)
    await init_beanie(
        database=client.memory_lane_db,
        document_models=[Lane, User, Friendship]
    )