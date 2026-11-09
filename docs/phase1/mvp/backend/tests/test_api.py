"""Nimrah full-stack API contract: temporary chats are ephemeral; permanent groups persist."""
import os
import tempfile
from datetime import timedelta
from pathlib import Path

os.environ['DATABASE_FILE'] = str(Path(tempfile.mkdtemp()) / 'test.sqlite3')

from fastapi.testclient import TestClient
from sqlalchemy import select, func
from app.main import app
from app.database import SessionLocal
from app.models import Traveler, TravelerPresence, RideRequest, PermanentGroup, PermanentMember, GroupMessage, PermanentMessage, utcnow


def register(client, phone, name):
    r = client.post('/api/register', json={'name':name,'phone':phone,'role':'passenger'})
    assert r.status_code == 200, r.text
    data = r.json()
    return data['user']['id'], {'Authorization':f'Bearer {data["token"]}'}


def publish(client, uid, token, *, mode='now', date='', lat=35.7):
    r = client.post('/api/travelers', headers=token, json={
        'user_id':uid,'lat':lat,'lng':51.4,'dest_name':'تهران',
        'travel_mode':mode,'travel_date':date,'travel_time':'10:00' if mode=='later' else ''})
    assert r.status_code == 200, r.text


def temp_join(client, sender_id, sender_h, receiver_id, receiver_h):
    r = client.post('/api/requests',headers=sender_h,json={
        'sender_id':sender_id,'receiver_id':receiver_id})
    assert r.status_code == 200, r.text
    req_id = r.json()['request_id']
    assert len(client.get(f'/api/requests/incoming/{receiver_id}',headers=receiver_h).json()['requests']) >= 1
    r = client.post(f'/api/requests/{req_id}/respond',headers=receiver_h,json={'status':'accepted'})
    assert r.status_code == 200 and r.json()['success'], r.text
    return req_id


def test_logout_dissolves_temp_group_but_keeps_permanent_membership():
    with TestClient(app) as c:
        ana, ah=register(c,'09120001001','Ana')
        sara, sh=register(c,'09120001002','Sara')
        mahan, mh=register(c,'09120001003','Mahan')
        publish(c,ana,ah)
        publish(c,sara,sh)
        temp_join(c,ana,ah,sara,sh)
        assert len(c.get(f'/api/requests/accepted/{ana}',headers=ah).json()['requests']) == 1
        assert c.post('/api/chat',headers=ah,json={'sender_id':ana,'text':'old temporary message'}).json()['success']
        old_group = next(g for g in c.get(f'/api/travelers?exclude_id={mahan}',headers=mh).json()
                         if {m['id'] for m in g['members']} == {ana,sara})['id']
        assert c.post('/api/logout',headers=ah).json()['success']
        assert c.get('/api/me',headers=ah).status_code == 401
        with SessionLocal() as db:
            assert db.get(Traveler,ana) is None
            assert db.get(Traveler,sara).group_id != old_group
        assert not any(g['id']==old_group for g in c.get(f'/api/travelers?exclude_id={mahan}',headers=mh).json())
        assert c.get(f'/api/requests/accepted/{sara}',headers=sh).json()['requests'] == []
        # Relogin does not reopen the old temporary chat.
        relog = c.post('/api/login',json={'phone':'09120001001'}).json()
        ah2={'Authorization':f'Bearer {relog["token"]}'}
        assert c.get(f'/api/chat?userId={ana}',headers=ah2).json()['messages'] == []
        assert c.get(f'/api/requests/accepted/{ana}',headers=ah2).json()['requests'] == []


