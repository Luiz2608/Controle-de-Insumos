(() => {
    const DB_NAME = 'controle-insumos-offline';
    const DB_VERSION = 1;
    const STORE_ROWS = 'rows';
    const STORE_OUTBOX = 'outbox';
    const STORE_META = 'meta';

    const nowIso = () => new Date().toISOString();

    const safeJsonParse = (value) => {
        try { return JSON.parse(value); } catch { return null; }
    };

    const deepClone = (value) => {
        if (value == null || typeof value !== 'object') return value;
        if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    };

    const createUuid = () => {
        if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
        const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
        return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
    };

    const computeStorageKey = (table, row) => {
        if (row && row.id != null) return `${table}::id::${String(row.id)}`;
        if (row && row.codigo != null) return `${table}::codigo::${String(row.codigo)}`;
        if (row && row.numero != null) return `${table}::numero::${String(row.numero)}`;
        if (row && row.numero_liberacao != null) return `${table}::numero_liberacao::${String(row.numero_liberacao)}`;
        if (row && row.key != null) return `${table}::key::${String(row.key)}`;
        if (row && row.frente != null && row.produto != null) return `${table}::frente_produto::${String(row.frente)}__${String(row.produto)}`;
        const offlineId = row && row._offline_uuid ? String(row._offline_uuid) : createUuid();
        if (row && !row._offline_uuid) row._offline_uuid = offlineId;
        return `${table}::offline::${offlineId}`;
    };

    class OfflineDB {
        constructor() {
            this._dbp = null;
        }

        async open() {
            if (this._dbp) return this._dbp;
            this._dbp = new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(STORE_ROWS)) {
                        db.createObjectStore(STORE_ROWS, { keyPath: 'storageKey' });
                    }
                    if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
                        db.createObjectStore(STORE_OUTBOX, { keyPath: 'opId' });
                    }
                    if (!db.objectStoreNames.contains(STORE_META)) {
                        db.createObjectStore(STORE_META, { keyPath: 'key' });
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            return this._dbp;
        }

        async _tx(storeName, mode, fn) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, mode);
                const store = tx.objectStore(storeName);
                let result;
                tx.oncomplete = () => resolve(result);
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
                Promise.resolve()
                    .then(async () => {
                        result = await fn(store);
                    })
                    .catch(err => {
                        try { tx.abort(); } catch {}
                        reject(err);
                    });
            });
        }

        async putRows(table, rows) {
            const list = Array.isArray(rows) ? rows : [];
            return this._tx(STORE_ROWS, 'readwrite', async (store) => {
                list.forEach(row => {
                    const cloned = deepClone(row);
                    const storageKey = computeStorageKey(table, cloned);
                    store.put({ storageKey, table, row: cloned, updatedAt: nowIso() });
                });
                return true;
            });
        }

        async upsertRow(table, row) {
            return this.putRows(table, [row]);
        }

        async getAllRowsForTable(table) {
            return this._tx(STORE_ROWS, 'readonly', async (store) => {
                const all = await new Promise((resolve, reject) => {
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                });
                return all.filter(r => r.table === table);
            });
        }

        async deleteByPredicate(table, predicate) {
            return this._tx(STORE_ROWS, 'readwrite', async (store) => {
                const all = await new Promise((resolve, reject) => {
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                });
                all.forEach(entry => {
                    if (entry.table !== table) return;
                    if (predicate(entry.row)) store.delete(entry.storageKey);
                });
                return true;
            });
        }

        async enqueue(op) {
            const opId = op && op.opId ? String(op.opId) : createUuid();
            const item = {
                opId,
                createdAt: op && op.createdAt ? op.createdAt : nowIso(),
                table: op.table,
                action: op.action,
                payload: op.payload,
                filters: op.filters || [],
            };
            return this._tx(STORE_OUTBOX, 'readwrite', async (store) => {
                store.put(item);
                return item;
            });
        }

        async listOutbox() {
            return this._tx(STORE_OUTBOX, 'readonly', async (store) => {
                const all = await new Promise((resolve, reject) => {
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                });
                return all.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
            });
        }

        async removeOutbox(opId) {
            return this._tx(STORE_OUTBOX, 'readwrite', async (store) => {
                store.delete(opId);
                return true;
            });
        }

        async setMeta(key, value) {
            return this._tx(STORE_META, 'readwrite', async (store) => {
                store.put({ key, value, updatedAt: nowIso() });
                return true;
            });
        }

        async getMeta(key) {
            return this._tx(STORE_META, 'readonly', async (store) => {
                const req = store.get(key);
                const res = await new Promise((resolve, reject) => {
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
                return res ? res.value : null;
            });
        }
    }

    const applyFilters = (rows, filters) => {
        if (!filters || !filters.length) return rows;
        return rows.filter(r => {
            return filters.every(f => {
                const val = r && Object.prototype.hasOwnProperty.call(r, f.column) ? r[f.column] : undefined;
                if (f.op === 'eq') return String(val) === String(f.value);
                if (f.op === 'neq') return String(val) !== String(f.value);
                if (f.op === 'or') {
                    const clauses = Array.isArray(f.clauses) ? f.clauses : [];
                    return clauses.some(c => {
                        const v = r && Object.prototype.hasOwnProperty.call(r, c.column) ? r[c.column] : undefined;
                        if (c.op === 'eq') return String(v) === String(c.value);
                        if (c.op === 'neq') return String(v) !== String(c.value);
                        return false;
                    });
                }
                if (f.op === 'contains') {
                    const target = val;
                    const needle = f.value;
                    const parsedNeedle = typeof needle === 'string' ? safeJsonParse(needle) : needle;
                    if (Array.isArray(target) && parsedNeedle && Array.isArray(parsedNeedle)) {
                        const wanted = parsedNeedle[0];
                        if (wanted && typeof wanted === 'object') {
                            return target.some(entry => {
                                if (!entry || typeof entry !== 'object') return false;
                                return Object.keys(wanted).every(k => String(entry[k]) === String(wanted[k]));
                            });
                        }
                    }
                    if (typeof target === 'string') return target.includes(String(needle));
                    return false;
                }
                return true;
            });
        });
    };

    const applyOrderLimit = (rows, orderBy, limit) => {
        let out = rows;
        if (orderBy && orderBy.column) {
            const col = orderBy.column;
            const asc = !!orderBy.ascending;
            out = [...out].sort((a, b) => {
                const va = a && a[col] != null ? a[col] : '';
                const vb = b && b[col] != null ? b[col] : '';
                if (va === vb) return 0;
                return (va < vb ? -1 : 1) * (asc ? 1 : -1);
            });
        }
        if (typeof limit === 'number' && limit >= 0) out = out.slice(0, limit);
        return out;
    };

    class OfflineFirstController {
        constructor() {
            this.db = new OfflineDB();
            this._realSupabase = null;
            this._ui = null;
            this._offlineBannerEl = null;
            this._statusEl = null;
            this._isSyncing = false;
            this._lastOnline = null;
            this._queuedToasts = [];
            this._initConnectionUI();
            this._attachNetworkEvents();
        }

        bindUI(uiManager) {
            this._ui = uiManager;
            if (this._queuedToasts.length) {
                this._queuedToasts.splice(0).forEach(t => this._ui.showNotification(t.message, t.type, t.duration));
            }
        }

        setRealSupabase(client) {
            this._realSupabase = client;
        }

        isOnline() {
            return navigator.onLine === true;
        }

        _toast(message, type = 'info', duration = 5000) {
            if (this._ui && this._ui.showNotification) this._ui.showNotification(message, type, duration);
            else this._queuedToasts.push({ message, type, duration });
        }

        _initConnectionUI() {
            const ensure = () => {
                if (document.getElementById('connection-status-indicator')) return;
                const bar = document.createElement('div');
                bar.id = 'connection-status-indicator';
                bar.style.zIndex = '2147483646';
                bar.style.display = 'inline-flex';
                bar.style.alignItems = 'center';
                bar.style.gap = '6px';
                bar.style.padding = '2px 8px';
                bar.style.fontFamily = '-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif';
                bar.style.fontSize = '11px';
                bar.style.fontWeight = '700';
                bar.style.background = 'rgba(0,0,0,0.75)';
                bar.style.color = '#fff';
                bar.style.backdropFilter = 'blur(8px)';
                bar.style.pointerEvents = 'none';
                bar.style.borderRadius = '999px';
                bar.style.whiteSpace = 'nowrap';

                const status = document.createElement('div');
                status.textContent = '🟢 Online';
                const sync = document.createElement('div');
                sync.id = 'connection-status-right';
                sync.textContent = '';
                bar.appendChild(status);
                bar.appendChild(sync);
                this._statusEl = status;

                const currentUser = document.getElementById('current-user');
                if (currentUser && currentUser.parentElement) {
                    const wrapper = document.createElement('div');
                    wrapper.id = 'connection-user-wrapper';
                    wrapper.style.display = 'flex';
                    wrapper.style.flexDirection = 'column';
                    wrapper.style.alignItems = 'flex-end';
                    wrapper.style.gap = '4px';
                    currentUser.parentElement.insertBefore(wrapper, currentUser);
                    wrapper.appendChild(currentUser);
                    wrapper.appendChild(bar);
                } else {
                    bar.style.position = 'fixed';
                    bar.style.top = '8px';
                    bar.style.right = '10px';
                    document.body.appendChild(bar);
                }
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    ensure();
                    this._renderConnectionUI();
                });
            } else {
                ensure();
                this._renderConnectionUI();
            }
        }

        _renderConnectionUI() {
            if (!this._statusEl) return;
            const online = this.isOnline();
            this._statusEl.textContent = online ? '🟢 Online' : '🔴 Offline';

            const right = document.getElementById('connection-status-right');
            if (right) right.textContent = this._isSyncing ? '⟳ Sync' : '';
        }

        _attachNetworkEvents() {
            const onOffline = () => {
                this._renderConnectionUI();
                this._toast('⚠️ Modo Offline\nSem conexão com a internet. Os dados serão sincronizados automaticamente quando a conexão voltar.', 'warning', 7000);
            };
            const onOnline = async () => {
                this._renderConnectionUI();
                this._toast('✅ Conexão restaurada\nInternet detectada. Sincronizando dados...', 'success', 5000);
                await this.syncNow();
            };
            window.addEventListener('offline', onOffline);
            window.addEventListener('online', onOnline);
            setTimeout(() => this._renderConnectionUI(), 0);
        }

        createHybridClient(realSupabase) {
            this.setRealSupabase(realSupabase);
            const controller = this;
            return {
                auth: realSupabase.auth,
                storage: realSupabase.storage,
                functions: realSupabase.functions,
                realtime: realSupabase.realtime,
                from(table) {
                    return new HybridQuery(controller, realSupabase, table);
                },
                channel: (...args) => realSupabase.channel(...args),
                removeChannel: (...args) => realSupabase.removeChannel(...args),
                removeAllChannels: (...args) => realSupabase.removeAllChannels(...args),
                getChannels: (...args) => realSupabase.getChannels(...args),
            };
        }

        async syncNow() {
            if (!this.isOnline()) return { success: false, message: 'offline' };
            if (!this._realSupabase) return { success: false, message: 'no-supabase' };
            if (this._isSyncing) return { success: true, message: 'syncing' };
            this._isSyncing = true;
            this._renderConnectionUI();
            try {
                const outbox = await this.db.listOutbox();
                for (const op of outbox) {
                    const ok = await this._applyOpToRemote(op);
                    if (ok) await this.db.removeOutbox(op.opId);
                }
                await this.db.setMeta('lastSyncAt', nowIso());
                if (outbox.length) this._toast('☁️ Sincronização concluída\nTodos os dados foram enviados para o servidor.', 'success', 6000);
                return { success: true, synced: outbox.length };
            } finally {
                this._isSyncing = false;
                this._renderConnectionUI();
            }
        }

        async _applyOpToRemote(op) {
            try {
                const table = op.table;
                let q = this._realSupabase.from(table);
                const filters = Array.isArray(op.filters) ? op.filters : [];

                const applyWhere = (query) => {
                    let qq = query;
                    filters.forEach(f => {
                        if (f.op === 'eq') qq = qq.eq(f.column, f.value);
                        else if (f.op === 'neq') qq = qq.neq(f.column, f.value);
                        else if (f.op === 'or') qq = qq.or(f.expr);
                    });
                    return qq;
                };

                if (op.action === 'insert') {
                    const rows = Array.isArray(op.payload && op.payload.rows) ? op.payload.rows : [];
                    const { error } = await q.insert(rows);
                    if (!error) return true;
                    const msg = (error && (error.code || error.message)) ? String(error.code || error.message) : '';
                    if (msg.includes('23505') || msg.toLowerCase().includes('duplicate')) return true;
                    return false;
                }

                if (op.action === 'upsert') {
                    const row = op.payload && op.payload.row;
                    const onConflict = op.payload && op.payload.onConflict;
                    const { error } = await q.upsert(row, onConflict ? { onConflict } : undefined);
                    if (!error) return true;
                    const msg = (error && (error.code || error.message)) ? String(error.code || error.message) : '';
                    if (msg.includes('23505') || msg.toLowerCase().includes('duplicate')) return true;
                    return false;
                }

                if (op.action === 'update') {
                    const updates = op.payload && op.payload.updates ? op.payload.updates : {};
                    q = applyWhere(q.update(updates));
                    const { error } = await q;
                    if (!error) return true;
                    return false;
                }

                if (op.action === 'delete') {
                    q = applyWhere(q.delete());
                    const { error } = await q;
                    if (!error) return true;
                    return false;
                }

                return true;
            } catch {
                return false;
            }
        }
    }

    class HybridQuery {
        constructor(controller, realSupabase, table) {
            this._c = controller;
            this._real = realSupabase;
            this._table = table;
            this._filters = [];
            this._order = null;
            this._limit = null;
            this._action = null;
            this._payload = null;
            this._returning = null;
            this._singleMode = null;
            this._selectArgs = null;
        }

        eq(column, value) {
            this._filters.push({ op: 'eq', column, value });
            return this;
        }

        neq(column, value) {
            this._filters.push({ op: 'neq', column, value });
            return this;
        }

        contains(column, value) {
            this._filters.push({ op: 'contains', column, value });
            return this;
        }

        or(expr) {
            const parsedClauses = String(expr || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
                .map(part => {
                    const pieces = part.split('.');
                    if (pieces.length < 3) return null;
                    const [column, op, ...rest] = pieces;
                    return { column, op, value: rest.join('.') };
                })
                .filter(Boolean);
            this._filters.push({ op: 'or', clauses: parsedClauses, expr: String(expr || '') });
            return this;
        }

        order(column, options = {}) {
            this._order = { column, ascending: options.ascending !== false };
            return this;
        }

        limit(n) {
            this._limit = Number(n);
            return this;
        }

        select(columns = '*', options = null) {
            if (!this._action) {
                this._action = 'select';
                this._selectArgs = { columns, options };
            } else {
                this._returning = { columns, options };
            }
            return this;
        }

        insert(rows) {
            this._action = 'insert';
            this._payload = { rows: Array.isArray(rows) ? rows : [rows] };
            return this;
        }

        update(updates) {
            this._action = 'update';
            this._payload = { updates: updates || {} };
            return this;
        }

        delete() {
            this._action = 'delete';
            this._payload = {};
            return this;
        }

        upsert(row, options = {}) {
            this._action = 'upsert';
            this._payload = { row, onConflict: options && options.onConflict ? String(options.onConflict) : null };
            return this;
        }

        single() {
            this._singleMode = 'single';
            return this;
        }

        maybeSingle() {
            this._singleMode = 'maybe';
            return this;
        }

        then(resolve, reject) {
            return this._execute().then(resolve, reject);
        }

        async _execute() {
            const online = this._c.isOnline();
            if (online) return this._executeOnline();
            return this._executeOffline();
        }

        async _executeOnline() {
            try {
                let q = this._real.from(this._table);
                this._filters.forEach(f => {
                    if (f.op === 'eq') q = q.eq(f.column, f.value);
                    else if (f.op === 'neq') q = q.neq(f.column, f.value);
                    else if (f.op === 'contains') q = q.contains(f.column, f.value);
                    else if (f.op === 'or') q = q.or(f.expr);
                });
                if (this._order) q = q.order(this._order.column, { ascending: this._order.ascending });
                if (typeof this._limit === 'number' && !Number.isNaN(this._limit)) q = q.limit(this._limit);

                let res;
                if (this._action === 'select') {
                    const { columns, options } = this._selectArgs || { columns: '*', options: null };
                    let qs = options ? q.select(columns, options) : q.select(columns);
                    if (this._singleMode === 'single') qs = qs.single();
                    if (this._singleMode === 'maybe') qs = qs.maybeSingle();
                    res = await qs;
                    if (res && !res.error) {
                        const data = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
                        await this._c.db.putRows(this._table, data);
                    }
                } else if (this._action === 'insert') {
                    const rows = this._payload && Array.isArray(this._payload.rows) ? this._payload.rows : [];
                    if (this._returning) {
                        const { columns, options } = this._returning;
                        res = options ? await q.insert(rows).select(columns, options) : await q.insert(rows).select(columns);
                    } else {
                        res = await q.insert(rows);
                    }
                    const data = res && res.data ? (Array.isArray(res.data) ? res.data : [res.data]) : rows;
                    if (res && !res.error) await this._c.db.putRows(this._table, data);
                } else if (this._action === 'upsert') {
                    const row = this._payload ? this._payload.row : null;
                    const onConflict = this._payload ? this._payload.onConflict : null;
                    if (this._returning) {
                        const { columns, options } = this._returning;
                        res = onConflict
                            ? (options ? await q.upsert(row, { onConflict }).select(columns, options) : await q.upsert(row, { onConflict }).select(columns))
                            : (options ? await q.upsert(row).select(columns, options) : await q.upsert(row).select(columns));
                    } else {
                        res = onConflict ? await q.upsert(row, { onConflict }) : await q.upsert(row);
                    }
                    const data = res && res.data ? (Array.isArray(res.data) ? res.data : [res.data]) : (row ? [row] : []);
                    if (res && !res.error) await this._c.db.putRows(this._table, data);
                } else if (this._action === 'update') {
                    const updates = this._payload ? this._payload.updates : {};
                    let qu = q.update(updates);
                    if (this._returning) {
                        const { columns, options } = this._returning;
                        qu = options ? qu.select(columns, options) : qu.select(columns);
                    }
                    res = await qu;
                    if (res && !res.error && res.data) await this._c.db.putRows(this._table, res.data);
                } else if (this._action === 'delete') {
                    res = await q.delete();
                    if (res && !res.error) {
                        await this._c.db.deleteByPredicate(this._table, (row) => applyFilters([row], this._filters).length === 1);
                    }
                } else {
                    res = await q;
                }

                return res;
            } catch (e) {
                const msg = e && e.message ? String(e.message) : String(e);
                const isNet = msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('offline');
                if (isNet) {
                    return this._executeOffline();
                }
                return { data: null, error: e };
            }
        }

        async _executeOffline() {
            const table = this._table;
            const action = this._action || 'select';

            if (action === 'select') {
                const raw = await this._c.db.getAllRowsForTable(table);
                let rows = raw.map(r => r.row);
                rows = applyFilters(rows, this._filters);
                rows = applyOrderLimit(rows, this._order, this._limit);

                const { columns, options } = this._selectArgs || { columns: '*', options: null };
                if (options && options.head === true && options.count === 'exact' && String(columns) === 'count') {
                    return { data: null, error: null, count: rows.length };
                }

                if (typeof columns === 'string' && columns.includes('equipamento_operador')) {
                    const equipsRaw = await this._c.db.getAllRowsForTable('equipamento_operador');
                    const equips = equipsRaw.map(r => r.row);
                    rows = rows.map(r => {
                        const id = r && r.id != null ? r.id : null;
                        const rel = equips.filter(e => e && e.plantio_diario_id === id);
                        return { ...r, equipamento_operador: rel };
                    });
                }
                if (typeof columns === 'string' && columns.includes('users(')) {
                    const usersRaw = await this._c.db.getAllRowsForTable('users');
                    const users = usersRaw.map(r => r.row);
                    rows = rows.map(r => {
                        const uid = r && r.user_id != null ? r.user_id : null;
                        const u = users.find(x => x && x.id === uid) || null;
                        return { ...r, users: u ? { email: u.email, username: u.username } : null };
                    });
                }

                if (this._singleMode === 'single') {
                    if (!rows.length) return { data: null, error: { message: 'No rows' } };
                    return { data: rows[0] || null, error: null };
                }
                if (this._singleMode === 'maybe') return { data: rows[0] || null, error: null };
                return { data: rows, error: null };
            }

            if (action === 'insert') {
                const rows = this._payload && Array.isArray(this._payload.rows) ? this._payload.rows : [];
                rows.forEach(r => {
                    if (table === 'insumos_fazendas' && r && typeof r === 'object' && r.id == null) {
                        r.id = Date.now() + Math.floor(Math.random() * 1000);
                    }
                });
                await this._c.db.putRows(table, rows);
                await this._c.db.enqueue({ table, action: 'insert', payload: { rows }, filters: [] });
                return { data: this._returning ? rows : null, error: null };
            }

            if (action === 'upsert') {
                const row = this._payload ? this._payload.row : null;
                if (row) await this._c.db.upsertRow(table, row);
                await this._c.db.enqueue({ table, action: 'upsert', payload: { row, onConflict: this._payload ? this._payload.onConflict : null }, filters: [] });
                return { data: this._returning ? [row] : null, error: null };
            }

            if (action === 'update') {
                const updates = this._payload ? this._payload.updates : {};
                const raw = await this._c.db.getAllRowsForTable(table);
                const existing = raw.map(r => r.row);
                const matches = applyFilters(existing, this._filters);
                const updated = matches.map(r => ({ ...r, ...updates }));
                await this._c.db.putRows(table, updated);
                await this._c.db.enqueue({ table, action: 'update', payload: { updates }, filters: this._filters });
                return { data: this._returning ? updated : null, error: null };
            }

            if (action === 'delete') {
                await this._c.db.deleteByPredicate(table, (row) => applyFilters([row], this._filters).length === 1);
                await this._c.db.enqueue({ table, action: 'delete', payload: {}, filters: this._filters });
                return { data: null, error: null };
            }

            return { data: null, error: null };
        }
    }

    if (!window.offlineFirst) window.offlineFirst = new OfflineFirstController();
})();
