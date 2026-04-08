class ApiService {

    constructor() {
        if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || window.SUPABASE_CONFIG.url.includes('SUA_URL')) {
            console.warn('⚠️ Supabase não configurado. Verifique o arquivo config.js');
            // Tenta pegar do localStorage se houver (fallback)
            const storedUrl = localStorage.getItem('supabaseUrl');
            const storedKey = localStorage.getItem('supabaseKey');
            if (storedUrl && storedKey) {
                this.supabase = window.supabase.createClient(storedUrl, storedKey, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                    },
                    db: {
                        schema: 'public',
                    },
                    global: {
                        headers: { 'x-application-name': 'controle-insumos' },
                    },
                });
            } else {
                this.supabase = null;
            }
        } else {
            this.supabase = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                },
                db: {
                    schema: 'public',
                },
                global: {
                    headers: { 'x-application-name': 'controle-insumos' },
                },
            });
        }
        if (this.supabase && window.offlineFirst && typeof window.offlineFirst.createHybridClient === 'function') {
            this.supabase = window.offlineFirst.createHybridClient(this.supabase);
        }
        this.realtimeChannel = null;


        // URL base da API (backend)
        this.baseUrl = (window.API_CONFIG && window.API_CONFIG.baseUrl) || '';

        this.cache = new Map();
        this.user = null;
        
        // Recuperar sessão
        this.recoverSession();
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        
        if (options.body instanceof FormData) {
            delete headers['Content-Type'];
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API Request Error:', error);
            return { success: false, message: error.message };
        }
    }

    async recoverSession() {
        if (!this.supabase) return;
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) {
            this.user = session.user;
            
            // SECURITY: Auto-promote admins
            const isHardcodedAdmin = this.user.email && this.ADMIN_EMAILS.includes(this.user.email.toLowerCase());

            if (isHardcodedAdmin) {
                this.user.role = 'admin';
                if (!this.user.user_metadata) this.user.user_metadata = {};
                this.user.user_metadata.role = 'admin';
                this.ensureAdminRole(this.user);
            } else {
                // Fetch updated role from public table
                try {
                    const { data: publicUser } = await this.supabase
                        .from('users')
                        .select('role, permissions')
                        .eq('id', this.user.id)
                        .single();
                    
                    if (publicUser) {
                        if (publicUser.role) {
                            this.user.role = publicUser.role;
                            if (!this.user.user_metadata) this.user.user_metadata = {};
                            this.user.user_metadata.role = publicUser.role;
                        }
                        if (publicUser.permissions) {
                            this.user.permissions = publicUser.permissions;
                            if (!this.user.user_metadata) this.user.user_metadata = {};
                            this.user.user_metadata.permissions = publicUser.permissions;
                        }
                    }
                } catch (e) {
                    console.warn('RecoverSession: Error fetching user role', e);
                }
            }

            localStorage.setItem('authUser', JSON.stringify(this.user));
            localStorage.setItem('authToken', session.access_token);
        }
    }

    // Helper para verificar configuração
    checkConfig() {
        if (!this.supabase) {
            throw new Error('Supabase não configurado. Por favor, configure o arquivo frontend/config.js com sua URL e Chave do Supabase.');
        }
    }

    applyOrder(query, column, options) {
        if (query && typeof query.order === 'function') return query.order(column, options);
        return query;
    }

    // === AUTH ===

    // Lista de emails que são automaticamente promovidos a admin
    get ADMIN_EMAILS() {
        return [
            'santossilvaluizeduardo@gmail.com',
            'gutemberggg10@gmail.com'
        ];
    }

    // Helper para sincronizar usuário do Auth com tabela pública 'users'
    async syncUserToPublicTable(user) {
        if (!user || !user.id) return;
        
        try {
            // Verificar se usuário já existe na tabela pública
            const { data: existingUser } = await this.supabase
                .from('users')
                .select('id, username, email')
                .eq('id', user.id)
                .maybeSingle();

            // Gerar username base
            let baseUsername = user.user_metadata?.username || user.email.split('@')[0];
            
            const publicUser = {
                id: user.id,
                email: user.email,
                username: baseUsername,
                first_name: user.user_metadata?.first_name || '',
                last_name: user.user_metadata?.last_name || '',
                password: 'managed_by_supabase_auth'
            };
            
            if (!existingUser) {
                publicUser.role = user.user_metadata?.role || 'user';
            } else {
                // Se já existe, não mexemos no username para evitar conflito de Unique Key
                delete publicUser.username;
            }
            
            // Use upsert
            const { error } = await this.supabase.from('users').upsert(publicUser);
            
            if (error) {
                // Erro 23505: Unique Constraint (email ou username já existe)
                if (error.code === '23505') {
                    console.warn('Conflito de unicidade (email/username). Tentando resolver...');
                    
                    // Se o erro for no username e for novo usuário, tentamos sufixo
                    if (String(error.message).includes('users_username_key') && !existingUser) {
                        publicUser.username = `${baseUsername}_${Math.floor(Math.random() * 1000)}`;
                        await this.supabase.from('users').upsert(publicUser);
                        return;
                    }

                    // Se for conflito de email, apenas update campos seguros
                    const { data: byEmail } = await this.supabase
                        .from('users')
                        .select('id')
                        .eq('email', user.email)
                        .maybeSingle();
                    
                    if (byEmail) {
                        await this.supabase.from('users').update({
                            first_name: publicUser.first_name,
                            last_name: publicUser.last_name
                        }).eq('id', byEmail.id);
                        return;
                    }
                }
                
                // Fallback PGRST204 (coluna inexistente)
                if (error.code === 'PGRST204') {
                    const basicUser = { id: user.id, username: baseUsername, password: 'managed_by_supabase_auth' };
                    await this.supabase.from('users').upsert(basicUser);
                    return;
                }

                console.error('Erro detalhado Supabase sync:', error);
            }
        } catch (e) {
            console.error('Erro ao sincronizar usuário público:', e);
        }
    }

    async login(username, password) {
        this.checkConfig();
        
        // Tenta login direto com Supabase
        let email = username;
        
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error('Erro no login Supabase:', error);
            // Verifica se o erro é especificamente sobre email não confirmado
            if (error.message.includes('Email not confirmed')) {
                return { success: false, message: 'Email não confirmado. Verifique sua caixa de entrada.' };
            }
            return { success: false, message: 'Email ou senha inválidos' };
        }

        if (data.session) {
            this.user = data.user;
            
            // Verificação adicional de segurança: se o usuário pediu para bloquear,
            // garantimos que email_confirmed_at esteja preenchido.
            if (!this.user.email_confirmed_at) {
                // Se o Supabase permitiu login mas o email não tem data de confirmação,
                // pode ser que a configuração do projeto esteja como "Confirm Email: OFF".
                // Mas se o usuário quer EXIGIR, podemos bloquear aqui.
                // PORÉM: Se estiver OFF, email_confirmed_at pode ser null pra sempre ou preenchido auto.
                // Se estiver NULL e logou, vamos barrar.
                // Se o usuário acabou de criar a conta, email_confirmed_at é null.
                
                await this.supabase.auth.signOut();
                return { success: false, message: 'Acesso negado: Email ainda não confirmado.' };
            }

            // SECURITY: Auto-promote admins
            if (this.user.email && this.ADMIN_EMAILS.includes(this.user.email.toLowerCase())) {
                this.user.role = 'admin';
                if (!this.user.user_metadata) this.user.user_metadata = {};
                this.user.user_metadata.role = 'admin';
                this.ensureAdminRole(this.user);
            }

            // Sincroniza com tabela pública
            await this.syncUserToPublicTable(this.user);

            // Buscar dados atualizados (role e permissions) da tabela pública
            try {
                const { data: publicUser } = await this.supabase
                    .from('users')
                    .select('role, permissions')
                    .eq('id', this.user.id)
                    .single();
                
                if (publicUser) {
                    if (publicUser.role) {
                        this.user.role = publicUser.role;
                        if (!this.user.user_metadata) this.user.user_metadata = {};
                        this.user.user_metadata.role = publicUser.role;
                    }
                    if (publicUser.permissions) {
                        this.user.permissions = publicUser.permissions;
                        if (!this.user.user_metadata) this.user.user_metadata = {};
                        this.user.user_metadata.permissions = publicUser.permissions;
                    }
                }
            } catch (e) {
                console.warn('Erro ao buscar permissões no login:', e);
            }

            localStorage.setItem('authUser', JSON.stringify(this.user));
            localStorage.setItem('authToken', data.session.access_token);
            
            // Tenta recuperar role dos metadados
            const role = (this.user.user_metadata && this.user.user_metadata.role) || 'user';
            localStorage.setItem('authRole', role);
            
            return { success: true, user: this.user };
        }

        return { success: false, message: 'Erro desconhecido no login' };
    }

    async register(userData) {
        this.checkConfig();
        const { email, password, username, firstName, lastName } = userData;

        const { data, error } = await this.supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    username: username,
                    first_name: firstName,
                    last_name: lastName,
                    nome: `${firstName} ${lastName}`.trim(),
                    role: 'user' // Default role
                }
            }
        });

        if (error) {
            console.error('Erro no registro Supabase:', error);
            return { success: false, message: error.message };
        }

        if (data.user) {
            // Sincroniza imediatamente com tabela pública
            await this.syncUserToPublicTable(data.user);

            // Se o cadastro foi bem sucedido, faz logout imediato para forçar confirmação de email
            // mesmo que o Supabase tenha retornado uma sessão (caso a opção de confirmação esteja desabilitada no painel)
            // O usuário solicitou explicitamente: "n aceite o usuario entrar no sistema sem confirmar o emial"
            
            if (data.session) {
                await this.supabase.auth.signOut();
            }

            return { 
                success: true, 
                user: data.user, 
                message: 'Cadastro realizado! Por favor, verifique seu email para confirmar a conta antes de entrar.' 
            };
        }

        return { success: false, message: 'Erro ao criar conta' };
    }

    async logout() {
        if (this.supabase) {
            await this.supabase.auth.signOut();
        }
        localStorage.removeItem('authUser');
        localStorage.removeItem('authToken');
        localStorage.removeItem('authRole');
        this.user = null;
        return { success: true };
    }

    // === REALTIME ===
    enableRealtime(tables = []) {
        this.checkConfig();
        try {
            if (this.realtimeChannel) {
                this.supabase.removeChannel(this.realtimeChannel);
                this.realtimeChannel = null;
            }
            const channel = this.supabase.channel('db-changes');
            const watch = (table) => {
                channel.on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table },
                    (payload) => {
                        const detail = {
                            table,
                            eventType: payload.eventType,
                            new: payload.new,
                            old: payload.old
                        };
                        window.dispatchEvent(new CustomEvent('supabase:change', { detail }));
                    }
                );
            };
            const defaultTables = ['plantio_diario','equipamento_operador','insumos_fazendas','insumos_oxifertil','viagens_adubo','estoque','os_agricola','metas_plantio'];
            const set = (tables && tables.length) ? tables : defaultTables;
            set.forEach(watch);
            this.realtimeChannel = channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    window.dispatchEvent(new CustomEvent('supabase:ready'));
                }
            });
        } catch (e) {
            console.warn('Realtime indisponível:', e);
        }
    }


    async updateProfile(metadata) {
        this.checkConfig();
        const { data, error } = await this.supabase.auth.updateUser({
            data: metadata
        });

        if (error) {
            return { success: false, message: error.message };
        }

        this.user = data.user;
        localStorage.setItem('authUser', JSON.stringify(this.user));
        return { success: true, user: this.user };
    }

    async me() {
        if (!this.supabase) return { success: false };
        
        const { data: { session }, error } = await this.supabase.auth.getSession();
        
        if (session && session.user) {
            this.user = session.user;
            
            // Auto-promote Admin se estiver na lista de emails permitidos
            const isHardcodedAdmin = this.user.email && this.ADMIN_EMAILS.includes(this.user.email.toLowerCase());
            
            if (isHardcodedAdmin) {
                // Força o role no objeto local
                this.user.role = 'admin';
                if (!this.user.user_metadata) this.user.user_metadata = {};
                this.user.user_metadata.role = 'admin';
                
                // Tenta atualizar no banco de dados se não estiver como admin
                this.ensureAdminRole(this.user);
            }

            // Buscar role atualizado da tabela pública (se não for auto-admin)
            if (!isHardcodedAdmin) {
                try {
                    const { data: publicUser } = await this.supabase
                        .from('users')
                        .select('role, permissions')
                        .eq('id', this.user.id)
                        .single();
                    
                    if (publicUser) {
                        if (publicUser.role) {
                            this.user.role = publicUser.role;
                            if (!this.user.user_metadata) this.user.user_metadata = {};
                            this.user.user_metadata.role = publicUser.role;
                        }
                        if (publicUser.permissions) {
                            this.user.permissions = publicUser.permissions;
                            if (!this.user.user_metadata) this.user.user_metadata = {};
                            this.user.user_metadata.permissions = publicUser.permissions;
                        }
                    }
                } catch (e) {
                    // Silently fail or log
                    console.warn('Erro ao buscar permissões atualizadas:', e);
                }
            }

            // Sync localStorage
            localStorage.setItem('authRole', this.user.role || 'user');
            localStorage.setItem('authUser', JSON.stringify(this.user));
            localStorage.setItem('authToken', session.access_token);
            return { success: true, user: this.user };
        }
        
        return { success: false };
    }

    async ensureAdminRole(user) {
        // Atualiza metadados do Auth
        if (user.user_metadata && user.user_metadata.role !== 'admin') {
            await this.supabase.auth.updateUser({
                data: { role: 'admin' }
            });
        }
        
        // Atualiza tabela pública
        try {
            await this.supabase.from('users').update({ role: 'admin' }).eq('id', user.id);
        } catch (e) {
            console.warn('EnsureAdminRole: Error updating public table', e);
        }
    }

    async getUsers() {
        this.checkConfig();
        const { data, error } = await this.supabase
            .from('users')
            .select('*')
            .order('username', { ascending: true });
        
        if (error) return { success: false, message: error.message };
        return { success: true, data };
    }

    async updateUser(id, updates) {
        this.checkConfig();
        
        // Use backend API
        const result = await this.request(`/api/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });

        if (!result.success) {
            console.error('Erro ao atualizar usuário via API:', result.message);
            // Fallback para update direto via Supabase se a API falhar (e se o usuário tiver permissão)
            const { error } = await this.supabase
                .from('users')
                .update(updates)
                .eq('id', id);

            if (error) {
                return { success: false, message: error.message };
            }
            await this.logAction('UPDATE_USER', { target_user_id: id, updates });
            return { success: true };
        }
        
        await this.logAction('UPDATE_USER', { target_user_id: id, updates });
        return { success: true };
    }

    async deleteUser(id) {
        this.checkConfig();
        
        // Use backend API
        const result = await this.request(`/api/users/${id}`, {
            method: 'DELETE'
        });

        if (!result.success) {
            console.error('Erro ao excluir usuário via API:', result.message);
            // Fallback
            const { error } = await this.supabase
                .from('users')
                .delete()
                .eq('id', id);

            if (error) {
                return { success: false, message: error.message };
            }
             await this.logAction('DELETE_USER', { target_user_id: id });
             return { success: true };
        }
        
        await this.logAction('DELETE_USER', { target_user_id: id });
        
        return { success: true };
    }

    // === AUDIT LOGS ===

    async logAction(action, details = {}) {
        if (!this.user) return; 
        
        try {
            // Se o log falhar por causa da FK do user_id, 
            // tentamos sincronizar o usuário e repetir uma vez.
            const performLog = async (retry = true) => {
                const { error } = await this.supabase
                    .from('audit_logs')
                    .insert({
                        user_id: this.user.id,
                        action: action,
                        details: details
                    });
                
                if (error) {
                    // Erro 23503: Foreign Key Constraint (user_id não existe em 'users')
                    if (error.code === '23503' && retry) {
                        console.warn('User record missing in public.users, syncing before retry log...');
                        await this.syncUserToPublicTable(this.user);
                        return await performLog(false);
                    }
                    console.error('Error logging action:', error);
                }
            };

            await performLog();
        } catch (e) {
            console.error('Error logging action:', e);
        }
    }

    async getAuditLogs(limit = 100) {
        this.checkConfig();
        try {
            let q = this.supabase.from('audit_logs').select('*, users(email, username)').limit(limit);
            q = this.applyOrder(q, 'created_at', { ascending: false });
            const { data, error } = await q;

            if (error) {
                console.error('Error fetching audit logs:', error);
                return { success: false, message: error.message };
            }
            return { success: true, data };
        } catch (e) {
            console.error('Error fetching audit logs:', e);
            return { success: false, message: e.message };
        }
    }

    // === DADOS ===

    async getPlantioDiario() {
        this.checkConfig();
        const { data: plantios, error } = await this.supabase.from('plantio_diario').select('*');
        if (error) throw error;

        // Buscar dados de equipamento/operador para enriquecer
        const { data: equipamentos } = await this.supabase.from('equipamento_operador').select('*');
        
        if (plantios && equipamentos) {
            const merged = plantios.map(p => {
                // Encontrar equipamento vinculado (se houver)
                // Assumindo que equipamento_operador tem plantio_diario_id
                const equip = equipamentos.find(e => e.plantio_diario_id === p.id);
                if (equip) {
                    p.qualidade = p.qualidade || {};
                    // Merge info
                    p.qualidade.qualEquipamentoTrator = equip.trator;
                    p.qualidade.qualEquipamentoPlantadora = equip.plantadora_colhedora;
                    p.qualidade.qualOperador = equip.operador;
                    p.qualidade.qualMatricula = equip.matricula;
                }
                return p;
            });
            return { success: true, data: merged };
        }

        return { success: true, data: plantios };
    }

    async getOxifertil(filters = {}) {
        this.checkConfig();
        
        // 1. Buscar dados da tabela plantio_diario
        const { data: plantios, error: pError } = await this.supabase
            .from('plantio_diario')
            .select('*')
            .eq('tipo_operacao', 'plantio');
            
        if (pError) throw pError;

        // 2. Buscar insumos vinculados ao Oxifértil
        const { data: insumos, error: iError } = await this.supabase
            .from('insumos_oxifertil')
            .select('*');
            
        if (iError) throw iError;

        // 3. Cruzamento de dados
        const result = [];
        plantios.forEach(p => {
            const rowInsumos = insumos.filter(i => i.plantio_diario_id === p.id);
            if (rowInsumos.length > 0) {
                rowInsumos.forEach(ri => {
                    result.push({
                        ...p,
                        insumo: ri
                    });
                });
            }
        });

        return { success: true, data: result };
    }

    async addPlantioDia(payload) {
        this.checkConfig();
        const { error } = await this.supabase.from('plantio_diario').insert(payload);
        if (error) throw error;
        await this.logAction('ADD_PLANTIO', { id: payload.id, data: payload.data });
        return { success: true };
    }

    async updatePlantioDia(id, payload) {
        this.checkConfig();
        const { error } = await this.supabase.from('plantio_diario').update(payload).eq('id', id);
        if (error) throw error;
        await this.logAction('UPDATE_PLANTIO', { id, data: payload.data });
        return { success: true };
    }

    async deletePlantioDia(id) {
        this.checkConfig();
        const { error } = await this.supabase.from('plantio_diario').delete().eq('id', id);
        if (error) throw error;
        await this.logAction('DELETE_PLANTIO', { id });
        return { success: true };
    }

    // === ESTOQUE ===
    async getEstoque() {
        this.checkConfig();
        try {
            let q = this.supabase.from('estoque').select('*');
            q = this.applyOrder(q, 'item_nome', { ascending: true });
            const { data, error } = await q;
            if (error) throw error;
            return { success: true, data };
        } catch (e) {
            console.error('Error fetching estoque:', e);
            return { success: false, message: e.message };
        }
    }

    async updateEstoque(id, updates) {
        this.checkConfig();
        const { error } = await this.supabase.from('estoque').update(updates).eq('id', id);
        if (error) throw error;
        await this.logAction('UPDATE_ESTOQUE', { id, updates });
        return { success: true };
    }

    // === OS AGRICOLA ===
    async getOSList() {
        this.checkConfig();
        try {
            let q = this.supabase.from('os_agricola').select('*');
            q = this.applyOrder(q, 'numero', { ascending: false });
            const { data, error } = await q;
            if (error) throw error;
            return { success: true, data };
        } catch (e) {
            console.error('Error fetching OS:', e);
            return { success: false, message: e.message };
        }
    }

    async addOS(payload) {
        this.checkConfig();
        const { error } = await this.supabase.from('os_agricola').insert(payload);
        if (error) throw error;
        await this.logAction('ADD_OS', { numero: payload.numero });
        return { success: true };
    }

    // === VIAGENS ADUBO ===
    async getViagensAdubo() {
        this.checkConfig();
        try {
            let q = this.supabase.from('viagens_adubo').select('*');
            q = this.applyOrder(q, 'data', { ascending: false });
            const { data, error } = await q;
            if (error) throw error;
            return { success: true, data };
        } catch (e) {
            console.error('Error fetching viagens adubo:', e);
            return { success: false, message: e.message };
        }
    }

    async addViagemAdubo(payload) {
        this.checkConfig();
        const { error } = await this.supabase.from('viagens_adubo').insert(payload);
        if (error) throw error;
        await this.logAction('ADD_VIAGEM_ADUBO', { id: payload.id });
        return { success: true };
    }

}

window.api = new ApiService();
