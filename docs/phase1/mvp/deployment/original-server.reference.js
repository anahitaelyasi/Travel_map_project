const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite Database
const db = new sqlite3.Database('./mapapp.db', (err) => {
    if (err) console.error("Database error:", err.message);
    else console.log('Connected to the SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT UNIQUE, role TEXT, avatar TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS stations (id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_type TEXT, origin_lat REAL, origin_lng REAL, dest_lat REAL, dest_lng REAL, fare TEXT, creator_name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS active_travelers (user_id INTEGER PRIMARY KEY, group_id INTEGER, name TEXT, avatar TEXT, lat REAL, lng REAL, dest_name TEXT, travel_mode TEXT, travel_date TEXT, travel_time TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS ride_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER, sender_name TEXT, sender_avatar TEXT, receiver_id INTEGER, status TEXT DEFAULT 'pending')`);
    db.run(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, message TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS group_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER, sender_id INTEGER, sender_name TEXT, sender_avatar TEXT, text TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    
    db.run(`CREATE TABLE IF NOT EXISTS perm_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, avatar TEXT, owner_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS perm_group_members (group_id INTEGER, user_id INTEGER, PRIMARY KEY(group_id, user_id))`);
    db.run(`CREATE TABLE IF NOT EXISTS perm_group_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER, sender_id INTEGER, sender_name TEXT, sender_avatar TEXT, text TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
});

// --- API Endpoints ---
app.post('/api/register', (req, res) => {
    const { name, phone, role, avatar } = req.body;
    db.run(`INSERT INTO users (name, phone, role, avatar) VALUES (?, ?, ?, ?)`, [name, phone, role, avatar], function(err) {
        if (err) return res.status(400).json({ error: 'Phone number already exists.' });
        res.json({ success: true, user: { id: this.lastID, name, phone, role, avatar } });
    });
});

app.post('/api/login', (req, res) => {
    const { phone } = req.body;
    db.get(`SELECT * FROM users WHERE phone = ?`, [phone], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'User not found.' });
        res.json({ success: true, user: row });
    });
});

app.post('/api/stations', (req, res) => {
    const { vehicle_type, origin_lat, origin_lng, dest_lat, dest_lng, fare, creator_name } = req.body;
    db.run(`INSERT INTO stations (vehicle_type, origin_lat, origin_lng, dest_lat, dest_lng, fare, creator_name) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
        [vehicle_type, origin_lat, origin_lng, dest_lat, dest_lng, fare, creator_name], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, station_id: this.lastID });
    });
});

