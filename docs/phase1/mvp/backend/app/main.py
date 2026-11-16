"""Nimrah MVP API. Compatible with the original /api endpoint and response contract."""
import json
import os
import secrets
import math
from datetime import datetime, date, timezone, time as time_type
from collections import defaultdict
from datetime import timedelta
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, func, delete, update, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import (User, SessionToken, Station, Traveler, TripGroup, TravelerPresence, RideRequest, Notification,
                     GroupMessage, PermanentGroup, PermanentMember, PermanentMessage,
                     PlannedRequest, PermanentRecruitment, PausedTravelerSearch, utcnow)
from .schemas import (UserRegister, LoginBody, ProfileUpdate, StationCreate,
                      TravelerUpsert, RequestCreate, RequestRespond, MessageCreate,
                      PermanentConvert, PermanentRename, PermanentKick, PlannedCreate, PermanentRecruitmentCreate)

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Existing SQLite databases predate request timestamps. Upgrade in place
    # without deleting messages, requests, or group memberships.
    if not any(col['name'] == 'created_at' for col in inspect(engine).get_columns('ride_requests')):
        with engine.begin() as connection:
            connection.execute(text('ALTER TABLE ride_requests ADD COLUMN created_at TIMESTAMP'))
            connection.execute(text('UPDATE ride_requests SET created_at = :now WHERE created_at IS NULL'),
                               {'now': utcnow()})
    from .database import SessionLocal
    with SessionLocal() as db:
        legacy = list(db.scalars(select(PermanentGroup).where(
            PermanentGroup.active_group_id.is_not(None))))
        for group in legacy:
            convert_temporary_members(db, group, group.active_group_id)
        cutoff = utcnow() - timedelta(minutes=5)
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
app.add_middleware(
    CORSMiddleware, 
    allow_origins=[origin.strip() for origin in os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')], 
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*']
)

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
    db.execute(update(RideRequest).where(
        RideRequest.status == 'pending',
        (RideRequest.sender_id == uid) |
        ((RideRequest.receiver_id == uid) & RideRequest.perm_group_id.is_(None))
    ).values(status='cancelled'))

def convert_temporary_members(db: Session, permanent: PermanentGroup, old_group: int):
    """Preserve chat history, end the temporary search, and require opt-in recruitment."""
    existing_messages = list(db.scalars(select(GroupMessage).where(
        GroupMessage.group_id == old_group).order_by(GroupMessage.id)))
    for msg in existing_messages:
        if msg.sender_id:
            db.add(PermanentMessage(group_id=permanent.id, sender_id=msg.sender_id,
                sender_name=msg.sender_name, sender_avatar=msg.sender_avatar,
                text=msg.text, timestamp=msg.timestamp))
    members = list(db.scalars(select(Traveler).where(Traveler.group_id == old_group)))
    user_ids = [m.user_id for m in members]
    if user_ids:
        # Pending invitations to a temporary ride must NOT silently become
        # requests to join the permanent group's private message history.
        db.execute(update(RideRequest).where(RideRequest.status == 'pending',
            RideRequest.perm_group_id.is_(None),
            (RideRequest.receiver_id.in_(user_ids)) | (RideRequest.sender_id.in_(user_ids))
        ).values(status='cancelled'))
        for uid in user_ids:
            if db.get(PausedTravelerSearch, uid) is None:
                db.add(PausedTravelerSearch(user_id=uid))
        db.execute(delete(TravelerPresence).where(TravelerPresence.user_id.in_(user_ids)))
        db.execute(delete(Traveler).where(Traveler.user_id.in_(user_ids)))
    db.execute(delete(GroupMessage).where(GroupMessage.group_id == old_group))
    permanent.active_group_id = None

IRAN_TZ = timezone(timedelta(hours=3, minutes=30))

def iran_today():
    return datetime.now(IRAN_TZ).date()

def recruitment_active(row: PermanentRecruitment | None) -> bool:
    return row is not None and row.expires_at > utcnow()

def recruitment_info(row: PermanentRecruitment | None):
    if not recruitment_active(row):
        return {'active': False}
    return {'active': True, 'origin_label': row.origin_label,
        'dest_label': row.dest_label, 'travel_mode': row.travel_mode,
        'travel_date': row.travel_date, 'travel_time': row.travel_time,
        'expires_at': row.expires_at.isoformat() + 'Z'}

def km_between(lat1, lon1, lat2, lon2):
    r1, r2 = math.radians(lat1), math.radians(lat2)
    dr, dl = r2 - r1, math.radians(lon2 - lon1)
    a = math.sin(dr/2)**2 + math.cos(r1)*math.cos(r2)*math.sin(dl/2)**2
    return 12742 * math.asin(min(1, math.sqrt(a)))

def search_date_to_iso(relative: str):
    offset = {'today': 0, 'tomorrow': 1, 'day_after': 2}.get(relative)
    if offset is None:
        return relative
    return (iran_today() + timedelta(days=offset)).isoformat()


def pending_request_dict(req: RideRequest, group: PermanentGroup | None = None):
    result = {'id': req.id, 'sender_id': req.sender_id,
        'sender_name': req.sender_name, 'sender_avatar': req.sender_avatar,
        'receiver_id': req.receiver_id, 'status': req.status,
        'created_at': req.created_at.isoformat(sep=' ') if req.created_at else None}
    if group is not None:
        result.update(perm_group_id=group.id, perm_group_name=group.name)
    return result

@app.get('/api/health')
def health():
    return {'status': 'ok'}

ADMIN_PHONES = {"09111234567"}

@app.post('/api/register')
def register(body: UserRegister, db: Session = Depends(get_db)):
    phone = body.phone.strip()
    if db.scalar(select(User).where(User.phone == phone)):
        fail('Phone number already exists.', 400)
    assigned_role = 'admin' if phone in ADMIN_PHONES else body.role
    u = User(name=body.name.strip(), phone=phone, role=assigned_role, avatar=body.avatar, birth_date=body.birth_date)
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
    user = db.scalar(
        select(User).where(User.phone == body.phone.strip())
    )
    if user is None:
        fail('User not found.', 404)
    if user.phone in ADMIN_PHONES and user.role != 'admin':
        user.role = 'admin'
        db.commit()
    return session_response(db, user)

@app.get('/api/me')
def me(user: User = Depends(current_user)):
    return {'success': True, 'user': user_dict(user)}

@app.get('/api/me/recruitment')
def my_active_recruitment(user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Only an owned, currently active recruitment can supply the Hamsafar route.
    # A person may own several groups; the most recently activated one wins.
    recruitment = db.scalar(
        select(PermanentRecruitment)
        .join(PermanentGroup, PermanentRecruitment.group_id == PermanentGroup.id)
        .join(PermanentMember, PermanentMember.group_id == PermanentGroup.id)
        .where(PermanentGroup.owner_id == user.id,
               PermanentMember.user_id == user.id,
               PermanentRecruitment.expires_at > utcnow())
        .order_by(PermanentRecruitment.created_at.desc(), PermanentRecruitment.group_id.desc())
        .limit(1)
    )
    if recruitment is None:
        return {'recruitment': None}
    return {'recruitment': {
        'group_id': recruitment.group_id,
        'origin_lat': recruitment.origin_lat,
        'origin_lng': recruitment.origin_lng,
        'dest_lat': recruitment.dest_lat,
        'dest_lng': recruitment.dest_lng,
        'origin_label': recruitment.origin_label,
        'dest_label': recruitment.dest_label,
        'travel_mode': recruitment.travel_mode,
        'travel_date': recruitment.travel_date,
        'travel_time': recruitment.travel_time
    }}

@app.put('/api/users/me')
def profile_update(body: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.name = body.name.strip()
    user.role = 'admin' if user.phone in ADMIN_PHONES else body.role
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
    paused = db.get(PausedTravelerSearch, user.id)
    if paused is not None:
        if not body.new_search:
            return {'success': True, 'paused': True}
        db.delete(paused)
        db.flush()
    row = traveler_for(db, user.id)

    # Reopening Hamsafar (or recalculating the same route) is NOT a new trip.
    # The frontend can repeat a new_search request when panels open; resetting
    # an unchanged trip would cancel outstanding ride requests in
    # detach_temporary_member() and leave stale accept/reject cards visible.
    # Only actually changing the journey should end the old temporary group.
    same_trip = row is not None and (
        abs(row.lat - body.lat) < 0.00001 and
        abs(row.lng - body.lng) < 0.00001 and
        row.travel_mode == body.travel_mode and
        row.travel_date == body.travel_date and
        row.travel_time == body.travel_time
    )
    if row is not None and not same_trip:
        detach_temporary_member(db, user.id, keep_route=True)
        row = traveler_for(db, user.id)

    if row is None:
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

@app.post('/api/travelers/heartbeat')
def traveler_heartbeat(user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = traveler_for(db, user.id)
    if row is None:
        fail('ابتدا مسیر همسفر خود را انتخاب کنید.', 409)
    presence = db.get(TravelerPresence, user.id)
    if presence is None:
        presence = TravelerPresence(user_id=user.id)
        db.add(presence)
    presence.updated_at = utcnow()
    db.commit()
    return {'success': True}

@app.get('/api/travelers')
def get_travelers(exclude_id: int = 0, travel_mode: str = 'now', travel_date: str = '',
                  travel_time: str = '', origin_lat: float | None = None,
                  origin_lng: float | None = None, dest_lat: float | None = None,
                  dest_lng: float | None = None,
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(exclude_id, user)
    me = traveler_for(db, user.id)
    my_group = me.group_id if me else None
    cutoff = utcnow() - timedelta(minutes=3)
    available_users = set(db.scalars(select(TravelerPresence.user_id).where(
        TravelerPresence.updated_at >= cutoff)))
    rows = list(db.scalars(select(Traveler)))
    # A recruiting owner may temporarily publish a route in Hamsafar to send
    # requests. Do not show that same person as a separate one-member group
    # when their permanent group is already advertised for this exact trip.
    owner_recruitments = list(db.execute(
        select(PermanentRecruitment, PermanentGroup.owner_id)
        .join(PermanentGroup, PermanentRecruitment.group_id == PermanentGroup.id)
        .where(PermanentRecruitment.expires_at > utcnow())
    ))
    grouped = defaultdict(list)
    for row in rows:
        grouped[row.group_id].append(row)

    def matches_trip(m):
        if travel_mode == 'later':
            return m.travel_mode == 'later' and m.travel_date == travel_date
        return m.travel_mode == 'now' and m.user_id in available_users

    result = []
    # Temporary searches are discoverable automatically. Never attach the
    # permanent-group memberships of their members to these results.
    for gid, members in grouped.items():
        if gid == my_group or len(members) >= 4:
            continue
        if len(members) == 1:
            solo = members[0]
            if any(owner_id == solo.user_id and rec.travel_mode == solo.travel_mode
                   and abs(rec.origin_lat - solo.lat) < 0.00001
                   and abs(rec.origin_lng - solo.lng) < 0.00001
                   and rec.dest_label == solo.dest_name
                   and (rec.travel_mode != 'later' or
                        rec.travel_date == search_date_to_iso(solo.travel_date))
                   for rec, owner_id in owner_recruitments):
                continue
        matched = [m for m in members if matches_trip(m)]
        if not matched:
            continue
        result.append({'id': gid, 'kind': 'temporary',
            'lat': sum(m.lat for m in matched) / len(matched),
            'lng': sum(m.lng for m in matched) / len(matched),
            'dest_name': matched[0].dest_name, 'member_count': len(members),
            'members': [{'id': m.user_id, 'name': m.name, 'avatar': m.avatar}
                        for m in members]})

    # Permanent groups are discoverable only through an explicit, unexpired
    # recruitment session; viewers must match both ends of that particular trip.
    if None not in (origin_lat, origin_lng, dest_lat, dest_lng):
        my_perm_ids = set(db.scalars(select(PermanentMember.group_id).where(
            PermanentMember.user_id == user.id)))
        recruitments = [rec for rec, _owner_id in owner_recruitments]
        for rec in recruitments:
            if rec.group_id in my_perm_ids or rec.travel_mode != travel_mode:
                continue
            if travel_mode == 'later':
                if rec.travel_date != search_date_to_iso(travel_date) or not travel_time:
                    continue
                try:
                    a = time_type.fromisoformat(travel_time)
                    b = time_type.fromisoformat(rec.travel_time)
                    if abs((a.hour*60+a.minute) - (b.hour*60+b.minute)) > 90:
                        continue
                except ValueError:
                    continue
            if (km_between(origin_lat, origin_lng, rec.origin_lat, rec.origin_lng) > 15 or
                km_between(dest_lat, dest_lng, rec.dest_lat, rec.dest_lng) > 20):
                continue
            g = db.get(PermanentGroup, rec.group_id)
            if g is None:
                continue
            members = list(db.scalars(select(User).join(PermanentMember,
                PermanentMember.user_id == User.id).where(
                PermanentMember.group_id == rec.group_id)))
            if not members or len(members) >= 4 or not any(m.id == g.owner_id for m in members):
                continue
            result.append({'id': -g.id, 'kind': 'permanent',
                'perm_group_id': g.id, 'group_name': g.name, 'receiver_id': g.owner_id,
                'lat': rec.origin_lat, 'lng': rec.origin_lng,
                'dest_name': rec.dest_label, 'member_count': len(members),
                'members': [{'id': m.id, 'name': m.name, 'avatar': m.avatar}
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
    
    if permanent_id is not None:
        perm = db.get(PermanentGroup, permanent_id)
        if perm is None:
            fail('گروه دائمی پیدا نشد.', 404)
        rec = db.get(PermanentRecruitment, perm.id)
        if not recruitment_active(rec):
            fail('این گروه در حال حاضر عضو جدید نمی‌پذیرد.', 409)
        if (body.dest_lat is None or body.dest_lng is None or
            km_between(sender.lat, sender.lng, rec.origin_lat, rec.origin_lng) > 15 or
            km_between(body.dest_lat, body.dest_lng, rec.dest_lat, rec.dest_lng) > 20 or
            sender.travel_mode != rec.travel_mode):
            fail('مسیر شما با سفر این گروه تطابق ندارد.', 409)
        if rec.travel_mode == 'later':
            if search_date_to_iso(sender.travel_date) != rec.travel_date or not sender.travel_time:
                fail('زمان سفر شما با گروه تطابق ندارد.', 409)
            try:
                a = time_type.fromisoformat(sender.travel_time)
                b = time_type.fromisoformat(rec.travel_time)
            except ValueError:
                fail('زمان سفر شما معتبر نیست.', 409)
            if abs((a.hour * 60 + a.minute) - (b.hour * 60 + b.minute)) > 90:
                fail('زمان سفر شما با گروه تطابق ندارد.', 409)
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
        # STRICTLY TEMPORARY REQUEST - Allows forming new live map rides even if a permanent group exists
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
        if not recruitment_active(db.get(PermanentRecruitment, perm.id)):
            req.status = 'cancelled'
            db.commit()
            fail('جستجوی عضو جدید برای این گروه متوقف شده است.', 409)
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
        detach_temporary_member(db, sender.user_id)
        # The old solo temporary search must not be auto-published again
        # while the new permanent member's existing browser is still polling.
        if db.get(PausedTravelerSearch, sender.user_id) is None:
            db.add(PausedTravelerSearch(user_id=sender.user_id))
        db.add(PermanentMember(group_id=perm.id, user_id=sender.user_id))
        req.status = 'accepted'
        req.perm_group_id = perm.id
        if member_count + 1 >= 3:
            perm.avatar = '/three_users.png'
        db.execute(update(RideRequest).where(RideRequest.sender_id == sender.user_id,
            RideRequest.status == 'pending', RideRequest.id != req.id).values(status='cancelled'))
        db.add(PermanentMessage(group_id=perm.id, sender_id=sender.user_id,
            sender_name='سیستم', sender_avatar='system',
            text=f'{sender.name} به گروه پیوست.'))
        if member_count + 1 >= 4:
            db.execute(delete(PermanentRecruitment).where(PermanentRecruitment.group_id == perm.id))
            db.execute(update(RideRequest).where(RideRequest.perm_group_id == perm.id,
                RideRequest.status == 'pending').values(status='cancelled'))
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
    member_group_ids = select(PermanentMember.group_id).where(PermanentMember.user_id == user.id)
    
    # WRAP IN LIST to prevent SQLite cursor exhaustion during iteration
    groups = list(db.scalars(select(PermanentGroup).where(PermanentGroup.id.in_(member_group_ids)).order_by(PermanentGroup.id.desc())))
    
    result = []
    for g in groups:
        last = db.scalar(select(PermanentMessage).where(PermanentMessage.group_id == g.id).order_by(PermanentMessage.id.desc()).limit(1))
        result.append({'id': g.id, 'name': g.name, 'avatar': g.avatar, 'owner_id': g.owner_id,
                       'last_msg': last.text if last else None, 'last_time': last.timestamp.isoformat(sep=' ') if last else None})
    result.sort(key=lambda g: (g['last_time'] or '', g['id']), reverse=True)
    return {'groups': result}

@app.put('/api/perm_groups/{group_id}/recruitment')
def start_permanent_recruitment(group_id: int, body: PermanentRecruitmentCreate,
        user: User = Depends(current_user), db: Session = Depends(get_db)):
    group = db.get(PermanentGroup, group_id)
    if group is None:
        fail('گروه پیدا نشد.', 404)
    if group.owner_id != user.id or db.get(PermanentMember, (group_id, user.id)) is None:
        fail('فقط مالک گروه می‌تواند جستجوی عضو را فعال کند.', 403)
    member_count = db.scalar(select(func.count()).select_from(PermanentMember).where(
        PermanentMember.group_id == group_id))
    if member_count >= 4:
        fail('ظرفیت گروه تکمیل است.', 409)
    if body.travel_mode == 'later':
        if not body.travel_date or not body.travel_time:
            fail('تاریخ و ساعت حرکت را وارد کنید.')
        try:
            planned = datetime.combine(date.fromisoformat(body.travel_date),
                time_type.fromisoformat(body.travel_time), tzinfo=IRAN_TZ)
        except ValueError:
            fail('تاریخ یا ساعت حرکت معتبر نیست.')
        remaining = planned - datetime.now(IRAN_TZ)
        if remaining <= timedelta(0) or remaining > timedelta(days=90):
            fail('زمان حرکت باید در آینده و حداکثر ۹۰ روز بعد باشد.')
        expires = (planned + timedelta(hours=3)).astimezone(timezone.utc).replace(tzinfo=None)
    else:
        expires = utcnow() + timedelta(hours=3)
    row = db.get(PermanentRecruitment, group_id)
    if row is None:
        row = PermanentRecruitment(group_id=group_id)
        db.add(row)
    row.origin_lat, row.origin_lng = body.origin_lat, body.origin_lng
    row.dest_lat, row.dest_lng = body.dest_lat, body.dest_lng
    row.origin_label, row.dest_label = body.origin_label.strip(), body.dest_label.strip()
    row.travel_mode = body.travel_mode
    row.travel_date = body.travel_date if body.travel_mode == 'later' else ''
    row.travel_time = body.travel_time if body.travel_mode == 'later' else ''
    row.expires_at = expires
    # This timestamp represents the start of the current recruitment session.
    # Refresh it on reactivation so Hamsafar selects the latest chosen group.
    row.created_at = utcnow()
    db.commit()
    return {'success': True, 'recruitment': recruitment_info(row)}

@app.delete('/api/perm_groups/{group_id}/recruitment')
def stop_permanent_recruitment(group_id: int,
        user: User = Depends(current_user), db: Session = Depends(get_db)):
    group = db.get(PermanentGroup, group_id)
    if group is None:
        fail('گروه پیدا نشد.', 404)
    if group.owner_id != user.id:
        fail('فقط مالک گروه می‌تواند جستجوی عضو را متوقف کند.', 403)
    db.execute(delete(PermanentRecruitment).where(PermanentRecruitment.group_id == group_id))
    db.execute(update(RideRequest).where(RideRequest.perm_group_id == group_id,
        RideRequest.status == 'pending').values(status='cancelled'))
    db.commit()
    return {'success': True}

@app.get('/api/perm_groups/{group_id}/info')
def perm_info(group_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    member_required(db, group_id, user.id)
    group = db.get(PermanentGroup, group_id)
    if not group:
        return {'success': False}
    users = db.scalars(select(User).join(PermanentMember, PermanentMember.user_id == User.id).where(PermanentMember.group_id == group_id))
    return {'success': True, 'group': {'id': group.id, 'name': group.name, 'avatar': group.avatar, 'owner_id': group.owner_id},
            'recruitment': recruitment_info(db.get(PermanentRecruitment, group.id)),
            'members': [{'id': u.id, 'name': u.name, 'avatar': u.avatar} for u in users]}

@app.post('/api/perm_groups/{group_id}/kick')
def perm_kick(group_id: int, body: PermanentKick, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_self(body.ownerId, user)
    group = db.get(PermanentGroup, group_id)
    if not group or group.owner_id != user.id or body.targetId == user.id:
        return {'success': False, 'error': 'عدم دسترسی'}
    member = db.get(PermanentMember, (group_id, body.targetId))
    if member:
        removed_user = db.get(User, body.targetId)
        db.add(PermanentMessage(group_id=group_id, sender_id=body.targetId,
            sender_name='سیستم', sender_avatar='system',
            text=f'{removed_user.name if removed_user else "یک عضو"} از گروه حذف شد.'))
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

@app.post('/api/perm_groups/{group_id}/leave')
def perm_leave(group_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    member = db.get(PermanentMember, (group_id, user.id))
    if not member:
        return {'success': False, 'error': 'شما عضو این گروه نیستید.'}
    group = db.get(PermanentGroup, group_id)
    if group is None:
        return {'success': False, 'error': 'گروه پیدا نشد.'}

    # Select the next member deterministically before removing the leaver.
    remaining_ids = list(db.scalars(select(PermanentMember.user_id).where(
        PermanentMember.group_id == group_id,
        PermanentMember.user_id != user.id).order_by(PermanentMember.user_id)))
    if group.owner_id == user.id:
        # Existing behavior: the previous owner's recruitment does not carry over.
        db.execute(delete(PermanentRecruitment).where(PermanentRecruitment.group_id == group_id))
        db.execute(update(RideRequest).where(RideRequest.perm_group_id == group_id,
            RideRequest.status == 'pending').values(status='cancelled'))
        if remaining_ids:
            group.owner_id = remaining_ids[0]

    db.delete(member)
    if remaining_ids:
        # Visible to remaining members, in chronological chat order.
        db.add(PermanentMessage(group_id=group_id, sender_id=user.id,
            sender_name='سیستم', sender_avatar='system', text=f'{user.name} گروه را ترک کرد.'))
    else:
        # Last member: remove the empty group and all group-linked data.
        db.execute(delete(RideRequest).where(RideRequest.perm_group_id == group_id))
        db.delete(group)

    db.commit()
    return {'success': True}

@app.delete('/api/perm_groups/{group_id}')
def perm_delete(group_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    group = db.get(PermanentGroup, group_id)
    if not group:
        return {'success': False, 'error': 'گروه پیدا نشد.'}
    if group.owner_id != user.id:
        return {'success': False, 'error': 'فقط مالک گروه می‌تواند آن را حذف کند.'}
    db.delete(group)
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

# --- ADMIN ENDPOINTS ---
def admin_user(user: User = Depends(current_user)):
    if user.role != 'admin':
        fail('عدم دسترسی. فقط مدیران مجاز هستند.', 403)
    return user

@app.get('/api/admin/stats')
def admin_stats(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    users_count = db.scalar(select(func.count()).select_from(User))
    groups_count = db.scalar(select(func.count()).select_from(PermanentGroup))
    active_travelers = db.scalar(select(func.count()).select_from(TravelerPresence))
    stations_count = db.scalar(select(func.count()).select_from(Station))
    return {'users': users_count, 'groups': groups_count, 'active_travelers': active_travelers, 'stations': stations_count}

@app.get('/api/admin/users')
def admin_users(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    users = db.scalars(select(User).order_by(User.id.desc())).all()
    return {'users': [user_dict(u) for u in users]}

@app.delete('/api/admin/users/{target_id}')
def admin_delete_user(target_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    if target_id == admin.id:
        fail('شما نمی‌توانید حساب مدیریت خود را حذف کنید.')
    db.execute(delete(User).where(User.id == target_id))
    db.commit()
    return {'success': True}

@app.get('/api/admin/groups')
def admin_groups_list(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    groups = db.scalars(select(PermanentGroup).order_by(PermanentGroup.id.desc())).all()
    return {'groups': [{'id': g.id, 'name': g.name, 'owner_id': g.owner_id} for g in groups]}

@app.delete('/api/admin/groups/{group_id}')
def admin_force_delete_group(group_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    db.execute(delete(PermanentGroup).where(PermanentGroup.id == group_id))
    db.commit()
    return {'success': True}


# --- SPA AND STATIC FILE ROUTING ---
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
            
        # SECURE ROUTING: Serve admin.html exclusively when /admin is requested
        if full_path == 'admin' or full_path == 'admin.html':
            admin_file = DIST_DIR / 'admin.html'
            if admin_file.is_file():
                return FileResponse(admin_file)
                
        # Fallback for all other frontend routes (React mapping)
        return FileResponse(DIST_DIR / 'index.html')