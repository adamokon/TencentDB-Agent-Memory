import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, symlinkSync, lstatSync, existsSync, mkdirSync, truncateSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { createDb } from "../src/db/client.js";
import { SqliteKnowledgeStore } from "../src/store/sqlite-store.js";
import { WikiService } from "../src/store/wiki-service.js";
import { createWikiSourceManager } from "../src/engines/wiki/manager.js";
import { createWikiRoutes } from "../src/routes/wiki.js";
import { accessLog } from "../src/middleware/response-envelope.js";

const created: Array<{ root: string; raw: ReturnType<typeof createDb>["raw"] }> = [];
afterEach(() => { for (const { root, raw } of created.splice(0)) { raw.close(); rmSync(root, { recursive: true, force: true }); } vi.restoreAllMocks(); });
function setup() {
  vi.spyOn(globalThis,"fetch").mockImplementation(async()=>{throw new Error("Network forbidden in synthetic API tests")});
  const root = mkdtempSync(join(tmpdir(), "okf-api-"));
  const { db, raw } = createDb({ path: ":memory:" }); created.push({ root, raw });
  const store = new SqliteKnowledgeStore(db);
  const worker = vi.fn(async () => ({}));
  const warn = vi.fn();
  const service = new WikiService({ store, dataRoot: join(root, "data"), worker, logger: { warn } });
  const manager = createWikiSourceManager(join(root, "manager"));
  const row = service.create({ service_id: "service-a", team_id: "team-a", name: "Knowledge" }).row;
  const app = new Hono(); app.use("*", createServiceAuthMiddleware({serviceKey:"synthetic-only-key"},"/wiki")); app.use("*", accessLog());
  app.route("/wiki", createWikiRoutes({ wikiService: service, wikiMgr: manager, publicBaseUrl: "http://test/wiki" }));
  const post = (path: string, body: unknown, serviceId = "service-a", token = "synthetic-only-key") => app.request(`/wiki/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization":"Bearer "+token, "x-tdai-service-id": serviceId }, body: JSON.stringify(body),
  });
  return { service, manager, store, worker, row, post, root, warn };
}

import { createServiceAuthMiddleware } from "../src/middleware/auth.js";

const page=(body:string)=>"---\ntype: concept\ntitle: Synthetic\n---\n"+body;
describe("candidate actual HTTP routes and store, synthetic data only",()=>{
 it.each(["\ud800","\udc00","x\ud800y"])("rejects malformed text without semantic row or document changes %j",async bad=>{
 const {row,post,store,service,worker}=setup();const before=store.getWikiById("service-a",row.wiki_id);
 const files=[{path:"a.md",content:page("valid")},{path:"b.md",content:page(bad)}];
 expect((await post("okf/validate",{files})).status).toBe(400);
 expect((await post("okf/import",{team_id:"team-a",wiki_id:row.wiki_id,files})).status).toBe(400);
 const after=store.getWikiById("service-a",row.wiki_id)!;expect({...after,updated_at:before!.updated_at}).toEqual(before);
 expect(existsSync(join(service.dirFor("service-a","team-a",row.wiki_id),"wiki/a.md"))).toBe(false);
 expect(worker).not.toHaveBeenCalled();
 });
 it.each(["ASCII","\ufffd","\ud83d\ude42"])("preserves valid Markdown through authenticated import/export %j",async body=>{
 const {row,post,service,worker}=setup();const content=page(body);const ids={team_id:"team-a",wiki_id:row.wiki_id};
 expect((await post("okf/import",{...ids,files:[{path:"a.md",content}]})).status).toBe(200);
 expect(readFileSync(join(service.dirFor("service-a","team-a",row.wiki_id),"wiki/a.md"),"utf8")).toBe(content);
 const out=await post("okf/export",ids);expect(out.status).toBe(200);expect(JSON.stringify(await out.json())).toContain(Buffer.from(content).toString("base64"));expect(worker).not.toHaveBeenCalled();
 });
 it("retains binary base64 bytes",async()=>{const {row,post,service,worker}=setup();expect((await post("okf/import",{team_id:"team-a",wiki_id:row.wiki_id,files:[{path:"a.bin",content:"/w==",encoding:"base64"}]})).status).toBe(200);expect(readFileSync(join(service.dirFor("service-a","team-a",row.wiki_id),"wiki/a.bin"))).toEqual(Buffer.from([255]));expect(worker).not.toHaveBeenCalled()});
 it.each(["","wrong"])("rejects invalid authentication %j",async token=>{const {row,post,store,worker}=setup();const before=store.getWikiById("service-a",row.wiki_id);expect((await post("okf/import",{team_id:"team-a",wiki_id:row.wiki_id,files:[{path:"a.md",content:page("safe")}]},"service-a",token)).status).toBe(401);expect(store.getWikiById("service-a",row.wiki_id)).toEqual(before);expect(worker).not.toHaveBeenCalled()});
});