app.get('/api/stations', (req, res) => {
    db.all(`SELECT * FROM stations`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/travelers', (req, res) => {
    const { user_id, name, avatar, lat, lng, dest_name, travel_mode, travel_date, travel_time } = req.body;
    db.get(`SELECT group_id FROM active_travelers WHERE user_id = ?`, [user_id], (err, row) => {
        const group_id = row ? row.group_id : user_id;
        db.run(`INSERT OR REPLACE INTO active_travelers (user_id, group_id, name, avatar, lat, lng, dest_name, travel_mode, travel_date, travel_time, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, 
            [user_id, group_id, name, avatar, lat, lng, dest_name, travel_mode, travel_date, travel_time], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.get('/api/travelers', (req, res) => {
    const exclude_id = parseInt(req.query.exclude_id) || 0;
    const mode = req.query.travel_mode || 'now';
    const date = req.query.travel_date || '';
    
    db.get(`SELECT group_id FROM active_travelers WHERE user_id = ?`, [exclude_id], (err, me) => {
        const myGroupId = me ? me.group_id : exclude_id;
        
        let timeFilter = `AND (travel_mode = 'now' OR travel_mode IS NULL)`;
        if (mode === 'later') {
            timeFilter = `AND travel_mode = 'later' AND travel_date = ?`;
        }

        const query = `
            SELECT t1.* 
            FROM active_travelers t1
            JOIN (
                SELECT group_id FROM active_travelers 
                WHERE group_id != ? 
                AND timestamp >= datetime('now', '-24 hours')
                ${timeFilter}
                AND group_id NOT IN (
                    SELECT a.group_id 
                    FROM ride_requests r 
                    JOIN active_travelers a ON r.sender_id = a.user_id 
                    WHERE r.receiver_id = ? AND r.status = 'pending'
                )
                GROUP BY group_id HAVING COUNT(user_id) < 4
            ) t2 ON t1.group_id = t2.group_id
        `;
        
        const params = mode === 'later' ? [myGroupId, date, myGroupId] : [myGroupId, myGroupId];
        
        db.all(query, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const groups = {};
            (rows || []).forEach(r => {
                if (!groups[r.group_id]) {
                    groups[r.group_id] = { id: r.group_id, lat: 0, lng: 0, dest_name: r.dest_name, members: [] };
                }
                groups[r.group_id].lat += r.lat;
                groups[r.group_id].lng += r.lng;
                groups[r.group_id].members.push({ id: r.user_id, name: r.name, avatar: r.avatar });
            });
            
            const result = Object.values(groups).map(g => {
                g.lat /= g.members.length;
                g.lng /= g.members.length;
                g.member_count = g.members.length;
                return g;
            });
            
            res.json(result);
        });
    });
});

app.delete('/api/travelers/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    db.get(`SELECT group_id FROM active_travelers WHERE user_id = ?`, [userId], (err, me) => {
        if (me) {
            db.run(`INSERT INTO group_messages (group_id, sender_id, sender_name, sender_avatar, text) VALUES (?, 0, 'سیستم', 'system', 'یک نفر گروه را ترک کرد.')`, [me.group_id]);
        }
        db.run(`DELETE FROM active_travelers WHERE user_id = ?`, [userId], () => {
            db.run(`UPDATE ride_requests SET status = 'cancelled' WHERE (receiver_id = ? OR receiver_id = ? OR sender_id = ?) AND status = 'pending'`, [me ? me.group_id : userId, userId, userId], () => {
                res.json({ success: true });
            });
        });
    });
});

app.post('/api/requests', (req, res) => {
    const { sender_id, sender_name, sender_avatar, receiver_id } = req.body;
    db.get(`SELECT id FROM ride_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'`, [sender_id, receiver_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) return res.json({ success: true, request_id: row.id }); 
        
        db.run(`INSERT INTO ride_requests (sender_id, sender_name, sender_avatar, receiver_id, status) VALUES (?, ?, ?, ?, 'pending')`,
            [sender_id, sender_name, sender_avatar, receiver_id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, request_id: this.lastID });
        });
    });
});

app.get('/api/requests/incoming/:userId', (req, res) => {
    const uid = parseInt(req.params.userId);
    db.get(`SELECT group_id FROM active_travelers WHERE user_id = ?`, [uid], (err, me) => {
        if (!me) return res.json({ requests: [] });
        db.all(`
            SELECT r.* FROM ride_requests r 
            JOIN active_travelers a ON r.receiver_id = a.user_id 
            WHERE a.group_id = ? AND r.status = 'pending' ORDER BY r.id DESC
        `, [me.group_id], (err, rows) => {
            res.json({ requests: rows || [] });
        });
    });
});

app.get('/api/requests/accepted/:userId', (req, res) => {
    const uid = parseInt(req.params.userId);
    db.get(`SELECT group_id FROM active_travelers WHERE user_id = ?`, [uid], (err, me) => {
        if (!me) return res.json({ requests: [] });
        db.all(`SELECT user_id as id, name as other_name, avatar as other_avatar FROM active_travelers WHERE group_id = ? AND user_id != ?`, [me.group_id, uid], (err, rows) => {
            res.json({ requests: rows || [] });
        });
    });
});

app.get('/api/requests/status/:reqId', (req, res) => {
    db.get(`SELECT status, receiver_id FROM ride_requests WHERE id = ?`, [req.params.reqId], (err, row) => {
        if (!row) return res.json({ status: null });
        
        if (row.status === 'accepted') {
            db.get(`SELECT group_id FROM perm_group_members WHERE user_id = ? ORDER BY group_id DESC LIMIT 1`, [row.receiver_id], (err, permGroup) => {
                res.json({ status: row.status, perm_group_id: permGroup ? permGroup.group_id : null });
            });
        } else {
            res.json({ status: row.status });
        }
    });
});

