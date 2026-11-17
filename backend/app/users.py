"""
Everything fastapi-users needs to run registration/login/logout for Memory
Lane: how to reach the `users` collection, how to issue/verify tokens, and
the dependencies other routers use to find out who's making a request.

Nothing outside this file should construct a UserManager or a JWT strategy
directly — import from here, the same rule config.py already applies to
environment variables.
"""

from typing import Optional

from beanie import PydanticObjectId
from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers
from fastapi_users.authentication import (
    AuthenticationBackend,
    CookieTransport,
    JWTStrategy,
)
from fastapi_users_db_beanie import BeanieUserDatabase, ObjectIDIDMixin

from app.config import JWT_SECRET
from app.models.user import User


async def get_user_db():
    yield BeanieUserDatabase(User)


class UserManager(ObjectIDIDMixin, BaseUserManager[User, PydanticObjectId]):
    # Used to sign password-reset and email-verification tokens. Reusing
    # JWT_SECRET keeps this app to a single secret to manage; splitting
    # these into their own env vars later is a drop-in change if you ever
    # want to rotate them independently.
    reset_password_token_secret = JWT_SECRET
    verification_token_secret = JWT_SECRET

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        print(f"[auth] registered: {user.id} ({user.email})")

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        # No email sending is wired up yet — this just logs the token so
        # password reset is at least testable locally. Send a real email
        # here (or via a background task) before this ever goes live.
        print(f"[auth] password reset requested for {user.id}. Token: {token}")

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        print(f"[auth] verification requested for {user.id}. Token: {token}")


async def get_user_manager(user_db: BeanieUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


# Cookie transport: the browser holds an httpOnly cookie, so the frontend
# never has to read or store a token itself (safer than localStorage,
# where any injected script could steal it). This pairs with the
# `allow_credentials=True` CORS setting already in main.py — fetch calls
# just need `credentials: "include"`.
cookie_transport = CookieTransport(
    cookie_name="memorylane_auth",
    cookie_max_age=60 * 60 * 24 * 7,  # 7 days
    cookie_httponly=True,
    cookie_samesite="lax",
    # NOTE: False so the cookie works over plain http://localhost during
    # development. Flip this to True (the fastapi-users default) as soon
    # as this is ever deployed behind HTTPS — a non-secure cookie should
    # never ship to production.
    cookie_secure=False,
)


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=JWT_SECRET, lifetime_seconds=60 * 60 * 24 * 7)


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, PydanticObjectId](get_user_manager, [auth_backend])

# Require a logged-in, active user — raises 401 otherwise. Use for
# anything that mutates or reads someone's own data (pave, my-lane,
# reflection, delete).
current_active_user = fastapi_users.current_user(active=True)

# Same, but returns None instead of raising when no one is logged in.
# Search stays usable for a logged-out visitor; being logged in just adds
# the "paved by me" / "co-paved" social-status badges.
current_active_user_optional = fastapi_users.current_user(active=True, optional=True)
