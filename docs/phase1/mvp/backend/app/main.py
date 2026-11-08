"""Nimrah MVP API. Compatible with the original /api endpoint and response contract."""
import json
import os
import secrets
from collections import defaultdict
from datetime import timedelta
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, func, delete, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import (User, SessionToken, Station, Traveler, TripGroup, TravelerPresence, RideRequest, Notification,
                     GroupMessage, PermanentGroup, PermanentMember, PermanentMessage,
                     PlannedRequest, utcnow)
from .schemas import (UserRegister, LoginBody, ProfileUpdate, StationCreate,
                      TravelerUpsert, RequestCreate, RequestRespond, MessageCreate,
                      PermanentConvert, PermanentRename, PermanentKick, PlannedCreate)

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # One-off data migration: older builds kept the temporary group alive after
    # conversion. active_group_id=NULL marks a migrated permanent group.
    from .database import SessionLocal
    with SessionLocal() as db:
        legacy = list(db.scalars(select(PermanentGroup).where(
            PermanentGroup.active_group_id.is_not(None))))
        for group in legacy:
            convert_temporary_members(db, group, group.active_group_id)
        # An older release preserved temporary membership after logout. A trip
        # without a recent heartbeat is no longer active; discard those stale
        # temporary sessions on startup, without touching permanent membership.
        cutoff = utcnow() - timedelta(seconds=90)
        live_user_ids = set(db.scalars(select(TravelerPresence.user_id).where(
            TravelerPresence.updated_at >= cutoff)))
        stale_ids = [uid for uid in db.scalars(select(Traveler.user_id))
                     if uid not in live_user_ids]
        for uid in stale_ids:
            detach_temporary_member(db, uid)
        if legacy or stale_ids:
            db.commit()
    yield