app.post('/api/requests/:reqId/respond', (req, res) => {
    const { status } = req.body; 
    const reqId = parseInt(req.params.reqId);
    
    if (status === 'accepted') {
        db.get(`SELECT sender_id, receiver_id FROM ride_requests WHERE id = ?`, [reqId], (err, row) => {
            if (!row) return res.json({ success: false });
            
            const senderId = row.sender_id;
            const receiverId = row.receiver_id;
            
            db.get(`SELECT group_id FROM active_travelers WHERE user_id = ?`, [receiverId], (err, receiver) => {
                if (!receiver) return res.json({ success: false });
                const targetGroupId = receiver.group_id;
                
                db.get(`SELECT COUNT(user_id) as c FROM active_travelers WHERE group_id = ?`, [targetGroupId], (err, countRow) => {
                    if (countRow && countRow.c >= 4) {
                        db.run(`UPDATE ride_requests SET status = 'rejected' WHERE id = ?`, [reqId]);
                        return res.json({ success: false, error: 'ظرفیت گروه تکمیل است.' });
                    }
                    
                    db.run(`UPDATE active_travelers SET group_id = ? WHERE user_id = ?`, [targetGroupId, senderId], () => {
                        db.run(`UPDATE ride_requests SET status = 'accepted' WHERE id = ?`, [reqId]);
                        db.run(`UPDATE ride_requests SET status = 'cancelled' WHERE sender_id = ? AND status = 'pending'`, [senderId]);
                        
                        db.get(`SELECT name FROM active_travelers WHERE user_id = ?`, [senderId], (err, senderInfo) => {
                            const sName = senderInfo ? senderInfo.name : 'یک همسفر جدید';
                            db.run(`INSERT INTO group_messages (group_id, sender_id, sender_name, sender_avatar, text) VALUES (?, 0, 'سیستم', 'system', ?)`,
                                [targetGroupId, `${sName} به گروه پیوست.`]);
                        });
                        
                        // اضافه کردن اتوماتیک به گروه دائمی در صورت وجود
                        db.get(`SELECT group_id FROM perm_group_members WHERE user_id = ? ORDER BY group_id DESC LIMIT 1`, [receiverId], (err, permGroup) => {
                            if (permGroup) {
                                db.run(`INSERT OR IGNORE INTO perm_group_members (group_id, user_id) VALUES (?, ?)`, [permGroup.group_id, senderId], () => {
                                    // آپدیت کردن آیکون گروه به 3 نفر
                                    if (countRow.c + 1 >= 3) {
                                        db.run(`UPDATE perm_groups SET avatar = './three_users.png' WHERE id = ?`, [permGroup.group_id]);
                                    }
                                    res.json({ success: true, perm_group_id: permGroup.group_id });
                                });
                            } else {
                                res.json({ success: true, perm_group_id: null });
                            }
                        });
                    });
                });
            });
        });
    } else {
        db.run(`UPDATE ride_requests SET status = ? WHERE id = ?`, [status, reqId], () => {
            res.json({ success: true });
        });
    }
});

app.delete('/api/requests/:reqId', (req, res) => {
    db.run(`DELETE FROM ride_requests WHERE id = ?`, [req.params.reqId], (err) => {
        res.json({ success: true });
    });
});

app.post('/api/requests/cancel-accepted/:targetId', (req, res) => {
    const targetId = parseInt(req.params.targetId);
    db.run(`INSERT INTO notifications (user_id, message) VALUES (?, ?)`, [targetId, `شما از گروه همسفران حذف شدید.`]);
    db.run(`UPDATE active_travelers SET group_id = user_id WHERE user_id = ?`, [targetId], () => {
        res.json({ success: true });
    });
});

app.get('/api/chat', (req, res) => {
    const uid = parseInt(req.query.userId);
    db.get(`SELECT group_id FROM active_travelers WHERE user_id = ?`, [uid], (err, me) => {
        if (!me) return res.json({ messages: [] });
        db.all(`SELECT * FROM group_messages WHERE group_id = ? ORDER BY id ASC LIMIT 100`, [me.group_id], (err, rows) => {
            res.json({ messages: rows || [] });
        });
    });
});

app.post('/api/chat', (req, res) => {
    const { sender_id, sender_name, sender_avatar, text } = req.body;
    db.get(`SELECT group_id FROM active_travelers WHERE user_id = ?`, [sender_id], (err, me) => {
        if (!me) return res.json({ success: false });
        db.run(`INSERT INTO group_messages (group_id, sender_id, sender_name, sender_avatar, text) VALUES (?, ?, ?, ?, ?)`,
            [me.group_id, sender_id, sender_name, sender_avatar, text], (err) => {
            res.json({ success: true });
        });
    });
});


// ==========================================
// PERMANENT GROUPS ENDPOINTS
// ==========================================

