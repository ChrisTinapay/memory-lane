from datetime import datetime

from beanie import PydanticObjectId
from beanie.operators import In, Or
from fastapi import APIRouter, Depends, HTTPException
from fastapi_users_db_beanie import BeanieUserDatabase

from app.friends import find_friendship, get_relationship_status
from app.models.friendship import Friendship, FriendRequestCreate
from app.models.lane import Lane
from app.models.user import User
from app.users import current_active_user

router = APIRouter(prefix="/api/friends", tags=["Friends"])


@router.get("/search")
async def search_users(email: str, user: User = Depends(current_active_user)):
    # Exact match only (via the same collation-aware lookup fastapi-users
    # itself uses for login) — a "contains" search would let anyone type in
    # partial strings and enumerate every registered email on the site.
    user_db = BeanieUserDatabase(User)
    found = await user_db.get_by_email(email.strip())

    if not found or str(found.id) == str(user.id):
        return {"results": []}

    status = await get_relationship_status(str(user.id), str(found.id))
    return {"results": [{"id": str(found.id), "email": found.email, "status": status}]}


@router.post("/request")
async def send_friend_request(
    payload: FriendRequestCreate, user: User = Depends(current_active_user)
):
    recipient_id = payload.recipient_id

    if recipient_id == str(user.id):
        raise HTTPException(status_code=400, detail="You can't friend yourself.")

    recipient = await User.get(PydanticObjectId(recipient_id))
    if not recipient:
        raise HTTPException(status_code=404, detail="User not found.")

    if await find_friendship(str(user.id), recipient_id):
        raise HTTPException(
            status_code=400, detail="A friend request already exists between you two."
        )

    friendship = Friendship(requester_id=str(user.id), recipient_id=recipient_id)
    await friendship.insert()
    return {"status": "success", "id": str(friendship.id)}


@router.get("/requests")
async def list_incoming_requests(user: User = Depends(current_active_user)):
    pending = await Friendship.find(
        Friendship.recipient_id == str(user.id),
        Friendship.status == "pending",
    ).sort("-created_at").to_list()

    requester_ids = [PydanticObjectId(f.requester_id) for f in pending]
    requesters = await User.find(In(User.id, requester_ids)).to_list()
    email_by_id = {str(u.id): u.email for u in requesters}

    return {
        "requests": [
            {"id": str(f.id), "from_email": email_by_id.get(f.requester_id, "unknown")}
            for f in pending
        ]
    }


@router.post("/requests/{request_id}/accept")
async def accept_friend_request(
    request_id: PydanticObjectId, user: User = Depends(current_active_user)
):
    friendship = await Friendship.get(request_id)

    if not friendship or friendship.recipient_id != str(user.id) or friendship.status != "pending":
        raise HTTPException(status_code=404, detail="Friend request not found.")

    friendship.status = "accepted"
    friendship.responded_at = datetime.utcnow()
    await friendship.save()
    return {"status": "success"}


@router.delete("/requests/{request_id}")
async def remove_friendship(
    request_id: PydanticObjectId, user: User = Depends(current_active_user)
):
    # Covers three actions with one endpoint: declining an incoming request,
    # cancelling a request you sent, and unfriending an already-accepted
    # friendship — all of them are just "delete the row I'm a party to".
    friendship = await Friendship.get(request_id)

    if not friendship or str(user.id) not in (friendship.requester_id, friendship.recipient_id):
        raise HTTPException(status_code=404, detail="Friend request not found.")

    await friendship.delete()
    return {"status": "success"}


@router.get("/")
async def list_friends(user: User = Depends(current_active_user)):
    # Queried directly (rather than via app.friends.get_friend_ids) because
    # the frontend needs the *friendship* row's own id to unfriend someone —
    # get_friend_ids only returns the other user's id, which is enough for
    # search.py's purpose but not this one.
    friendships = await Friendship.find(
        Friendship.status == "accepted",
        Or(Friendship.requester_id == str(user.id), Friendship.recipient_id == str(user.id)),
    ).to_list()

    other_ids = {
        f.recipient_id if f.requester_id == str(user.id) else f.requester_id: f
        for f in friendships
    }
    others = await User.find(In(User.id, [PydanticObjectId(oid) for oid in other_ids])).to_list()
    email_by_id = {str(u.id): u.email for u in others}

    return {
        "friends": [
            {
                "friendship_id": str(friendship.id),
                "id": other_id,
                "email": email_by_id.get(other_id, "unknown"),
            }
            for other_id, friendship in other_ids.items()
        ]
    }


@router.get("/{friend_id}/lane")
async def get_friend_lane(friend_id: str, user: User = Depends(current_active_user)):
    # 403, not 404: a friend's account existing isn't secret (you found them
    # via exact-email search), only their paved lane is gated on actually
    # being friends. Contrast with get_owned_lane in routes/lanes.py, which
    # uses 404 because a *lane*'s existence there is what's meant to be
    # invisible to non-owners.
    if await get_relationship_status(str(user.id), friend_id) != "friends":
        raise HTTPException(status_code=403, detail="You can only view a friend's lane.")

    friend = await User.get(PydanticObjectId(friend_id))
    if not friend:
        raise HTTPException(status_code=404, detail="User not found.")

    lanes = await Lane.find(Lane.user_id == friend_id).sort("-created_at").to_list()

    return {
        "status": "success",
        "friend_email": friend.email,
        "count": len(lanes),
        "lanes": lanes,
    }
