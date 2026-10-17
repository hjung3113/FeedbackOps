import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('ADR-0064 canonical read boundary', () => {
  let app: DbHandle;
  let migrate: DbHandle;
  beforeAll(() => {
    app = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
  });
  afterAll(async () => {
    await app?.close();
    await migrate?.close();
  });

  it.each([
    'select id from core.entity_links',
    'insert into core.entity_links (id) values (gen_random_uuid())',
    "update core.entity_links set status = 'detached'",
    'delete from core.entity_links',
    'select id from core.audit_log',
    'select detail from core.audit_log',
    'delete from core.entity_links_app',
  ])('denies app SQL: %s', async (statement) => {
    await expect(app.pool.query(statement)).rejects.toMatchObject({ code: '42501' });
  });

  it('pins effective view/raw privileges, barrier/check option and least-privileged owners', async () => {
    const columns = await migrate.pool.query(`
      select attname from pg_catalog.pg_attribute
      where attrelid in ('core.entity_links'::regclass, 'core.audit_log'::regclass)
        and attnum > 0 and not attisdropped
        and pg_catalog.has_column_privilege('fops_app', attrelid, attname, 'SELECT')
    `);
    expect(columns.rows).toEqual([]);
    const publicView = await migrate.pool.query(`
      select a.privilege_type from pg_catalog.pg_class c,
        lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
      where c.oid = 'core.entity_links_app'::regclass and a.grantee = 0
    `);
    expect(publicView.rows).toEqual([]);
    const privileges = await migrate.pool.query<{
      name: string;
      privilege: string;
      allowed: boolean;
    }>(`
      select name, privilege, pg_catalog.has_table_privilege('fops_app', name, privilege) as allowed
      from unnest(ARRAY['core.entity_links','core.entity_links_app','core.audit_log']) name
      cross join unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege
    `);
    expect(
      privileges.rows
        .filter((r) => r.allowed)
        .map((r) => `${r.name}:${r.privilege}`)
        .sort(),
    ).toEqual([
      'core.audit_log:INSERT',
      'core.entity_links_app:INSERT',
      'core.entity_links_app:SELECT',
      'core.entity_links_app:UPDATE',
    ]);
    const view = await migrate.pool.query<{ owner: string; reloptions: string[] }>(`
      select pg_catalog.pg_get_userbyid(relowner) as owner, reloptions
      from pg_catalog.pg_class where oid = 'core.entity_links_app'::regclass
    `);
    expect(view.rows[0]?.owner).toBe('fops_entity_links_view_owner');
    expect(view.rows[0]?.reloptions).toEqual(
      expect.arrayContaining(['security_barrier=true', 'check_option=cascaded']),
    );
    const owners = [
      'fops_entity_links_view_owner',
      'fops_entity_links_survey_mutator_owner',
      'fops_core_audit_reader_owner',
      'fops_survey_derived_finding_reader_owner',
    ];
    for (const owner of owners) {
      const roles = await migrate.pool.query(
        `
        select rolcanlogin, rolinherit, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls,
          pg_catalog.pg_has_role('fops_app', oid, 'MEMBER') as app_member,
          pg_catalog.pg_has_role(oid, 'fops_migrate', 'MEMBER') as reverse_member,
          pg_catalog.pg_has_role('fops_migrate', oid, 'MEMBER') as migrate_member
        from pg_catalog.pg_roles where rolname = $1`,
        [owner],
      );
      expect(roles.rows).toEqual([
        {
          rolcanlogin: false,
          rolinherit: false,
          rolsuper: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolbypassrls: false,
          app_member: false,
          reverse_member: false,
          migrate_member: true,
        },
      ]);
    }
    for (const [owner, table, expected] of [
      ['fops_entity_links_view_owner', 'core.entity_links', [true, true, true, false]],
      ['fops_entity_links_survey_mutator_owner', 'core.entity_links', [true, true, false, false]],
      ['fops_core_audit_reader_owner', 'core.audit_log', [true, false, false, false]],
      ['fops_survey_evidence_reader_owner', 'core.entity_links', [false, false, false, false]],
      [
        'fops_survey_derived_finding_reader_owner',
        'core.entity_links',
        [true, false, false, false],
      ],
    ] as const) {
      const grants = await migrate.pool.query<{
        read: boolean;
        insert: boolean;
        update: boolean;
        delete: boolean;
        create: boolean;
      }>(
        `
        select pg_catalog.has_any_column_privilege($1::name, $2::text, 'SELECT') as read,
          pg_catalog.has_any_column_privilege($1::name, $2::text, 'INSERT') as insert,
          pg_catalog.has_any_column_privilege($1::name, $2::text, 'UPDATE') as update,
          pg_catalog.has_table_privilege($1::name, $2::text, 'DELETE') as delete,
          pg_catalog.has_schema_privilege($1::name, 'core', 'CREATE') as create`,
        [owner, table],
      );
      const row = grants.rows[0];
      expect([row?.read, row?.insert, row?.update, row?.delete]).toEqual(expected);
      expect(row?.create).toBe(false);
    }
    const definition = await migrate.pool.query<{ definition: string }>(
      "select pg_catalog.pg_get_viewdef('core.entity_links_app'::regclass) as definition",
    );
    expect(definition.rows[0]?.definition).toMatch(/source_type[^\n]*<>[^\n]*survey_response/);
    expect(definition.rows[0]?.definition).toMatch(/target_type[^\n]*<>[^\n]*survey_response/);
    const functions = await migrate.pool.query(`
      select p.proname, pg_catalog.pg_get_userbyid(p.proowner) as owner,
        p.prosecdef, p.proconfig,
        pg_catalog.has_function_privilege('fops_app', p.oid, 'EXECUTE') as app_execute,
        exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,
          pg_catalog.acldefault('f', p.proowner))) a where a.grantee = 0
          and a.privilege_type = 'EXECUTE') as public_execute
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where (n.nspname, p.proname) in (
        ('core','create_survey_finding_link'), ('survey','read_derived_findings'),
        ('core','latest_permission_request_question'), ('core','responsibility_configuration_changes'))
      order by p.proname
    `);
    expect(functions.rows).toHaveLength(4);
    for (const row of functions.rows) {
      expect(row).toMatchObject({ prosecdef: true, app_execute: true, public_execute: false });
      expect(row.proconfig).toEqual(['search_path=pg_catalog']);
    }
    expect(functions.rows.map((r) => [r.proname, r.owner])).toEqual([
      ['create_survey_finding_link', 'fops_entity_links_survey_mutator_owner'],
      ['latest_permission_request_question', 'fops_core_audit_reader_owner'],
      ['read_derived_findings', 'fops_survey_derived_finding_reader_owner'],
      ['responsibility_configuration_changes', 'fops_core_audit_reader_owner'],
    ]);
  });

  it.each(['active', 'stale', 'detached', 'revoked'])(
    'hides retained Survey source history in %s',
    async (status) => {
      const seed = await migrate.pool.query<{ actor_id: string; ms_id: string }>(
        `
      select a.id as actor_id, m.id as ms_id from core.actors a
      join core.managed_systems m on m.workspace_id = a.workspace_id
      where a.workspace_id = $1 limit 1`,
        [WORKSPACE_ID],
      );
      const row = seed.rows[0];
      if (!row) throw new Error('canonical seed required');
      const id = randomUUID();
      const responseId = randomUUID();
      try {
        await migrate.pool.query(
          `insert into core.entity_links
        (id, workspace_id, source_type, source_id, target_type, target_id,
         relation_type, status, managed_system_id, created_by)
        values ($1,$2,'survey_response',$3,'finding',$4,'generated_finding',$5,$6,$7)`,
          [id, WORKSPACE_ID, responseId, randomUUID(), status, row.ms_id, row.actor_id],
        );
        const visible = await app.pool.query('select id from core.entity_links_app where id = $1', [
          id,
        ]);
        expect(visible.rows).toEqual([]);
        const history = await migrate.pool.query(
          'select source_id, status from core.entity_links where id = $1',
          [id],
        );
        expect(history.rows).toEqual([{ source_id: responseId, status }]);
      } finally {
        await migrate.pool.query('delete from core.entity_links where id = $1', [id]);
      }
    },
  );

  it('rejects inserts and updates that escape the ordinary view predicate', async () => {
    const seed = await migrate.pool.query<{ actor_id: string; ms_id: string }>(
      `
      select a.id as actor_id, m.id as ms_id from core.actors a
      join core.managed_systems m on m.workspace_id = a.workspace_id
      where a.workspace_id = $1 limit 1`,
      [WORKSPACE_ID],
    );
    const row = seed.rows[0];
    if (!row) throw new Error('canonical seed required');
    const id = randomUUID();
    try {
      await app.pool.query(
        `insert into core.entity_links_app
        (id, workspace_id, source_type, source_id, target_type, target_id,
         relation_type, managed_system_id, created_by)
        values ($1,$2,'voc',$3,'finding',$4,'created_finding',$5,$6)`,
        [id, WORKSPACE_ID, randomUUID(), randomUUID(), row.ms_id, row.actor_id],
      );
      await expect(
        app.pool.query(
          `update core.entity_links_app
        set source_type = 'survey_response', relation_type = 'generated_finding' where id = $1`,
          [id],
        ),
      ).rejects.toMatchObject({ code: '44000' });
      await expect(
        app.pool.query(
          `insert into core.entity_links_app
        (workspace_id, source_type, source_id, target_type, target_id,
         relation_type, managed_system_id, created_by)
        values ($1,'survey_response',$2,'finding',$3,'generated_finding',$4,$5)`,
          [WORKSPACE_ID, randomUUID(), randomUUID(), row.ms_id, row.actor_id],
        ),
      ).rejects.toMatchObject({ code: '44000' });
    } finally {
      await migrate.pool.query('delete from core.entity_links where id = $1', [id]);
    }
  });
  it('pins the bounded inventory definer ACL without restoring private app reads', async () => {
    const metadata = await migrate.pool.query(
      `select pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proconfig,
        has_function_privilege('fops_app',p.oid,'EXECUTE') as app_execute,
        exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute,
        has_schema_privilege('fops_survey_evidence_reader_owner','survey','CREATE') as owner_create,
        pg_has_role('fops_app','fops_survey_evidence_reader_owner','MEMBER') as app_member
       from pg_proc p where p.oid='survey.read_inventory_highlight_evidence(uuid,uuid[])'::regprocedure`,
    );
    expect(metadata.rows).toEqual([
      {
        owner: 'fops_survey_evidence_reader_owner',
        prosecdef: true,
        proconfig: ['search_path=pg_catalog'],
        app_execute: true,
        public_execute: false,
        owner_create: false,
        app_member: false,
      },
    ]);
    for (const table of [
      'survey.highlight_response_bindings',
      'survey.finding_response_bindings',
    ]) {
      await expect(app.pool.query(`select * from ${table} limit 1`)).rejects.toMatchObject({
        code: '42501',
      });
    }
    expect(
      (
        await app.pool.query(
          'select * from survey.read_inventory_highlight_evidence($1,$2::uuid[])',
          [WORKSPACE_ID, []],
        )
      ).rows,
    ).toEqual([]);
    await expect(
      app.pool.query('select * from survey.read_inventory_highlight_evidence($1,$2::uuid[])', [
        WORKSPACE_ID,
        Array.from({ length: 101 }, () => randomUUID()),
      ]),
    ).rejects.toMatchObject({ code: '22023' });
  });

  it('#1109 pins the exact attachment link witness and consistency-check column grants', async () => {
    for (const [owner, table, expected] of [
      [
        'fops_entity_links_survey_mutator_owner',
        'survey.highlight_response_bindings',
        ['highlight_id', 'response_id', 'workspace_id'],
      ],
      [
        'fops_entity_links_survey_mutator_owner',
        'finding.evidence_highlights',
        ['finding_id', 'id', 'source_type', 'workspace_id'],
      ],
      [
        'fops_survey_provenance_mutator_owner',
        'core.entity_links',
        [
          'relation_type',
          'source_id',
          'source_type',
          'status',
          'target_id',
          'target_type',
          'visibility',
          'workspace_id',
        ],
      ],
    ] as const) {
      const acl = await migrate.pool.query<{ column_name: string }>(
        `select attname as column_name from pg_attribute where attrelid=$2::regclass and attnum>0 and not attisdropped
          and has_column_privilege($1::name,attrelid,attname,'SELECT') order by attname`,
        [owner, table],
      );
      expect(acl.rows.map((row) => row.column_name)).toEqual(expected);
      const write = await migrate.pool.query(
        `select has_any_column_privilege($1::name,$2::text,'INSERT,UPDATE') or
          has_table_privilege($1::name,$2::text,'DELETE,TRUNCATE') as allowed`,
        [owner, table],
      );
      expect(write.rows[0]?.allowed).toBe(false);
    }
  });
});
