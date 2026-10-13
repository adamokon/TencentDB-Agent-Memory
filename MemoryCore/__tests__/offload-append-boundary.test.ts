import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendOffloadEntries, createStorageContext, ensureDirs } from "../src/offload/storage.js";
import type { OffloadEntry } from "../src/offload/types.js";
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>fs.rm(root,{recursive:true,force:true})));});
function entry(id:string):OffloadEntry{return {tool_call_id:id,synthetic_content:"synthetic-private-body"} as unknown as OffloadEntry;}
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"offload-append-"));roots.push(root);
 const ctx=createStorageContext(root,"synthetic-agent","synthetic-session");await ensureDirs(ctx);
 return {root,ctx};
}
describe("optional offload JSONL append targets",()=>{
 it("rejects an escaping target before changing existing files",async()=>{
  const f=await fixture();await fs.mkdir(path.join(f.ctx.dataDir,"offload-x"));
  const outside=path.join(f.root,"outside.jsonl");await fs.writeFile(outside,"synthetic-newer-data\n");await fs.writeFile(f.ctx.offloadJsonl,"synthetic-current-session\n");
  await expect(appendOffloadEntries(f.ctx,[entry("synthetic-call")],"x/../../outside")).rejects.toThrow("Invalid offload storage filename");
  expect(await fs.readFile(outside,"utf8")).toBe("synthetic-newer-data\n");expect(await fs.readFile(f.ctx.offloadJsonl,"utf8")).toBe("synthetic-current-session\n");
 });
 it.each(["",".","..","bad\\name","bad\nname"])("rejects raw target %j",async target=>{
  const f=await fixture();const before=await fs.readdir(f.ctx.dataDir);
  await expect(appendOffloadEntries(f.ctx,[entry("synthetic-call")],target)).rejects.toThrow("Invalid offload storage filename");
  expect(await fs.readdir(f.ctx.dataDir)).toEqual(before);
 });
 it("preserves Unicode targeted append and dedup without identifier diagnostics",async()=>{
  const f=await fixture();const target="synthetic-private-session-任务";const id="synthetic-private-tool\nsecond-line";
  const logs:string[]=[];const log=(message:string)=>logs.push(message);const logger={debug:log,info:log,warn:log,error:log};
  await appendOffloadEntries(f.ctx,[entry(id)],target,logger);
  await appendOffloadEntries(f.ctx,[entry(id),entry("synthetic-fresh")],target,logger);
  const rows=(await fs.readFile(path.join(f.ctx.dataDir,`offload-${target}.jsonl`),"utf8")).trim().split("\n").map(s=>JSON.parse(s));
  expect(rows.map(r=>r.tool_call_id)).toEqual([id,"synthetic-fresh"]);expect(rows[0].synthetic_content).toBe("synthetic-private-body");
  expect(logs.join("\n")).not.toContain("synthetic-private");expect(logs.join("\n")).not.toContain("second-line");
  expect(logs.some(s=>s.includes("1/2 entries are duplicates, writing 1"))).toBe(true);
 });
 it("retains current-session default and all-duplicate no-write behavior",async()=>{
  const f=await fixture();await appendOffloadEntries(f.ctx,[entry("synthetic-call")]);const before=await fs.readFile(f.ctx.offloadJsonl,"utf8");
  await appendOffloadEntries(f.ctx,[entry("synthetic-call")]);expect(await fs.readFile(f.ctx.offloadJsonl,"utf8")).toBe(before);
 });
});
