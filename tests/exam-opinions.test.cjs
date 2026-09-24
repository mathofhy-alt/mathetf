const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('opinions reward once per exam, cap at two per Korean day, and allow edits without reward', async () => {
    const db = new PGlite();
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
            CREATE TABLE public.profiles(id uuid PRIMARY KEY, earned_points bigint DEFAULT 0);
            CREATE TABLE public.exam_materials(id uuid PRIMARY KEY);
            CREATE TABLE public.point_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,amount bigint,description text,related_id uuid);
            CREATE TABLE public.settlement_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,amount bigint,bank_name text,account_number text,account_holder text);`);
        for (let n = 1; n <= 4; n++) await db.query('INSERT INTO public.exam_materials(id) VALUES ($1)', [id(n)]);
        await db.query('INSERT INTO auth.users(id) VALUES ($1)', [id(10)]);
        await db.query('INSERT INTO public.profiles(id, earned_points) VALUES ($1, 0)', [id(10)]);
        await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260925_exam_opinions.sql'), 'utf8'));
        const submit = (exam, number = 1, comment = '발상과 조건을 해석하는 과정에서 시간이 오래 걸렸습니다.') => db.query(
            `SELECT public.submit_exam_opinion($1::uuid,$2::uuid,$3,'발상·조건 해석',$4,22) result`,
            [id(exam), id(10), number, comment]);

        assert.equal((await submit(1)).rows[0].result.rewarded, 500);
        assert.equal((await submit(1, 2)).rows[0].result.rewarded, 0);
        assert.equal((await submit(2)).rows[0].result.rewarded, 500);
        await assert.rejects(submit(3), /오늘은 이미 두 시험지/);
        await assert.rejects(submit(1, 23), /문항 번호/);
        assert.equal((await db.query('SELECT earned_points FROM profiles WHERE id=$1', [id(10)])).rows[0].earned_points, 1000);
        assert.equal((await db.query('SELECT count(*)::int n FROM exam_opinions')).rows[0].n, 2);
        assert.equal((await db.query('SELECT count(*)::int n FROM exam_opinion_rewards')).rows[0].n, 2);
        await db.query(`UPDATE exam_opinions SET created_at = now() - interval '1 day' WHERE exam_id=$1`, [id(1)]);
        assert.equal((await submit(3)).rows[0].result.rewarded, 500);
        assert.deepEqual((await db.query('SELECT earned_points,opinion_points FROM profiles WHERE id=$1', [id(10)])).rows[0], { earned_points: 1500, opinion_points: 1500 });
        assert.equal((await db.query('SELECT count(*)::int n FROM exam_opinion_rewards')).rows[0].n, 3);
        await db.query('UPDATE profiles SET earned_points=earned_points-500 WHERE id=$1', [id(10)]);
        await db.query("INSERT INTO point_transactions(user_id,type,amount) VALUES ($1,'purchase',-500)", [id(10)]);
        assert.deepEqual((await db.query('SELECT earned_points,opinion_points FROM profiles WHERE id=$1', [id(10)])).rows[0], { earned_points: 1000, opinion_points: 1000 });
        await assert.rejects(db.exec('SET ROLE authenticated; SELECT public.submit_exam_opinion(NULL,NULL,1,NULL,NULL,1);'), /permission denied/);
    } finally { await db.close(); }
});
