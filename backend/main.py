from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routes import search, lanes, friends
from app.models.user import UserCreate, UserRead, UserUpdate
from app.users import auth_backend, fastapi_users

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs on startup
    await init_db()
    yield
    # Cleanup on shutdown can go here

app = FastAPI(title="Memory Lane API", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth routers (fastapi-users) — registration, login/logout, and the
# current-user profile endpoints. These issue/read the httpOnly cookie
# the rest of the app relies on (see app/users.py).
app.include_router(
    fastapi_users.get_auth_router(auth_backend), prefix="/auth/jwt", tags=["Auth"]
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["Auth"],
)
app.include_router(
    fastapi_users.get_reset_password_router(), prefix="/auth", tags=["Auth"]
)
app.include_router(
    fastapi_users.get_verify_router(UserRead), prefix="/auth", tags=["Auth"]
)
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["Users"],
)

# Include Routers
app.include_router(search.router)
app.include_router(lanes.router)
app.include_router(friends.router)

@app.get("/")
async def root():
    return {"message": "Memory Lane API is operational 🚀"}
