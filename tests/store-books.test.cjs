// Entirely local: in-memory PostgreSQL and mocked Supabase. No env files or network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, imports = {}, globals = {}) {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
        { module, exports: module.exports, require: name => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; }, ...globals });
    return module.exports;
}
const order = load('src/lib/payments/order.ts');
const ids = { user: '00000000-0000-4000-8000-000000000001', other: '00000000-0000-4000-8000-000000000002', book: '00000000-0000-4000-8000-000000000003' };

test('migration, RLS, source guards and existing payment completion work together', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_user::text $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY);
        INSERT INTO auth.users VALUES ('${ids.user}'), ('${ids.other}');
        CREATE TABLE public.db_requests(id uuid PRIMARY KEY);
        CREATE TABLE public.exam_materials(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_db_id text,file_type text);
        CREATE TABLE public.questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_db_id text,work_status text,school text,grade text,year text,semester text,subject text);
        CREATE TABLE public.question_images(question_id uuid);
        ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.question_images ENABLE ROW LEVEL SECURITY;
        GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
        GRANT SELECT ON public.questions,public.question_images TO authenticated;
        CREATE TABLE public.purchased_items(id uuid DEFAULT gen_random_uuid(),user_id uuid,payment_id text,item_type text,item_id text,title text,price_paid bigint);
        CREATE TABLE public.payment_orders(id uuid DEFAULT gen_random_uuid(),payment_id text,user_id uuid,status text DEFAULT 'pending',total bigint,used_points bigint,amount bigint,points bigint DEFAULT 0,items jsonb,name text,completed_at timestamptz);
        CREATE TABLE public.profiles(id uuid PRIMARY KEY,earned_points bigint);
        CREATE TABLE public.payment_history(user_id uuid,payment_id text,merchant_uid text,amount bigint,points_added bigint,status text);
        CREATE TABLE public.point_transactions(user_id uuid,type text,amount bigint,description text,related_id uuid);
    `);
    await db.exec(read('supabase/migrations/20261006_private_db.sql'));
    await db.exec(read('supabase/migrations/20261007_private_db_per_owner.sql'));
    // Legacy public/public and public/owner-only overlap must not fail installation.
    await db.exec(`INSERT INTO exam_materials(source_db_id,file_type) VALUES ('legacy-overlap','DB'),('legacy-overlap > unit','PDF');
        INSERT INTO private_dbs(owner_user_id,title,source_db_id,price) VALUES ('${ids.other}','fixture','legacy-overlap',0);`);
    // Production may have only the table from a partial installation.
    await db.exec(`CREATE TABLE store_books(id uuid DEFAULT gen_random_uuid(),slug text NOT NULL,title text NOT NULL,source_db_id text NOT NULL);`);
    await db.exec(read('supabase/migrations/20261108_store_books.sql'));
    await db.exec(read('supabase/migrations/20261108_store_books.sql')); // repeat installation preserves existing mappings
    await db.exec(`DELETE FROM private_dbs WHERE source_db_id='legacy-overlap'`);
    const completion = read('supabase/migrations/20260926_retire_seller_settlements.sql').match(/CREATE OR REPLACE FUNCTION public\.complete_payment_order[\s\S]+?END; \$\$;/)[0];
    await db.exec(completion);
    await db.exec(`INSERT INTO questions(source_db_id,work_status) VALUES ('fixture-store > unit','private'),('fixture-public','sorted');`);
    await db.exec(`INSERT INTO store_books(id,slug,title,source_db_id,published) VALUES ('${ids.book}','fixture-store','fixture','fixture-store',true);`);
    assert.equal((await db.query('SELECT price FROM store_books')).rows[0].price, null);

    await t.test('direct authenticated reads cannot reach private questions or server-only book records', async () => {
        await db.exec('SET ROLE authenticated');
        assert.equal((await db.query('SELECT count(*)::int AS n FROM questions')).rows[0].n, 1);
        await assert.rejects(db.query('SELECT * FROM store_books'), /permission denied/);
        await db.exec('RESET ROLE');
        await db.exec('SET ROLE anon');
        await assert.rejects(db.query('SELECT * FROM store_books'), /permission denied/);
        await db.exec('RESET ROLE');
    });
    await t.test('private source can only be selected explicitly, never through a school rule', async () => {
        assert.equal((await db.query(`SELECT count(*)::int AS n FROM question_bank_candidates('[{"sources":["fixture-store > unit"]}]')`)).rows[0].n, 1);
        assert.equal((await db.query(`SELECT count(*)::int AS n FROM question_bank_candidates('[{"school":"fixture-store"}]')`)).rows[0].n, 0);
    });
    await t.test('unsafe state changes, empty publication and overlapping entitlements are rejected', async () => {
        await assert.rejects(db.exec(`UPDATE questions SET work_status='sorted' WHERE source_db_id='fixture-store > unit'`), /cannot have/);
        await assert.rejects(db.exec(`UPDATE questions SET work_status='sorted',source_db_id='escaped' WHERE source_db_id='fixture-store > unit'`), /cannot be moved/);
        await assert.rejects(db.exec(`INSERT INTO questions(source_db_id,work_status) VALUES ('fixture-store > new','sorted')`), /cannot have/);
        await assert.rejects(db.exec(`INSERT INTO questions(source_db_id,work_status) VALUES ('fixture-store > unit|fixture-other','private')`), /scope separators/);
        await assert.rejects(db.exec(`INSERT INTO store_books(slug,title,source_db_id,published) VALUES ('empty','fixture','empty',true)`), /must have private/);
        await assert.rejects(db.exec(`INSERT INTO store_books(slug,title,source_db_id) VALUES ('public','fixture','fixture-public')`), /cannot have/);
        await assert.rejects(db.exec(`INSERT INTO store_books(slug,title,source_db_id) VALUES ('overlap','fixture','fixture-store > unit')`), /separate/);
        await assert.rejects(db.exec(`INSERT INTO private_dbs(owner_user_id,title,source_db_id,price) VALUES ('${ids.other}','fixture','fixture-store',0)`), /cannot be assigned/);
        await db.exec(`INSERT INTO private_dbs(owner_user_id,title,source_db_id,price) VALUES ('${ids.other}','fixture','fixture-owner',0)`);
        await assert.rejects(db.exec(`INSERT INTO store_books(slug,title,source_db_id) VALUES ('owner','fixture','fixture-owner')`), /separate/);
    });
    await t.test('pending, null and private ingest and book saves are allowed; sorted remains blocked', async () => {
        await db.exec(`INSERT INTO questions(source_db_id,work_status) VALUES
            ('fixture-store > pending','pending'),('fixture-store > null',NULL),('fixture-store > private','private');
            UPDATE store_books SET title='fixture with staged questions' WHERE id='${ids.book}';
            UPDATE questions SET work_status='private' WHERE source_db_id='fixture-store > pending';
            INSERT INTO questions(source_db_id,work_status) VALUES ('fixture-staged > pending','pending'),('fixture-staged > null',NULL);
            INSERT INTO store_books(slug,title,source_db_id) VALUES ('staged','fixture','fixture-staged');`);
        await assert.rejects(db.exec(`UPDATE store_books SET published=true WHERE slug='staged'`), /must have private/);
        await db.exec(`INSERT INTO questions(source_db_id,work_status) VALUES ('fixture-staged > private','private');
            UPDATE store_books SET published=true WHERE slug='staged';
            UPDATE questions SET work_status=NULL WHERE source_db_id='fixture-store > null';
            UPDATE questions SET work_status='pending',source_db_id='fixture-store > moved' WHERE source_db_id='fixture-store > private';`);
        await assert.rejects(db.exec(`UPDATE questions SET work_status='sorted' WHERE source_db_id='fixture-store > moved'`), /cannot have/);
    });
    await t.test('exam_material source overlap is blocked both ways for every file type and path direction', async () => {
        for (const source of ['fixture-store', 'fixture-store > unit']) {
            for (const type of ['DB', 'PDF', 'HWP']) {
                await assert.rejects(db.query(`INSERT INTO exam_materials(source_db_id,file_type) VALUES ($1,$2)`, [source, type]), /cannot be assigned/);
            }
        }
        await db.exec(`INSERT INTO exam_materials(source_db_id,file_type) VALUES ('fixture-public-root','PDF'),('fixture-public-child > unit','HWP'),(NULL,'DB');`);
        for (const source of ['fixture-public-root', 'fixture-public-root > unit', 'fixture-public-child']) {
            await assert.rejects(db.query(`INSERT INTO store_books(slug,title,source_db_id) VALUES ('material-overlap','fixture',$1)`, [source]), /separate/);
            await assert.rejects(db.query(`UPDATE store_books SET source_db_id=$1 WHERE slug='staged'`, [source]), /separate/);
        }
        await assert.rejects(db.exec(`UPDATE exam_materials SET source_db_id='fixture-store' WHERE source_db_id IS NULL`), /cannot be assigned/);
        await assert.rejects(db.exec(`INSERT INTO exam_materials(source_db_id) VALUES ('unrelated|fixture-store > unit')`), /cannot be assigned/);
        await assert.rejects(db.exec(`UPDATE exam_materials SET source_db_id='fixture-store|unrelated' WHERE source_db_id IS NULL`), /cannot be assigned/);
        await db.exec(`INSERT INTO exam_materials(source_db_id) VALUES ('unrelated|fixture-multi > unit');`);
        await assert.rejects(db.exec(`INSERT INTO store_books(slug,title,source_db_id) VALUES ('multi','fixture','fixture-multi')`), /separate/);
        await db.exec(`INSERT INTO store_books(slug,title,source_db_id) VALUES ('nested','fixture','fixture-nested > unit');`);
        await assert.rejects(db.exec(`INSERT INTO exam_materials(source_db_id) VALUES ('fixture-nested')`), /cannot be assigned/);
        // Historical overlaps remain editable when no book is involved.
        await db.exec(`UPDATE exam_materials SET file_type='PDF' WHERE source_db_id='legacy-overlap';
            UPDATE exam_materials SET source_db_id='legacy-overlap > other' WHERE source_db_id='legacy-overlap > unit';
            INSERT INTO exam_materials(source_db_id) VALUES ('fixture-store-other');`);
    });
    await t.test('existing SQL completes full-point store orders exactly once and preserves other types', async () => {
        // One unit is a synthetic accounting fixture, not a product price or seed.
        await db.exec(`INSERT INTO profiles VALUES ('${ids.user}',1);
            INSERT INTO payment_orders(payment_id,user_id,total,used_points,amount,items,name)
            VALUES ('fixture-order','${ids.user}',1,1,0,'[{"item_id":"${ids.book}","item_type":"STORE_BOOK","title":"fixture","price":1},{"item_id":"fixture-owner","item_type":"PRIVATE_DB","title":"fixture","price":0},{"item_id":"fixture-pass","item_type":"QB_PASS","title":"fixture","price":0}]','fixture');`);
        await db.query(`SELECT complete_payment_order('fixture-order','${ids.user}')`);
        await db.query(`SELECT complete_payment_order('fixture-order','${ids.user}')`);
        assert.equal((await db.query('SELECT earned_points::int AS n FROM profiles')).rows[0].n, 0);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM payment_history')).rows[0].n, 1);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM purchased_items')).rows[0].n, 3);
        await assert.rejects(db.exec(`UPDATE store_books SET source_db_id='replacement' WHERE id='${ids.book}'`), /cannot be changed/);
        await db.exec(`UPDATE store_books SET published=false,price=NULL WHERE id='${ids.book}'`);
        assert.equal((await db.query(`SELECT count(*)::int AS n FROM purchased_items WHERE item_type='STORE_BOOK'`)).rows[0].n, 1);
    });
    await t.test('a different order for the same book rolls back points, ledgers, all items and order status', async () => {
        await db.exec(`UPDATE profiles SET earned_points=5 WHERE id='${ids.user}';
            INSERT INTO payment_orders(payment_id,user_id,total,used_points,amount,items,name)
            VALUES ('fixture-second-order','${ids.user}',1,1,0,'[{"item_id":"rollback-item","item_type":"PERSONAL_DB","title":"fixture","price":0},{"item_id":"${ids.book}","item_type":"STORE_BOOK","title":"fixture","price":1}]','fixture');`);
        const snapshot = async () => (await db.query(`SELECT
            (SELECT earned_points::int FROM profiles WHERE id='${ids.user}') AS balance,
            (SELECT count(*)::int FROM payment_history) AS payments,
            (SELECT count(*)::int FROM point_transactions) AS points,
            (SELECT count(*)::int FROM purchased_items) AS items`)).rows[0];
        const before = await snapshot();
        await assert.rejects(db.query(`SELECT complete_payment_order('fixture-second-order','${ids.user}')`), e => e.code === '23505' && e.message.includes('purchased_items_store_owner_idx'));
        assert.deepEqual(await snapshot(), before);
        assert.equal((await db.query(`SELECT status,completed_at FROM payment_orders WHERE payment_id='fixture-second-order'`)).rows[0].status, 'pending');
        assert.equal((await db.query(`SELECT completed_at FROM payment_orders WHERE payment_id='fixture-second-order'`)).rows[0].completed_at, null);
        // The partial index leaves repeat purchases of other types and other users intact.
        await db.exec(`INSERT INTO purchased_items(user_id,item_type,item_id) VALUES
            ('${ids.user}','PERSONAL_DB','repeat'),('${ids.user}','PERSONAL_DB','repeat'),('${ids.other}','STORE_BOOK','${ids.book}');`);
    });
});

function privateHarness(user, failure, logs = []) {
    const data = {
        store_books: [{ id: ids.book, title: 'fixture', source_db_id: 'fixture-store', price: null, published: false }],
        private_dbs: [{ id: 'owner-paid', owner_user_id: ids.user, source_db_id: 'fixture-owner', price: 1 }, { id: 'owner-free', owner_user_id: ids.user, source_db_id: 'fixture-free', price: 0 }, { id: 'other-free', owner_user_id: ids.other, source_db_id: 'fixture-other', price: 0 }],
        purchased_items: [{ user_id: ids.user, item_type: 'STORE_BOOK', item_id: ids.book }, { user_id: ids.user, item_type: 'PRIVATE_DB', item_id: 'owner-paid' }],
        questions: [{ id: 'root', source_db_id: 'fixture-store', work_status: 'private' }, { id: 'unit', source_db_id: 'fixture-store > unit', work_status: 'private' }, { id: 'unsafe', source_db_id: 'fixture-store > unsafe', work_status: 'sorted' }],
    };
    const sb = { from(table) {
        let rows = data[table] || []; let storePurchase = false;
        const q = { select: () => q, order: () => q, range: () => q,
            like: (key, pattern) => { rows = rows.filter(r => r[key].startsWith(pattern.slice(0, -1))); return q; },
            eq: (key, val) => { if (key === 'item_type' && val === 'STORE_BOOK') storePurchase = true; rows = rows.filter(r => r[key] === val); return q; }, in: (key, vals) => { rows = rows.filter(r => vals.includes(r[key])); return q; }, then: (fn, reject) => {
                const fail = (storePurchase && failure?.startsWith('purchased_items')) || (table === 'store_books' && failure?.startsWith('store_books'));
                if (fail && failure.endsWith('throw')) return Promise.reject(new Error('fixture network failure')).then(fn, reject);
                return Promise.resolve({ data: rows, count: rows.length, error: fail ? { code: 'fixture' } : null }).then(fn, reject);
            } };
        return q;
    } };
    const mod = load('src/lib/questions/privateDb.ts', {
        '@/utils/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
        '@/utils/supabase/server-admin': { createAdminClient: () => sb }, '@/lib/store/config': { STORE_ITEM_TYPE: 'STORE_BOOK' },
    }, { console: { error: (...args) => logs.push(args) } });
    return mod;
}

test('store entitlement errors omit only store books and keep owner-only and admin results', async () => {
    for (const failure of ['purchased_items-error', 'purchased_items-throw', 'store_books-error', 'store_books-throw']) {
        for (const admin of [false, true]) {
            const logs = [];
            const h = privateHarness({ id: ids.user, email: admin ? 'mathofhy@naver.com' : 'fixture@example.test' }, failure, logs);
            assert.deepEqual(plain(await h.usablePrivateDbs()).map(b => b.source_db_id), admin ? ['fixture-owner', 'fixture-free', 'fixture-other'] : ['fixture-owner', 'fixture-free']);
            assert.equal(logs.length, 1);
            assert.match(logs[0][0], /Store DB entitlements/);
            assert.deepEqual(plain(await h.stripPrivate([{ work_status: 'private', source_db_id: 'fixture-store > unit' }])), []);
        }
    }
});
test('buyer-only source and image entitlements preserve owner-only DB behavior', async () => {
    assert.deepEqual(plain(await privateHarness(null).usablePrivateDbs()), []);
    const buyer = privateHarness({ id: ids.user, email: 'fixture@example.test' });
    assert.deepEqual(plain(await buyer.usablePrivateDbs()).map(b => b.source_db_id), ['fixture-owner', 'fixture-free', 'fixture-store']);
    const other = privateHarness({ id: ids.other, email: 'other@example.test' });
    assert.deepEqual(plain(await other.usablePrivateDbs()).map(b => b.source_db_id), ['fixture-other']);
    const rows = [{ id: 'book', work_status: 'private', source_db_id: 'fixture-store > unit' }, { id: 'prefix-trick', work_status: 'private', source_db_id: 'fixture-store-other > unit' }, { id: 'public', work_status: 'sorted' }];
    assert.deepEqual(plain(await buyer.stripPrivate(rows)).map(q => q.id), ['book', 'public']);
    assert.deepEqual(plain(await other.stripPrivate(rows)).map(q => q.id), ['public']);
    assert.equal((await privateHarness({ id: 'admin', email: 'mathofhy@naver.com' }).usablePrivateDbs()).length, 4);
    assert.equal(buyer.subPattern('a%_\\'), 'a\\%\\_\\\\ > %');
    const catalog = plain(await buyer.privateCatalog());
    assert.ok(catalog.some(b => b.id === ids.book && b.source_db_id === 'fixture-store' && b.question_count === 1));
    assert.ok(catalog.some(b => b.source_db_id === 'fixture-store > unit' && b.path[0] === 'unit'));
    assert.ok(catalog.every(b => b.private));
    assert.ok(!catalog.some(b => b.source_db_id?.includes('unsafe')));
});

test('store quote uses server price/type; null prices are not purchasable', () => {
    const requested = [{ item_id: ids.book, price: 999, item_type: 'HWP_DOC' }];
    assert.throws(() => order.cartQuote(requested, [{ id: ids.book, title: 'fixture', file_type: 'STORE', price: null }], 0));
    const quote = order.cartQuote(requested, [{ id: ids.book, title: 'fixture', file_type: 'STORE', price: 0 }], 0);
    assert.equal(quote.items[0].item_type, 'STORE_BOOK');
    assert.equal(quote.items[0].price, 0);
    assert.equal(quote.amount, 0);
});

function ordersHarness({ enabled = true, price = 1, published = true, paid = false, points = 1, existing = false, pending = [], pendingError = false, mode = 'modern' } = {}) {
    let inserted;
    const tables = {
        exam_materials: existing ? [{ id: ids.book, title: 'fixture', price: 1, file_type: 'DB' }] : [],
        private_dbs: [], store_books: [{ id: ids.book, title: 'fixture', price, published }],
        purchased_items: paid ? [{ user_id: ids.user, item_id: ids.book, item_type: 'STORE_BOOK' }] : [],
        profiles: [{ id: ids.user, earned_points: points }],
        payment_orders: pending,
    };
    const sb = { from(table) {
        let rows = tables[table] || []; let single = false;
        const q = { select: () => q, in: (k, a) => { rows = rows.filter(r => a.includes(r[k])); return q; }, eq: (k, v) => { rows = rows.filter(r => r[k] === v); return q; }, single: () => { single = true; return q; },
            gte: (k, v) => { rows = rows.filter(r => r[k] >= v); return q; },
            maybeSingle: () => { single = true; return q; }, order: () => q, limit: () => q,
            or: () => { rows = rows.filter(row => row.manual_review_required || (row.legacy_reconciliation && row.status === 'pending')); return q; },
            insert: () => { throw new Error("Store orders must use RPC"); }, then: fn => Promise.resolve({ data: single ? rows[0] : rows, error: table === 'payment_orders' && pendingError ? { code: 'fixture' } : null }).then(fn) };
        return q;
    }, rpc: async (name, args) => {
        assert.equal(name, 'create_payment_order');
        if (args.p_quote.used_points > points) return { error: { code: 'P0002' } };
        inserted = args.p_quote;
        return { data: { paymentId: args.p_payment_id } };
    } };
    const mod = load('src/app/api/payments/orders/route.ts', {
        'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        '@/utils/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: ids.user, email: 'fixture@example.test' } } }) } }) },
        '@/utils/supabase/server-admin': { createAdminClient: () => sb }, '@/lib/payments/order': order,
        '@/lib/questions/privateDb': { PRIVATE_ITEM_TYPE: 'PRIVATE_DB' }, '@/lib/store/config': { STORE_ITEM_TYPE: 'STORE_BOOK', storeEnabled: () => enabled },
        '@/lib/qbPassConfig': { QB_PASS_TERMS: [], PASS_ONCE: {}, PASS_EXAM: {}, PASS_SHEET: {}, paywallOn: () => true },
        '@/lib/schemaCapabilities': { hasSchemaCapability: async () => true, paymentCreationMode: async () => mode },
        '@/lib/payments/reconcile': { readOrder: async () => pending[0], reconcileOrder: async () => { throw new Error('PAYMENT_RETRY_CHOICE'); } },
        '@/lib/payments/complete': { paymentErrorResponse: (error, paymentId) => ({ status: 409, body: { code: error.message, paymentId } }) },
    }, { crypto: require('node:crypto'), console });
    return { post: (body = {}) => mod.POST({ json: async () => ({ kind: 'cart', items: [{ item_id: ids.book, item_type: 'STORE_BOOK', price: 999 }], usedPoints: 0, ...body }) }), get inserted() { return inserted; } };
}
test('orders reject disabled, hidden, unpriced, purchased books and insufficient points', async () => {
    for (const fixture of [{ enabled: false }, { price: null }, { published: false }, { paid: true }]) {
        const h = ordersHarness(fixture); assert.equal((await h.post()).status, fixture.paid ? 409 : 400); assert.equal(h.inserted, undefined);
    }
    const insufficient = ordersHarness({ points: 0 });
    assert.equal((await insufficient.post({ usedPoints: 1 })).status, 503);
    const success = ordersHarness();
    assert.equal((await success.post({ usedPoints: 1 })).body.amount, 0);
    assert.equal(success.inserted.items[0].price, 1);
    assert.equal(success.inserted.items[0].item_type, 'STORE_BOOK');
    const oldCart = ordersHarness({ enabled: false, existing: true });
    assert.equal((await oldCart.post({ items: [{ item_id: ids.book, item_type: 'PERSONAL_DB' }] })).status, 200);
    assert.equal(oldCart.inserted.items[0].item_type, 'PERSONAL_DB');
    for (const mode of ['legacy', 'closed']) {
        const h = ordersHarness({ mode });
        assert.equal((await h.post({ usedPoints: 1 })).status, 503);
        assert.equal(h.inserted, undefined);
    }
});

test('pending store orders use explicit recovery and replacement regardless of age; lookup errors fail closed', async () => {
    for (const age of [0, 86400000]) {
        const pending = { payment_id: 'order-' + 'b'.repeat(32), user_id: ids.user, kind: 'cart', status: 'pending', amount: 1, created_at: new Date(Date.now()-age).toISOString(), legacy_reconciliation: false, manual_review_required: false, items: [{ item_id: ids.book, item_type: 'STORE_BOOK' }] };
        const h = ordersHarness({ pending: [pending] });
        assert.equal((await h.post()).body.code, 'PAYMENT_RETRY_CHOICE');
        assert.equal(h.inserted, undefined);
        assert.equal((await h.post({ replaceOpen: true, supersedePaymentId: pending.payment_id })).status, 200);
        assert.equal(h.inserted.items[0].item_type, 'STORE_BOOK');
    }
    const failed = ordersHarness({ pendingError: true });
    assert.equal((await failed.post()).status, 503);
    assert.equal(failed.inserted, undefined);
});

function completionHarness({ amount = 0, enabled = true, admin = false, published = true, price = 1, missing = false, bookError = false, rpcError = null, status = 'pending', store = true, paymentStatus = 'PAID', resolution = true } = {}) {
    const paymentId = 'order-' + 'a'.repeat(32);
    const fixture = { payment_id: paymentId, user_id: ids.user, legacy_reconciliation: false, kind: 'cart', items: [{ item_id: ids.book, item_type: store ? 'STORE_BOOK' : 'PERSONAL_DB' }], amount, status };
    const calls = { rpc: 0, retired: 0, card: 0, books: 0, cleanup: 0 };
    const sb = { auth: { admin: { getUserById: async () => ({ data: { user: { email: admin ? 'mathofhy@naver.com' : 'fixture@example.test' } } }) } }, from(table) {
        if (table === 'store_books') calls.books++;
        const q = { select: () => q, eq: () => q, in: () => q, single: () => q,
            delete: () => { calls.cleanup++; return q; }, then: fn => Promise.resolve({
                data: table === 'payment_orders' ? fixture : table === 'store_books' ? missing ? [] : [{ id: ids.book, published, price }] : [],
                error: table === 'store_books' && bookError ? { code: 'fixture' } : null,
            }).then(fn) };
        return q;
    }, rpc: async name => {
        if (name === 'defer_payment_reconciliation') return { error: null };
        if (name === 'supersede_payment_order') { calls.retired++; fixture.status = 'superseded'; return { data: { superseded: true } }; }
        assert.equal(name, 'complete_payment_order_v2'); calls.rpc++;
        return { data: { status: 'completed', alreadyProcessed: false }, error: rpcError };
    } };
    const reconcile = load('src/lib/payments/reconcile.ts', {
        '@/utils/supabase/server-admin': { createAdminClient: () => sb }, './order': order,
        '../schemaCapabilities': { hasSchemaCapability: async () => resolution, paymentCreationMode: async () => 'modern' },
        '../store/config': { STORE_ITEM_TYPE: 'STORE_BOOK', storeEnabled: () => enabled },
    }, { console, process: { env: { PORTONE_API_SECRET: 'local-only' } }, AbortSignal,
        fetch: async () => { calls.card++; return { ok: true, status: 200, json: async () => ({ id: paymentId, status: paymentStatus, currency: 'KRW', amount: { total: amount }, customer: { id: ids.user }, customData: { orderId: paymentId } }) }; },
    });
    const mod = load('src/lib/payments/complete.ts', {
        'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        '@/utils/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: ids.user } } }) } }) },
        '@/utils/supabase/server-admin': { createAdminClient: () => sb }, './order': order, './reconcile': reconcile,
    });
    return { calls, complete: () => mod.completeOrder({ json: async () => ({ paymentId }) }) };
}

test('full-point v2 completion rechecks sale and flag, retires unavailable orders without spending points', async () => {
    for (const fixture of [{ published: false }, { price: null }, { enabled: false }, { missing: true }, { admin: true, published: false }, { admin: true, price: null }]) {
        const h = completionHarness(fixture);
        const res = await h.complete();
        assert.equal(res.status, 409);
        assert.equal(res.body.code, 'STORE_UNAVAILABLE');
        assert.equal(h.calls.rpc, 0);
        assert.equal(h.calls.retired, 1);
        assert.equal(h.calls.card, 0);
        assert.equal(h.calls.cleanup, 0);
    }
    for (const fixture of [{}, { price: 0 }, { enabled: false, admin: true }, { enabled: false, store: false }, { enabled: false, status: 'completed', published: false, price: null }]) {
        const h = completionHarness(fixture);
        assert.equal((await h.complete()).status, 200);
        assert.equal(h.calls.rpc, fixture.status === 'completed' ? 0 : 1);
        assert.equal(h.calls.card, 0);
    }
    const failure = completionHarness({ bookError: true });
    assert.equal((await failure.complete()).status, 503);
    assert.equal(failure.calls.rpc, 0);
    const legacy = completionHarness({ resolution: false });
    assert.equal((await legacy.complete()).status, 503);
    assert.equal(legacy.calls.rpc, 0);
});

test('approved cards fulfill withdrawn books through v2; transport errors do not refund unconfirmed outcomes', async () => {
    const paid = completionHarness({ amount: 1, enabled: false, published: false, price: null });
    const result = await paid.complete();
    assert.equal(result.status, 200);
    assert.equal(result.body.hasStoreBooks, true);
    assert.equal(paid.calls.rpc, 1);
    assert.equal(paid.calls.card, 1);
    assert.equal(paid.calls.books, 0);
    const unpaid = completionHarness({ amount: 1, paymentStatus: 'READY' });
    assert.equal((await unpaid.complete()).body.code, 'PAYMENT_RETRY_CHOICE');
    assert.equal(unpaid.calls.rpc, 0);
    const lost = completionHarness({ amount: 1, rpcError: { code: 'fixture' } });
    assert.equal((await lost.complete()).body.code, 'ORDER_RETRY');
    assert.equal(lost.calls.card, 1);
});

test('admin save rejects only sorted linked questions, while publication still requires private content', async () => {
    for (const statuses of [['pending', null], ['private', 'pending', null], ['private', 'sorted']]) {
        for (const published of [false, true]) {
            let saved = false;
            const questions = statuses.map((work_status, i) => ({ source_db_id: i ? 'fixture > unit' : 'fixture', work_status }));
            const sb = { from(table) {
                let rows = questions;
                const q = { select: () => q,
                    eq: (k, v) => { rows = rows.filter(r => r[k] === v); return q; },
                    like: (k, v) => { rows = rows.filter(r => r[k].startsWith(v.slice(0, -1))); return q; },
                    or: () => { rows = rows.filter(r => r.work_status !== 'private'); return q; },
                    insert: () => { saved = true; return q; }, single: () => q,
                    then: fn => Promise.resolve({ data: table === 'store_books' ? { id: ids.book } : null, count: rows.length, error: null }).then(fn) };
                return q;
            } };
            const admin = load('src/lib/store/admin.ts', {
                'server-only': {}, '@/utils/supabase/server-admin': { createAdminClient: () => sb },
                '@/lib/questions/privateDb': { subPattern: source => `${source} > %` },
            });
            const route = load('src/app/api/admin/store/route.ts', {
                'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
                '@/utils/admin-auth': { requireAdmin: async () => ({ authorized: true }) },
                '@/utils/supabase/server-admin': { createAdminClient: () => sb }, '@/lib/store/admin': admin, '@/lib/payments/order': order,
            });
            const result = await route.POST({ json: async () => ({ slug: 'fixture', title: 'fixture', source_db_id: 'fixture', published, price: null, contents: {}, cover_text_color: '#FFFFFF' }) });
            const allowed = !statuses.includes('sorted') && (!published || statuses.includes('private'));
            assert.equal(saved, allowed);
            assert.equal(result.status, allowed ? 200 : 400);
        }
    }
});

test('existing payOrder skips PortOne for full points and uses it for a remaining balance', async () => {
    for (const amount of [0, 1]) {
        const calls = []; const payments = []; const storage = new Map();
        const mod = load('src/lib/payments/client.ts', { './order': order }, {
            crypto: require('node:crypto').webcrypto, AbortSignal, process: { env: {} }, window: { location: { origin: 'https://fixture.test' }, PortOne: { requestPayment: async args => { payments.push(args); return {}; } } },
            localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
            fetch: async (url, args) => { calls.push({ url, body: JSON.parse(args.body) }); return { ok: true, json: async () => url.endsWith('/orders') ? { paymentId: 'fixture-order', amount, name: 'fixture' } : { success: true } }; },
        });
        await mod.payOrder({ id: ids.user, email: 'fixture@example.test' }, { kind: 'cart', items: [], usedPoints: amount ? 0 : 1 });
        assert.equal(payments.length, amount ? 1 : 0);
        assert.deepEqual(calls.map(c => c.url), ['/api/payments/orders', '/api/payments/complete']);
        assert.equal(storage.size, 0);
    }
});

test('image API blocks nonbuyers, unclassified rows and entitlement lookup failures before loading image bytes', async () => {
    for (const fixture of ['buyer', 'nonbuyer', 'null-status', 'lookup-error']) {
        let readBytes = false;
        const sb = { from(table) {
            let fields = '';
            const q = { select: value => { fields = value; return q; }, in: () => q, order: () => q, or: () => q,
                then: fn => Promise.resolve(table === 'questions' ? { data: fixture === 'lookup-error' ? null : [{ id: ids.book, work_status: fixture === 'null-status' ? null : 'private', source_db_id: 'fixture-store > unit' }], error: fixture === 'lookup-error' ? { code: 'fixture' } : null } : (() => {
                    if (fields === 'id, data') { readBytes = true; return { data: [{ id: 'image', data: 'fixture-bytes' }], error: null }; }
                    return { data: [{ question_id: ids.book, id: 'image', original_bin_id: 'AUTO_Q_', format: 'webp' }], error: null };
                })()).then(fn) };
            return q;
        } };
        const route = load('src/app/api/questions/images/route.ts', {
            'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
            '@/utils/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: ids.user } } }) } }) }, '@/lib/predictAccess': { previewAccess: async () => {} }, '@/lib/planBundles': { BundleError: class extends Error {} },
            '@/lib/requireMember': { memberOnly: async () => null }, '@/lib/questions/privateDb': { stripPrivate: async rows => fixture === 'buyer' ? rows : [] },
            '@/utils/supabase/server-admin': { createAdminClient: () => sb }, '@/lib/questions/imageAccess': { canSeeSolutions: async () => true, trimQuestionImages: rows => rows, trimPreviewImages: rows => rows },
        }, { console: { error() {} } });
        const res = await route.POST({ headers: { get: () => null }, json: async () => ({ ids: [ids.book] }) });
        assert.equal(res.status, fixture === 'lookup-error' ? 500 : 200);
        assert.equal(readBytes, fixture === 'buyer');
        if (fixture !== 'lookup-error') assert.equal(res.body.images[ids.book].length, fixture === 'buyer' ? 1 : 0);
    }
});

test('store defaults open and a withdrawn detail is limited to buyers or administrators', async () => {
    const env = {};
    const config = load('src/lib/store/config.ts', {}, { process: { env } });
    assert.equal(config.storeEnabled(), true);
    env.NEXT_PUBLIC_STORE_ENABLED = 'false'; assert.equal(config.storeEnabled(), false);
    env.NEXT_PUBLIC_STORE_ENABLED = 'true'; assert.equal(config.storeEnabled(), true);
    const types = load('src/lib/store/types.ts');
    assert.ok(!types.PUBLIC_BOOK_FIELDS.includes('source_db_id'));
    const mod = load('src/lib/store/server.ts', {
        'server-only': {}, './config': { ...config, storeEnabled: () => false }, './types': types,
        '@/utils/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) },
        '@/utils/supabase/server-admin': { createAdminClient: () => ({ from: () => {
            const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: ids.book, published: false }, error: null }) };
            return q;
        } }) },
    });
    assert.equal((await mod.storeViewer()).allowed, false);
    assert.equal(await mod.storeBookBySlug('fixture', false, []), null);
    assert.equal((await mod.storeBookBySlug('fixture', false, [ids.book])).id, ids.book);
    assert.equal((await mod.storeBookBySlug('fixture', true, [])).id, ids.book);
});

test('empty storefront renders polite preparation copy without fabricated books, prices or filters', () => {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { default: BookList } = load('src/components/store/BookList.tsx', {
        react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
        'next/link': () => null, './BookCover': () => null,
    });
    const html = renderToStaticMarkup(React.createElement(BookList, { books: [], purchased: [], loggedIn: false }));
    assert.match(html, /책을 준비하고 있어요/);
    assert.doesNotMatch(html, /store-card|store-filters|store-tabs|원|가격/);
    const header = read('src/components/Header.tsx');
    assert.match(header, /storeEnabled\(\)/);
    assert.match(header, /href: '\/store'/);
});

test('sitemap includes store listing only with published books and excludes hidden books', async () => {
    for (const enabled of [false, true]) for (const published of [false, true]) {
        const tables = {
            exam_materials: [{ id: ids.other, school: 'fixture', created_at: '2026-11-01', file_type: 'PDF', content_type: '해설', preview_urls: ['fixture'] }],
            questions: [{ created_at: '2026-11-01' }], mock_exams: [],
            store_books: [{ slug: 'hidden', published: false, created_at: '2026-11-01' }, ...(published ? [{ slug: 'fixture-book', published: true, created_at: '2026-11-02' }] : [])],
        };
        let storeReads = 0;
        const sb = { from(table) {
            if (table === 'store_books') storeReads++;
            let rows = tables[table] || [];
            const q = { select: () => q, order: () => q, limit: () => q, not: () => q,
                neq: (k, v) => { rows = rows.filter(r => r[k] !== v); return q; },
                eq: (k, v) => { rows = rows.filter(r => r[k] === v); return q; },
                in: (k, v) => { rows = rows.filter(r => v.includes(r[k])); return q; },
                range: (start, end) => { rows = rows.slice(start, end + 1); return q; },
                maybeSingle: async () => ({ data: rows[0], error: null }),
                then: resolve => Promise.resolve({ data: rows, error: null }).then(resolve),
            }; return q;
        } };
        const { default: sitemap } = load('src/app/sitemap.ts', {
            '@/lib/stats': { NOT_A_SCHOOL: new Set() }, '@/lib/subject-hub': { HUB_SUBJECTS: [] },
            '@/lib/region-hub': { buildRegionTree: async () => [] }, '@/lib/seo-insights': { INSIGHT_REPORTS: [] },
            '@/lib/exam-editorials': { examEditorials: {} }, '@/lib/store/config': { storeEnabled: () => enabled },
            '@/utils/supabase/server-admin': { createAdminClient: () => sb },
        }, { console });
        const urls = plain(await sitemap()).map(entry => entry.url);
        assert.equal(urls.includes('https://mathetf.com/store'), enabled && published);
        assert.equal(urls.includes('https://mathetf.com/store/fixture-book'), enabled && published);
        assert.equal(urls.includes('https://mathetf.com/store/hidden'), false);
        assert.equal(storeReads, enabled ? 1 : 0);
    }
});