app = FastAPI(title='Nimrah API', version='1.0.0', lifespan=lifespan, docs_url='/api/docs', openapi_url='/api/openapi.json')
app.add_middleware(CORSMiddleware, allow_origins=[origin.strip() for origin in os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')], allow_methods=['*'], allow_headers=['*'])

@app.exception_handler(HTTPException)
async def api_http_error(request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={'error':str(exc.detail), 'detail':exc.detail})


def fail(message: str, code: int = 400):
    raise HTTPException(status_code=code, detail=message)


def user_dict(user: User):
    return {'id': user.id, 'name': user.name, 'phone': user.phone, 'role': user.role, 'avatar': user.avatar}


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.startswith('Bearer '):
        fail('برای ادامه وارد حساب شوید.', 401)
    token = db.get(SessionToken, authorization[7:])
    if token is None or token.created_at < utcnow() - timedelta(days=30):
        fail('نشست شما منقضی شده است.', 401)
    user = db.get(User, token.user_id)
    if user is None:
        fail('کاربر پیدا نشد.', 401)
    return user


def require_self(uid: int, user: User):
    if uid != user.id:
        fail('عدم دسترسی', 403)


def session_response(db: Session, user: User):
    token = secrets.token_urlsafe(36)
    db.add(SessionToken(token=token, user_id=user.id))
    db.commit()
    return {'success': True, 'user': user_dict(user), 'token': token}


def member_required(db: Session, group_id: int, user_id: int):
    member = db.get(PermanentMember, (group_id, user_id))
    if member is None:
        fail('شما عضو این گروه نیستید.', 403)
    return member


def traveler_for(db: Session, uid: int) -> Traveler | None:
    return db.get(Traveler, uid)


def as_message(row):
    return {'id': row.id, 'group_id': row.group_id, 'sender_id': row.sender_id,
            'sender_name': row.sender_name, 'sender_avatar': row.sender_avatar,
            'text': row.text, 'timestamp': row.timestamp.isoformat(sep=' ') if row.timestamp else None}


def new_solo_group(db: Session) -> int:
    group = TripGroup()
    db.add(group)
    db.flush()
    return 1_000_000 + group.id


def detach_temporary_member(db: Session, uid: int, *, keep_route: bool = False):
    """Leave temporary chat/matching, but NEVER remove permanent-group membership."""
    row = traveler_for(db, uid)
    if row is not None:
        old_group = row.group_id
        if keep_route:
            row.group_id = new_solo_group(db)
        else:
            db.delete(row)
            db.flush()
        remaining = list(db.scalars(select(Traveler).where(Traveler.group_id == old_group)))
        if len(remaining) == 1:
            remaining[0].group_id = new_solo_group(db)
        if len(remaining) < 2:
            db.execute(delete(GroupMessage).where(GroupMessage.group_id == old_group))
        else:
            db.add(GroupMessage(group_id=old_group, sender_id=0,
                sender_name='سیستم', sender_avatar='system', text='یک نفر گروه را ترک کرد.'))
    if not keep_route:
        db.execute(delete(TravelerPresence).where(TravelerPresence.user_id == uid))
    # Permanent-group requests are addressed to a group, so losing one account
    # must not cancel another permanent member's ability to respond.
    db.execute(update(RideRequest).where(
        RideRequest.status == 'pending',
        (RideRequest.sender_id == uid) |
        ((RideRequest.receiver_id == uid) & RideRequest.perm_group_id.is_(None))
    ).values(status='cancelled'))


def convert_temporary_members(db: Session, permanent: PermanentGroup, old_group: int):
    """Atomically migrate a temporary conversation and dissolve that group."""
    existing_messages = list(db.scalars(select(GroupMessage).where(
        GroupMessage.group_id == old_group).order_by(GroupMessage.id)))
    for msg in existing_messages:
        if msg.sender_id:
            db.add(PermanentMessage(group_id=permanent.id, sender_id=msg.sender_id,
                sender_name=msg.sender_name, sender_avatar=msg.sender_avatar,
                text=msg.text, timestamp=msg.timestamp))
    # Move requests already addressed to any of the former temporary members.
    members = list(db.scalars(select(Traveler).where(Traveler.group_id == old_group)))
    receiver_ids = [m.user_id for m in members]
    if receiver_ids:
        db.execute(update(RideRequest).where(
            RideRequest.receiver_id.in_(receiver_ids),
            RideRequest.status == 'pending',
            RideRequest.perm_group_id.is_(None)
        ).values(perm_group_id=permanent.id))
    for member in members:
        member.group_id = new_solo_group(db)
    db.execute(delete(GroupMessage).where(GroupMessage.group_id == old_group))
    permanent.active_group_id = None


def pending_request_dict(req: RideRequest, group: PermanentGroup | None = None):
    result = {'id': req.id, 'sender_id': req.sender_id,
        'sender_name': req.sender_name, 'sender_avatar': req.sender_avatar,
        'receiver_id': req.receiver_id, 'status': req.status}
    if group is not None:
        result.update(perm_group_id=group.id, perm_group_name=group.name)
    return result


@app.get('/api/health')
def health():
    return {'status': 'ok'}


@app.post('/api/register')
def register(body: UserRegister, db: Session = Depends(get_db)):
    phone = body.phone.strip()
    if db.scalar(select(User).where(User.phone == phone)):
        fail('Phone number already exists.', 400)
    u = User(name=body.name.strip(), phone=phone, role=body.role, avatar=body.avatar, birth_date=body.birth_date)
    db.add(u)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        fail('Phone number already exists.', 400)
    db.refresh(u)
    return session_response(db, u)


@app.post('/api/login')
def login(body: LoginBody, db: Session = Depends(get_db)):
    # MVP ONLY: a phone number without OTP does not prove account ownership.
    user = db.scalar(select(User).where(User.phone == body.phone.strip()))
    if user is None:
        fail('User not found.', 404)
    detach_temporary_member(db, user.id)
    db.commit()
    return session_response(db, user)


@app.get('/api/me')
def me(user: User = Depends(current_user)):
    return {'success': True, 'user': user_dict(user)}


@app.put('/api/users/me')
def profile_update(body: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.name = body.name.strip()
    user.role = body.role
    if body.avatar is not None:
        user.avatar = body.avatar
    for traveler in db.scalars(select(Traveler).where(Traveler.user_id == user.id)):
        traveler.name, traveler.avatar = user.name, user.avatar
    db.commit()
    return {'success': True, 'user': user_dict(user)}


@app.post('/api/logout')
def logout(authorization: str | None = Header(default=None), user: User = Depends(current_user), db: Session = Depends(get_db)):
    detach_temporary_member(db, user.id)
    db.execute(delete(SessionToken).where(
        SessionToken.token == authorization[7:], SessionToken.user_id == user.id))
    db.commit()
    return {'success': True}

@app.post('/api/stations')
def create_station(body: StationCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    station = Station(vehicle_type=body.vehicle_type.strip(), origin_lat=body.origin_lat,
                      origin_lng=body.origin_lng, dest_lat=body.dest_lat, dest_lng=body.dest_lng,
                      fare=body.fare.strip(), creator_name=user.name,
                      hours=json.dumps(body.hours, ensure_ascii=False))
    db.add(station)
    db.commit()
    db.refresh(station)
    return {'success': True, 'station_id': station.id}


@app.get('/api/stations')
def list_stations(db: Session = Depends(get_db)):
    return [{'id': s.id, 'vehicle_type': s.vehicle_type, 'origin_lat': s.origin_lat,
             'origin_lng': s.origin_lng, 'dest_lat': s.dest_lat, 'dest_lng': s.dest_lng,
             'fare': s.fare, 'creator_name': s.creator_name,
             'hours': json.loads(s.hours or '[]')} for s in db.scalars(select(Station).order_by(Station.id.desc()).limit(500))]


@app.post('/api/travelers')
def upsert_traveler(body: TravelerUpsert, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(body.user_id, user)
    if body.travel_mode == 'later' and (not body.travel_date or not body.travel_time):
        fail('تاریخ و زمان سفر را انتخاب کنید.')
    row = traveler_for(db, user.id)
    if row is None:
        # Group IDs must not equal user IDs; otherwise a returning traveler may
        # be accidentally attached to an old group whose leader departed.
        group = TripGroup()
        db.add(group)
        db.flush()
        row = Traveler(user_id=user.id, group_id=1_000_000 + group.id)
        db.add(row)
    row.name, row.avatar = user.name, user.avatar
    row.lat, row.lng, row.dest_name = body.lat, body.lng, body.dest_name
    row.travel_mode, row.travel_date, row.travel_time = body.travel_mode, body.travel_date, body.travel_time
    row.timestamp = utcnow()
    presence = db.get(TravelerPresence, user.id)
    if presence is None:
        presence = TravelerPresence(user_id=user.id)
        db.add(presence)
    presence.updated_at = utcnow()
    db.commit()
    return {'success': True}


@app.get('/api/travelers')
def get_travelers(exclude_id: int = 0, travel_mode: str = 'now', travel_date: str = '',
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(exclude_id, user)
    me = traveler_for(db, user.id)
    my_group = me.group_id if me else None
    cutoff = utcnow() - timedelta(seconds=45)
    available_users = set(db.scalars(select(TravelerPresence.user_id).where(
        TravelerPresence.updated_at >= cutoff)))
    rows = list(db.scalars(select(Traveler)))
    by_user = {r.user_id: r for r in rows}
    grouped = defaultdict(list)
    for row in rows:
        grouped[row.group_id].append(row)

    def matches_trip(m):
        if travel_mode == 'later':
            return m.travel_mode == 'later' and m.travel_date == travel_date
        return m.travel_mode == 'now' and m.user_id in available_users

    result = []
    # Permanent groups are advertised as ONE match. Only a member with an active
    # matching trip must be online; the group member listing is persistent.
    all_perm_ids = set()
    for group in db.scalars(select(PermanentGroup).order_by(PermanentGroup.id)):
        member_ids = list(db.scalars(select(PermanentMember.user_id).where(
            PermanentMember.group_id == group.id)))
        all_perm_ids.update(member_ids)
        if user.id in member_ids or len(member_ids) >= 4 or not member_ids:
            continue
        matched = [by_user[uid] for uid in member_ids if uid in by_user and matches_trip(by_user[uid])]
        if not matched:
            continue
        users = [db.get(User, uid) for uid in member_ids]
        users = [u for u in users if u]
        result.append({'id': 2_000_000 + group.id, 'perm_group_id': group.id,
            'lat': sum(m.lat for m in matched) / len(matched),
            'lng': sum(m.lng for m in matched) / len(matched),
            'dest_name': matched[0].dest_name, 'member_count': len(users),
            'members': [{'id': u.id, 'name': u.name, 'avatar': u.avatar} for u in users]})

    blocked = {r.sender_id for r in db.scalars(select(RideRequest).where(
        RideRequest.receiver_id == user.id, RideRequest.status == 'pending',
        RideRequest.perm_group_id.is_(None)))}
    for gid, members in grouped.items():
        if gid == my_group or len(members) >= 4 or any(m.user_id in blocked for m in members):
            continue
        # A permanent group's members must not be duplicated as standalone matches.
        if any(m.user_id in all_perm_ids for m in members):
            continue
        matched = [m for m in members if matches_trip(m)]
        if not matched:
            continue
        result.append({'id': gid,
            'lat': sum(m.lat for m in matched) / len(matched),
            'lng': sum(m.lng for m in matched) / len(matched),
            'dest_name': matched[0].dest_name, 'member_count': len(members),
            'members': [{'id': m.user_id, 'name': m.name, 'avatar': m.avatar}
                        for m in members]})
    return result

@app.delete('/api/travelers/{user_id}')
def delete_traveler(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(user_id, user)
    detach_temporary_member(db, user_id)
    db.commit()
    return {'success': True}

@app.post('/api/requests')
def send_request(body: RequestCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(body.sender_id, user)
    sender = traveler_for(db, user.id)
    if sender is None:
        fail('برای ارسال درخواست، ابتدا مسیر همسفر را انتخاب کنید.')
    permanent_id = body.perm_group_id
    if permanent_id is None:
        # Compatibility for an old browser with a stale temporary-group card:
        # never create a new temporary request for a converted group.
        candidate_groups = list(db.scalars(select(PermanentMember.group_id).where(
            PermanentMember.user_id == body.receiver_id)))
        if len(candidate_groups) == 1:
            permanent_id = candidate_groups[0]
        elif len(candidate_groups) > 1:
            fail('برای انتخاب گروه دائمی مشخص، فهرست همسفران را به‌روز کنید.', 409)
    if permanent_id is not None:
        perm = db.get(PermanentGroup, permanent_id)
        if perm is None:
            fail('گروه دائمی پیدا نشد.', 404)
        if db.get(PermanentMember, (perm.id, user.id)):
            fail('شما در حال حاضر عضو این گروه هستید.')
        members = list(db.scalars(select(PermanentMember.user_id).where(
            PermanentMember.group_id == perm.id)))
        if len(members) >= 4:
            fail('ظرفیت گروه تکمیل است.')
        if body.receiver_id not in members:
            fail('عضو انتخاب شده دیگر در این گروه نیست.', 409)
        existing = db.scalar(select(RideRequest).where(
            RideRequest.sender_id == user.id, RideRequest.perm_group_id == perm.id,
            RideRequest.status == 'pending'))
        if existing:
            return {'success': True, 'request_id': existing.id}
        new = RideRequest(sender_id=user.id, sender_name=user.name,
            sender_avatar=user.avatar, receiver_id=body.receiver_id,
            perm_group_id=perm.id, status='pending')
    else:
        receiver = traveler_for(db, body.receiver_id)
        if not receiver or sender.group_id == receiver.group_id:
            fail('همسفر موردنظر دیگر در دسترس نیست.')
        if db.scalar(select(func.count()).select_from(Traveler).where(
            Traveler.group_id == receiver.group_id)) >= 4:
            fail('ظرفیت گروه تکمیل است.')
        existing = db.scalar(select(RideRequest).where(
            RideRequest.sender_id == user.id, RideRequest.receiver_id == receiver.user_id,
            RideRequest.perm_group_id.is_(None), RideRequest.status == 'pending'))
        if existing:
            return {'success': True, 'request_id': existing.id}
        new = RideRequest(sender_id=user.id, sender_name=user.name,
            sender_avatar=user.avatar, receiver_id=receiver.user_id, status='pending')
    db.add(new)
    db.commit()
    db.refresh(new)
    return {'success': True, 'request_id': new.id}

@app.get('/api/requests/incoming/{user_id}')
def incoming(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(user_id, user)
    mine = traveler_for(db, user.id)
    if not mine:
        return {'requests': []}
    receiver_ids = list(db.scalars(select(Traveler.user_id).where(Traveler.group_id == mine.group_id)))
    rows = db.scalars(select(RideRequest).where(
        RideRequest.receiver_id.in_(receiver_ids),
        RideRequest.perm_group_id.is_(None),
        RideRequest.status == 'pending').order_by(RideRequest.id.desc()))
    return {'requests': [pending_request_dict(r) for r in rows]}


@app.get('/api/requests/incoming-permanent')
def permanent_incoming(user: User = Depends(current_user), db: Session = Depends(get_db)):
    memberships = list(db.scalars(select(PermanentMember.group_id).where(
        PermanentMember.user_id == user.id)))
    if not memberships:
        return {'requests': []}
    groups = {gid: db.get(PermanentGroup, gid) for gid in memberships}
    rows = db.scalars(select(RideRequest).where(
        RideRequest.perm_group_id.in_(memberships),
        RideRequest.status == 'pending').order_by(RideRequest.id.desc()))
    return {'requests': [pending_request_dict(r, groups[r.perm_group_id]) for r in rows]}

@app.get('/api/requests/accepted/{user_id}')
def accepted(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(user_id, user)
    me = traveler_for(db, user.id)
    if me is None:
        return {'requests': []}
    rows = db.scalars(select(Traveler).where(Traveler.group_id == me.group_id, Traveler.user_id != user.id))
    return {'requests': [{'id': r.user_id, 'other_name': r.name, 'other_avatar': r.avatar} for r in rows]}


@app.get('/api/requests/status/{request_id}')
def request_status(request_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    req = db.get(RideRequest, request_id)
    if req is None or req.sender_id != user.id:
        return {'status': None}
    return {'status': req.status, **({'perm_group_id': req.perm_group_id} if req.status == 'accepted' else {})}


@app.post('/api/requests/{request_id}/respond')
def respond(request_id: int, body: RequestRespond, user: User = Depends(current_user), db: Session = Depends(get_db)):
    req = db.get(RideRequest, request_id)
    if not req or req.status != 'pending':
        fail('این درخواست دیگر فعال نیست.', 409)
    if req.perm_group_id is not None:
        perm = db.get(PermanentGroup, req.perm_group_id)
        if perm is None or db.get(PermanentMember, (perm.id, user.id)) is None:
            fail('شما عضو این گروه دائمی نیستید.', 403)
        if body.status != 'accepted':
            req.status = body.status
            db.commit()
            return {'success': True, 'perm_group_id': perm.id}
        if db.get(PermanentMember, (perm.id, req.sender_id)):
            fail('کاربر در حال حاضر عضو این گروه است.', 409)
        member_count = db.scalar(select(func.count()).select_from(PermanentMember).where(
            PermanentMember.group_id == perm.id))
        if member_count >= 4:
            req.status = 'rejected'
            db.commit()
            return {'success': False, 'error': 'ظرفیت گروه تکمیل است.'}
        sender = traveler_for(db, req.sender_id)
        if sender is None:
            req.status = 'cancelled'
            db.commit()
            fail('درخواست‌دهنده دیگر فعال نیست.', 409)
        # Join permanent membership ONLY. They should not join any temporary chat.
        detach_temporary_member(db, sender.user_id, keep_route=True)
        db.add(PermanentMember(group_id=perm.id, user_id=sender.user_id))
        req.status = 'accepted'
        req.perm_group_id = perm.id
        if member_count + 1 >= 3:
            perm.avatar = '/three_users.png'
        db.execute(update(RideRequest).where(RideRequest.sender_id == sender.user_id,
            RideRequest.status == 'pending', RideRequest.id != req.id).values(status='cancelled'))
        db.add(PermanentMessage(group_id=perm.id, sender_id=sender.user_id,
            sender_name=sender.name, sender_avatar=sender.avatar,
            text='به گروه پیوست.'))
        db.commit()
        return {'success': True, 'perm_group_id': perm.id}

    receiver = traveler_for(db, req.receiver_id)
    acting = traveler_for(db, user.id)
    if not receiver or not acting or acting.group_id != receiver.group_id:
        fail('عدم دسترسی', 403)
    if body.status != 'accepted':
        req.status = body.status
        db.commit()
        return {'success': True}
    sender = traveler_for(db, req.sender_id)
    if not sender or sender.group_id == receiver.group_id:
        fail('همسفر دیگر در دسترس نیست.', 409)
    source = list(db.scalars(select(Traveler).where(Traveler.group_id == sender.group_id)))
    count = db.scalar(select(func.count()).select_from(Traveler).where(
        Traveler.group_id == receiver.group_id))
    if count + len(source) > 4:
        req.status = 'rejected'
        db.commit()
        return {'success': False, 'error': 'ظرفیت گروه تکمیل است.'}
    target = receiver.group_id
    for traveler in source:
        traveler.group_id = target
    req.status = 'accepted'
    db.execute(update(RideRequest).where(RideRequest.sender_id == sender.user_id,
        RideRequest.status == 'pending', RideRequest.id != req.id).values(status='cancelled'))
    db.add(GroupMessage(group_id=target, sender_id=0, sender_name='سیستم',
        sender_avatar='system', text=f'{sender.name} به گروه پیوست.'))
    db.commit()
    return {'success': True, 'perm_group_id': None}

@app.delete('/api/requests/{request_id}')
def delete_request(request_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    req = db.get(RideRequest, request_id)
    if req is None:
        return {'success': True}
    if req.sender_id != user.id:
        fail('عدم دسترسی', 403)
    if req.status == 'pending':
        req.status = 'cancelled'
        db.commit()
    return {'success': True}


@app.post('/api/requests/cancel-accepted/{target_id}')
def kick_traveler(target_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    actor = traveler_for(db, user.id)
    target = traveler_for(db, target_id)
    if target is None or actor is None or actor.group_id != target.group_id or user.id == target_id:
        fail('عدم دسترسی', 403)
    detach_temporary_member(db, target_id, keep_route=True)
    db.add(Notification(user_id=target_id, message='شما از گروه همسفران حذف شدید.'))
    db.commit()
    return {'success': True}


@app.get('/api/notifications/{user_id}')
def notifications(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(user_id, user)
    rows = list(db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.id)))
    result = [{'id': n.id, 'message': n.message} for n in rows]
    for n in rows:
        db.delete(n)
    db.commit()
    return {'notifications': result}


@app.get('/api/chat')
def group_chat(userId: int = Query(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(userId, user)
    me = traveler_for(db, user.id)
    if not me:
        return {'messages': []}
    rows = db.scalars(select(GroupMessage).where(GroupMessage.group_id == me.group_id).order_by(GroupMessage.id.desc()).limit(100))
    return {'messages': [as_message(m) for m in reversed(list(rows))]}


@app.post('/api/chat')
def send_group_chat(body: MessageCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(body.sender_id, user)
    me = traveler_for(db, user.id)
    if not me:
        fail('شما گروه فعالی ندارید.', 400)
    db.add(GroupMessage(group_id=me.group_id, sender_id=user.id, sender_name=user.name, sender_avatar=user.avatar, text=body.text.strip()))
    db.commit()
    return {'success': True}


@app.post('/api/perm_groups/convert')
def convert_group(body: PermanentConvert, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(body.userId, user)
    me = traveler_for(db, user.id)
    if not me:
        return {'success': False, 'error': 'شما در هیچ گروه فعالی نیستید.'}
    members = list(db.scalars(select(Traveler).where(Traveler.group_id == me.group_id)))
    if len(members) < 2:
        return {'success': False, 'error': 'گروه شما باید حداقل ۲ نفر باشد.'}
    existing = db.scalar(select(PermanentGroup).where(
        PermanentGroup.active_group_id == me.group_id))
    if existing:
        return {'success': True, 'group_id': existing.id}
    group = PermanentGroup(name=f'گروه سفر ({len(members)} نفره)',
        avatar='/three_users.png' if len(members) >= 3 else '/two_users.jpg',
        owner_id=user.id, active_group_id=me.group_id)
    db.add(group)
    db.flush()
    for member in members:
        db.add(PermanentMember(group_id=group.id, user_id=member.user_id))
    convert_temporary_members(db, group, me.group_id)
    db.commit()
    return {'success': True, 'group_id': group.id}

@app.get('/api/perm_groups/{group_id}/requests')
def permanent_group_requests(group_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    member_required(db, group_id, user.id)
    group = db.get(PermanentGroup, group_id)
    if group is None:
        fail('گروه پیدا نشد.', 404)
    rows = db.scalars(select(RideRequest).where(
        RideRequest.perm_group_id == group_id,
        RideRequest.status == 'pending').order_by(RideRequest.id.desc()))
    return {'requests': [pending_request_dict(r, group) for r in rows]}


@app.get('/api/perm_groups/{user_id}')
def permanent_groups(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(user_id, user)
    groups = db.scalars(select(PermanentGroup).join(PermanentMember, PermanentMember.group_id == PermanentGroup.id).where(PermanentMember.user_id == user.id).order_by(PermanentGroup.id.desc()))
    result = []
    for g in groups:
        last = db.scalar(select(PermanentMessage).where(PermanentMessage.group_id == g.id).order_by(PermanentMessage.id.desc()).limit(1))
        result.append({'id': g.id, 'name': g.name, 'avatar': g.avatar, 'owner_id': g.owner_id,
                       'last_msg': last.text if last else None, 'last_time': last.timestamp.isoformat(sep=' ') if last else None})
    result.sort(key=lambda g: (g['last_time'] or '', g['id']), reverse=True)
    return {'groups': result}


@app.get('/api/perm_groups/{group_id}/info')
def perm_info(group_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    member_required(db, group_id, user.id)
    group = db.get(PermanentGroup, group_id)
    if not group:
        return {'success': False}
    users = db.scalars(select(User).join(PermanentMember, PermanentMember.user_id == User.id).where(PermanentMember.group_id == group_id))
    return {'success': True, 'group': {'id': group.id, 'name': group.name, 'avatar': group.avatar, 'owner_id': group.owner_id},
            'members': [{'id': u.id, 'name': u.name, 'avatar': u.avatar} for u in users]}


@app.post('/api/perm_groups/{group_id}/kick')
def perm_kick(group_id: int, body: PermanentKick, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(body.ownerId, user)
    group = db.get(PermanentGroup, group_id)
    if not group or group.owner_id != user.id or body.targetId == user.id:
        return {'success': False, 'error': 'عدم دسترسی'}
    member = db.get(PermanentMember, (group_id, body.targetId))
    if member:
        db.delete(member)
        db.commit()
    return {'success': True}


@app.put('/api/perm_groups/{group_id}/rename')
def perm_rename(group_id: int, body: PermanentRename, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(body.ownerId, user)
    group = db.get(PermanentGroup, group_id)
    if not group or group.owner_id != user.id:
        return {'success': False, 'error': 'فقط مالک گروه می‌تواند نام آن را تغییر دهد.'}
    group.name = body.newName.strip()
    db.commit()
    return {'success': True}


@app.get('/api/perm_groups/{group_id}/messages')
def perm_messages(group_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    member_required(db, group_id, user.id)
    rows = db.scalars(select(PermanentMessage).where(PermanentMessage.group_id == group_id).order_by(PermanentMessage.id.desc()).limit(100))
    return {'messages': [as_message(m) for m in reversed(list(rows))]}


@app.post('/api/perm_groups/{group_id}/messages')
def perm_message_post(group_id: int, body: MessageCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(body.sender_id, user)
    member_required(db, group_id, user.id)
    db.add(PermanentMessage(group_id=group_id, sender_id=user.id, sender_name=user.name, sender_avatar=user.avatar, text=body.text.strip()))
    db.commit()
    return {'success': True}


@app.get('/api/planned_requests')
def list_planned(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(PlannedRequest).where(PlannedRequest.user_id == user.id).order_by(PlannedRequest.created_at.desc()))
    return {'requests': [{'id': r.id, 'date': r.date, 'time': r.time, 'startLabel': r.start_label,
                          'destLabel': r.dest_label, 'createdAt': int(r.created_at.timestamp() * 1000)} for r in rows]}


@app.post('/api/planned_requests')
def create_planned(body: PlannedCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    req = PlannedRequest(id='pl_' + secrets.token_hex(12), user_id=user.id, date=body.date, time=body.time,
                         start_label=body.startLabel, dest_label=body.destLabel)
    db.add(req)
    db.commit()
    return {'success': True, 'id': req.id}


@app.delete('/api/planned_requests/{request_id}')
def remove_planned(request_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(delete(PlannedRequest).where(PlannedRequest.id == request_id, PlannedRequest.user_id == user.id))
    db.commit()
    return {'success': True}


# In Docker, serve the compiled React SPA from the same origin as the API.
DIST_DIR = Path(os.getenv('FRONTEND_DIST', Path(__file__).resolve().parents[2] / 'frontend' / 'dist'))
if DIST_DIR.is_dir():
    app.mount('/assets', StaticFiles(directory=DIST_DIR / 'assets'), name='assets')
    @app.get('/{full_path:path}', include_in_schema=False)
    def spa_fallback(full_path: str):
        if full_path.startswith('api/'):
            fail('Endpoint not found', 404)
        requested = (DIST_DIR / full_path).resolve()
        if requested.is_relative_to(DIST_DIR.resolve()) and requested.is_file():
            return FileResponse(requested)
        return FileResponse(DIST_DIR / 'index.html')
