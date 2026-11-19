import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Optional external runner dependency, installed in a temporary directory, never in the app.
test('price migration executes in isolated PostgreSQL; reservations, CAS, immutable identity and grants hold',
  { skip: !process.env.ISBN_PRICE_PGLITE_MODULE }, async () => {
    const { PGlite } = await import(pathToFileURL(process.env.ISBN_PRICE_PGLITE_MODULE).href);
    const db = new PGlite();
    const registration = '33333333-3333-4333-8333-333333333333';
    const actor = '11111111-1111-4111-8111-111111111111', store = '22222222-2222-4222-8222-222222222222';
    const job = '44444444-4444-4444-8444-444444444444', other = '55555555-5555-4555-8555-555555555555';
    try {
      await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
      await db.exec(await readFile('supabase/setup/magazord_registration_journal.sql', 'utf8'));
      const sql = await readFile('supabase/setup/magazord_price_journal.sql', 'utf8');
      assert.equal(await readFile('supabase/migrations/20261119161609_magazord_price_journal.sql', 'utf8'), sql);
      await db.exec(sql);
      await db.query(`insert into public.magazord_registration_jobs(id,store_id,actor_id,parent_code,child_code,fingerprint)
        values ($1,$2,$3,'FIXTURE-P','FIXTURE-C',repeat('a',64))`, [registration, store, actor]);
      const insert = id => db.query(`insert into public.magazord_price_jobs
        (id,registration_id,store_id,actor_id,parent_code,child_code,environment,channel_id,table_id,ad_scope,cents,fingerprint)
        values ($1,$2,$3,$4,'FIXTURE-P','FIXTURE-C','homologation',1,1,'none',3000,repeat('b',64))`, [id, registration, store, actor]);
      await assert.rejects(insert(job), { code: '23514' });
      for (const stage of ['parent_started','parent_confirmed','child_started','verified'])
        await db.query('update public.magazord_registration_jobs set stage=$1 where id=$2', [stage,registration]);
      const before = (await db.query('select * from public.magazord_registration_jobs')).rows;
      await db.exec('set role service_role');
      await assert.rejects(db.query(`insert into public.magazord_price_jobs
        (id,registration_id,store_id,actor_id,parent_code,child_code,environment,channel_id,table_id,ad_scope,cents,fingerprint)
        values ($1,$2,$3,$4,'FIXTURE-P','FIXTURE-C','homologation',1,1,'none',3000,repeat('b',64))`,
        [other, registration, other, actor]), { code: '23514' });
      await insert(job);
      assert.equal((await db.query('select child_code from public.magazord_price_reservations')).rows[0].child_code, 'fixture-c');
      await assert.rejects(insert(other), { code: '23505' });
      assert.equal((await db.query('select count(*)::int as n from public.magazord_price_jobs')).rows[0].n, 1);
      await assert.rejects(db.query("update public.magazord_price_jobs set cents=4000 where id=$1", [job]), { code: '23514' });
      await assert.rejects(db.query("update public.magazord_price_jobs set stage='price_verified' where id=$1", [job]), { code: '23514' });
      const cas = () => db.query("update public.magazord_price_jobs set stage='price_started' where id=$1 and stage='prepared' and fingerprint=repeat('b',64) returning id", [job]);
      assert.equal((await db.query("update public.magazord_price_jobs set stage='price_started' where id=$1 and fingerprint=repeat('c',64) returning id", [job])).rows.length, 0);
      const contenders = await Promise.all([cas(),cas(),cas()]);
      assert.equal(contenders.reduce((sum, r) => sum + r.rows.length, 0), 1);
      await assert.rejects(db.query("update public.magazord_price_jobs set stage='prepared' where id=$1", [job]), { code: '23514' });
      await db.query("update public.magazord_price_jobs set stage='price_verified' where id=$1 and stage='price_started'", [job]);
      for (const table of ['magazord_price_jobs','magazord_price_reservations'])
        await assert.rejects(db.exec(`delete from public.${table}`), { code: '42501' });
      for (const role of ['anon','authenticated']) {
        await db.exec(`reset role; set role ${role}`);
        for (const table of ['magazord_price_jobs','magazord_price_reservations'])
          await assert.rejects(db.exec(`select * from public.${table}`), { code: '42501' });
      }
      await db.exec('reset role');
      assert.deepEqual((await db.query('select * from public.magazord_registration_jobs')).rows, before);
      const rls = await db.query("select relrowsecurity from pg_class where relname in ('magazord_price_jobs','magazord_price_reservations')");
      assert.equal(rls.rows.length, 2); assert.ok(rls.rows.every(row => row.relrowsecurity));
    } finally { await db.close(); }
  });
