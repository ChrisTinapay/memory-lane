import os
from fastapi import FastAPI
from pymongo import AsyncMongoClient # <--- The new Native Async Client
from beanie import init_beanie, Document
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

class Lane(Document):
    title: str
    media_type: str
    path_maker: str

    class Settings:
        name = "lanes"

app = FastAPI()

@app.on_event("startup")
async def startup_db():
    # We use the new AsyncMongoClient instead of MotorClient
    client = AsyncMongoClient(os.environ["MONGO_URI"])
    
    # Beanie 2026 fully supports the new native driver
    await init_beanie(database=client.memory_lane_db, document_models=[Lane])

@app.get("/")
async def read_root():
    return {"message": "Memory Lane: Native Async Edition 🚀"}

@app.post("/pave-lane")
async def pave_lane(new_lane: Lane):
    # This single line does the validation AND the database save!
    await new_lane.insert()
    return {"message": f"Success! You paved the lane for {new_lane.title}", "id": str(new_lane.id)}

@app.get("/lanes")
async def get_all_lanes():
    # The Librarian goes to the 'lanes' collection and grabs everything
    # .to_list() turns the database results into a nice Python list
    lanes = await Lane.find_all().to_list()
    
    return {
        "status": "success",
        "count": len(lanes),
        "lanes": lanes
    }