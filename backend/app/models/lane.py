from beanie import Document
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class Lane(Document):
    # No default anymore: every Lane is now created server-side with the
    # authenticated user's id (see routes/lanes.py) rather than trusting
    # whatever the client sends.
    user_id: str
    tmdb_id: int
    title: str
    media_type: str
    poster_path: Optional[str] = None
    release_date: Optional[str] = None
    rating: Optional[int] = None        # 1-5 star rating
    reflection: Optional[str] = None    # Personal notes/review
    created_at: datetime = datetime.utcnow()


    class Settings:
        name = "lanes"


class LaneCreate(BaseModel):
    """
    What a client is allowed to send to POST /api/lanes/pave. Deliberately
    excludes user_id — that comes from the authenticated session, never
    from the request body, so a logged-in user can't pave into someone
    else's lane by editing the payload.
    """
    tmdb_id: int
    title: str
    media_type: str
    poster_path: Optional[str] = None
    release_date: Optional[str] = None
