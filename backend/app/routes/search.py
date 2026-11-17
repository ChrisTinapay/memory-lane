from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query
from typing import List, Dict, Any
from app.config import TMDB_API_URL, TMDB_API_BASE_URL
from app.friends import get_friend_ids
from app.models.lane import Lane
from app.models.user import User
from app.tmdb import fetch_tmdb
from app.users import current_active_user_optional
from beanie.operators import In

router = APIRouter(prefix="/api/search", tags=["Search"])

@router.get("/")
async def search_media(
    query: str = Query(..., min_length=1),
    user: Optional[User] = Depends(current_active_user_optional),
):
    data = await fetch_tmdb(f"{TMDB_API_URL}?query={query}&include_adult=false")

    results = data.get("results", [])
    if not results:
        return {"results": []}

    # Search stays usable while logged out (no "paved by me" to compute,
    # but browsing/searching shouldn't require an account). current_user_id
    # is None in that case and simply never matches anything below.
    current_user_id = str(user.id) if user else None
    network_ids = []
    if current_user_id:
        network_ids = await get_friend_ids(current_user_id)
        network_ids.append(current_user_id)

    # Extract all TMDB IDs from current search results
    tmdb_ids = [item["id"] for item in results if "id" in item]

    # Query MongoDB for matching paved lanes created by anyone in your network
    network_lanes = await Lane.find(
        In(Lane.tmdb_id, tmdb_ids),
        In(Lane.user_id, network_ids)
    ).sort("+created_at").to_list()  # Sorted by created_at ascending (pioneer first!)

    # Resolve emails for everyone who paved something, in one query, so each
    # result can show *who* (not just "a friend") paved it.
    email_by_id: Dict[str, str] = {}
    if network_lanes:
        paver_ids = {PydanticObjectId(lane.user_id) for lane in network_lanes}
        pavers = await User.find(In(User.id, list(paver_ids))).to_list()
        email_by_id = {str(u.id): u.email for u in pavers}

    # Group lanes by tmdb_id
    # e.g., { 27205: [{"user_id": "<mongo id>", "created_at": ..., ...}] }
    lanes_by_tmdb: Dict[int, List[Dict[str, Any]]] = {}
    for lane in network_lanes:
        lanes_by_tmdb.setdefault(lane.tmdb_id, []).append({
            "user_id": lane.user_id,
            "email": email_by_id.get(lane.user_id, "unknown"),
            "created_at": lane.created_at,
            "reflection": lane.reflection,
            "is_me": lane.user_id == current_user_id,
        })

    # Enrich each search result with social context
    formatted_results = []
    for item in results:
        media_type = item.get("media_type")
        if media_type not in ["movie", "tv"]:
            continue  # Skip actors/people results

        tmdb_id = item["id"]
        network_paves = lanes_by_tmdb.get(tmdb_id, [])

        # Check who paved it
        is_paved_by_me = any(p["is_me"] for p in network_paves)
        friends_who_paved = [p for p in network_paves if not p["is_me"]]

        # Determine social status
        if is_paved_by_me and friends_who_paved:
            status = "co_paved"
        elif is_paved_by_me:
            status = "paved_by_me"
        elif friends_who_paved:
            status = "paved_by_friend"
        else:
            status = "unpaved"

        formatted_results.append({
            "tmdb_id": tmdb_id,
            "title": item.get("title") or item.get("name"),
            "media_type": media_type,
            "poster_path": f"https://image.tmdb.org/t/p/w500{item['poster_path']}" if item.get("poster_path") else None,
            "release_date": item.get("release_date") or item.get("first_air_date"),
            "overview": item.get("overview"),
            "social_status": status,
            # Full detail (who + when + their reflection) for everyone in
            # your network who's paved this — the frontend shows this so you
            # can see a friend's engraved memory on a title straight from search.
            "network_paves": network_paves,
        })

    return {"results": formatted_results}

@router.get("/trailer")
async def get_trailer(tmdb_id: int, media_type: str = Query(..., pattern="^(movie|tv)$")):
    data = await fetch_tmdb(f"{TMDB_API_BASE_URL}/{media_type}/{tmdb_id}/videos")
    videos = data.get("results", [])

    # Prefer an official trailer, but fall back to any YouTube video (e.g. a teaser)
    trailer = next(
        (v for v in videos if v.get("site") == "YouTube" and v.get("type") == "Trailer"),
        next((v for v in videos if v.get("site") == "YouTube"), None)
    )

    if not trailer:
        return {"url": None}

    return {"url": f"https://www.youtube.com/watch?v={trailer['key']}"}
