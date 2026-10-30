import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
const source=process.env.CI_DEMO_VOICEOVER_URL;
const destination=process.env.CI_DEMO_VOICEOVER_FILE;
assert(process.env.CI==="true" && process.env.MANDATEGATE_DISABLE_PAYMENTS==="1" &&
 process.env.CI_EXPECTED_SHA && destination?.startsWith("/tmp/mandategate-pg."),
 "CI_VOICE_STAGING_REQUIRES_PAYMENT_DISABLED_ISOLATION");
assert(source && destination,"CI_VOICE_STAGING_INPUT_MISSING");
const url=new URL(source);
assert(url.protocol==="https:" && url.hostname==="storage.googleapis.com" &&
 url.pathname==="/xi-backend/database/workspace/7fabfb9b85e8407b8ae20d815c58a053/content_generation/CMItzllkFNiQtVPFgRn3/J92LMKujKAJPc6Y2RvSG/content.mp3",
 "CI_VOICE_STAGING_SOURCE_NOT_ALLOWLISTED");
const response=await fetch(source,{signal:AbortSignal.timeout(30000),redirect:"error"});
assert(response.ok,"CI_VOICE_STAGING_FETCH_"+response.status);
const buffer=Buffer.from(await response.arrayBuffer());
assert(buffer.length>25000&&buffer.length<10_000_000,
 "CI_VOICE_STAGING_BYTES_INVALID");
writeFileSync(destination,buffer,{mode:0o600});
console.log("CI_DEMO_VOICE_STAGED bytes="+buffer.length);
