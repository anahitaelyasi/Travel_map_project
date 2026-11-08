from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, UniqueConstraint
from .database import Base

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    phone = Column(String(20), unique=True, index=True, nullable=False)
    role = Column(String(20), nullable=False, default='passenger')
    avatar = Column(Text, nullable=True)
    birth_date = Column(String(10), nullable=True)

class SessionToken(Base):
    __tablename__ = 'session_tokens'
    token = Column(String(100), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

class Station(Base):
    __tablename__ = 'stations'
    id = Column(Integer, primary_key=True)
    vehicle_type = Column(String(100), nullable=False)
    origin_lat = Column(Float, nullable=False)
    origin_lng = Column(Float, nullable=False)
    dest_lat = Column(Float, nullable=False)
    dest_lng = Column(Float, nullable=False)
    fare = Column(String(50), nullable=False)
    creator_name = Column(String(120), nullable=False)
    hours = Column(Text, nullable=False, default='[]')

class TripGroup(Base):
    __tablename__ = 'trip_groups'
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

class Traveler(Base):
    __tablename__ = 'active_travelers'
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    group_id = Column(Integer, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    avatar = Column(Text)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    dest_name = Column(String(300), nullable=False)
    travel_mode = Column(String(10), nullable=False, default='now')
    travel_date = Column(String(25), nullable=False, default='')
    travel_time = Column(String(10), nullable=False, default='')
    timestamp = Column(DateTime, default=utcnow, nullable=False)

class TravelerPresence(Base):
    """Ephemeral online trip-search state, separate from persistent trip groups."""
    __tablename__ = 'traveler_presence'
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    updated_at = Column(DateTime, default=utcnow, nullable=False)

class RideRequest(Base):
    __tablename__ = 'ride_requests'
    id = Column(Integer, primary_key=True)
    sender_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    sender_name = Column(String(120), nullable=False)
    sender_avatar = Column(Text)
    receiver_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    status = Column(String(20), nullable=False, default='pending')
    perm_group_id = Column(Integer, nullable=True)

class Notification(Base):
    __tablename__ = 'notifications'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    message = Column(String(1000), nullable=False)

class GroupMessage(Base):
    __tablename__ = 'group_messages'
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, nullable=False, index=True)
    sender_id = Column(Integer, nullable=False)
    sender_name = Column(String(120), nullable=False)
    sender_avatar = Column(Text)
    text = Column(String(2000), nullable=False)
    timestamp = Column(DateTime, default=utcnow, nullable=False)

class PermanentGroup(Base):
    __tablename__ = 'perm_groups'
    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    avatar = Column(String(255))
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    active_group_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

class PermanentMember(Base):
    __tablename__ = 'perm_group_members'
    group_id = Column(Integer, ForeignKey('perm_groups.id', ondelete='CASCADE'), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)

class PermanentMessage(Base):
    __tablename__ = 'perm_group_messages'
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey('perm_groups.id', ondelete='CASCADE'), index=True, nullable=False)
    sender_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    sender_name = Column(String(120), nullable=False)
    sender_avatar = Column(Text)
    text = Column(String(2000), nullable=False)
    timestamp = Column(DateTime, default=utcnow, nullable=False)

class PlannedRequest(Base):
    __tablename__ = 'planned_requests'
    id = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    date = Column(String(20), nullable=False)
    time = Column(String(10), nullable=False)
    start_label = Column(String(300), nullable=False)
    dest_label = Column(String(300), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
