from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.models.lane import Lane, LaneCreate
from app.models.user import User
from app.users import current_active_user
from typing import List

router = APIRouter(prefix="/api/lanes", tags=["Lanes"])

class ReflectionUpdate(BaseModel):
    reflection: str

async def get_owned_lane(lane_id: PydanticObjectId, user: User) -> Lane:
    lane = await Lane.get(lane_id)

    if not lane or lane.user_id != str(user.id):
        raise HTTPException(status_code=404, detail="Lane not found")

    return lane

@router.post("/pave")
async def pave_lane(new_lane: LaneCreate, user: User = Depends(current_active_user)):
    user_id = str(user.id)

    existing_lane = await Lane.find_one(
        Lane.tmdb_id == new_lane.tmdb_id,
        Lane.user_id == user_id
    )

    if existing_lane:
        return {
            "message": f"'{new_lane.title}' is already in your lane!",
            "already_paved": True,
            "id": str(existing_lane.id)
        }

    lane = Lane(user_id=user_id, **new_lane.model_dump())
    await lane.insert()
    return {
        "message": f"Successfully paved '{lane.title}'!",
        "already_paved": False,
        "id": str(lane.id)
    }

@router.get("/my-lane")
async def get_my_lanes(user: User = Depends(current_active_user)):
    # Fetch lanes created by current user, newest first
    lanes = await Lane.find(
        Lane.user_id == str(user.id)
    ).sort("-created_at").to_list()

    return {"status": "success", "count": len(lanes), "lanes": lanes}

@router.put("/{lane_id}/reflection")
async def update_reflection(
    lane_id: PydanticObjectId,
    payload: ReflectionUpdate,
    user: User = Depends(current_active_user),
):
    lane = await get_owned_lane(lane_id, user)

    lane.reflection = payload.reflection
    await lane.save()

    return {"status": "success", "id": str(lane_id), "reflection": lane.reflection}

@router.delete("/{lane_id}")
async def delete_lane(lane_id: PydanticObjectId, user: User = Depends(current_active_user)):
    lane = await get_owned_lane(lane_id, user)

    await lane.delete()
    return {"status": "success", "id": str(lane_id)}
