from beanie import PydanticObjectId
from fastapi_users import schemas
from fastapi_users_db_beanie import BeanieBaseUserDocument


class User(BeanieBaseUserDocument):
    """
    The registered-account entity, managed by fastapi-users.

    BeanieBaseUserDocument already provides: id (Mongo ObjectId), email,
    hashed_password, is_active, is_superuser, is_verified — and, unlike the
    plain BeanieBaseUser mixin, it's already a Beanie Document, so this
    class needs nothing else mixed in.
    """

    class Settings(BeanieBaseUserDocument.Settings):
        name = "users"


# Request/response shapes for the auth routes in main.py. These stay
# separate from the `User` Document above on purpose: schemas are what the
# API exposes to the outside world (never hashed_password), the Document is
# what's actually stored in Mongo. fastapi-users wires them together.
class UserRead(schemas.BaseUser[PydanticObjectId]):
    pass


class UserCreate(schemas.BaseUserCreate):
    pass


class UserUpdate(schemas.BaseUserUpdate):
    pass
