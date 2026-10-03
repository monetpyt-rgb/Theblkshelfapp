import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { localModule } from "./module-loader.mjs";
import { backupToSql } from "../scripts/reader-backup-to-sql.mjs";

const ONE = "11111111-1111-4111-8111-111111111111";
const TWO = "22222222-2222-4222-8222-222222222222";
const schema = readFileSync(new URL("../supabase/reader-schema.sql", import.meta.url), "utf8");
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    create table public.public_library_books("Book_ID" text primary key);
    insert into public.public_library_books values ('book-a'),('book-b');
    grant select on public.public_library_books to anon,authenticated;
    insert into auth.users values ('${ONE}','private-one@example.com'),('${TWO}','private-two@example.com');`);
  await db.exec(schema);
  await db.exec(schema); // The setup may be run again without clearing reader data.
  return db;
}
async function reader(db, userId = null, role = "authenticated") {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId || ""]);
  await db.exec(`set role ${role};`);
}

test("Postgres protects each reader, preserves partial shelf updates, and publishes only safe review fields", async () => {
  const db = await database();
  try {
    await reader(db,ONE);
    await db.query("select public.blk_shelf_set_book($1,$2,$3)", ["book-a","Reading",true]);
    await db.query("select public.blk_shelf_set_book($1,$2,$3)", ["book-a",null,false]);
    assert.deepEqual((await db.query("select status,favorite from public.blk_shelf_reader_shelves")).rows,[{status:"Reading",favorite:false}]);
    await db.query("select public.blk_shelf_set_book($1,$2,$3)", ["book-a","Finished",null]);
    await db.query("select public.blk_shelf_set_book($1,$2,$3)", ["book-a",null,true]);
    assert.deepEqual((await db.query("select status,favorite from public.blk_shelf_reader_shelves")).rows,[{status:"Finished",favorite:true}]);
    const { sentenceCount, reviewError } = await import(localModule("lib/review-rules.ts"));
    const examples = ["The pacing was slow. I needed more depth.","Dr. Jones was boring.","This... felt slow.",". .","A 2.5 rating. I needed more depth!","e.g. this example is slow.","Émotion was missing. It needed more tension."];
    for (const text of examples) assert.equal((await db.query("select public.blk_shelf_sentence_count($1) as count",[text])).rows[0].count,sentenceCount(text));
    for (const rating of [1,2,3]) {
      assert.ok(reviewError(rating,"Only one sentence."));
      await assert.rejects(db.query("select public.blk_shelf_set_review($1,$2,$3)",["book-a",rating,"Only one sentence."]),/blk_shelf_low_rating_review/);
    }
    await db.query("select public.blk_shelf_set_review($1,$2,$3)",["book-a",3,examples[0]]);
    const id = (await db.query("select id from public.blk_shelf_reader_reviews")).rows[0].id;
    await db.query("select public.blk_shelf_set_review($1,$2,$3)",["book-a",5,""]);
    assert.equal((await db.query("select id from public.blk_shelf_reader_reviews")).rows[0].id,id);
    await assert.rejects(db.query("select public.blk_shelf_set_review($1,$2,$3)",["missing",5,""]),/not available/);
    await assert.rejects(db.query("insert into public.blk_shelf_reader_reviews(user_id,book_id,rating) values ($1,'book-b',5)",[ONE]),/permission denied/);
    await db.query("insert into public.blk_shelf_reader_profiles(user_id,display_name) values ($1,$2)",[ONE,"Public Reader"]);
    await db.query("insert into public.blk_shelf_reader_favorite_authors(user_id,author_id) values ($1,'author-a')",[ONE]);
    await reader(db,TWO);
    for (const table of ["shelves","profiles","reviews","favorite_authors","dismissed_releases"]) assert.equal((await db.query(`select * from public.blk_shelf_reader_${table}`)).rows.length,0);
    await assert.rejects(db.query("insert into public.blk_shelf_reader_shelves(user_id,book_id,status) values ($1,'book-b','Reading')",[ONE]),/row-level security/);
    assert.equal((await db.query("delete from public.blk_shelf_reader_shelves where user_id=$1 returning book_id",[ONE])).rows.length,0);
    await reader(db,null,"anon");
    await assert.rejects(db.query("select * from public.blk_shelf_reader_profiles"),/permission denied/);
    await assert.rejects(db.query("select public.blk_shelf_set_book('book-b','Reading',true)"),/permission denied/);
    const visible = (await db.query("select public.blk_shelf_book_reviews('book-a',0) as data")).rows[0].data;
    assert.equal(visible.count,1); assert.equal(visible.mine,null);
    assert.equal(visible.reviews[0].displayName,"Public Reader");
    const published = JSON.stringify(visible);
    for (const secret of [ONE,TWO,"private-one@example.com","private-two@example.com"]) assert.ok(!published.includes(secret));
    await reader(db,ONE);
    const profile = (await db.query("select public.blk_shelf_get_profile(0) as data")).rows[0].data;
    assert.equal(profile.displayName,"Public Reader"); assert.equal(profile.reviewCount,1);
    assert.equal(profile.reviews[0].bookId,"book-a");
  } finally { await db.close(); }
});

test("backup import keeps account IDs and favorites, is idempotent, and does not overwrite newer reader changes", async () => {
  const db = await database();
  const empty = { reader_profiles:[],reader_shelves:[],reader_reviews:[],reader_favorite_authors:[],reader_dismissed_releases:[] };
  const backup = { complete:true,tables:{...empty,
    reader_profiles:[{user_id:ONE,display_name:"O'Reader",updated_at:"2026-10-01T10:00:00Z"}],
    reader_shelves:[{user_id:ONE,book_id:"book-a",status:"Favorites",favorite:0,updated_at:"2026-10-01T10:00:00Z"}],
  }};
  try {
    const sql=backupToSql(backup); await db.exec(sql); await db.exec(sql);
    assert.deepEqual((await db.query("select status,favorite from public.blk_shelf_reader_shelves")).rows,[{status:"Want to Read",favorite:true}]);
    assert.equal((await db.query("select display_name from public.blk_shelf_reader_profiles")).rows[0].display_name,"O'Reader");
    await db.query("update public.blk_shelf_reader_shelves set status='Finished',updated_at='2026-10-02T10:00:00Z'");
    await db.exec(sql);
    assert.equal((await db.query("select status from public.blk_shelf_reader_shelves")).rows[0].status,"Finished");
    assert.throws(()=>backupToSql({...backup,complete:false}),/complete/);
  } finally { await db.close(); }
});

test("Vercel API validates login and review rules and forwards the reader JWT to Supabase", async () => {
  const routes = {};
  for (const name of ["shelf","reader-profile","author-favorites","reviews"]) routes[name] = await import(localModule(`app/api/${name}/route.ts`));
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url=new URL(input); const headers=new Headers(init.headers); const token=headers.get("authorization");
    const payload=init.body?JSON.parse(init.body):null;
    calls.push({url,headers,init,payload});
    if (url.pathname==="/auth/v1/user") return token==="Bearer invalid"?Response.json({}, {status:401}):Response.json({id:token==="Bearer two"?TWO:ONE});
    if (url.pathname.endsWith("public_library_books")) return Response.json([{Book_ID:"book-a"}]);
    if (url.pathname.endsWith("/rpc/blk_shelf_get_profile")) return Response.json({displayName:"Public Reader",reviewCount:0,reviews:[]});
    if (url.pathname.endsWith("/rpc/blk_shelf_book_reviews")) return Response.json({reviews:[],count:0,average:0,mine:null,displayName:"Reader"});
    if (url.pathname.includes("/rpc/")) return Response.json(null);
    if (init.method==="POST" || init.method==="DELETE") return new Response(null,{status:204});
    assert.equal(url.searchParams.get("user_id"),`eq.${token==="Bearer two"?TWO:ONE}`);
    return Response.json([]);
  };
  const req=(name,method="GET",body=null,token="one")=>new Request(`https://app.example/api/${name}${name==="reviews"?"?bookId=book-a":""}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)} : {})});
  try {
    for (const name of ["shelf","reader-profile","author-favorites"]) {
      assert.equal((await routes[name].GET(req(name,"GET",null,null))).status,401);
      assert.equal((await routes[name].GET(req(name,"GET",null,"invalid"))).status,401);
      assert.equal((await routes[name].GET(req(name))).status,200);
    }
    assert.equal((await routes.shelf.PUT(req("shelf","PUT",{bookId:"book-a",favorite:true}))).status,200);
    const shelfCall=calls.find(call=>call.url.pathname.endsWith("/rpc/blk_shelf_set_book"));
    assert.deepEqual(shelfCall.payload,{p_book_id:"book-a",p_status:null,p_favorite:true});
    assert.equal(shelfCall.headers.get("authorization"),"Bearer one");
    assert.equal(shelfCall.init.cache,"no-store");
    assert.equal((await routes.shelf.PUT(req("shelf","PUT",{bookId:"book-a",status:"invalid"}))).status,400);
    assert.equal((await routes.shelf.POST(req("shelf","POST",{items:"invalid"}))).status,400);
    assert.equal((await routes["reader-profile"].PUT(req("reader-profile","PUT",{displayName:"Public Reader"}))).status,200);
    assert.equal(calls.find(call=>call.payload?.display_name).payload.user_id,ONE);
    assert.equal((await routes["author-favorites"].PUT(req("author-favorites","PUT",{authorId:"author-a",favorite:true}))).status,200);
    assert.equal((await routes["author-favorites"].PUT(req("author-favorites","PUT",{authorId:"author-a",favorite:"yes"}))).status,400);
    assert.equal((await routes.reviews.PUT(req("reviews","PUT",{bookId:"book-a",rating:3,review:"Only one sentence."}))).status,400);
    assert.equal((await routes.reviews.PUT(req("reviews","PUT",{bookId:"book-a",rating:3,review:"The pacing was slow. I needed more depth."}))).status,200);
    assert.equal((await routes.reviews.PUT(req("reviews","PUT",{bookId:"book-a",rating:5},null))).status,401);
    const anonymous=await routes.reviews.GET(req("reviews","GET",null,null));
    assert.equal(anonymous.status,200); assert.match(anonymous.headers.get("cache-control"),/no-store/);
    await routes.shelf.GET(req("shelf","GET",null,"two"));
    const last=calls.at(-1); assert.equal(last.headers.get("authorization"),"Bearer two"); assert.equal(last.url.searchParams.get("user_id"),`eq.${TWO}`);
  } finally { globalThis.fetch=originalFetch; }
});
