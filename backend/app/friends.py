"""
Shared queries over the `friendships` collection. `routes/friends.py` (the
friends UI's own endpoints) and `routes/search.py` (which needs to know
"who's in my network" to compute social_status) both call into here instead
of each writing their own Friendship query — the same "one place" rule
app/tmdb.py and app/users.py already follow for their own concerns.
"""

from typing import Optional

from beanie.operators import And, Or

from app.models.friendship import Friendship


async def get_friend_ids(user_id: str) -> list[str]:
    """All user ids with an *accepted* friendship with `user_id`."""
    friendships = await Friendship.find(
        Friendship.status == "accepted",
        Or(Friendship.requester_id == user_id, Friendship.recipient_id == user_id),
    ).to_list()

    return [
        f.recipient_id if f.requester_id == user_id else f.requester_id
        for f in friendships
    ]


async def find_friendship(user_id: str, other_id: str) -> Optional[Friendship]:
    """The Friendship row between these two users, in either direction, if any."""
    return await Friendship.find_one(
        Or(
            And(Friendship.requester_id == user_id, Friendship.recipient_id == other_id),
            And(Friendship.requester_id == other_id, Friendship.recipient_id == user_id),
        )
    )


async def get_relationship_status(user_id: str, other_id: str) -> str:
    """
    One of "none", "pending_sent", "pending_received", "friends" — from
    `user_id`'s point of view looking at `other_id`.
    """
    friendship = await find_friendship(user_id, other_id)

    if not friendship:
        return "none"
    if friendship.status == "accepted":
        return "friends"
    return "pending_sent" if friendship.requester_id == user_id else "pending_received"
