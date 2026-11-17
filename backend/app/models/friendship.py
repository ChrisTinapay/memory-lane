from beanie import Document
from pydantic import BaseModel
from typing import Literal, Optional
from datetime import datetime


class Friendship(Document):
    """
    One row per friend relationship, in either direction. `requester_id` is
    whoever sent the request; `status` starts "pending" and becomes
    "accepted" once the recipient accepts. There's no "declined" status —
    a decline just deletes the row (see routes/friends.py), so a declined
    request doesn't block a future one.
    """
    requester_id: str
    recipient_id: str
    status: Literal["pending", "accepted"] = "pending"
    created_at: datetime = datetime.utcnow()
    responded_at: Optional[datetime] = None

    class Settings:
        name = "friendships"


class FriendRequestCreate(BaseModel):
    recipient_id: str
