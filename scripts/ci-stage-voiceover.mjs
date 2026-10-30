import assert from "node:assert/strict";
import {writeFileSync,statSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {dirname,join} from "node:path";

const source=process.env.CI_DEMO_VOICEOVER_URL;
const destination=process.env.CI_DEMO_VOICEOVER_FILE;
assert(process.env.CI==="true" && process.env.MANDATEGATE_DISABLE_PAYMENTS==="1" &&
 process.env.CI_EXPECTED_SHA && destination?.startsWith("/tmp/mandategate-pg.") &&
 destination.endsWith("/voiceover-source.mp3"),
 "CI_VOICE_STAGING_REQUIRES_PAYMENT_DISABLED_ISOLATION");
assert(source && destination,"CI_VOICE_STAGING_INPUT_MISSING");
const url=new URL(source);
assert(url.protocol==="https:" && url.hostname==="storage.googleapis.com" &&
 url.pathname==="/xi-backend/database/workspace/7fabfb9b85e8407b8ae20d815c58a053/content_generation/CMItzllkFNiQtVPFgRn3/J92LMKujKAJPc6Y2RvSG/content.mp3",
 "CI_VOICE_STAGING_SOURCE_NOT_ALLOWLISTED");
const direct=await fetch(source,{signal:AbortSignal.timeout(20000),redirect:"error"})
 .catch(()=>null);
if(direct?.ok){
 const buf=Buffer.from(await direct.arrayBuffer());
 assert(buf.length>25000&&buf.length<10_000_000,
  "CI_VOICE_STAGING_DIRECT_BYTES_INVALID");
 writeFileSync(destination,buf,{mode:0o600});
 console.log("CI_DEMO_VOICE_STAGED_DIRECT bytes="+buf.length);
}else{
 // Reuse the SAME previously generated licensed narration, already embedded
 // in the published validated synthetic-browser demonstration. No new
 // ElevenLabs generation, no voice cloning and no provider payment call.
 const recorded="https://mg-review-ci.onrender.com/demo/mandategate-demo-final.mp4";
 const previous=await fetch(recorded,{signal:AbortSignal.timeout(40000),redirect:"error"});
 assert(previous.ok,"CI_VOICE_FALLBACK_MEDIA_UNAVAILABLE_"+previous.status);
 const buf=Buffer.from(await previous.arrayBuffer());
 assert(buf.length>500_000&&buf.length<30_000_000,
  "CI_VOICE_FALLBACK_MEDIA_BYTES_INVALID");
 const tmp=join(dirname(destination),"prior-narrated-demo.mp4");
 writeFileSync(tmp,buf,{mode:0o600});
 const ffmpeg="/usr/bin/ffmpeg";
 const filter="silenceremove=start_periods=1:start_threshold=-38dB:"+
  "stop_periods=-1:stop_duration=0.85:stop_silence=0.45:stop_threshold=-38dB";
 const run=spawnSync(ffmpeg,["-hide_banner","-loglevel","error","-y",
  "-i",tmp,"-vn","-af",filter,"-ac","1","-ar","44100",
  "-c:a","libmp3lame","-q:a","3",destination],{
  encoding:"utf8",timeout:60000,maxBuffer:500000});
 assert(run.status===0,"CI_VOICE_FALLBACK_EXTRACT_FAILED_"+String(run.stderr).slice(-180));
 assert(statSync(destination).size>25000&&statSync(destination).size<10_000_000,
  "CI_VOICE_FALLBACK_EXTRACT_INVALID");
 console.log("CI_DEMO_VOICE_STAGED_REUSED_EXISTING_NARRATION bytes="+statSync(destination).size);
}