def test_convert_removes_temporary_group_migrates_chat_and_new_request_goes_to_permanent():
    with TestClient(app) as c:
        ana, ah=register(c,'09120001101','Ana')
        sara, sh=register(c,'09120001102','Sara')
        mahan, mh=register(c,'09120001103','Mahan')
        publish(c,ana,ah)
        publish(c,sara,sh,lat=35.8)
        publish(c,mahan,mh,lat=35.9)
        temp_join(c,ana,ah,sara,sh)
        assert c.post('/api/chat',headers=sh,json={'sender_id':sara,'text':'message before conversion'}).json()['success']
        with SessionLocal() as db:
            old_gid=db.get(Traveler,ana).group_id
            assert db.get(Traveler,sara).group_id==old_gid
        r=c.post('/api/perm_groups/convert',headers=ah,json={'userId':ana})
        assert r.status_code == 200 and r.json()['success'],r.text
        pg=r.json()['group_id']
        with SessionLocal() as db:
            assert db.get(Traveler,ana).group_id != old_gid
            assert db.get(Traveler,sara).group_id != old_gid
            assert db.get(Traveler,ana).group_id != db.get(Traveler,sara).group_id
            assert db.get(PermanentGroup,pg).active_group_id is None
            assert db.scalar(select(func.count()).select_from(GroupMessage).where(GroupMessage.group_id==old_gid))==0
            assert db.scalar(select(func.count()).select_from(PermanentMember).where(PermanentMember.group_id==pg))==2
        assert c.get(f'/api/requests/accepted/{ana}',headers=ah).json()['requests'] == []
        assert c.get(f'/api/chat?userId={ana}',headers=ah).json()['messages'] == []
        pm=c.get(f'/api/perm_groups/{pg}/messages',headers=ah).json()['messages']
        assert any(m['text']=='message before conversion' for m in pm)
        # The third user sees ONE group with both permanent members, not two solo matches.
        matches=c.get(f'/api/travelers?exclude_id={mahan}',headers=mh).json()
        perm=next(g for g in matches if g.get('perm_group_id') == pg)
        assert perm['member_count']==2
        assert {m['id'] for m in perm['members']}=={ana,sara}
        assert not any(g['id']==old_gid for g in matches)
        assert not any(g.get('perm_group_id') is None and ({m['id'] for m in g['members']} & {ana,sara}) for g in matches)
        r=c.post('/api/requests',headers=mh,json={
            'sender_id':mahan,'receiver_id':perm['members'][0]['id'],'perm_group_id':pg})
        assert r.status_code == 200, r.text
        req=r.json()['request_id']
        assert c.get(f'/api/requests/incoming/{ana}',headers=ah).json()['requests']==[]
        assert c.get(f'/api/requests/incoming/{sara}',headers=sh).json()['requests']==[]
        assert [x['id'] for x in c.get(f'/api/perm_groups/{pg}/requests',headers=ah).json()['requests']]==[req]
        assert [x['id'] for x in c.get(f'/api/perm_groups/{pg}/requests',headers=sh).json()['requests']]==[req]
        assert c.get(f'/api/perm_groups/{pg}/requests',headers=mh).status_code==403
        assert c.get('/api/requests/incoming-permanent',headers=ah).json()['requests'][0]['perm_group_id']==pg
        assert c.get('/api/requests/incoming-permanent',headers=sh).json()['requests'][0]['perm_group_id']==pg
        r=c.post(f'/api/requests/{req}/respond',headers=sh,json={'status':'accepted'})
        assert r.status_code == 200 and r.json()['perm_group_id']==pg, r.text
        assert c.get(f'/api/requests/status/{req}',headers=mh).json()['status']=='accepted'
        members=c.get(f'/api/perm_groups/{pg}/info',headers=mh).json()['members']
        assert {m['id'] for m in members}=={ana,sara,mahan}
        assert c.get(f'/api/perm_groups/{pg}/requests',headers=ah).json()['requests']==[]
        # No new temporary group is created by accepting a permanent join request.
        assert c.get(f'/api/requests/accepted/{mahan}',headers=mh).json()['requests']==[]
        # Logout and return: Mahan still sees ONLY permanent membership.
        assert c.post('/api/logout',headers=mh).json()['success']
        mahan_relogin=c.post('/api/login',json={'phone':'09120001103'}).json()
        new_mh={'Authorization':f'Bearer {mahan_relogin["token"]}'}
        assert any(g['id']==pg for g in c.get(f'/api/perm_groups/{mahan}',headers=new_mh).json()['groups'])
        assert c.get(f'/api/requests/accepted/{mahan}',headers=new_mh).json()['requests']==[]
        assert c.get(f'/api/perm_groups/{pg}/info',headers=new_mh).json()['success']