app.post('/api/perm_groups/convert', (req, res) => {
    const { userId } = req.body;
    db.get(`SELECT group_id FROM active_travelers WHERE user_id = ?`, [userId], (err, me) => {
        if (!me) return res.json({ success: false, error: 'شما در هیچ گروه فعالی نیستید.' });
        
        db.all(`SELECT user_id FROM active_travelers WHERE group_id = ?`, [me.group_id], (err, members) => {
            if (members.length < 2) return res.json({ success: false, error: 'گروه شما باید حداقل ۲ نفر باشد.' });
            
            const groupName = `گروه سفر (${members.length} نفره)`;
            const avatar = members.length >= 3 ? './three_users.png' : './two_users.jpg';
            
            db.run(`INSERT INTO perm_groups (name, avatar, owner_id) VALUES (?, ?, ?)`, [groupName, avatar, userId], function(err) {
                if (err) return res.json({ success: false, error: 'خطا در ساخت گروه' });
                const newGroupId = this.lastID;
                
                const stmt = db.prepare(`INSERT OR IGNORE INTO perm_group_members (group_id, user_id) VALUES (?, ?)`);
                members.forEach(m => stmt.run([newGroupId, m.user_id]));
                stmt.finalize();
                
                res.json({ success: true, group_id: newGroupId });
            });
        });
    });
});

app.get('/api/perm_groups/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const query = `
        SELECT g.id, g.name, g.avatar, g.owner_id,
               (SELECT text FROM perm_group_messages WHERE group_id = g.id ORDER BY id DESC LIMIT 1) as last_msg,
               (SELECT timestamp FROM perm_group_messages WHERE group_id = g.id ORDER BY id DESC LIMIT 1) as last_time
        FROM perm_groups g
        JOIN perm_group_members m ON g.id = m.group_id
        WHERE m.user_id = ?
        ORDER BY last_time DESC NULLS LAST, g.id DESC
    `;
    db.all(query, [userId], (err, rows) => {
        res.json({ groups: rows || [] });
    });
});

app.get('/api/perm_groups/:groupId/info', (req, res) => {
    const groupId = parseInt(req.params.groupId);
    db.get(`SELECT * FROM perm_groups WHERE id = ?`, [groupId], (err, groupData) => {
        if (!groupData) return res.json({ success: false });
        
        db.all(`SELECT u.id, u.name, u.avatar FROM perm_group_members m JOIN users u ON m.user_id = u.id WHERE m.group_id = ?`, [groupId], (err, members) => {
            res.json({ 
                success: true, 
                group: groupData, 
                members: members || []
            });
        });
    });
});

app.post('/api/perm_groups/:groupId/kick', (req, res) => {
    const { groupId } = req.params;
    const { ownerId, targetId } = req.body;
    
    db.get(`SELECT owner_id FROM perm_groups WHERE id = ?`, [groupId], (err, group) => {
        if (!group || group.owner_id !== ownerId) return res.json({ success: false, error: 'عدم دسترسی' });
        
        db.run(`DELETE FROM perm_group_members WHERE group_id = ? AND user_id = ?`, [groupId, targetId], () => {
            res.json({ success: true });
        });
    });
});

// UPGRADED: New endpoint to edit group name
app.put('/api/perm_groups/:groupId/rename', (req, res) => {
    const { groupId } = req.params;
    const { ownerId, newName } = req.body;
    
    db.get(`SELECT owner_id FROM perm_groups WHERE id = ?`, [groupId], (err, group) => {
        if (!group || group.owner_id !== ownerId) return res.json({ success: false, error: 'فقط مالک گروه می‌تواند نام آن را تغییر دهد.' });
        
        db.run(`UPDATE perm_groups SET name = ? WHERE id = ?`, [newName, groupId], () => {
            res.json({ success: true });
        });
    });
});

app.get('/api/perm_groups/:groupId/messages', (req, res) => {
    const groupId = parseInt(req.params.groupId);
    db.all(`SELECT * FROM perm_group_messages WHERE group_id = ? ORDER BY id ASC LIMIT 100`, [groupId], (err, rows) => {
        res.json({ messages: rows || [] });
    });
});

app.post('/api/perm_groups/:groupId/messages', (req, res) => {
    const groupId = parseInt(req.params.groupId);
    const { sender_id, sender_name, sender_avatar, text } = req.body;
    db.run(`INSERT INTO perm_group_messages (group_id, sender_id, sender_name, sender_avatar, text) VALUES (?, ?, ?, ?, ?)`,
        [groupId, sender_id, sender_name, sender_avatar, text], (err) => {
        res.json({ success: true });
    });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));