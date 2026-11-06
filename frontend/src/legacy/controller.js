/**
 * Functional migration adapter for the original imperative JS UI. React owns the
 * original static markup. The controller retains legacy Leaflet and chat DOM
 * updates until those modules can be independently converted to React state.
 */
export function initializeLegacyApp() {
  if (!window.L) { console.error('Leaflet did not load.'); return () => {}; }
  const L = window.L;
  let sessionToken = localStorage.getItem('nimrahSessionToken') || '';
  function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
    return fetch(url, { ...options, headers });
  }
        // ---------- API & Helpers ----------
        const API_BASE = '/api';
        const $ = id => document.getElementById(id);
        const fa = n => Number(n).toLocaleString('fa-IR');
        const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';
        const AVATAR_FALLBACK = "this.onerror=null;this.src='https://placehold.co/150x150/10b981/ffffff?text=U'";

        const ICON_2_USERS = './two_users.jpg';
        const ICON_3_USERS = './three_users.png';

        function showToast(message, type = 'info', ms = 3500) {
            const toast = document.createElement('div');
            const bg = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-emerald-600' : 'bg-gray-800';
            toast.className = `${bg} text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 transition-all duration-300 pointer-events-auto`;
            toast.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> <span>${esc(message)}</span>`;
            $('toast-container').appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, ms);
        }
        
        let pendingConfirmCallback = null;
        function openConfirmModal(title, desc, iconClass, btnText, callback) {
            $('confirm-title').innerText = title;
            $('confirm-desc').innerText = desc;
            $('confirm-icon').className = `fa-solid ${iconClass}`;
            $('confirm-yes-btn').innerText = btnText;
            pendingConfirmCallback = callback;
            $('confirm-modal').style.display = 'flex';
        }
        function closeConfirmModal() {
            $('confirm-modal').style.display = 'none';
            pendingConfirmCallback = null;
        }
        $('confirm-yes-btn').addEventListener('click', () => {
            if (pendingConfirmCallback) pendingConfirmCallback();
            closeConfirmModal();
        });

        // ---------- Map ----------
        const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([35.6892, 51.3890], 13);
        L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).addTo(map);
        const activeStationExtras = L.layerGroup().addTo(map);

        // ---------- State ----------
        window.myGroupMemberCount = 1;
        let travelScheduleMode = 'now'; 

        let panelOpen = false;
        let hamsafarOpen = false;
        let permGroupsOpen = false;
        let mainMenuOpen = false;
        let profilePanelOpen = false;
        
        let currentHTab = 'nearby';
        let routeMode = 'time';              
        let profile = 'car';                 
        let currentUser = null;
        let pickMode = null;                 
        
        let pendingStationData = {};
        let rawRoutes = [], rawKey = '', selectedRoute = 0, routeLayers = [];
        let personMarkers = [], requestActive = false;
        let searchMarker = null, searchPlace = null, lastFocused = null;
        let tempAvatar = null;
        const points = { start: null, dest: null };
        const pointMarkers = { start: null, dest: null };
        
        const inputsMapping = {
            'start': ['start-point', 'h-start-point'],
            'dest': ['dest-point', 'h-dest-point'],
            'search': ['search-input']
        };
        const saved = { home: null, work: null };

        let currentSelectedTraveler = null;
        // An old route or a login alone must not publish a new trip.
        let travelerSearchActive = false;
        let activeTravelersInterval = null;
        let activeOutboundRequests = {}; 
        let requestInsertionIndex = {}; 
        
        let activePermGroupId = null;
        let globalPermanentPendingRequests = [];
        let previousPermanentIncomingIds = "";
        let previousPermMessageCount = -1;
        let previousMessageCount = -1;
        let knownPermGroupIds = new Set();
        let initialPermGroupsLoaded = false;

        // ---------- Sidebar Icon Highlighter ----------
        function updateSidebarIcons() {
            const mapBtn = $('nav-btn-map');
            const hamsafarBtn = $('nav-btn-hamsafar');
            const groupsBtn = $('nav-btn-groups');
            const profileBtn = $('nav-btn-profile');
            
            const activeClass = 'text-blue-600';
            const inactiveClass = 'text-gray-600';
            
            if(mapBtn) { mapBtn.classList.remove(activeClass, inactiveClass); mapBtn.classList.add(mainMenuOpen ? activeClass : inactiveClass); }
            if(hamsafarBtn) { hamsafarBtn.classList.remove(activeClass, inactiveClass); hamsafarBtn.classList.add(hamsafarOpen ? activeClass : inactiveClass); }
            if(groupsBtn) { groupsBtn.classList.remove(activeClass, inactiveClass); groupsBtn.classList.add(permGroupsOpen ? activeClass : inactiveClass); }
            if(profileBtn) { profileBtn.classList.remove(activeClass, inactiveClass); profileBtn.classList.add(profilePanelOpen ? activeClass : inactiveClass); }
        }

        // ---------- Map view helpers ----------
        function panTo(lat, lng, zoom) {
            const p = map.project([lat, lng], zoom);
            if (panelOpen || hamsafarOpen || permGroupsOpen || mainMenuOpen) p.x += 240;
            map.flyTo(map.unproject(p, zoom), zoom);
        }
        function fitTo(bounds) {
            map.fitBounds(bounds, { paddingTopLeft: [50, 50], paddingBottomRight: [(panelOpen||hamsafarOpen||permGroupsOpen||mainMenuOpen) ? 500 : 80, 50] });
        }

        // ---------- Geocoding & Pins ----------
        // Photon is intended for autocomplete; public Nominatim explicitly prohibits it.
        // The Photon demo is appropriate for development/small testing, not a production SLA.
        function photonPlace(feature) {
            const p = feature.properties || {};
            const [lng, lat] = feature.geometry.coordinates;
            return { lat, lon: lng,
                name: p.name || p.street || p.city || p.county || '',
                address: {road:p.street, neighbourhood:p.district, suburb:p.district,
                          city:p.city, town:p.city, state:p.state, country:p.country},
                display_name: [p.name || p.street, p.city, p.state, p.country].filter(Boolean).join('، ') };
        }
        let lastPhotonQuery = 0;
        async function searchPlaces(q) {
            // A modest per-browser throttle avoids overwhelming the community demo server.
            const wait = Math.max(0, 1100 - (Date.now() - lastPhotonQuery));
            if (wait) await new Promise(resolve => setTimeout(resolve, wait));
            lastPhotonQuery = Date.now();
            const url = 'https://photon.komoot.io/api/?limit=7&bbox=44,25,64,40&q=' + encodeURIComponent(q);
            const r = await fetch(url);
            if (!r.ok) throw new Error('search unavailable');
            const data = await r.json();
            return (data.features || []).map(photonPlace);
        }
        async function reverseGeocode(lat, lng) {
            try {
                const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`);
                if (!r.ok) throw new Error('reverse unavailable');
                const d = await r.json();
                if (d.features?.length) return shortName(photonPlace(d.features[0]));
            } catch (e) {}
            return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
        function shortName(p) {
            const a = p.address || {};
            const main = p.name || a.road || a.neighbourhood || a.suburb || a.city || a.town || a.village || '';
            const rest = [a.suburb || a.neighbourhood, a.city || a.town || a.village || a.county, a.state].filter(x => x && x !== main);
            return [main, ...rest].filter(Boolean).join('، ') || p.display_name;
        }
        function pinIcon(color, icon) {
            return L.divIcon({
                className: 'pin',
                html: `<div style="background:${color};width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,.4)"><i class="fa-solid ${icon}" style="transform:rotate(45deg);color:white;font-size:13px"></i></div>`,
                iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -34]
            });
        }
        function setPoint(kind, lat, lng, label, fly = true) {
            const coreKind = kind.replace('h-', '');
            if (hamsafarOpen && (coreKind === 'start' || coreKind === 'dest')) {
                travelerSearchActive = true;
            }
            points[coreKind] = { lat, lng, label };
            
            if (inputsMapping[coreKind]) {
                inputsMapping[coreKind].forEach(id => { const el = $(id); if(el) el.value = label; });
            }
            
            if (pointMarkers[coreKind]) map.removeLayer(pointMarkers[coreKind]);
            const m = L.marker([lat, lng], {
                icon: coreKind === 'start' ? pinIcon('#2563eb', 'fa-circle-dot') : pinIcon('#ef4444', 'fa-flag-checkered'),
                draggable: true
            }).addTo(map).bindPopup(esc(label));
            
            m.on('dragend', async (e) => {
                const ll = e.target.getLatLng();
                const name = await reverseGeocode(ll.lat, ll.lng);
                setPoint(coreKind, ll.lat, ll.lng, name, false);
                if (bothFilled()) handleRoutingAction();
            });
            pointMarkers[coreKind] = m;
            
            hideBox(kind);
            
            if (fly && !bothFilled()) panTo(lat, lng, Math.max(map.getZoom(), 15));
        }

        // ---------- Suggestions & Search ----------
        const debounceTimers = {};
        
        function getBox(id) {
            const mapId = { 'start': 'suggest-start', 'dest': 'suggest-dest', 'h-start': 'suggest-h-start', 'h-dest': 'suggest-h-dest', 'search': 'suggest-search' };
            return $(mapId[id] || id);
        }
        function hideBox(id) { 
            const b = getBox(id); 
            if(b) b.style.display = 'none'; 
        }
        function showBoxItems(id, items) {
            const box = getBox(id);
            if(!box) return;
            box.innerHTML = '';
            items.forEach(it => {
                const el = document.createElement('div');
                el.className = 'suggest-item';
                el.innerHTML = `<i class="fa-solid ${it.icon}"></i><div><div>${esc(it.title)}</div>${it.sub ? `<div class="sub">${esc(it.sub)}</div>` : ''}</div>`;
                el.addEventListener('mousedown', ev => { ev.preventDefault(); it.onPick(); });
                box.appendChild(el);
            });
            box.style.display = items.length ? 'block' : 'none';
        }

        function defaultOptions(kind) {
            return [
                { icon: 'fa-location-crosshairs', title: 'موقعیت فعلی من', sub: 'استفاده از GPS', onPick: () => useMyLocation(kind) },
                { icon: 'fa-hand-pointer', title: 'انتخاب از روی نقشه', sub: 'روی نقشه کلیک کنید', onPick: () => { 
                    hideBox(kind);
                    startPicking(kind); 
                }}
            ];
        }
        
        function onPlacePicked(kind, p) {
            const lat = parseFloat(p.lat), lng = parseFloat(p.lon), name = shortName(p);
            if (kind === 'search') { setSearchPlace(lat, lng, name); return; }
            setPoint(kind, lat, lng, name);
            if (bothFilled()) handleRoutingAction();
        }

        const searchInputConfigs = [
            { id: 'start', inputId: 'start-point' },
            { id: 'dest', inputId: 'dest-point' },
            { id: 'search', inputId: 'search-input' },
            { id: 'h-start', inputId: 'h-start-point' },
            { id: 'h-dest', inputId: 'h-dest-point' }
        ];

        searchInputConfigs.forEach(conf => {
            const input = $(conf.inputId);
            if (!input) return;
            
            input.addEventListener('focus', () => {
                lastFocused = conf.id.replace('h-', '');
                if (conf.id !== 'search' && !input.value.trim()) showBoxItems(conf.id, defaultOptions(conf.id));
            });
            
            input.addEventListener('blur', () => setTimeout(() => hideBox(conf.id), 150));
            
            input.addEventListener('input', () => {
                const coreKind = conf.id.replace('h-', '');
                if (coreKind !== 'search') points[coreKind] = null;
                else $('search-clear').classList.toggle('hidden', !input.value);
                
                const q = input.value.trim();
                clearTimeout(debounceTimers[conf.id]);

                if (!q) { 
                    if (coreKind === 'search') hideBox(conf.id); 
                    else showBoxItems(conf.id, defaultOptions(conf.id)); 
                    return; 
                }
                if (q.length < 2) { hideBox(conf.id); return; }
                
                debounceTimers[conf.id] = setTimeout(async () => {
                    showBoxItems(conf.id, [{ icon: 'fa-spinner fa-spin', title: 'در حال جستجو...', onPick: () => {} }]);
                    try {
                        const res = await searchPlaces(q);
                        if (!res.length) {
                            showBoxItems(conf.id, [{ icon: 'fa-circle-exclamation', title: 'نتیجه‌ای پیدا نشد', onPick: () => {} }]);
                            return;
                        }
                        showBoxItems(conf.id, res.map(p => ({ icon: 'fa-location-dot', title: shortName(p), sub: p.display_name, onPick: () => onPlacePicked(conf.id, p) })));
                    } catch (e) {
                        showBoxItems(conf.id, [{ icon: 'fa-wifi', title: 'خطا در اتصال', onPick: () => {} }]);
                    }
                }, 450);   
            });
        });

        function setSearchPlace(lat, lng, label) {
            searchPlace = { lat, lng, label };
            const sInp = $('search-input'); if(sInp) sInp.value = label;
            $('search-clear').classList.remove('hidden');
            hideBox('search');
            
            if (searchMarker) map.removeLayer(searchMarker);
            searchMarker = L.marker([lat, lng], { icon: pinIcon('#ef4444', 'fa-location-dot') }).addTo(map)
                .bindPopup(`<div style="min-width:170px"><div style="font-weight:700;margin-bottom:8px">${esc(label)}</div><button onclick="routeToSearched()" class="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg w-full">مسیریابی به اینجا</button></div>`)
                .openPopup();
            panTo(lat, lng, Math.max(map.getZoom(), 15));
        }
        function clearSearch() {
            if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null; }
            searchPlace = null; 
            const sInp = $('search-input'); if(sInp) sInp.value = '';
            $('search-clear').classList.add('hidden');
            hideBox('search');
        }
        function routeToSearched() { map.closePopup(); openDirections(searchPlace); }

        // ---------- Panels open / close ----------
        // ---------- Panels open / close ----------
        function toggleMainMenu() {
            if (mainMenuOpen) closeMainMenu();
            else openMainMenu();
        }
        
        function openMainMenu() {
            closeProfilePanel();
            closeDirections();
            closeHamsafarPanel();
            closePermGroupsPanel();
            
            mainMenuOpen = true;
            $('main-menu-panel').classList.remove('hidden');
            $('main-menu-panel').classList.add('flex');

            updateSidebarIcons();
        }
        
        function closeMainMenu() {
            mainMenuOpen = false;
            $('main-menu-panel').classList.add('hidden');
            $('main-menu-panel').classList.remove('flex');

            updateSidebarIcons();
        }

        function openDirections(passedPlace = null) {
            closeProfilePanel();
            closeHamsafarPanel();
            closePermGroupsPanel();
            closeMainMenu();
            
            panelOpen = true;
            $('dir-panel').classList.remove('hidden');
            
            let placeToUse = passedPlace || searchPlace;
            if (placeToUse) setPoint('dest', placeToUse.lat, placeToUse.lng, placeToUse.label, false);
            clearSearch();
            if (bothFilled()) handleRoutingAction();
            else if (points.start && !points.dest) { const el = $('dest-point'); if(el) el.focus(); }
            else { const el = $('start-point'); if(el) el.focus(); }
            
            updateSidebarIcons();
        }
        
        function closeDirections() {
            panelOpen = false;
            $('dir-panel').classList.add('hidden');
            clearRoutes(); stopPicking();
        }

        function openHamsafarPanel() {
            if (!currentUser) { showToast('برای استفاده از قابلیت همسفر ابتدا وارد حساب شوید.', 'error'); openAuthModal('login'); return; }
            closeProfilePanel();
            closeDirections();
            closePermGroupsPanel();
            closeMainMenu();
            
            hamsafarOpen = true;
            $('hamsafar-panel').classList.remove('hidden');
            $('hamsafar-panel').classList.add('flex');
            
            profile = 'car';
            if (bothFilled()) handleRoutingAction();
            updateSidebarIcons();
        }
        
        function closeHamsafarPanel() {
            hamsafarOpen = false;
            $('hamsafar-panel').classList.add('hidden');
            $('hamsafar-panel').classList.remove('flex');
            updateSidebarIcons();
        }

        async function openPermGroupsPanel(groupIdToOpen = null) {
            if (!currentUser) { showToast('برای استفاده از گروه‌ها ابتدا وارد حساب شوید.', 'error'); openAuthModal('login'); return; }
            closeProfilePanel();
            closeDirections();
            closeHamsafarPanel();
            closeMainMenu();
            
            permGroupsOpen = true;
            $('groups-panel').classList.remove('hidden');
            $('groups-panel').classList.add('flex');
            
            const groups = await loadPermanentGroups();
            
            if (groupIdToOpen && groups) {
                const targetGroup = groups.find(g => g.id === groupIdToOpen);
                if (targetGroup) openPermChat(targetGroup.id, targetGroup.name, targetGroup.avatar);
            }
            updateSidebarIcons();
        }
        
        function closePermGroupsPanel() {
            permGroupsOpen = false;
            activePermGroupId = null;
            closePermGroupDetail(); 
            $('groups-panel').classList.add('hidden');
            $('groups-panel').classList.remove('flex');
            updateSidebarIcons();
        }

        function openProfilePanel() {
            if (!currentUser) return;
            closeDirections();
            closeHamsafarPanel();
            closePermGroupsPanel();
            closeMainMenu();
            
            profilePanelOpen = true;
            $('profile-panel-avatar').src = currentUser.avatar || DEFAULT_AVATAR;
            $('profile-panel-name').innerText = currentUser.name || 'کاربر';
            $('profile-panel').classList.remove('hidden');
            $('profile-menu').classList.add('hidden');
            updateSidebarIcons();
        }
        
        function closeProfilePanel() {
            profilePanelOpen = false;
            $('profile-panel').classList.add('hidden');
            $('profile-menu').classList.add('hidden');
            updateSidebarIcons();
        }
        
        function openEditProfilePanel() {
            $('profile-menu').classList.add('hidden');
            $('profile-panel').classList.add('hidden');
            $('edit-profile-panel').classList.remove('hidden');
            $('edit-avatar-preview').src = currentUser.avatar || DEFAULT_AVATAR;
            tempAvatar = currentUser.avatar;
            const parts = (currentUser.name || '').trim().split(/\s+/);
            $('edit-name').value = parts.shift() || '';
            $('edit-family').value = parts.join(' ');
            document.querySelectorAll('input[name="user-role"]').forEach(el => el.checked = (el.value === (currentUser.role || 'passenger')));
        }
        async function saveProfileChanges() {
            if (!currentUser) return;
            const fullName = [$('edit-name').value.trim(), $('edit-family').value.trim()].filter(Boolean).join(' ');
            if (!fullName) { showToast('نام را وارد کنید.', 'error'); return; }
            const role = document.querySelector('input[name="user-role"]:checked')?.value || 'passenger';
            try {
                const response = await apiFetch(`${API_BASE}/users/me`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name: fullName, role, avatar: tempAvatar || currentUser.avatar || DEFAULT_AVATAR })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail || 'خطا در ذخیره');
                currentUser = data.user;
                $('profile-panel-name').innerText = currentUser.name;
                $('profile-panel-avatar').src = currentUser.avatar || DEFAULT_AVATAR;
                renderHeaderAuth();
                closeEditProfilePanel();
                showToast('پروفایل با موفقیت به‌روز شد.', 'success');
            } catch (e) { showToast(e.message || 'خطا در ذخیره پروفایل.', 'error'); }
        }
        $('edit-avatar-input')?.addEventListener('change', async (event) => {
            const f = event.target.files?.[0];
            if (!f) return;
            if (!f.type.startsWith('image/') || f.size > 1500000) { showToast('حجم تصویر باید کمتر از ۱.۵ مگابایت باشد.', 'error'); return; }
            const reader = new FileReader();
            reader.onload = () => { tempAvatar = reader.result; $('edit-avatar-preview').src = tempAvatar; };
            reader.readAsDataURL(f);
        });
        function closeEditProfilePanel() {
            $('edit-profile-panel').classList.add('hidden');
            $('profile-panel').classList.remove('hidden');
        }
        
        function toggleProfileMenu(e) { e.stopPropagation(); $('profile-menu').classList.toggle('hidden'); }
        
        function toggleGroupMenu(menuId, e) { 
            e.stopPropagation(); 
            const menu = $(menuId);
            if (menu) menu.classList.toggle('hidden'); 
        }
        
        document.addEventListener('click', function(e) {
            if ($('profile-menu') && !$('profile-menu').classList.contains('hidden') && !e.target.closest('#profile-menu') && !e.target.closest('button[title="گزینه‌ها"]')) {
                $('profile-menu').classList.add('hidden');
            }
            ['chat-menu', 'info-menu'].forEach(id => {
                const m = $(id);
                if (m && !m.classList.contains('hidden') && !e.target.closest('.relative')) {
                    m.classList.add('hidden');
                }
            });
        });
        
        function switchProfileTab(tab, btn) {
            document.querySelectorAll('.profile-tab-btn').forEach(b => b.className = 'profile-tab-btn pb-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition');
            btn.className = 'profile-tab-btn pb-2.5 text-sm font-bold text-blue-600 border-b-2 border-blue-600';
            document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.add('hidden'));
            $('tab-content-' + tab).classList.remove('hidden');
        }

        // ---------- Pick from map ----------
        function startPicking(kind) {
            pickMode = kind;
            $('map').classList.add('picking');
            hideBox(kind);
            showToast('لطفاً از روی نقشه انتخاب کنید (Esc برای لغو)', 'info', 5000);
        }
        function stopPicking() { pickMode = null; $('map').classList.remove('picking'); }
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && pickMode) stopPicking(); });

        map.on('click', async function (e) {
            if (!pickMode) return;
            const mode = pickMode;
            stopPicking();
            
            if (mode === 'station-origin') { pendingStationData.origin = e.latlng; openStationStep1(); return; }
            if (mode === 'station-dest') { pendingStationData.dest = e.latlng; openStationStep3(); return; }
            
            if (mode.startsWith('save-')) {
                const key = mode.slice(5);
                saved[key] = { lat: e.latlng.lat, lng: e.latlng.lng, label: await reverseGeocode(e.latlng.lat, e.latlng.lng) };
                persistSaved(); renderSaved();
                showToast('مکان با موفقیت ذخیره شد.', 'success');
                return;
            }
            
            const coreKind = mode.replace('h-', '');
            if(inputsMapping[coreKind]) {
                inputsMapping[coreKind].forEach(id => { const el = $(id); if(el) el.value = '...'; });
            }
            
            const name = await reverseGeocode(e.latlng.lat, e.latlng.lng);
            setPoint(mode, e.latlng.lat, e.latlng.lng, name, false);
            if (bothFilled()) handleRoutingAction();
        });

        function swapPoints() {
            const a = points.start, b = points.dest;
            const sInp1 = $('start-point'), sInp2 = $('h-start-point');
            const dInp1 = $('dest-point'), dInp2 = $('h-dest-point');
            
            const aLabel = sInp1 ? sInp1.value : '';
            const bLabel = dInp1 ? dInp1.value : '';
            
            ['start', 'dest'].forEach(k => { if (pointMarkers[k]) { map.removeLayer(pointMarkers[k]); pointMarkers[k] = null; } points[k] = null; });
            
            if(sInp1) sInp1.value = bLabel; if(sInp2) sInp2.value = bLabel;
            if(dInp1) dInp1.value = aLabel; if(dInp2) dInp2.value = aLabel;
            
            if (b) setPoint('start', b.lat, b.lng, b.label, false);
            if (a) setPoint('dest', a.lat, a.lng, a.label, false);
            if (bothFilled()) handleRoutingAction();
        }
        function bothFilled() { 
            return points.start !== null && points.dest !== null;
        }

        // ---------- Saved places ----------
        function persistSaved() { try { localStorage.setItem('mapSaved', JSON.stringify(saved)); } catch (e) {} }
        function loadSaved() { try { const s = JSON.parse(localStorage.getItem('mapSaved') || 'null'); if (s) { saved.home = s.home || null; saved.work = s.work || null; } } catch (e) {} }
        function renderSaved() {
            if (!$('saved-places')) return;
            const hSet = !!saved.home, wSet = !!saved.work;
            $('saved-places').innerHTML = `
                <div class="flex items-center gap-2 w-full text-xs font-medium text-gray-700">
                    <button onclick="${hSet ? "savedClick('home')" : "editSaved('home')"}" class="flex-1 flex items-center justify-center gap-2 py-2 px-3 border border-gray-200 rounded-full hover:bg-gray-50 transition">
                        خانه <i class="fa-solid fa-house ${hSet ? 'text-blue-500' : 'text-blue-300'}"></i>
                    </button>
                    <button onclick="${wSet ? "savedClick('work')" : "editSaved('work')"}" class="flex-1 flex items-center justify-center gap-2 py-2 px-3 border border-gray-200 rounded-full hover:bg-gray-50 transition">
                        محل کار <i class="fa-solid fa-briefcase ${wSet ? 'text-orange-500' : 'text-orange-300'}"></i>
                    </button>
                    <button onclick="showSavedPlacesView()" class="flex-1 flex items-center justify-center gap-1 py-2 px-3 border border-gray-200 rounded-full hover:bg-gray-50 transition text-gray-500">
                        <span class="text-[10px]">...</span> سایر ذخیره‌ها
                    </button>
                </div>`;
        }
        function showSavedPlacesView() { $('route-selection-view').classList.add('hidden'); $('saved-places-view').classList.remove('hidden'); $('saved-places-view').classList.add('flex'); renderExtendedSavedList(); }
        function hideSavedPlacesView() { $('saved-places-view').classList.add('hidden'); $('saved-places-view').classList.remove('flex'); $('route-selection-view').classList.remove('hidden'); }
        
        function renderExtendedSavedList() {
            if (!$('extended-saved-list')) return;
            let html = '';
            const homeLabel = saved.home ? 'خانه' : 'اضافه کردن خانه';
            const homeIconColor = saved.home ? 'text-blue-500' : 'text-blue-400';
            html += `
            <div class="flex items-center justify-between p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onclick="${saved.home ? "savedClick('home')" : "editSaved('home')"}">
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-house ${homeIconColor}"></i>
                    <span class="text-sm font-medium ${saved.home ? 'text-blue-600' : 'text-blue-500'}">${homeLabel}</span>
                </div>
                <button class="text-gray-400 hover:text-gray-600"><i class="fa-solid ${saved.home ? 'fa-ellipsis-vertical' : 'fa-plus'}"></i></button>
            </div>`;
            
            const workLabel = saved.work ? 'محل کار' : 'اضافه کردن محل کار';
            const workIconColor = saved.work ? 'text-orange-500' : 'text-orange-400';
            html += `
            <div class="flex items-center justify-between p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onclick="${saved.work ? "savedClick('work')" : "editSaved('work')"}">
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-briefcase ${workIconColor}"></i>
                    <span class="text-sm font-medium ${saved.work ? 'text-orange-600' : 'text-orange-500'}">${workLabel}</span>
                </div>
                <button class="text-gray-400 hover:text-gray-600"><i class="fa-solid ${saved.work ? 'fa-ellipsis-vertical' : 'fa-plus'}"></i></button>
            </div>`;

            const customPlaces = [
                { title: 'ایستگاه قائمشهر ساری', icon: 'fa-star', color: 'text-yellow-400' },
                { title: 'My university', icon: 'fa-plus', color: 'text-emerald-400' }
            ];

            customPlaces.forEach(d => {
                html += `
                <div class="flex items-center justify-between p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                    <div class="flex items-center gap-3"><i class="fa-solid ${d.icon} ${d.color}"></i><span class="text-sm text-gray-700 font-medium">${d.title}</span></div>
                    <button class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                </div>`;
            });
            $('extended-saved-list').innerHTML = html;
        }

        function editSaved(key) { if (!currentUser) { showToast('ابتدا وارد حساب شوید.', 'error'); openAuthModal('login'); return; } startPicking('save-' + key); }
        function savedClick(key) {
            const s = saved[key];
            if (!s) return editSaved(key);
            const kind = !points.start ? 'start' : !points.dest ? 'dest' : (lastFocused || 'dest');
            setPoint(kind, s.lat, s.lng, s.label, false);
            if (bothFilled()) handleRoutingAction(); else panTo(s.lat, s.lng, 15);
            hideSavedPlacesView();
        }

        // ---------- Station Wizard ----------
        function enableAddStationMode() { 
            if (!currentUser) { showToast('برای افزودن ایستگاه ابتدا باید وارد حساب کاربری شوید.', 'error'); openAuthModal('login'); return; }
            pendingStationData = {}; startPicking('station-origin'); 
        }
        function openStationStep1() {
            $('station-step1').classList.remove('hidden'); $('station-step2').classList.add('hidden'); $('station-step3').classList.add('hidden');
            const checkedRadio = document.querySelector('input[name="vehicle-type"]:checked'); if(checkedRadio) checkedRadio.checked = false;
            $('vehicle-other-input').value = ''; $('vehicle-other-input').classList.add('hidden');
            $('station-wizard-modal').style.display = 'flex';
        }
        function toggleOtherVehicleInput() {
            const val = document.querySelector('input[name="vehicle-type"]:checked')?.value;
            if (val === 'other') { $('vehicle-other-input').classList.remove('hidden'); $('vehicle-other-input').focus(); } else { $('vehicle-other-input').classList.add('hidden'); }
        }
        function goToStationStep2() {
            const val = document.querySelector('input[name="vehicle-type"]:checked')?.value;
            if (!val) { showToast('لطفاً نوع وسیله نقلیه را انتخاب کنید.', 'error'); return; }
            if (val === 'other' && !$('vehicle-other-input').value.trim()) { showToast('لطفاً نوع وسیله نقلیه را تایپ کنید.', 'error'); return; }
            pendingStationData.vehicleType = val === 'other' ? $('vehicle-other-input').value.trim() : val;
            $('station-step1').classList.add('hidden'); $('station-step2').classList.remove('hidden');
        }
        function pickStationDest() { $('station-wizard-modal').style.display = 'none'; startPicking('station-dest'); }
        function openStationStep3() {
            $('station-step1').classList.add('hidden'); $('station-step2').classList.add('hidden'); $('station-step3').classList.remove('hidden');
            $('station-fare').value = ''; for(let i=1; i<=3; i++) { $(`time-start-${i}`).value = ''; $(`time-end-${i}`).value = ''; }
            $('station-wizard-modal').style.display = 'flex';
        }
        async function confirmAddStationFinal() {
            const fare = $('station-fare').value.trim();
            if (!fare) { showToast('لطفاً کرایه حدودی را تعیین کنید.', 'error'); return; }
            pendingStationData.fare = fare;
            const times = [];
            for(let i=1; i<=3; i++) {
                const start = $(`time-start-${i}`).value, end = $(`time-end-${i}`).value;
                if (start || end) { times.push(`از ${start ? esc(start) : '...'} تا ${end ? esc(end) : '...'}`); }
            }
            const nameMap = { 'yellow-taxi': 'تاکسی زرد', 'personal-taxi': 'تاکسی شخصی', 'bus': 'اتوبوس', 'van': 'ون / مینی‌بوس' };
            const vName = nameMap[pendingStationData.vehicleType] || pendingStationData.vehicleType;
            
            let popupHtml = `<div class="text-right p-1"><b class="text-emerald-700 text-sm mb-1 block">ایستگاه ${esc(vName)}</b>`;
            popupHtml += `<div class="text-xs text-gray-700 mb-2 font-medium">کرایه حدودی: ${fa(fare)} تومان</div>`;
            if (times.length > 0) { popupHtml += `<div class="text-[10px] text-gray-500 mb-1 border-t pt-1">ساعات حضور:</div><ul class="text-[10px] text-gray-600 space-y-0.5">` + times.map(t => `<li>- ${t}</li>`).join('') + `</ul>`; }
            popupHtml += `</div>`;
            
            try {
                const result = await apiFetch(`${API_BASE}/stations`, {
                    method: 'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({
                        vehicle_type: pendingStationData.vehicleType,
                        origin_lat:pendingStationData.origin.lat, origin_lng:pendingStationData.origin.lng,
                        dest_lat:pendingStationData.dest.lat, dest_lng:pendingStationData.dest.lng,
                        fare, hours:times
                    })
                });
                if (!result.ok) throw new Error('خطا در ذخیره ایستگاه');
            } catch (error) { showToast(error.message || 'ذخیره ایستگاه ناموفق بود.', 'error'); return; }
            const originMarker = L.marker(pendingStationData.origin, { icon: pinIcon('#059669', 'fa-map-pin') }).addTo(map).bindPopup(popupHtml);
            originMarker.on('popupopen', async () => {
                activeStationExtras.clearLayers();
                const destIcon = L.divIcon({ className: 'pin', html: `<div style="background:#ef4444;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;box-shadow:0 2px 4px rgba(0,0,0,.3);"><i class="fa-solid fa-flag-checkered text-[10px]"></i></div>`, iconSize: [24, 24] });
                L.marker(pendingStationData.dest, {icon: destIcon}).bindPopup(`مقصد تقریبی خط ${esc(vName)}`).addTo(activeStationExtras);
                try {
                    const s = pendingStationData.origin, d = pendingStationData.dest;
                    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${s.lng},${s.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`);
                    const data = await res.json();
                    if (data.code === 'Ok' && data.routes.length > 0) {
                        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                        L.polyline(coords, { color: '#059669', weight: 4, dashArray: '6, 6' }).addTo(activeStationExtras);
                    } else { L.polyline([s, d], { color: '#059669', weight: 4, dashArray: '6, 6' }).addTo(activeStationExtras); }
                } catch (e) { L.polyline([pendingStationData.origin, pendingStationData.dest], { color: '#059669', weight: 4, dashArray: '6, 6' }).addTo(activeStationExtras); }
            });
            originMarker.on('popupclose', () => { activeStationExtras.clearLayers(); });
            showToast('ایستگاه جدید با موفقیت ثبت شد.', 'success');
            closeStationWizard();
        }
        async function loadSavedStations() {
            try {
                const res = await apiFetch(`${API_BASE}/stations`);
                if (!res.ok) return;
                const stations = await res.json();
                for (const s of stations) {
                    const vehicleLabels = { 'yellow-taxi':'تاکسی زرد', 'personal-taxi':'تاکسی شخصی', bus:'اتوبوس', van:'ون / مینی‌بوس' };
                    const name = vehicleLabels[s.vehicle_type] || s.vehicle_type;
                    const popup = `<div class="text-right p-1"><b class="text-emerald-700 text-sm mb-1 block">ایستگاه ${esc(name)}</b>`+
                        `<div class="text-xs text-gray-700 mb-2 font-medium">کرایه حدودی: ${esc(s.fare)} تومان</div>`+
                        ((s.hours || []).length ? `<div class="text-[10px] text-gray-500 mb-1 border-t pt-1">ساعات حضور:</div><ul class="text-[10px] text-gray-600 space-y-0.5">${s.hours.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>` : '') + '</div>';
                    L.marker([s.origin_lat, s.origin_lng], {icon:pinIcon('#059669','fa-map-pin')}).addTo(map).bindPopup(popup)
                        .on('popupopen', () => {
                            activeStationExtras.clearLayers();
                            L.marker([s.dest_lat,s.dest_lng], {icon:pinIcon('#ef4444','fa-flag-checkered')}).addTo(activeStationExtras);
                            L.polyline([[s.origin_lat,s.origin_lng],[s.dest_lat,s.dest_lng]], {color:'#059669',weight:4,dashArray:'6, 6'}).addTo(activeStationExtras);
                        }).on('popupclose',()=>activeStationExtras.clearLayers());
                }
            } catch(e) { console.warn('Unable to load stations', e); }
        }
        function closeStationWizard() { $('station-wizard-modal').style.display = 'none'; pendingStationData = {}; }

        // ---------- GPS ----------
        function getGPS() {
            return new Promise((resolve, reject) => {
                if (!navigator.geolocation) return reject(new Error('no geolocation'));
                navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, { enableHighAccuracy: true, timeout: 10000 });
            });
        }
        async function useMyLocation(kind) {
            hideBox(kind);
            showToast('در حال یافتن موقعیت مکانی شما...', 'info', 2000);
            try {
                const loc = await getGPS();
                const name = await reverseGeocode(loc.lat, loc.lng);
                setPoint(kind, loc.lat, loc.lng, name);
            } catch (e) { 
                console.error("GPS Error:", e);
                showToast('خطا! لطفا دسترسی به موقعیت مکانی (GPS) را مجاز کنید.', 'error', 5000); 
            }
        }
        async function locateMe() {
            try {
                const loc = await getGPS();
                panTo(loc.lat, loc.lng, 15);
                L.circleMarker([loc.lat, loc.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map).bindPopup('موقعیت شما');
            } catch (e) { showToast('لطفا دسترسی به موقعیت مکانی (GPS) را مجاز کنید.', 'error'); }
        }

        // ---------- Transport profile + route type ----------
        function carLike() { return profile === 'car' || profile === 'moto'; }
        
        const TAB_ON = 'profile-tab flex flex-col items-center gap-1 py-2 rounded-xl border text-xs border-blue-600 text-blue-600 bg-blue-50 font-bold';
        const TAB_OFF = 'profile-tab flex flex-col items-center gap-1 py-2 rounded-xl border text-xs border-gray-200 text-gray-600 hover:bg-gray-50';
        const SEG_ON = 'py-2 rounded-lg text-sm font-bold bg-blue-600 text-white shadow transition';
        const SEG_OFF = 'py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition';

        function updateControls() {
            document.querySelectorAll('.profile-tab').forEach(b => { b.className = b.dataset.p === profile ? TAB_ON : TAB_OFF; });
            if($('mode-time')) $('mode-time').className = routeMode === 'time' ? SEG_ON : SEG_OFF;
            if($('mode-cost')) $('mode-cost').className = routeMode === 'cost' ? SEG_ON : SEG_OFF;
        }
        function setProfile(p) {
            if (p === 'transit') { showToast('مسیریابی با حمل‌ونقل همگانی هنوز پشتیبانی نمی‌شود.', 'info'); return; }
            profile = p; updateControls(); hideResultPanels();
            if (bothFilled()) handleRoutingAction(); else if(panelOpen) $('road-panel').innerHTML = `<div class="text-sm text-gray-500">${ROAD_HINT}</div>`;
        }
        function setRouteMode(m) {
            routeMode = m; 
            updateControls(); 
            selectedRoute = 0;
            if (bothFilled() && rawRoutes.length > 0) {
                drawRoutes(true);
                renderRoadPanel();
            }
        }
        function hideResultPanels() { if($('road-panel')) $('road-panel').classList.add('hidden'); }

        // ---------- UPGRADED: SCHEDULE TOGGLE ----------
        function toggleScheduleMode(mode) {
            travelScheduleMode = mode;
            if (hamsafarOpen && bothFilled()) travelerSearchActive = true;
            const btnNow = $('btn-time-now');
            const btnLater = $('btn-time-later');
            const picker = $('schedule-picker');
            
            if (mode === 'now') {
                btnNow.className = 'flex-1 text-[11px] font-bold py-1.5 rounded-md bg-white shadow text-blue-600 transition';
                btnLater.className = 'flex-1 text-[11px] font-medium py-1.5 rounded-md text-gray-500 hover:text-gray-700 transition';
                picker.classList.remove('flex');
                picker.classList.add('hidden');
                $('btn-create-planned').classList.add('hidden');
            } else {
                btnLater.className = 'flex-1 text-[11px] font-bold py-1.5 rounded-md bg-white shadow text-blue-600 transition';
                btnNow.className = 'flex-1 text-[11px] font-medium py-1.5 rounded-md text-gray-500 hover:text-gray-700 transition';
                picker.classList.remove('hidden');
                picker.classList.add('flex');
                $('btn-create-planned').classList.remove('hidden');
            }
            
            if (bothFilled()) handleRoutingAction();
        }

        // ---------- LIVE Polling Methods ----------
        function startTravelerPolling() {
            if (activeTravelersInterval) clearInterval(activeTravelersInterval);
            activeTravelersInterval = setInterval(async () => {
                if (!currentUser) return;
                
                try {
                    const notifRes = await apiFetch(`${API_BASE}/notifications/${currentUser.id}`);
                    const notifData = await notifRes.json();
                    if (notifData.notifications) {
                        notifData.notifications.forEach(n => showToast(n.message, 'info', 5000));
                    }
                } catch(e) {}
                
                // ALWAYS POLL PERMANENT GROUPS SO NOTIFICATIONS/REDIRECTS WORK IN BACKGROUND
                await loadPermanentGroups();
                if (permGroupsOpen && activePermGroupId) {
                    await loadPermChatMessages();
                }

                // Poll incoming requests even when the Hamsafar sidebar is closed.
                // Otherwise the receiver never sees the request notification.
                await pollIncomingRequests();
                // Keep advertising only after explicitly selecting a trip.
                // Continue the heartbeat even if the sidebar is closed.
                if (travelerSearchActive && bothFilled()) await publishTraveler();
                if (hamsafarOpen) {
                    await loadAcceptedRequests();
                    if (travelerSearchActive && bothFilled() && currentHTab === 'nearby') {
                        await loadTravelersOnMap(false);
                    }
                    if (currentHTab === 'group') await loadChatMessages();
                }
            }, 3000); 
        }

        function stopTravelerPolling() {
            if (activeTravelersInterval) clearInterval(activeTravelersInterval);
            activeTravelersInterval = null;
            travelerSearchActive = false;
            // The /api/logout endpoint already removes temporary membership.
            // No second DELETE request is needed; permanent groups are retained.
        }

        // ---------- Routing & Live API Calls ----------
        async function handleRoutingAction() {
            if (!bothFilled()) { showToast('لطفاً مبدا و مقصد را وارد کنید.', 'error'); return; }
            if (hamsafarOpen && !currentUser) { openAuthModal('login'); return; }
            
            if(panelOpen) {
                hideResultPanels();
                $('road-panel').classList.remove('hidden');
                $('road-panel').innerHTML = '<div class="text-sm text-gray-500"><i class="fa-solid fa-spinner fa-spin"></i> در حال محاسبه مسیر...</div>';
            }

            // Traveler availability must not depend on public OSRM routing being online.
            // Publish the selected origin/destination before requesting road directions.
            if (hamsafarOpen && travelerSearchActive) {
                await publishTraveler();
                if (currentHTab === 'nearby') await loadTravelersOnMap(true);
                startTravelerPolling();
            }

            try { await fetchRoutes(); }
            catch (e) {
                clearRoutes();
                console.warn('Road directions unavailable; traveler matching remains active.', e);
                if(panelOpen) $('road-panel').innerHTML = '<div class="text-sm text-red-600">مسیری پیدا نشد.</div>';
                return;
            }
            selectedRoute = 0;
            drawRoutes(true);

            if (!hamsafarOpen) renderRoadPanel();
        }

        function osrmBase() {
            if (profile === 'foot') return 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/';
            if (profile === 'bike') return 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/';
            return 'https://router.project-osrm.org/route/v1/driving/';   
        }

        async function fetchRoutes() {
            const s = points.start, d = points.dest;
            const key = `${profile}|${s.lat},${s.lng}|${d.lat},${d.lng}`;
            if (key === rawKey && rawRoutes.length) return;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
            try {
                const r = await fetch(`${osrmBase()}${s.lng},${s.lat};${d.lng},${d.lat}?overview=full&geometries=geojson&alternatives=true&steps=true`, { signal: controller.signal });
                clearTimeout(timeoutId);
                const data = await r.json();
                if (data.code !== 'Ok' || !data.routes.length) throw new Error('no route');
                rawRoutes = data.routes; rawKey = key;
            } catch (err) {
                clearTimeout(timeoutId);
                throw err;
            }
        }

        function sortedRoutes() {
            const r = [...rawRoutes];
            if (routeMode === 'cost' && !hamsafarOpen) {
                r.sort((a, b) => a.distance - b.distance);
            } else {
                r.sort((a, b) => a.duration - b.duration);
            }
            return r;
        }
        function fmtDuration(sec) {
            const m = Math.max(1, Math.round(sec / 60));
            if (m < 60) return fa(m) + ' دقیقه';
            return fa(Math.floor(m / 60)) + ' ساعت' + (m % 60 ? ' و ' + fa(m % 60) + ' دقیقه' : '');
        }
        function fmtCost(km) { 
            const baseCost = 5000;
            const perKm = profile === 'moto' ? 800 : 1500;
            return fa(Math.max(baseCost, Math.round((baseCost + (km * perKm)) / 500) * 500)) + ' تومان';
        }

        function drawRoutes(fit) {
            routeLayers.forEach(l => map.removeLayer(l)); routeLayers = [];
            const rs = sortedRoutes();
            const idxs = hamsafarOpen ? [0] : rs.map((_, i) => i).filter(i => i !== selectedRoute).concat(selectedRoute);
            idxs.forEach(i => {
                const sel = i === selectedRoute;
                const coords = rs[i].geometry.coordinates.map(c => [c[1], c[0]]);
                const line = L.polyline(coords, sel ? { color: '#2563eb', weight: 7, opacity: .95 } : { color: '#64748b', weight: 5, dashArray: '6, 8', opacity: .8 }).addTo(map);
                if (!hamsafarOpen) line.on('click', () => selectRoute(i));
                routeLayers.push(line);
            });
            if (fit && routeLayers.length) fitTo(L.featureGroup(routeLayers).getBounds());
        }
        function selectRoute(i) { selectedRoute = i; drawRoutes(false); renderRoadPanel(); }
        function clearRoutes() { routeLayers.forEach(l => map.removeLayer(l)); routeLayers = []; }

        function showRouteSteps(index) {
            const rt = sortedRoutes()[index];
            const steps = rt.legs[0].steps || [];
            $('steps-route-title').innerText = index === 0 ? 'بهترین مسیر' : `مسیر جایگزین ${fa(index)}`;
            $('steps-route-dist').innerText = fa((rt.distance / 1000).toFixed(1)) + ' کیلومتر';
            $('steps-route-time').innerText = fmtDuration(rt.duration);
            $('steps-route-icon').className = `fa-solid ${profile === 'foot' ? 'fa-person-walking' : 'fa-car'} text-gray-500 text-lg`;
            $('route-selection-view').classList.add('hidden');
            $('route-steps-view').classList.remove('hidden');
            $('route-steps-view').classList.add('flex');
            
            let html = '';
            steps.forEach(st => {
                const tr = translateManeuver(st);
                html += `
                <div class="flex gap-4 py-4 border-b border-gray-100 last:border-0 items-start hover:bg-gray-50 transition">
                    <div class="mt-0.5 text-gray-600 w-6 flex justify-center text-lg"><i class="fa-solid ${tr.icon}"></i></div>
                    <div class="flex-1">
                        <div class="text-[13px] text-gray-800 font-bold mb-1 pl-2">${tr.text}</div>
                        ${st.maneuver.type !== 'arrive' ? `<div class="text-[11px] text-gray-400">${st.distance<1000 ? fa(Math.round(st.distance))+' متر' : fa((st.distance/1000).toFixed(1))+' کیلومتر'}</div>` : ''}
                    </div>
                </div>`;
            });
            $('steps-list').innerHTML = html;
        }

        function translateManeuver(step) {
            const m = step.maneuver, type = m.type, dir = m.modifier, name = step.name ? 'وارد ' + esc(step.name) + ' شوید' : 'مسیر را ادامه دهید';
            if (type === 'depart') return { icon: 'fa-location-dot', text: 'در جهت مسیر قرار بگیرید' };
            if (type === 'arrive') return { icon: 'fa-flag-checkered text-red-500', text: 'به مقصد رسیدید' };
            if (type === 'roundabout') return { icon: 'fa-arrows-spin', text: 'وارد میدان شوید' };
            if (dir && dir.includes('right')) return { icon: 'fa-arrow-turn-right', text: 'به راست بپیچید و ' + name };
            if (dir && dir.includes('left')) return { icon: 'fa-arrow-turn-left', text: 'به چپ بپیچید و ' + name };
            return { icon: 'fa-arrow-up', text: step.name ? 'در ' + esc(step.name) + ' ادامه دهید' : 'مستقیم ادامه دهید' };
        }

        function hideRouteSteps() {
            $('route-steps-view').classList.add('hidden');
            $('route-steps-view').classList.remove('flex');
            $('route-selection-view').classList.remove('hidden');
        }

        function renderRoadPanel() {
            if(!$('road-panel')) return;
            const rs = sortedRoutes(), showCost = carLike();
            const bestLabel = routeMode === 'cost' ? 'ارزان‌ترین مسیر' : 'سریع‌ترین مسیر';
            
            $('road-panel').innerHTML = rs.map((rt, i) => {
                const km = rt.distance / 1000, sel = i === selectedRoute;
                const title = i === 0 ? bestLabel : `مسیر جایگزین ${fa(i)}`;
                const costText = showCost ? fmtCost(km) : '';
                return `<div data-i="${i}" class="route-card ${sel ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200'} border p-3 rounded-xl cursor-pointer">
                    <div class="text-xs ${sel ? 'text-blue-700' : 'text-gray-500'}">${title}</div>
                    <div class="font-bold text-lg mt-0.5">${routeMode === 'cost' && showCost ? costText : fmtDuration(rt.duration)}</div>
                    <div class="text-xs ${sel ? 'text-blue-700' : 'text-gray-500'} mt-1">مسافت: ${fa(km.toFixed(1))} کیلومتر</div>
                    ${sel ? `<div class="mt-3 pt-3 border-t border-gray-100 flex justify-end"><button onclick="event.stopPropagation(); showRouteSteps(${i})" class="text-xs font-bold text-gray-800"><i class="fa-solid fa-arrow-left"></i> گام‌های مسیر</button></div>` : ''}
                </div>`;
            }).join('');
            $('road-panel').querySelectorAll('.route-card').forEach(el => el.addEventListener('click', () => selectRoute(+el.dataset.i)));
        }

        // ---------- HAMSAFAR TABS & LOGIC ----------
        function switchHTab(tab) {
            currentHTab = tab;
            ['nearby', 'accepted', 'group'].forEach(t => {
                const btn = $(`htab-${t}`);
                if(btn) btn.className = t === tab ? 'py-2 rounded-lg text-[11px] font-bold bg-blue-600 text-white shadow transition' : 'py-2 rounded-lg text-[11px] font-medium text-gray-600 hover:bg-gray-100 transition';
                const content = $(`hcontent-${t}`);
                if(content) {
                    if (t === tab) content.classList.remove('hidden');
                    else content.classList.add('hidden');
                }
            });
            if (tab === 'nearby' && bothFilled()) loadTravelersOnMap(true);
            if (tab === 'accepted') { renderPlannedRequests(); loadAcceptedRequests(); }
            if (tab === 'group') loadChatMessages();
        }

        // ---------- PLANNED (SCHEDULED) REQUESTS ----------
        // Planned requests are now stored in SQLite rather than per-browser localStorage.
        const DATE_LABELS = { today: 'امروز', tomorrow: 'فردا', day_after: 'پس‌فردا' };
        let plannedCache = [];
        function getPlanned() { return plannedCache; }
        async function loadPlannedRequests() {
            if (!currentUser) { plannedCache = []; return; }
            try {
                const res = await apiFetch(`${API_BASE}/planned_requests`);
                if (res.ok) { const data = await res.json(); plannedCache = data.requests || []; renderPlannedRequests(); }
            } catch (e) { console.warn('Unable to load scheduled trips', e); }
        }
        async function createPlannedRequest() {
            if (!currentUser) { showToast('برای ایجاد درخواست ابتدا وارد حساب خود شوید.', 'error'); return; }
            if (!bothFilled()) { showToast('ابتدا مبدا و مقصد را مشخص کنید.', 'error'); return; }
            const dateVal = $('schedule-date').value;
            const timeVal = $('schedule-time').value;
            if (!timeVal) { showToast('ساعت حرکت را انتخاب کنید.', 'error'); return; }
            if (dateVal === 'today') {
                const [h, m] = timeVal.split(':').map(Number), now = new Date();
                if (h * 60 + m < now.getHours() * 60 + now.getMinutes()) { showToast('این ساعت گذشته است؛ زمان دیگری انتخاب کنید.', 'error'); return; }
            }
            try {
                const res = await apiFetch(`${API_BASE}/planned_requests`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({date:dateVal, time:timeVal, startLabel:points.start.label || 'مبدا', destLabel:points.dest.label || 'مقصد'})
                });
                if (!res.ok) throw new Error('ثبت درخواست ناموفق بود');
                await loadPlannedRequests();
                showToast('درخواست شما ایجاد شد.', 'success');
                if (currentHTab !== 'accepted') switchHTab('accepted'); else renderPlannedRequests();
                const c = $('hcontent-accepted'); if (c) c.scrollTop = 0;
            } catch (e) { showToast(e.message, 'error'); }
        }

        function renderPlannedRequests() {
            const box = $('planned-requests-container'), listEl = $('planned-requests-list');
            if (!box || !listEl) return;
            const list = getPlanned();
            if (!list.length) { box.classList.add('hidden'); box.classList.remove('flex'); listEl.innerHTML = ''; updateAcceptedRequestsVisibility(true); return; }
            box.classList.remove('hidden'); box.classList.add('flex');
            listEl.innerHTML = list.map(r => `
                <div class="border border-gray-200 rounded-lg p-2.5 bg-gray-50 text-xs">
                    <div class="flex items-center justify-between mb-1.5">
                        <span class="font-bold text-gray-800"><i class="fa-regular fa-clock ml-1 text-emerald-600"></i>${esc(DATE_LABELS[r.date] || r.date)}، ساعت <span dir="ltr">${esc(r.time.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]))}</span></span>
                        <span class="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">در انتظار همسفر</span>
                    </div>
                    <div class="text-gray-600 leading-5"><i class="fa-solid fa-circle text-[7px] text-blue-500 ml-1"></i>${esc(r.startLabel)}</div>
                    <div class="text-gray-600 leading-5"><i class="fa-solid fa-location-dot text-[9px] text-red-500 ml-1"></i>${esc(r.destLabel)}</div>
                    <button onclick="cancelPlannedRequest('${esc(r.id)}')" class="mt-2 w-full bg-white border border-red-200 text-red-600 hover:bg-red-50 py-1.5 rounded-lg transition font-medium"><i class="fa-solid fa-xmark ml-1"></i> لغو درخواست</button>
                </div>`).join('');
            updateAcceptedRequestsVisibility(true);
        }

        async function cancelPlannedRequest(id) {
            try {
                const res = await apiFetch(`${API_BASE}/planned_requests/${encodeURIComponent(id)}`, {method:'DELETE'});
                if (!res.ok) throw new Error('خطا در لغو درخواست');
                await loadPlannedRequests();
                showToast('درخواست لغو شد.', 'info');
            } catch (e) { showToast(e.message, 'error'); }
        }

        function selectedTravelDate() {
            const choice = $('schedule-date')?.value || 'today';
            const dayOffset = {today: 0, tomorrow: 1, day_after: 2}[choice] ?? 0;
            const d = new Date(); d.setDate(d.getDate() + dayOffset);
            const two = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())}`;
        }
        // Public API failures were previously suppressed, making a missing traveler
        // indistinguishable from a successful save. Reuse the original toast component;
        // never introduce new panels or alter the original design.
        let lastTravelerError = '';
        let lastTravelerErrorAt = 0;
        function reportTravelerError(error, action) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Nimrah ${action}:`, error);
            const now = Date.now();
            if (message !== lastTravelerError || now - lastTravelerErrorAt >= 15000) {
                showToast(`خطا در ${action}: ${message}`, 'error', 5000);
                lastTravelerError = message;
                lastTravelerErrorAt = now;
            }
        }
        async function readApiError(response) {
            let data = null;
            try { data = await response.json(); } catch (_) {}
            const detail = data?.error || data?.detail;
            if (Array.isArray(detail)) return detail.map(x => x.msg || JSON.stringify(x)).join('، ');
            return typeof detail === 'string' ? detail : `HTTP ${response.status}`;
        }
        // Publish independently of the route-rendering service.
        async function publishTraveler() {
            if (!currentUser || !bothFilled()) return false;
            const mode = travelScheduleMode;
            const date = mode === 'later' ? selectedTravelDate() : '';
            const time = $('schedule-time')?.value || '';
            // A scheduled trip requires its time; do not spam errors while editing it.
            if (mode === 'later' && !time) return false;
            try {
                const res = await apiFetch(`${API_BASE}/travelers`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar,
                        lat: points.start.lat, lng: points.start.lng, dest_name: points.dest.label,
                        travel_mode: mode, travel_date: date, travel_time: time
                    })
                });
                if (!res.ok) throw new Error(await readApiError(res));
                const saved = await res.json();
                if (!saved.success) throw new Error(saved.error || 'ثبت سفر انجام نشد');
                lastTravelerError = '';
                return true;
            } catch (error) {
                reportTravelerError(error, 'ثبت همسفر');
                return false;
            }
        }

        // UPGRADED: Fetching travelers matched by schedule
        async function loadTravelersOnMap(forceUI = true) {
            try {
                const mode = travelScheduleMode;
                const date = mode === 'later' ? selectedTravelDate() : '';
                
                const res = await apiFetch(`${API_BASE}/travelers?exclude_id=${currentUser.id}&travel_mode=${mode}&travel_date=${date}`);
                if (!res.ok) throw new Error(await readApiError(res));
                const liveTravelers = await res.json();
                if (!Array.isArray(liveTravelers)) throw new Error('پاسخ نامعتبر از سرور');
                
                if (forceUI) $('person-mode-desc').innerHTML = liveTravelers.length === 0 ? 'هنوز همسفری با شرایط مشابه شما پیدا نشده است.' : 'همسفران پیدا شده با مسیر و زمان مشابه:';

                clearPersonMarkers();
                const list = $('travelers-list');
                list.innerHTML = '';
                
                liveTravelers.forEach(t => {
                    let iconClass = 'fa-user';
                    if(t.member_count === 2) iconClass = 'fa-user-group';
                    if(t.member_count === 3) iconClass = 'fa-users';

                    const marker = L.marker([t.lat, t.lng], {
                        icon: L.divIcon({ className: 'pin', html: `<div style="background:#f97316;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;border:2px solid white;box-shadow:0 4px 6px rgba(0,0,0,.3);"><i class="fa-solid ${iconClass} text-xs"></i></div>`, iconSize: [32, 32] })
                    }).addTo(map);
                    marker.on('click', () => {
                        renderSelectedTravelerPanel(t);
                        panTo(t.lat, t.lng, 16);
                    });
                    personMarkers.push(marker);

                    let displayAvatar = t.members[0].avatar;
                    let displayName = t.members[0].name;

                    if (t.member_count === 2) {
                        displayAvatar = ICON_2_USERS;
                        displayName = 'گروه ۲ نفره';
                    } else if (t.member_count === 3) {
                        displayAvatar = ICON_3_USERS;
                        displayName = 'گروه ۳ نفره';
                    }

                    const row = document.createElement('div');
                    row.className = 'flex items-center gap-3 p-2 bg-gray-50 hover:bg-blue-50 rounded-xl cursor-pointer border border-gray-200';
                    row.innerHTML = `<img src="${esc(displayAvatar)}" onerror="${AVATAR_FALLBACK}" class="w-10 h-10 rounded-full object-cover border border-gray-200 bg-white"><div><div class="font-bold text-sm text-gray-800">${esc(displayName)}</div><div class="text-xs text-orange-600">مقصد: ${esc(t.dest_name || 'نامشخص')}</div></div>`;
                    row.addEventListener('click', () => {
                        renderSelectedTravelerPanel(t);
                        panTo(t.lat, t.lng, 16);
                    });
                    list.appendChild(row);
                });
                
                if (currentSelectedTraveler) {
                    const oldMemberIds = currentSelectedTraveler.members.map(m => m.id);
                    const updatedGroup = liveTravelers.find(g => 
                        g.members.some(newM => oldMemberIds.includes(newM.id))
                    );
                    
                    if (updatedGroup) {
                        renderSelectedTravelerPanel(updatedGroup);
                    } else {
                        cancelOrNevermind();
                    }
                }
                
            } catch(e) { reportTravelerError(e, 'بارگذاری همسفران'); }
        }
        function clearPersonMarkers() { personMarkers.forEach(m => map.removeLayer(m)); personMarkers = []; }

        function renderSelectedTravelerPanel(t) {
            currentSelectedTraveler = t;
            
            $('travelers-list').classList.add('hidden');
            $('person-mode-desc').classList.add('hidden');
            $('h-selected-person-panel').classList.remove('hidden');
            
            let html = '';
            
            if (t.member_count === 1) {
                const m = t.members[0];
                html = `
                <div class="flex items-center gap-4 bg-white p-3 rounded-xl border border-gray-200 shadow-sm mb-3">
                    <img src="${esc(m.avatar)}" onerror="${AVATAR_FALLBACK}" class="w-12 h-12 rounded-full object-cover border-2 border-blue-500">
                    <div>
                        <h2 class="font-bold text-sm text-gray-800">${esc(m.name)}</h2>
                        <div class="text-yellow-500 text-[10px] flex gap-0.5 mt-0.5">
                            <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-regular fa-star"></i>
                        </div>
                        <p class="text-[10px] text-gray-500 mt-1">مقصد اعلام شده: ${esc(t.dest_name || 'نامشخص')}</p>
                    </div>
                </div>`;
            } else {
                html = `
                <div class="font-bold text-sm text-gray-800 border-b border-blue-200 pb-2 mb-3 flex items-center justify-between">
                    <span>گروه ${fa(t.member_count)} نفره</span>
                    <span class="text-xs font-normal text-blue-600">مقصد: ${esc(t.dest_name || 'نامشخص')}</span>
                </div>`;
                
                t.members.forEach(m => {
                    html += `
                    <div class="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-100 shadow-sm mb-2 last:mb-0">
                        <img src="${esc(m.avatar)}" onerror="${AVATAR_FALLBACK}" class="w-10 h-10 rounded-full object-cover border border-gray-200">
                        <div>
                            <div class="font-bold text-xs text-gray-800">${esc(m.name)}</div>
                            <div class="text-yellow-500 text-[10px] flex gap-0.5 mt-0.5">
                                <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-regular fa-star"></i>
                            </div>
                        </div>
                    </div>`;
                });
            }
            
            $('panel-group-members').innerHTML = html;
            
            let hasPendingReq = false;
            let matchedReqId = null;
            
            for (const m of t.members) {
                if (activeOutboundRequests[m.id]) {
                    hasPendingReq = true;
                    matchedReqId = m.id;
                    break;
                }
            }
            if (!hasPendingReq && activeOutboundRequests[t.id]) {
                hasPendingReq = true;
                matchedReqId = t.id;
            }
            
            if (hasPendingReq) {
                $('request-status-box').classList.remove('hidden');
                $('request-status-box').className = 'bg-amber-50 border border-amber-200 p-2 rounded-lg text-xs text-amber-800 flex items-center gap-2 mb-3';
                $('request-status-box').innerHTML = '<i class="fa-solid fa-hourglass-half animate-spin"></i> <span>درخواست ارسال شد. منتظر تایید...</span>';
                $('btn-send-req').classList.add('hidden');
                $('btn-cancel-req').innerHTML = 'لغو درخواست';
                $('btn-cancel-req').setAttribute('data-target-id', matchedReqId);
            } else {
                $('request-status-box').classList.add('hidden');
                $('btn-send-req').innerHTML = '<i class="fa-solid fa-paper-plane mr-1"></i> ارسال درخواست';
                $('btn-send-req').classList.remove('hidden');
                $('btn-cancel-req').innerHTML = 'انصراف';
                $('btn-cancel-req').removeAttribute('data-target-id');
            }
        }

        function backToTravelersList() { 
            $('h-selected-person-panel').classList.add('hidden');
            $('travelers-list').classList.remove('hidden');
            $('person-mode-desc').classList.remove('hidden');
            currentSelectedTraveler = null;
            if (points.start) panTo(points.start.lat, points.start.lng, 14);
        }

        async function sendRideRequest() {
            if (!currentSelectedTraveler || !currentUser) return;
            // /api/travelers returns a GROUP id plus members[].id (real user IDs).
            // /api/requests expects the user's ID, never the synthetic group ID.
            const selectedGroupId = currentSelectedTraveler.id;
            const receiverId = currentSelectedTraveler.members?.[0]?.id;
            if (!Number.isInteger(receiverId)) {
                showToast('شناسه همسفر معتبر نیست. فهرست را دوباره بارگذاری کنید.', 'error');
                return;
            }
            if (activeOutboundRequests[receiverId]) return;

            const statusBox = $('request-status-box');
            const sendBtn = $('btn-send-req');
            const cancelBtn = $('btn-cancel-req');
            statusBox.classList.remove('hidden');
            statusBox.className = 'bg-amber-50 border border-amber-200 p-2 rounded-lg text-xs text-amber-800 flex items-center gap-2 mb-3';
            statusBox.innerHTML = '<i class="fa-solid fa-hourglass-half animate-spin"></i> <span>در حال ارسال درخواست...</span>';
            sendBtn.classList.add('hidden');
            cancelBtn.innerHTML = 'انصراف';

            try {
                const res = await apiFetch(`${API_BASE}/requests`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sender_id: currentUser.id, sender_name: currentUser.name,
                                           sender_avatar: currentUser.avatar, receiver_id: receiverId,
                                           perm_group_id: currentSelectedTraveler.perm_group_id || null })
                });
                const data = await res.json();
                if (!res.ok || !data.success || !Number.isInteger(data.request_id)) {
                    throw new Error(data.error || data.detail || 'ثبت درخواست در سرور ناموفق بود.');
                }
                const reqId = data.request_id;
                statusBox.innerHTML = '<i class="fa-solid fa-hourglass-half animate-spin"></i> <span>درخواست ارسال شد. منتظر تایید...</span>';
                cancelBtn.innerHTML = 'لغو درخواست';
                cancelBtn.setAttribute('data-target-id', receiverId);

                const interval = setInterval(async () => {
                    try {
                        const sRes = await apiFetch(`${API_BASE}/requests/status/${reqId}`);
                        if (!sRes.ok) throw new Error(`HTTP ${sRes.status}`);
                        const sData = await sRes.json();
                        if (sData.status === 'accepted') {
                            clearInterval(interval);
                            delete activeOutboundRequests[receiverId];
                            showToast('درخواست شما قبول شد!', 'success');
                            if (currentSelectedTraveler && currentSelectedTraveler.id === selectedGroupId) {
                                backToTravelersList();
                            }
                            if (sData.perm_group_id) {
                                openPermGroupsPanel(sData.perm_group_id);
                            } else {
                                switchHTab('group');
                                loadAcceptedRequests();
                                loadChatMessages();
                            }
                        } else if (sData.status === 'rejected' || sData.status === 'cancelled' || sData.status === null) {
                            clearInterval(interval);
                            delete activeOutboundRequests[receiverId];
                            showToast(sData.status === 'rejected' ? 'درخواست شما رد شد.' : 'درخواست لغو شده است.', 'error');
                            if (currentSelectedTraveler && currentSelectedTraveler.id === selectedGroupId) {
                                backToTravelersList();
                            }
                        }
                    } catch (e) {
                        // A temporary network failure should not destroy a real pending request.
                        console.error('Unable to check request status:', e);
                    }
                }, 2000);
                activeOutboundRequests[receiverId] = { reqId, interval };
            } catch (e) {
                console.error('Ride request failed:', e);
                showToast(e.message || 'خطا در ارسال درخواست', 'error');
                statusBox.classList.add('hidden');
                sendBtn.classList.remove('hidden');
                cancelBtn.innerHTML = 'انصراف';
                cancelBtn.removeAttribute('data-target-id');
            }
        }

        function cancelOrNevermind() {
            if (!currentSelectedTraveler) return;
            const btn = $('btn-cancel-req');
            const receiverId = btn.getAttribute('data-target-id') || currentSelectedTraveler.id;
            
            if (activeOutboundRequests[receiverId]) {
                showToast('درخواست شما لغو شد.', 'info');
                clearInterval(activeOutboundRequests[receiverId].interval);
                const reqId = activeOutboundRequests[receiverId].reqId;
                apiFetch(`${API_BASE}/requests/${reqId}`, { method: 'DELETE' }).catch(() => {});
                delete activeOutboundRequests[receiverId];
            }
            backToTravelersList();
        }

        let previousIncomingIds = "";
        let globalPendingRequests = [];
        
        function updateAcceptedRequestsVisibility(fromPlanned) {
            if (!fromPlanned) renderPlannedRequests();
            const accContainer = $('accepted-requests-container');
            const accTitle = $('accepted-requests-title');
            const accList = $('h-accepted-list');
            if (!accContainer || !accTitle || !accList) return;
            
            if (window.myGroupMemberCount === 1) {
                if (globalPendingRequests.length > 0) {
                    accContainer.classList.add('hidden');
                } else {
                    accTitle.classList.add('hidden');
                    if (getPlanned().length) { accContainer.classList.add('hidden'); }
                    else {
                        accContainer.classList.remove('hidden');
                        accList.innerHTML = '<div class="text-xs text-gray-400 p-2 text-center mt-6">هیچ درخواست یا همسفری ندارید.</div>';
                    }
                }
            } else {
                accContainer.classList.remove('hidden');
                accTitle.classList.remove('hidden');
            }
        }

        async function pollIncomingRequests() {
            if (!currentUser) return;
            try {
                const [tempResponse, permanentResponse] = await Promise.all([
                    apiFetch(`${API_BASE}/requests/incoming/${currentUser.id}`),
                    apiFetch(`${API_BASE}/requests/incoming-permanent`)
                ]);
                if (!tempResponse.ok || !permanentResponse.ok) throw new Error('Request polling failed');
                globalPendingRequests = (await tempResponse.json()).requests || [];
                globalPermanentPendingRequests = (await permanentResponse.json()).requests || [];
                renderIncomingRequestsUI();
                const tempIds = globalPendingRequests.map(r => r.id).sort().join(',');
                const permIds = globalPermanentPendingRequests.map(r => r.id).sort().join(',');
                const old = new Set((previousIncomingIds + ',' + previousPermanentIncomingIds).split(','));
                const all = [...globalPendingRequests, ...globalPermanentPendingRequests];
                if (all.some(r => !old.has(String(r.id)))) {
                    $('incoming-req-text').innerText = `شما ${fa(all.length)} درخواست بررسی نشده دارید.`;
                    $('incoming-req-modal').style.display = 'flex';
                }
                previousIncomingIds = tempIds;
                previousPermanentIncomingIds = permIds;
                if (permGroupsOpen && activePermGroupId) await loadPermChatMessages();
                if (currentHTab === 'group' && hamsafarOpen) await loadChatMessages();
            } catch(e) { console.error('Incoming request polling failed:', e); }
        }

        function viewRequests() {
            $('incoming-req-modal').style.display = 'none';
            if (globalPermanentPendingRequests.length > 0) {
                openPermGroupsPanel(globalPermanentPendingRequests[0].perm_group_id);
                return;
            }
            openHamsafarPanel();
            switchHTab(window.myGroupMemberCount > 1 ? 'group' : 'accepted');
        }

        function renderIncomingRequestsUI() {
            const container = $('incoming-requests-container');
            const list = $('incoming-requests-list');
            if (!container || !list) return;

            if (window.myGroupMemberCount > 1) {
                container.classList.add('hidden');
                container.classList.remove('flex');
                list.innerHTML = '';
            } else {
                if (globalPendingRequests.length === 0) { 
                    container.classList.add('hidden'); 
                    container.classList.remove('flex');
                    list.innerHTML = ''; 
                } else {
                    container.classList.remove('hidden');
                    container.classList.add('flex');
                    
                    list.innerHTML = globalPendingRequests.map(req => `
                        <div class="bg-blue-50/50 p-2 rounded-lg flex flex-col gap-2">
                            <div class="flex items-center gap-2">
                                <img src="${esc(req.sender_avatar)}" onerror="${AVATAR_FALLBACK}" class="w-8 h-8 rounded-full border border-blue-200 object-cover">
                                <div><div class="font-bold text-xs text-gray-800">${esc(req.sender_name)}</div><div class="text-[10px] text-gray-500">درخواست همسفری</div></div>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="respondToRequest(${req.id}, 'accepted')" class="flex-1 bg-emerald-600 text-white font-medium py-1 rounded text-xs">قبول</button>
                                <button onclick="respondToRequest(${req.id}, 'rejected')" class="flex-1 bg-white border border-gray-200 text-red-500 py-1 rounded text-xs">رد کردن</button>
                            </div>
                        </div>`).join('');
                }
            }
            updateAcceptedRequestsVisibility();
        }
        
        async function respondToRequest(reqId, status) {
            try {
                const res = await apiFetch(`${API_BASE}/requests/${reqId}/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
                const data = await res.json();
                
                if (!res.ok || !data.success) {
                    showToast(data.error || data.detail || 'پاسخ به درخواست ثبت نشد.', 'error');
                    return;
                }
                
                showToast(status === 'accepted' ? 'قبول کردید!' : 'رد کردید.', status === 'accepted' ? 'success' : 'info');
                
                await pollIncomingRequests();
                await loadAcceptedRequests();
                if (activePermGroupId && permGroupsOpen) {
                    previousPermMessageCount = -1;
                    await loadPermChatMessages();
                }
                
                if (status === 'accepted') {
                    // بررسی می‌کنیم که آیا گروه دائمی وجود دارد یا موقت
                    if (data.perm_group_id) {
                        openPermGroupsPanel(data.perm_group_id);
                    } else {
                        switchHTab('group');
                        loadChatMessages();
                    }
                } else if (currentHTab === 'group') {
                    loadChatMessages();
                }
            } catch(e) { showToast('خطا در ارتباط با سرور هنگام پاسخ به درخواست.', 'error'); }
        }

        async function loadAcceptedRequests() {
            if (!currentUser) return;
            try {
                const res = await apiFetch(`${API_BASE}/requests/accepted/${currentUser.id}`);
                const data = await res.json();
                const list = $('h-accepted-list');
                
                window.myGroupMemberCount = (data.requests && data.requests.length > 0) ? data.requests.length + 1 : 1;
                renderIncomingRequestsUI();

                if (currentHTab !== 'accepted') return;
                
                if (!data.requests || data.requests.length === 0) {
                    list.innerHTML = '<div class="text-xs text-gray-400 p-2 text-center mt-6">گروه موقتی فعالی ندارید.</div>';
                    previousMessageCount = -1;
                    return;
                }

                let displayAvatar = ICON_2_USERS;
                let displayName = 'گروه ۲ نفره';
                
                if (window.myGroupMemberCount >= 3) {
                    displayAvatar = ICON_3_USERS;
                    displayName = `گروه ${fa(window.myGroupMemberCount)} نفره`;
                }
                
                list.innerHTML = `
                    <div class="flex items-center justify-between p-3 border border-gray-200 bg-white shadow-sm rounded-xl">
                        <div class="flex items-center gap-3">
                            <img src="${esc(displayAvatar)}" onerror="${AVATAR_FALLBACK}" class="w-10 h-10 rounded-full object-cover border border-emerald-200 bg-white">
                            <div>
                                <div class="font-bold text-sm text-gray-800">${esc(displayName)}</div>
                                <div class="text-[10px] text-emerald-600 font-medium mt-0.5"><i class="fa-solid fa-check-double mr-1"></i> همسفران متصل شده</div>
                            </div>
                        </div>
                        <button onclick="leaveGroup()" class="text-[10px] bg-red-50 text-red-600 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 font-bold transition">ترک گروه</button>
                    </div>
                `;
            } catch(e) {}
        }

        // --- Shared Group Chat ---
        function openGroupInfo() {
            $('h-chat-active').classList.add('hidden');
            $('h-chat-active').classList.remove('flex');
            
            $('h-chat-info').classList.remove('hidden');
            $('h-chat-info').classList.add('flex');
            
            loadGroupMembers();
        }
        
        function closeGroupInfo() {
            $('h-chat-info').classList.add('hidden');
            $('h-chat-info').classList.remove('flex');
            
            $('h-chat-active').classList.remove('hidden');
            $('h-chat-active').classList.add('flex');
        }
        
        async function loadGroupMembers() {
            if (!currentUser) return;
            try {
                const res = await apiFetch(`${API_BASE}/requests/accepted/${currentUser.id}`);
                const data = await res.json();
                
                let html = `
                    <div class="flex items-center justify-between p-2">
                        <div class="flex items-center gap-3">
                            <img src="${esc(currentUser.avatar)}" onerror="${AVATAR_FALLBACK}" class="w-10 h-10 rounded-full object-cover">
                            <div class="font-bold text-sm text-gray-800">${esc(currentUser.name)} (شما)</div>
                        </div>
                    </div>
                `;
                
                data.requests.forEach(req => {
                    html += `
                    <div class="flex items-center justify-between p-2 border-t border-gray-50 mt-1">
                        <div class="flex items-center gap-3">
                            <img src="${esc(req.other_avatar)}" onerror="${AVATAR_FALLBACK}" class="w-10 h-10 rounded-full object-cover">
                            <div class="font-bold text-sm text-gray-800">${esc(req.other_name)}</div>
                        </div>
                        <button onclick="kickMember(${req.id})" class="text-[10px] text-red-500 hover:text-red-700 font-bold px-2 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg transition">حذف همسفر</button>
                    </div>`;
                });
                
                $('group-members-list').innerHTML = html;
            } catch (e) {}
        }
        
        function kickMember(reqId) {
            openConfirmModal('حذف همسفر', 'آیا از حذف این همسفر مطمئن هستید؟', 'fa-user-slash', 'حذف همسفر', async () => {
                try {
                    await apiFetch(`${API_BASE}/requests/cancel-accepted/${reqId}`, {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ userId: currentUser.id, userName: currentUser.name })
                    });
                    showToast('همسفر حذف شد.', 'success');
                    loadGroupMembers();
                    loadChatMessages();
                } catch(e) {}
            });
        }

        function leaveGroup() {
            const infoMenu = $('info-menu'); if(infoMenu) infoMenu.classList.add('hidden');
            const chatMenu = $('chat-menu'); if(chatMenu) chatMenu.classList.add('hidden');
            
            openConfirmModal('ترک گروه', 'آیا از ترک گروه و لغو تمامی همسفری‌ها اطمینان دارید؟ این کار قابل بازگشت نیست.', 'fa-arrow-right-from-bracket', 'بله، ترک گروه', async () => {
                try {
                    travelerSearchActive = false;
                    const res = await apiFetch(`${API_BASE}/travelers/${currentUser.id}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Unable to leave temporary group');
                    window.myGroupMemberCount = 1;
                    previousMessageCount = -1;
                    showToast('از گروه خارج شدید.', 'info');
                    closeGroupInfo();
                    switchHTab('nearby');
                } catch(e) {
                    showToast('خطا در ترک گروه', 'error');
                }
            });
        }

        async function sendChatMessage() {
            const inp = $('h-chat-input');
            const text = inp.value.trim();
            if (!text || !currentUser) return;
            
            inp.value = '';
            try {
                const res = await apiFetch(`${API_BASE}/chat`, {
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ 
                        sender_id: currentUser.id, 
                        sender_name: currentUser.name, 
                        sender_avatar: currentUser.avatar, 
                        text: text 
                    })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    previousMessageCount = -1;
                    await loadChatMessages();
                } else {
                    showToast('خطا در ارسال پیام', 'error');
                }
            } catch(e) {
                showToast('خطا در ارتباط با سرور', 'error');
            }
        }

        queueMicrotask(() => {
            const chatInput = $('h-chat-input');
            if(chatInput) {
                chatInput.addEventListener('keypress', function (e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        sendChatMessage();
                    }
                });
            }
            
            const permChatInput = $('perm-chat-input');
            if(permChatInput) {
                permChatInput.addEventListener('keypress', function (e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        sendPermChatMessage();
                    }
                });
            }
            
            const permNameInput = $('edit-group-name-input');
            if(permNameInput) {
                permNameInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        saveGroupName();
                    }
                });
            }
        });

        async function loadChatMessages() {
            if (!currentUser || currentHTab !== 'group') return;
            try {
                if (window.myGroupMemberCount === 1) {
                    $('h-chat-empty').classList.remove('hidden');
                    $('h-chat-active').classList.add('hidden');
                    $('h-chat-active').classList.remove('flex');
                    return;
                }
                
                $('h-chat-empty').classList.add('hidden');
                
                if($('h-chat-info').classList.contains('hidden')){
                    $('h-chat-active').classList.remove('hidden');
                    $('h-chat-active').classList.add('flex');
                }

                const res = await apiFetch(`${API_BASE}/chat?userId=${currentUser.id}`);
                const data = await res.json();
                
                const newContentState = data.messages.length + "-" + globalPendingRequests.length;
                if (previousMessageCount === newContentState) return;
                previousMessageCount = newContentState;

                let html = `<div class="text-center text-[10px] text-gray-500 my-1 bg-white/60 mx-auto px-2 py-0.5 rounded-full">به گروه همسفران خوش آمدید</div>`;
                
                let renderItems = [];
                
                data.messages.forEach((m, idx) => {
                    renderItems.push({ type: 'msg', data: m, index: idx });
                });
                
                if (window.myGroupMemberCount > 1 && globalPendingRequests.length > 0) {
                    globalPendingRequests.forEach(req => {
                        if (requestInsertionIndex[req.id] === undefined) {
                            requestInsertionIndex[req.id] = data.messages.length; 
                        }
                        renderItems.push({ type: 'req', data: req, index: requestInsertionIndex[req.id] });
                    });
                }
                
                renderItems.sort((a, b) => {
                    if (a.index === b.index) {
                        return a.type === 'req' ? -1 : 1;
                    }
                    return a.index - b.index;
                });
                
                html += renderItems.map(item => {
                    if (item.type === 'msg') {
                        const m = item.data;
                        if (m.sender_id === 0) {
                            return `<div class="text-center text-[10px] text-emerald-600 font-bold my-2 bg-emerald-50 border border-emerald-100 mx-auto px-3 py-1 rounded-full">${esc(m.text)}</div>`;
                        }
                        
                        const isMe = m.sender_id === currentUser.id;
                        
                        if (isMe) {
                            return `
                            <div class="flex gap-2 w-full justify-start">
                                <img src="${esc(m.sender_avatar)}" onerror="${AVATAR_FALLBACK}" class="w-7 h-7 rounded-full mt-1 object-cover shrink-0">
                                <div class="flex flex-col items-start max-w-[80%]">
                                    <span class="text-[9px] text-gray-400 mb-0.5 px-1">${esc(m.sender_name)}</span>
                                    <div class="text-xs px-3 py-2 shadow-sm bg-blue-500 text-white rounded-2xl rounded-tr-sm">
                                        ${esc(m.text)}
                                    </div>
                                </div>
                            </div>`;
                        } else {
                            return `
                            <div class="flex gap-2 w-full justify-end">
                                <div class="flex flex-col items-end max-w-[80%]">
                                    <span class="text-[9px] text-gray-400 mb-0.5 px-1">${esc(m.sender_name)}</span>
                                    <div class="text-xs px-3 py-2 shadow-sm bg-white text-gray-800 border border-gray-100 rounded-2xl rounded-tl-sm">
                                        ${esc(m.text)}
                                    </div>
                                </div>
                                <img src="${esc(m.sender_avatar)}" onerror="${AVATAR_FALLBACK}" class="w-7 h-7 rounded-full mt-1 object-cover shrink-0">
                            </div>`;
                        }
                    } else {
                        const req = item.data;
                        return `
                        <div class="mx-auto my-3 w-[90%] bg-blue-50 border border-blue-200 p-3 rounded-xl shadow-sm">
                            <div class="text-center text-xs text-blue-800 font-bold mb-3 border-b border-blue-200 pb-2"><i class="fa-solid fa-user-plus mr-1"></i> درخواست پیوستن به گروه</div>
                            <div class="flex items-center gap-3 mb-3">
                                <img src="${esc(req.sender_avatar)}" onerror="${AVATAR_FALLBACK}" class="w-10 h-10 rounded-full border border-blue-200 object-cover">
                                <div>
                                    <div class="font-bold text-sm text-gray-800">${esc(req.sender_name)}</div>
                                    <div class="text-[10px] text-gray-500 mt-0.5">می‌خواهد با شما همسفر شود</div>
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="respondToRequest(${req.id}, 'accepted')" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded-lg text-xs transition shadow-sm">قبول درخواست</button>
                                <button onclick="respondToRequest(${req.id}, 'rejected')" class="flex-1 bg-white hover:bg-gray-50 border border-gray-200 text-red-500 font-medium py-2 rounded-lg text-xs transition shadow-sm">رد کردن</button>
                            </div>
                        </div>`;
                    }
                }).join('');

                const box = $('h-chat-messages');
                box.innerHTML = html;
                setTimeout(() => {
                    box.scrollTop = box.scrollHeight;
                }, 50);
                
            } catch(e) {
                console.error("Chat loading error:", e);
            }
        }

        // ==========================================
        // NEW PERMANENT GROUPS LOGIC
        // ==========================================
        async function convertToPermanentGroup() {
            if (!currentUser) return;
            try {
                const res = await apiFetch(`${API_BASE}/perm_groups/convert`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.id })
                });
                const data = await res.json();
                
                if (res.ok && data.success) {
                    showToast('گروه با موفقیت به گروه‌های دائمی اضافه شد.', 'success');
                    window.myGroupMemberCount = 1;
                    previousMessageCount = -1;
                    globalPendingRequests = [];
                    $('h-chat-active').classList.add('hidden');
                    $('h-chat-active').classList.remove('flex');
                    $('h-chat-empty').classList.remove('hidden');
                    currentHTab = 'nearby';
                    openPermGroupsPanel(data.group_id); 
                } else {
                    showToast(data.error || 'خطا در تبدیل گروه', 'error');
                }
            } catch (e) {
                showToast('خطای سرور', 'error');
            }
        }

        async function loadPermanentGroups() {
            if (!currentUser) return null;
            try {
                const res = await apiFetch(`${API_BASE}/perm_groups/${currentUser.id}`);
                const data = await res.json();
                
                if (initialPermGroupsLoaded) {
                    const newGroups = data.groups.filter(g => !knownPermGroupIds.has(g.id));
                    
                    data.groups.forEach(g => knownPermGroupIds.add(g.id));
                    
                    if (newGroups.length > 0) {
                        openPermGroupsPanel(newGroups[0].id);
                    }
                } else {
                    data.groups.forEach(g => knownPermGroupIds.add(g.id));
                    initialPermGroupsLoaded = true;
                }
                
                const container = $('perm-groups-list-container');
                if (!data.groups || data.groups.length === 0) {
                    container.innerHTML = `
                        <div class="flex flex-col items-center justify-center text-center p-6 h-full text-gray-400">
                            <i class="fa-solid fa-comments text-4xl mb-3 text-gray-300"></i>
                            <p class="text-sm">هیچ گروهی ندارید</p>
                        </div>
                    `;
                    return data.groups;
                }
                
                container.innerHTML = data.groups.map(g => `
                    <div class="flex items-center gap-3 p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition" onclick="openPermChat(${g.id}, '${esc(g.name)}', '${esc(g.avatar)}')">
                        <img src="${esc(g.avatar)}" onerror="${AVATAR_FALLBACK}" class="w-12 h-12 rounded-full object-cover shrink-0 border border-gray-200 bg-white">
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between items-baseline mb-1">
                                <h3 class="font-bold text-sm text-gray-800 truncate">${esc(g.name)}</h3>
                            </div>
                            <p class="text-xs text-gray-500 truncate">${esc(g.last_msg || 'هنوز پیامی ارسال نشده است.')}</p>
                        </div>
                    </div>
                `).join('');
                
                return data.groups;
            } catch(e) { return null; }
        }
        
        function openPermChat(groupId, name, avatar) {
            activePermGroupId = groupId;
            previousPermMessageCount = -1;
            
            $('perm-chat-title').innerText = name;
            $('perm-chat-avatar').src = avatar;
            
            $('perm-groups-list-view').classList.add('hidden');
            $('perm-groups-list-view').classList.remove('flex');
            
            $('perm-groups-chat-view').classList.remove('hidden');
            $('perm-groups-chat-view').classList.add('flex');
            
            $('perm-chat-messages').innerHTML = '<div class="text-center mt-10"><i class="fa-solid fa-spinner fa-spin text-gray-400 text-2xl"></i></div>';
            
            loadPermChatMessages();
        }
        
        function closePermChat() {
            activePermGroupId = null;
            closePermGroupDetail();
            
            $('perm-groups-chat-view').classList.add('hidden');
            $('perm-groups-chat-view').classList.remove('flex');
            
            $('perm-groups-list-view').classList.remove('hidden');
            $('perm-groups-list-view').classList.add('flex');
            
            loadPermanentGroups();
        }

        async function openPermGroupDetail() {
            if (!activePermGroupId) return;
            
            $('perm-groups-chat-view').classList.add('hidden');
            $('perm-groups-chat-view').classList.remove('flex');
            
            $('perm-group-detail-view').classList.remove('hidden');
            $('perm-group-detail-view').classList.add('flex');
            
            $('edit-group-name-container').classList.add('hidden');
            $('edit-group-name-container').classList.remove('flex');
            
            try {
                const res = await apiFetch(`${API_BASE}/perm_groups/${activePermGroupId}/info`);
                const data = await res.json();
                
                if (data.success) {
                    const g = data.group;
                    $('detail-group-name').innerText = g.name;
                    $('edit-group-name-input').value = g.name;
                    $('detail-group-count').innerText = `${fa(data.members.length)} اعضا`;
                    
                    const isOwner = g.owner_id === currentUser.id;
                    
                    if (isOwner) {
                        $('edit-group-name-btn').classList.remove('hidden');
                    } else {
                        $('edit-group-name-btn').classList.add('hidden');
                    }
                    
                    $('detail-members-list').innerHTML = data.members.map(m => `
                        <div class="flex items-center justify-between p-3 hover:bg-gray-50 transition cursor-default border-b border-gray-50">
                            <div class="flex items-center gap-3">
                                <img src="${esc(m.avatar)}" onerror="${AVATAR_FALLBACK}" class="w-10 h-10 rounded-full object-cover border border-gray-200">
                                <div>
                                    <div class="font-bold text-sm text-gray-800">${esc(m.name)} ${m.id === currentUser.id ? '(شما)' : ''}</div>
                                    <div class="text-[10px] text-gray-500">${g.owner_id === m.id ? 'مالک گروه' : 'عضو'}</div>
                                </div>
                            </div>
                            ${isOwner && m.id !== currentUser.id ? `
                            <button onclick="removePermMember(${g.id}, ${m.id})" class="text-red-500 hover:bg-red-50 p-2 rounded-full transition" title="حذف کاربر">
                                <i class="fa-solid fa-circle-minus"></i>
                            </button>` : ''}
                        </div>
                    `).join('');
                }
            } catch(e) {}
        }
        
        function toggleGroupNameEdit() {
            const container = $('edit-group-name-container');
            const btn = $('edit-group-name-btn');
            
            if (container.classList.contains('hidden')) {
                container.classList.remove('hidden');
                container.classList.add('flex');
                btn.classList.add('text-blue-600');
                btn.classList.remove('text-gray-400');
            } else {
                container.classList.add('hidden');
                container.classList.remove('flex');
                btn.classList.add('text-gray-400');
                btn.classList.remove('text-blue-600');
            }
        }
        
        async function saveGroupName() {
            const newName = $('edit-group-name-input').value.trim();
            if (!newName || !activePermGroupId || !currentUser) return;
            
            try {
                const res = await apiFetch(`${API_BASE}/perm_groups/${activePermGroupId}/rename`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ownerId: currentUser.id, newName: newName })
                });
                const data = await res.json();
                
                if (data.success) {
                    $('detail-group-name').innerText = newName;
                    $('perm-chat-title').innerText = newName; 
                    toggleGroupNameEdit();
                    showToast('نام گروه با موفقیت تغییر کرد.', 'success');
                } else {
                    showToast(data.error || 'خطا در تغییر نام.', 'error');
                }
            } catch(e) {
                showToast('خطا در ارتباط با سرور.', 'error');
            }
        }

        function closePermGroupDetail() {
            $('perm-group-detail-view').classList.add('hidden');
            $('perm-group-detail-view').classList.remove('flex');
            
            if (activePermGroupId) {
                $('perm-groups-chat-view').classList.remove('hidden');
                $('perm-groups-chat-view').classList.add('flex');
            }
        }

        function removePermMember(groupId, targetId) {
            openConfirmModal('حذف عضو', 'آیا از حذف این شخص از گروه اطمینان دارید؟', 'fa-user-slash', 'حذف', async () => {
                try {
                    const res = await apiFetch(`${API_BASE}/perm_groups/${groupId}/kick`, {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ ownerId: currentUser.id, targetId: targetId })
                    });
                    const data = await res.json();
                    
                    if (data.success) {
                        showToast('عضو با موفقیت حذف شد.', 'success');
                        openPermGroupDetail();
                    } else {
                        showToast(data.error || 'خطا در حذف عضو', 'error');
                    }
                } catch(e) {}
            });
        }

        async function loadPermChatMessages() {
            if (!currentUser || !activePermGroupId || !permGroupsOpen) return;
            
            try {
                const [messageResponse, requestResponse] = await Promise.all([
                    apiFetch(`${API_BASE}/perm_groups/${activePermGroupId}/messages`),
                    apiFetch(`${API_BASE}/perm_groups/${activePermGroupId}/requests`)
                ]);
                if (!messageResponse.ok || !requestResponse.ok) throw new Error('Permanent group fetch failed');
                const data = await messageResponse.json();
                const requestData = await requestResponse.json();
                const pending = requestData.requests || [];
                const signature = data.messages.map(m => m.id).join(',') + '|' + pending.map(r => r.id).join(',');
                if (signature === previousPermMessageCount) return;
                previousPermMessageCount = signature;

                let html = `<div class="text-center text-[10px] text-gray-500 my-1 bg-white/60 mx-auto px-2 py-0.5 rounded-full">آغاز تاریخچه گروه</div>`;
                
                html += data.messages.map(m => {
                    const isMe = m.sender_id === currentUser.id;
                    
                    if (isMe) {
                        return `
                        <div class="flex gap-2 w-full justify-start">
                            <img src="${esc(m.sender_avatar)}" onerror="${AVATAR_FALLBACK}" class="w-7 h-7 rounded-full mt-1 object-cover shrink-0">
                            <div class="flex flex-col items-start max-w-[80%]">
                                <span class="text-[9px] text-gray-400 mb-0.5 px-1">${esc(m.sender_name)}</span>
                                <div class="text-xs px-3 py-2 shadow-sm bg-purple-500 text-white rounded-2xl rounded-tr-sm">
                                    ${esc(m.text)}
                                </div>
                            </div>
                        </div>`;
                    } else {
                        return `
                        <div class="flex gap-2 w-full justify-end">
                            <div class="flex flex-col items-end max-w-[80%]">
                                <span class="text-[9px] text-gray-400 mb-0.5 px-1">${esc(m.sender_name)}</span>
                                <div class="text-xs px-3 py-2 shadow-sm bg-white text-gray-800 border border-gray-100 rounded-2xl rounded-tl-sm">
                                    ${esc(m.text)}
                                </div>
                            </div>
                            <img src="${esc(m.sender_avatar)}" onerror="${AVATAR_FALLBACK}" class="w-7 h-7 rounded-full mt-1 object-cover shrink-0">
                        </div>`;
                    }
                }).join('');

                // Requests to converted groups appear IN the permanent chat, not Hamsafar.
                html += pending.map(req => `
                    <div class="mx-auto my-3 w-[90%] bg-blue-50 border border-blue-200 p-3 rounded-xl shadow-sm">
                        <div class="text-center text-xs text-blue-800 font-bold mb-3 border-b border-blue-200 pb-2"><i class="fa-solid fa-user-plus mr-1"></i> درخواست پیوستن به گروه</div>
                        <div class="flex items-center gap-3 mb-3">
                            <img src="${esc(req.sender_avatar || DEFAULT_AVATAR)}" onerror="${AVATAR_FALLBACK}" class="w-10 h-10 rounded-full border border-blue-200 object-cover">
                            <span class="font-bold text-sm text-gray-800">${esc(req.sender_name)}</span>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="respondToRequest(${req.id}, 'accepted')" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded-lg text-xs">قبول درخواست</button>
                            <button onclick="respondToRequest(${req.id}, 'rejected')" class="flex-1 bg-white border border-gray-200 text-red-500 font-medium py-2 rounded-lg text-xs">رد کردن</button>
                        </div>
                    </div>`).join('');

                const box = $('perm-chat-messages');
                box.innerHTML = html;
                box.scrollTop = box.scrollHeight;
            } catch(e) {
                console.error('Unable to load permanent group messages or join requests:', e);
            }
        }
        
        async function sendPermChatMessage() {
            const inp = $('perm-chat-input');
            const text = inp.value.trim();
            if (!text || !currentUser || !activePermGroupId) return;
            
            try {
                const res = await apiFetch(`${API_BASE}/perm_groups/${activePermGroupId}/messages`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ sender_id: currentUser.id, sender_name: currentUser.name, sender_avatar: currentUser.avatar, text: text })
                });
                if (!res.ok || !(await res.json()).success) throw new Error('Message save failed');
                if (inp.value.trim() === text) inp.value = '';
                previousPermMessageCount = -1;
                await loadPermChatMessages();
            } catch(e) {
                showToast('خطا در ارسال پیام', 'error');
                console.error(e);
            }
        }

        // ---------- Auth & Initialization ----------
        function renderHeaderAuth() {
            const el = $('header-auth-section');
            if (!el) return;
            if (!currentUser) {
                el.innerHTML = `<button id="nav-btn-profile" onclick="openAuthModal('login')" class="flex flex-col items-center gap-1 text-gray-600 hover:text-blue-600 transition" title="ورود / ثبت‌نام"><i class="fa-solid fa-circle-user text-2xl"></i><span class="text-[10px]">ورود</span></button>`;
            } else {
                const nameStr = currentUser.name || 'کاربر';
                const avatarStr = currentUser.avatar || DEFAULT_AVATAR;
                el.innerHTML = `<button id="nav-btn-profile" onclick="openProfilePanel()" class="flex flex-col items-center gap-1 text-gray-600 hover:text-blue-600 transition" title="پروفایل کاربری"><img src="${esc(avatarStr)}" onerror="${AVATAR_FALLBACK}" class="w-8 h-8 rounded-full object-cover"><span class="text-[10px] max-w-[48px] truncate">${esc(nameStr.split(' ')[0])}</span></button>`;
            }
            updateSidebarIcons();
        }
        function openAuthModal(tab = 'login') { switchAuthTab(tab); $('auth-modal').style.display = 'flex'; }
        function closeAuthModal() { $('auth-modal').style.display = 'none'; }
        function switchAuthTab(tab) {
            ['login', 'signup'].forEach(t => {
                $(`tab-${t}`).className = t === tab ? 'font-bold text-blue-600 border-b-2 border-blue-600 pb-1 text-sm transition' : 'font-medium text-gray-500 pb-1 text-sm transition';
                $(`form-${t}`).classList.toggle('hidden', t !== tab);
            });
        }
        async function handleLogin() {
            const phone = $('login-phone').value.trim();
            if (!phone) { showToast('لطفاً شماره موبایل خود را وارد کنید.', 'error'); return; }
            try {
                const res = await apiFetch(`${API_BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
                const data = await res.json();
                if (data.success) { sessionToken = data.token; localStorage.setItem('nimrahSessionToken', sessionToken); currentUser = data.user; finalizeLogin('ورود با موفقیت انجام شد!'); loadPlannedRequests(); } 
                else showToast(data.error || 'خطا در ورود.', 'error');
            } catch (err) { showToast('خطا در ارتباط با سرور.', 'error'); }
        }
        async function handleSignup() {
            const g = id => $(id).value.trim();
            const name = g('signup-name'), family = g('signup-family'), phone = g('signup-phone');
            const year = g('signup-year'), month = g('signup-month'), day = g('signup-day');
            if (!name || !family || !phone || !year || !month || !day) { showToast('لطفاً فیلدهای ستاره‌دار را پر کنید.', 'error'); return; }
            const file = $('signup-avatar-file'); let avatar = DEFAULT_AVATAR;
            if (file.files && file.files[0]) {
                avatar = await new Promise(res => { const reader = new FileReader(); reader.onload = e => res(e.target.result); reader.readAsDataURL(file.files[0]); });
            }
            try {
                const res = await apiFetch(`${API_BASE}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name + ' ' + family, phone, role: 'passenger', birth_date: `${year}-${month}-${day}`, avatar }) });
                const data = await res.json();
                if (data.success) { sessionToken = data.token; localStorage.setItem('nimrahSessionToken', sessionToken); currentUser = data.user; finalizeLogin('ثبت‌نام با موفقیت انجام شد!'); loadPlannedRequests(); } 
                else showToast(data.error || 'این شماره ثبت شده است.', 'error');
            } catch (err) { showToast('خطا در سرور.', 'error'); }
        }
        function finalizeLogin(msg) {
            closeAuthModal(); renderHeaderAuth();
            if ($('profile-panel-name')) $('profile-panel-name').innerText = currentUser.name || 'کاربر';
            if ($('profile-panel-avatar')) $('profile-panel-avatar').src = currentUser.avatar || DEFAULT_AVATAR;
            showToast(msg, 'success');
            startTravelerPolling();
            if (hamsafarOpen && bothFilled()) handleRoutingAction();
        }
        
        function confirmLogout() {
            openConfirmModal('خروج از حساب', 'آیا از خروج از حساب کاربری اطمینان دارید؟', 'fa-right-from-bracket', 'خروج', async () => {
                try {
                    const response = await apiFetch(`${API_BASE}/logout`, {method:'POST'});
                    if (!response.ok) throw new Error('Logout request failed');
                } catch (e) {
                    showToast('خروج از حساب انجام نشد. اتصال به سرور را بررسی کنید.', 'error');
                    return;
                }
                stopTravelerPolling();
                Object.values(activeOutboundRequests).forEach(req => clearInterval(req.interval));
                activeOutboundRequests = {};
                previousIncomingIds = '';
                previousPermanentIncomingIds = '';
                globalPendingRequests = [];
                globalPermanentPendingRequests = [];
                requestInsertionIndex = {};
                window.myGroupMemberCount = 1;
                previousMessageCount = -1;
                activePermGroupId = null;
                previousPermMessageCount = -1;
                knownPermGroupIds.clear();
                initialPermGroupsLoaded = false;
                sessionToken = '';
                localStorage.removeItem('nimrahSessionToken');
                plannedCache = [];
                currentUser = null;
                closeProfilePanel();
                closeHamsafarPanel();
                closePermGroupsPanel();
                closeDirections();
                clearRoutes();
                clearSearch();
                renderHeaderAuth();
                showToast('با موفقیت خارج شدید.', 'success');
            });
        }

        // Refreshing a page is not logout; explicitly logging out ends temporary membership.

        queueMicrotask(() => {
            const ys = $('signup-year'); if(ys) { for (let y = 1300; y <= 1405; y++) { const o = document.createElement('option'); o.value = y; o.innerText = y; ys.appendChild(o); } }
            const ds = $('signup-day'); if(ds) { for (let d = 1; d <= 31; d++) { const o = document.createElement('option'); o.value = d < 10 ? '0' + d : d; o.innerText = d; ds.appendChild(o); } }
            loadSaved(); renderSaved(); updateControls();
            loadSavedStations();
            renderHeaderAuth();
            if (sessionToken) {
                apiFetch(`${API_BASE}/me`).then(r => r.ok ? r.json() : null).then(data => {
                    if (data?.user) { currentUser = data.user; finalizeLogin('خوش آمدید!'); loadPlannedRequests(); }
                    else { sessionToken = ''; localStorage.removeItem('nimrahSessionToken'); }
                }).catch(()=>{});
            }
            getGPS().then(loc => map.setView([loc.lat, loc.lng], 14)).catch(() => {});
        });

  Object.assign(window, {map, apiFetch, backToTravelersList, bothFilled, cancelOrNevermind, cancelPlannedRequest, carLike, clearPersonMarkers, clearRoutes, clearSearch, closeAuthModal, closeConfirmModal, closeDirections, closeEditProfilePanel, closeGroupInfo, closeHamsafarPanel, closeMainMenu, closePermChat, closePermGroupDetail, closePermGroupsPanel, closeProfilePanel, closeStationWizard, confirmAddStationFinal, confirmLogout, convertToPermanentGroup, createPlannedRequest, defaultOptions, drawRoutes, editSaved, enableAddStationMode, fetchRoutes, finalizeLogin, fitTo, fmtCost, fmtDuration, getBox, getGPS, getPlanned, goToStationStep2, handleLogin, handleRoutingAction, handleSignup, hideBox, hideResultPanels, hideRouteSteps, hideSavedPlacesView, initializeLegacyApp, kickMember, leaveGroup, loadAcceptedRequests, loadChatMessages, loadGroupMembers, loadPermChatMessages, loadPermanentGroups, loadPlannedRequests, loadSaved, loadSavedStations, loadTravelersOnMap, locateMe, onPlacePicked, openAuthModal, openConfirmModal, openDirections, openEditProfilePanel, openGroupInfo, openHamsafarPanel, openMainMenu, openPermChat, openPermGroupDetail, openPermGroupsPanel, openProfilePanel, openStationStep1, openStationStep3, osrmBase, panTo, persistSaved, pickStationDest, pinIcon, pollIncomingRequests, publishTraveler, removePermMember, renderExtendedSavedList, renderHeaderAuth, renderIncomingRequestsUI, renderPlannedRequests, renderRoadPanel, renderSaved, renderSelectedTravelerPanel, respondToRequest, reverseGeocode, routeToSearched, saveGroupName, saveProfileChanges, savedClick, searchPlaces, selectRoute, selectedTravelDate, sendChatMessage, sendPermChatMessage, sendRideRequest, setPoint, setProfile, setRouteMode, setSearchPlace, shortName, showBoxItems, showRouteSteps, showSavedPlacesView, showToast, sortedRoutes, startPicking, startTravelerPolling, stopPicking, stopTravelerPolling, swapPoints, switchAuthTab, switchHTab, switchProfileTab, toggleGroupMenu, toggleGroupNameEdit, toggleMainMenu, toggleOtherVehicleInput, toggleProfileMenu, toggleScheduleMode, translateManeuver, updateAcceptedRequestsVisibility, updateControls, updateSidebarIcons, useMyLocation, viewRequests});
  return () => { if (activeTravelersInterval) clearInterval(activeTravelersInterval); map.remove(); };
}