def test_temp_request_cancelled_on_logout_and_perm_request_survives_target_logout():
    with TestClient(app) as c:
        a,ah=register(c,'09120001201','AA')
        b,bh=register(c,'09120001202','BB')
        d,dh=register(c,'09120001203','DD')
        e,eh=register(c,'09120001204','EE')
        for uid,h in ((a,ah),(b,bh),(d,dh),(e,eh)):publish(c,uid,h)
        temp_join(c,a,ah,b,bh)
        pg=c.post('/api/perm_groups/convert',headers=ah,json={'userId':a}).json()['group_id']
        r=c.post('/api/requests',headers=dh,json={'sender_id':d,'receiver_id':a,'perm_group_id':pg}).json()['request_id']
        assert c.post('/api/logout',headers=ah).json()['success']
        # Request belongs to permanent group, not exclusively to the original receiver.
        assert c.get(f'/api/requests/status/{r}',headers=dh).json()['status']=='pending'
        assert c.get(f'/api/perm_groups/{pg}/requests',headers=bh).json()['requests'][0]['id']==r
        assert c.post(f'/api/requests/{r}/respond',headers=bh,json={'status':'rejected'}).json()['success']
        assert c.get(f'/api/requests/status/{r}',headers=dh).json()['status']=='rejected'
        temp=c.post('/api/requests',headers=eh,json={'sender_id':e,'receiver_id':d}).json()['request_id']
        assert c.post('/api/logout',headers=eh).json()['success']
        assert c.get(f'/api/requests/status/{temp}',headers=eh).status_code == 401  # sender session invalidated
        assert c.get(f'/api/requests/incoming/{d}',headers=dh).json()['requests']==[]


def test_scheduled_trip_filter_and_permissions():
    with TestClient(app) as c:
        a,ah=register(c,'09120001301','Scheduled')
        b,bh=register(c,'09120001302','Viewer')
        publish(c,a,ah,mode='later',date='2026-11-08')
        assert c.get(f'/api/travelers?exclude_id={b}&travel_mode=later&travel_date=2026-11-08',headers=bh).json()
        assert not c.get(f'/api/travelers?exclude_id={b}&travel_mode=later&travel_date=2026-11-09',headers=bh).json()
        assert not any(any(m['id']==a for m in g['members']) for g in c.get(f'/api/travelers?exclude_id={b}&travel_mode=now',headers=bh).json())
        assert c.get(f'/api/requests/accepted/{a}',headers=bh).status_code == 403


def test_older_permanent_group_link_is_migrated_on_restart():
    """Older versions had active_group_id still attached to a live temp chat."""
    from app.models import User
    with TestClient(app) as c:
        a, ah = register(c, '09120001401', 'Old Ana')
        b, bh = register(c, '09120001402', 'Old Sara')
        publish(c, a, ah)
        publish(c, b, bh)
        temp_join(c, a, ah, b, bh)
        assert c.post('/api/chat',headers=ah,json={'sender_id':a,'text':'legacy chat'}).json()['success']
        with SessionLocal() as db:
            old_group = db.get(Traveler,a).group_id
            group = PermanentGroup(name='Previously Converted',avatar='/two_users.jpg',owner_id=a,active_group_id=old_group)
            db.add(group)
            db.flush()
            old_perm_id = group.id
            db.add_all([PermanentMember(group_id=group.id,user_id=a),PermanentMember(group_id=group.id,user_id=b)])
            db.commit()
    with TestClient(app) as c:
        with SessionLocal() as db:
            assert db.get(PermanentGroup,old_perm_id).active_group_id is None
            assert db.get(Traveler,a).group_id != db.get(Traveler,b).group_id
            assert db.scalar(select(func.count()).select_from(GroupMessage).where(GroupMessage.group_id==old_group)) == 0
        messages=c.get(f'/api/perm_groups/{old_perm_id}/messages',headers=ah).json()['messages']
        assert any(m['text']=='legacy chat' for m in messages)
        # The migration is idempotent on a second startup.
    with TestClient(app) as c:
        messages=c.get(f'/api/perm_groups/{old_perm_id}/messages',headers=bh).json()['messages']
        assert sum(m['text']=='legacy chat' for m in messages)==1


