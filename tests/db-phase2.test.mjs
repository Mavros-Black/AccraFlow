import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const ids = {
  orgA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  orgB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  resident: "10000000-0000-4000-8000-000000000001",
  other: "10000000-0000-4000-8000-000000000002",
  moderator: "10000000-0000-4000-8000-000000000003",
  operator: "10000000-0000-4000-8000-000000000004",
  outsider: "10000000-0000-4000-8000-000000000005",
  admin: "10000000-0000-4000-8000-000000000006",
};

test(
  "PostGIS schema enforces organization isolation and atomic workflows",
  { timeout: 120000 },
  async () => {
    const db = await PGlite.create({ extensions: { postgis, pgcrypto } });
    try {
      // Minimal local Supabase Auth stand-in. PGlite exercises PostgreSQL RLS and
      // PostGIS but does not replace an integration test against Supabase itself.
      await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
      await db.exec(
        await readFile("supabase/migrations/202611140001_phase2.sql", "utf8"),
      );
      await db.exec(`grant usage on schema extensions to authenticated;
    create schema storage; create table storage.objects(bucket_id text not null,name text not null,owner_id text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security; grant usage on schema storage to authenticated, anon; grant select,insert,update,delete on storage.objects to authenticated, anon;
    create policy unrelated_broad_storage_policy on storage.objects for all to authenticated, anon using (true) with check (true);`);
      await db.exec(
        await readFile(
          "supabase/migrations/202611140002_private_photos.sql",
          "utf8",
        ),
      );
      for (const migration of [
        "202611140003_withdrawn_status.sql",
        "202611140004_incident_corrections.sql",
        "202611140005_maintenance_due_dates.sql",
      ]) {
        await db.exec(
          await readFile(`supabase/migrations/${migration}`, "utf8"),
        );
      }
      for (const [name, id] of Object.entries(ids).filter(
        ([key]) => !key.startsWith("org"),
      ))
        await db.query(
          "insert into auth.users(id,raw_user_meta_data) values ($1,$2)",
          [id, JSON.stringify({ display_name: name })],
        );
      await db.query(
        "insert into public.organizations(id,name) values ($1,$2),($3,$4)",
        [ids.orgA, "Organization A", ids.orgB, "Organization B"],
      );
      for (const [user, role, org] of [
        [ids.resident, "resident", ids.orgA],
        [ids.other, "resident", ids.orgA],
        [ids.moderator, "moderator", ids.orgA],
        [ids.operator, "operator", ids.orgA],
        [ids.admin, "admin", ids.orgA],
        [ids.outsider, "operator", ids.orgB],
      ])
        await db.query(
          "insert into public.memberships(organization_id,user_id,role) values($1,$2,$3)",
          [org, user, role],
        );
      async function asUser(id, fn) {
        await db.exec("set role authenticated");
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          id,
        ]);
        try {
          return await fn();
        } finally {
          await db.exec("reset role");
        }
      }
      const submit = (org, title = "Synthetic blocked drain") =>
        db.query("select public.submit_incident($1,$2,$3,$4,$5,$6) as id", [
          org,
          title,
          "This is a sufficiently detailed report.",
          "blockage",
          -0.21,
          5.58,
        ]);
      const id = await asUser(ids.resident, async () => {
        await assert.rejects(() => submit(ids.orgB), /not authorized/);
        await assert.rejects(
          () =>
            db.query("select * from public.list_assignable_operators($1)", [
              ids.orgA,
            ]),
          /not authorized/,
        );
        await assert.rejects(
          () =>
            db.query("insert into public.incidents(title) values ($1)", [
              "unauthorized",
            ]),
          /permission denied/,
        );
        return (await submit(ids.orgA)).rows[0].id;
      });
      const photoId = "20000000-0000-4000-8000-000000000001";
      const photoPath = `${ids.orgA}/${id}/${photoId}.jpg`;
      await db.exec("set role anon");
      try {
        assert.equal(
          (
            await db.query(
              "select name from storage.objects where bucket_id='accraflow-incident-photos'",
            )
          ).rows.length,
          0,
        );
      } finally {
        await db.exec("reset role");
      }
      await asUser(ids.resident, async () => {
        await db.query(
          "insert into storage.objects(bucket_id,name,owner_id,metadata) values('accraflow-incident-photos',$1,$2,$3)",
          [photoPath, ids.resident, JSON.stringify({ size: 100 })],
        );
        await assert.rejects(
          () =>
            db.query("select public.register_incident_photo($1,$2,$3)", [
              id,
              photoId,
              99,
            ]),
          /size mismatch/,
        );
        await db.query("select public.register_incident_photo($1,$2,$3)", [
          id,
          photoId,
          100,
        ]);
        assert.equal(
          (
            await db.query(
              "select id from public.incident_photos where incident_id=$1",
              [id],
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query(
              "delete from storage.objects where name=$1 returning name",
              [photoPath],
            )
          ).rows.length,
          0,
          "registered photos cannot be deleted through client access",
        );
      });
      await db.exec("set role anon");
      try {
        assert.equal(
          (
            await db.query(
              "select name from storage.objects where bucket_id='accraflow-incident-photos'",
            )
          ).rows.length,
          0,
          "anonymous users cannot read existing photos despite a broad policy",
        );
      } finally {
        await db.exec("reset role");
      }
      await asUser(ids.resident, async () => {
        assert.equal(
          (
            await db.query(
              "update storage.objects set metadata='{}' where name=$1 returning name",
              [photoPath],
            )
          ).rows.length,
          0,
          "registered objects cannot be updated despite a broad policy",
        );
        await db.query(
          "insert into storage.objects(bucket_id,name,owner_id) values('another-bucket','example',$1)",
          [ids.resident],
        );
        assert.equal(
          (
            await db.query(
              "select name from storage.objects where bucket_id='another-bucket'",
            )
          ).rows.length,
          1,
          "guard does not restrict other buckets",
        );
      });
      await asUser(ids.other, async () => {
        assert.equal(
          (
            await db.query("select name from storage.objects where name=$1", [
              photoPath,
            ])
          ).rows.length,
          0,
          "another resident cannot read the photo",
        );
        assert.equal(
          (
            await db.query(
              "select id from public.incident_photos where incident_id=$1",
              [id],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          () =>
            db.query(
              "insert into storage.objects(bucket_id,name,owner_id,metadata) values('accraflow-incident-photos',$1,$2,$3)",
              [
                `${ids.orgA}/${id}/20000000-0000-4000-8000-000000000002.jpg`,
                ids.other,
                JSON.stringify({ size: 100 }),
              ],
            ),
          /row-level security/,
        );
        assert.equal(
          (
            await db.query("select * from public.list_incidents($1)", [
              ids.orgA,
            ])
          ).rows.length,
          0,
          "unverified reports are private to their reporter",
        );
        assert.equal(
          (
            await db.query(
              "select * from public.incident_status_history where incident_id=$1",
              [id],
            )
          ).rows.length,
          0,
          "history follows incident visibility",
        );
        await assert.rejects(
          () =>
            db.query(
              "select public.transition_incident($1,'under_review',null)",
              [id],
            ),
          /not authorized/,
        );
      });
      await asUser(ids.outsider, async () => {
        assert.equal(
          (
            await db.query("select * from public.list_incidents($1)", [
              ids.orgA,
            ])
          ).rows.length,
          0,
          "cross-organization reads are hidden",
        );
        assert.equal(
          (
            await db.query("select name from storage.objects where name=$1", [
              photoPath,
            ])
          ).rows.length,
          0,
          "other organizations cannot read the photo",
        );
        await assert.rejects(
          () =>
            db.query(
              "select public.transition_incident($1,'under_review',null)",
              [id],
            ),
          /not authorized/,
        );
      });
      await asUser(ids.moderator, async () => {
        assert.equal(
          (
            await db.query("select * from public.list_incidents($1)", [
              ids.orgA,
            ])
          ).rows.length,
          1,
        );
        await assert.rejects(
          () =>
            db.query("select public.transition_incident($1,'verified',null)", [
              id,
            ]),
          /invalid status transition/,
        );
        await db.query(
          "select public.transition_incident($1,'under_review',null)",
          [id],
        );
        await assert.rejects(
          () =>
            db.query("select public.transition_incident($1,'rejected','no')", [
              id,
            ]),
          /reason required/,
        );
        await db.query(
          "select public.transition_incident($1,'verified',null)",
          [id],
        );
        await assert.rejects(
          () =>
            db.query("select public.transition_incident($1,'assigned',null)", [
              id,
            ]),
          /operator role required/,
        );
        await assert.rejects(
          () =>
            db.query(
              "delete from public.incident_status_history where incident_id=$1",
              [id],
            ),
          /permission denied/,
        );
      });
      await asUser(ids.operator, async () => {
        const roster = await db.query(
          "select * from public.list_assignable_operators($1)",
          [ids.orgA],
        );
        assert.deepEqual(
          roster.rows.map((row) => row.user_id),
          [ids.admin, ids.operator],
          "roster excludes residents and operators in other organizations",
        );
        await assert.rejects(
          () =>
            db.query("select * from public.list_assignable_operators($1)", [
              ids.orgB,
            ]),
          /not authorized/,
        );
        const order = (
          await db.query(
            "select public.create_maintenance_task($1,'Inspect and clear drain','high',null) as id",
            [id],
          )
        ).rows[0].id;
        await assert.rejects(
          () =>
            db.query(
              "select public.create_maintenance_task($1,'Second active work order','medium',null)",
              [id],
            ),
          /duplicate key/,
        );
        await assert.rejects(
          () =>
            db.query("select public.assign_maintenance_task($1,$2)", [
              order,
              ids.outsider,
            ]),
          /assignee must be an operator/,
        );
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          ids.resident,
        ]);
        await assert.rejects(
          () =>
            db.query("select public.set_maintenance_due_at($1,$2)", [
              order,
              "2030-03-10T23:59:59.999Z",
            ]),
          /not authorized/,
        );
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          ids.outsider,
        ]);
        await assert.rejects(
          () =>
            db.query("select public.set_maintenance_due_at($1,$2)", [
              order,
              "2030-03-10T23:59:59.999Z",
            ]),
          /not authorized/,
        );
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          ids.operator,
        ]);
        await assert.rejects(
          () =>
            db.query("select public.set_maintenance_due_at($1,'infinity')", [
              order,
            ]),
          /invalid due date/,
        );
        await db.query("select public.set_maintenance_due_at($1,$2)", [
          order,
          "2030-03-10T23:59:59.999Z",
        ]);
        await db.query("select public.set_maintenance_due_at($1,$2)", [
          order,
          "2030-03-10T23:59:59.999Z",
        ]);
        assert.equal(
          (
            await db.query(
              "select due_at from public.maintenance_tasks where id=$1",
              [order],
            )
          ).rows[0].due_at.toISOString(),
          "2030-03-10T23:59:59.999Z",
        );
        await db.query("select public.set_maintenance_due_at($1,null)", [
          order,
        ]);
        assert.equal(
          (
            await db.query(
              "select due_at from public.maintenance_tasks where id=$1",
              [order],
            )
          ).rows[0].due_at,
          null,
        );
        await db.query("select public.assign_maintenance_task($1,$2)", [
          order,
          ids.operator,
        ]);
        await assert.rejects(
          () =>
            db.query("select public.complete_maintenance_task($1,$2)", [
              order,
              "no",
            ]),
          /completion notes required/,
        );
        await db.query("select public.complete_maintenance_task($1,$2)", [
          order,
          "Demo work completion notes",
        ]);
        await assert.rejects(
          () =>
            db.query("select public.set_maintenance_due_at($1,$2)", [
              order,
              "2030-03-10T23:59:59.999Z",
            ]),
          /task is closed/,
        );
        await db.query(
          "select public.transition_incident($1,'assigned',null)",
          [id],
        );
        await db.query(
          "select public.transition_incident($1,'in_progress',null)",
          [id],
        );
        await db.query(
          "select public.transition_incident($1,'resolved',null)",
          [id],
        );
        const history = await db.query(
          "select new_status from public.incident_status_history where incident_id=$1 order by created_at",
          [id],
        );
        assert.deepEqual(
          history.rows.map((row) => row.new_status),
          [
            "submitted",
            "under_review",
            "verified",
            "assigned",
            "in_progress",
            "resolved",
          ],
        );
        await assert.rejects(
          () =>
            db.query("select public.transition_incident($1,'submitted',null)", [
              id,
            ]),
          /invalid status transition/,
        );
      });
      const edit = (incident, title = "Corrected drain report") =>
        db.query(
          "select public.edit_submitted_incident($1,$2,$3,'blockage',-0.2,5.6)",
          [incident, title, "Corrected description of the blockage."],
        );
      const editable = await asUser(
        ids.resident,
        async () =>
          (await submit(ids.orgA, "New report for correction")).rows[0].id,
      );
      await asUser(ids.other, async () => {
        await assert.rejects(() => edit(editable), /not authorized/);
        await assert.rejects(
          () =>
            db.query("select public.withdraw_submitted_incident($1)", [
              editable,
            ]),
          /not authorized/,
        );
      });
      await asUser(ids.outsider, async () => {
        await assert.rejects(() => edit(editable), /not authorized/);
      });
      await asUser(ids.resident, async () => {
        await edit(editable);
        const row = (
          await db.query(
            "select title,longitude,latitude from public.list_incidents($1) where id=$2",
            [ids.orgA, editable],
          )
        ).rows[0];
        assert.deepEqual(row, {
          title: "Corrected drain report",
          longitude: -0.2,
          latitude: 5.6,
        });
        await db.query("select public.withdraw_submitted_incident($1)", [
          editable,
        ]);
        await assert.rejects(() => edit(editable), /no longer editable/);
        await assert.rejects(
          () =>
            db.query("select public.withdraw_submitted_incident($1)", [
              editable,
            ]),
          /no longer be withdrawn/,
        );
        assert.deepEqual(
          (
            await db.query(
              "select new_status from public.incident_status_history where incident_id=$1 order by created_at",
              [editable],
            )
          ).rows.map((r) => r.new_status),
          ["submitted", "withdrawn"],
        );
        await assert.rejects(() => edit(id), /no longer editable/);
      });
      const inReview = await asUser(
        ids.resident,
        async () => (await submit(ids.orgA, "Report now in review")).rows[0].id,
      );
      await asUser(ids.moderator, async () =>
        db.query("select public.transition_incident($1,'under_review',null)", [
          inReview,
        ]),
      );
      await asUser(ids.resident, async () => {
        await assert.rejects(() => edit(inReview), /no longer editable/);
        await assert.rejects(
          () =>
            db.query("select public.withdraw_submitted_incident($1)", [
              inReview,
            ]),
          /no longer be withdrawn/,
        );
      });
      await asUser(ids.moderator, async () => {
        await assert.rejects(
          () =>
            db.query(
              "select public.transition_incident($1,'under_review',null)",
              [editable],
            ),
          /invalid status transition/,
        );
      });
      assert.deepEqual(
        (
          await db.query(
            "select action from public.audit_logs where entity_id=$1 order by created_at",
            [editable],
          )
        ).rows.map((r) => r.action),
        ["incident.submitted", "incident.edited", "incident.withdrawn"],
      );
      await asUser(ids.resident, async () => {
        await assert.rejects(
          () =>
            db.query("select * from public.list_organization_members($1)", [
              ids.orgA,
            ]),
          /not authorized/,
        );
        await assert.rejects(
          () =>
            db.query("select public.set_organization_member($1,$2,'admin')", [
              ids.orgA,
              ids.resident,
            ]),
          /not authorized/,
        );
      });
      await asUser(ids.admin, async () => {
        await assert.rejects(
          () =>
            db.query("select public.deactivate_organization_member($1,$2)", [
              ids.orgA,
              ids.admin,
            ]),
          /last active admin/,
        );
        await assert.rejects(
          () =>
            db.query(
              "select public.set_organization_member($1,$2,'resident')",
              [ids.orgA, ids.admin],
            ),
          /last active admin/,
        );
        await db.query(
          "select public.set_organization_member($1,$2,'operator')",
          [ids.orgA, ids.other],
        );
        const members = await db.query(
          "select * from public.list_organization_members($1)",
          [ids.orgA],
        );
        assert.equal(
          members.rows.find((row) => row.user_id === ids.other).role,
          "operator",
        );
        await db.query("select public.deactivate_organization_member($1,$2)", [
          ids.orgA,
          ids.resident,
        ]);
      });
      await asUser(ids.resident, async () => {
        assert.equal(
          (
            await db.query("select * from public.list_incidents($1)", [
              ids.orgA,
            ])
          ).rows.length,
          0,
          "inactive members immediately lose access",
        );
        assert.equal(
          (
            await db.query("select name from storage.objects where name=$1", [
              photoPath,
            ])
          ).rows.length,
          0,
          "inactive members cannot read photos",
        );
        await assert.rejects(() => submit(ids.orgA), /not authorized/);
      });
      const dueLogs = await db.query(
        "select metadata from public.audit_logs where action='maintenance.due_date_changed' order by created_at",
      );
      assert.equal(
        dueLogs.rows.length,
        2,
        "changing and clearing a due date are audited, duplicate updates are not",
      );
      assert.equal(dueLogs.rows[0].metadata.previous_due_at, null);
      assert.equal(dueLogs.rows[1].metadata.due_at, null);
      const logs = await db.query(
        "select action from public.audit_logs where entity_id=$1",
        [id],
      );
      assert.equal(
        logs.rows.filter((row) => row.action !== "incident.photo_added").length,
        6,
        "every incident state change has an audit record",
      );
      assert.equal(
        logs.rows.filter((row) => row.action === "incident.photo_added").length,
        1,
        "photo registration is audited",
      );
    } finally {
      await db.close();
    }
  },
);
