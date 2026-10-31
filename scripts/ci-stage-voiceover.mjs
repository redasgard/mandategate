import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";

const source=process.env.CI_DEMO_VOICEOVER_URL;
const destination=process.env.CI_DEMO_VOICEOVER_FILE;
assert(process.env.CI==="true" && process.env.MANDATEGATE_DISABLE_PAYMENTS==="1" &&
 process.env.CI_EXPECTED_SHA && destination?.startsWith("/tmp/mandategate-pg.") &&
 destination.endsWith("/voiceover-source.mp3"),
 "CI_VOICE_STAGING_REQUIRES_PAYMENT_DISABLED_ISOLATION");
assert(source && destination,"CI_VOICE_STAGING_INPUT_MISSING");
const url=new URL(source);
assert(url.protocol==="https:" && url.hostname==="storage.googleapis.com" &&
 /^\/xi-backend\/database\/workspace\/7fabfb9b85e8407b8ae20d815c58a053\/content_generation\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/content\.mp3$/.test(url.pathname),
 "CI_VOICE_SOURCE_MUST_BE_OWN_ELEVENLABS_GENERATION");
const direct=await fetch(source,{signal:AbortSignal.timeout(40000),redirect:"error"});
assert(direct.ok,"CI_NEW_EXPLANATORY_VOICEOVER_UNAVAILABLE_"+direct.status);
const buf=Buffer.from(await direct.arrayBuffer());
assert(buf.length>25000&&buf.length<10_000_000,"CI_EXPLANATORY_VOICE_INVALID_BYTES");
writeFileSync(destination,buf,{mode:0o600});
console.log("CI_EXPLANATORY_VOICE_STAGED bytes="+buf.length);