def test_stale_temporary_group_is_cleaned_at_restart_without_deleting_permanent_data():
    """Repair the previous version's logout bug, which left rows without presence."""
    from app.models import TravelerPresence
    with TestClient(app) as c:
        first, fh = register(c, '09120009991', 'First')
        second, sh = register(c, '09120009992', 'Second')
        publish(c, first, fh)
        publish(c, second, sh)
        temp_join(c, first, fh, second, sh)
        with SessionLocal() as db:
            old_group = db.get(Traveler, first).group_id
            presence = db.get(TravelerPresence, first)
            db.delete(presence)  # Simulate the older buggy logout.
            db.commit()
    with TestClient(app) as c:
        with SessionLocal() as db:
            assert db.get(Traveler, first) is None
            assert db.get(Traveler, second).group_id != old_group
        assert c.get(f'/api/requests/accepted/{second}', headers=sh).json()['requests'] == []


def test_pending_temp_request_moves_into_permanent_group_at_conversion():
    with TestClient(app) as c:
        first, fh = register(c, '09120001601', 'First')
        second, sh = register(c, '09120001602', 'Second')
        outsider, oh = register(c, '09120001603', 'Outsider')
        for uid, headers in [(first, fh), (second, sh), (outsider, oh)]:
            publish(c, uid, headers)
        temp_join(c, first, fh, second, sh)
        res = c.post('/api/requests', headers=oh, json={
            'sender_id': outsider, 'receiver_id': first})
        req_id = res.json()['request_id']
        assert c.get(f'/api/requests/incoming/{first}', headers=fh).json()['requests']
        pg = c.post('/api/perm_groups/convert', headers=fh,
                    json={'userId': first}).json()['group_id']
        assert c.get(f'/api/requests/incoming/{first}', headers=fh).json()['requests'] == []
        r = c.get(f'/api/perm_groups/{pg}/requests', headers=sh)
        assert [item['id'] for item in r.json()['requests']] == [req_id]
        r = c.post(f'/api/requests/{req_id}/respond', headers=sh, json={'status': 'accepted'})
        assert r.status_code == 200 and r.json()['success'], r.text
        assert {u['id'] for u in c.get(f'/api/perm_groups/{pg}/info',headers=oh).json()['members']} == {
            first, second, outsider}



def test_live_matching_survives_pending_request_and_presence_heartbeat():
    with TestClient(app) as c:
        ana, ah = register(c, '09120009993', 'Ana')
        mahan, mh = register(c, '09120009994', 'Mahan')
        publish(c, ana, ah)
        publish(c, mahan, mh, lat=35.8)

        # A pending request must not hide the requester from the match list.
        sent = c.post('/api/requests', headers=ah, json={
            'sender_id': ana, 'receiver_id': mahan
        })
        assert sent.status_code == 200, sent.text
        matches = c.get(f'/api/travelers?exclude_id={mahan}&travel_mode=now', headers=mh)
        assert matches.status_code == 200, matches.text
        assert any(any(member['id'] == ana for member in group['members'])
                   for group in matches.json())

        # Simulate a background tab whose heartbeat has expired.
        with SessionLocal() as db:
            presence = db.get(TravelerPresence, ana)
            presence.updated_at = utcnow() - timedelta(minutes=4)
            db.commit()
        stale = c.get(f'/api/travelers?exclude_id={mahan}&travel_mode=now', headers=mh)
        assert not any(any(member['id'] == ana for member in group['members'])
                       for group in stale.json())

        # The dedicated heartbeat refreshes availability without rewriting the route.
        heartbeat = c.post('/api/travelers/heartbeat', headers=ah)
        assert heartbeat.status_code == 200 and heartbeat.json()['success']
        refreshed = c.get(f'/api/travelers?exclude_id={mahan}&travel_mode=now', headers=mh)
        assert any(any(member['id'] == ana for member in group['members'])
                   for group in refreshed.json())
