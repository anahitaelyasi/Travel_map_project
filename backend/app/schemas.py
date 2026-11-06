from typing import Literal
from pydantic import BaseModel, Field, field_validator

class UserRegister(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=5, max_length=20)
    role: Literal['passenger', 'driver'] = 'passenger'
    avatar: str | None = Field(default=None, max_length=3_000_000)
    birth_date: str | None = Field(default=None, pattern=r'^1[34][0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')

class LoginBody(BaseModel):
    phone: str = Field(min_length=5, max_length=20)

class ProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    role: Literal['passenger', 'driver'] = 'passenger'
    avatar: str | None = Field(default=None, max_length=3_000_000)

class StationCreate(BaseModel):
    vehicle_type: str = Field(min_length=1, max_length=100)
    origin_lat: float = Field(ge=-90, le=90)
    origin_lng: float = Field(ge=-180, le=180)
    dest_lat: float = Field(ge=-90, le=90)
    dest_lng: float = Field(ge=-180, le=180)
    fare: str = Field(min_length=1, max_length=50)
    creator_name: str | None = None
    hours: list[str] = Field(default_factory=list, max_length=3)

class TravelerUpsert(BaseModel):
    user_id: int
    name: str | None = None
    avatar: str | None = None
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    dest_name: str = Field(min_length=1, max_length=300)
    travel_mode: Literal['now', 'later'] = 'now'
    travel_date: str = ''
    travel_time: str = ''

class RequestCreate(BaseModel):
    sender_id: int
    sender_name: str | None = None
    sender_avatar: str | None = None
    receiver_id: int
    perm_group_id: int | None = None

class RequestRespond(BaseModel):
    status: Literal['accepted', 'rejected', 'cancelled']

class MessageCreate(BaseModel):
    sender_id: int
    sender_name: str | None = None
    sender_avatar: str | None = None
    text: str = Field(min_length=1, max_length=2000)

class PermanentConvert(BaseModel):
    userId: int

class PermanentRename(BaseModel):
    ownerId: int
    newName: str = Field(min_length=1, max_length=120)

class PermanentKick(BaseModel):
    ownerId: int
    targetId: int

class PlannedCreate(BaseModel):
    date: Literal['today', 'tomorrow', 'day_after']
    time: str = Field(pattern=r'^([01][0-9]|2[0-3]):[0-5][0-9]$')
    startLabel: str = Field(min_length=1, max_length=300)
    destLabel: str = Field(min_length=1, max_length=300)
