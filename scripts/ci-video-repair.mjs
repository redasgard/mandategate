import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync,writeFileSync,statSync} from "node:fs";
import {resolve} from "node:path";

assert(process.env.CI_VIDEO_INSPECT_ONLY==="1" &&
 process.env.CI==="true" && process.env.MANDATEGATE_DISABLE_PAYMENTS==="1" &&
 process.env.CI_EXPECTED_SHA && !process.env.PAYPAL_CLIENT_SECRET &&
 !process.env.EXPLABS_API_KEY,"DEMO_REPAIR_ISOLATED_ONLY");
const ffmpeg=process.env.CI_VIDEO_FFMPEG;
assert(ffmpeg==="/usr/bin/ffmpeg" || ffmpeg?.startsWith("/tmp/mandategate-video-"),
 "DEMO_REPAIR_UNTRUSTED_FFMPEG");
const original=resolve("ci-public/demo/mandategate-demo-final.mp4");
const fixed=resolve("ci-public/demo/mandategate-demo-repaired.mp4");
const review=JSON.parse(readFileSync("ci-public/demo/media-review.json","utf8"));
assert(review.testedSource==="https://mg-review-ci.onrender.com/demo/mandategate-demo-final.mp4",
 "DEMO_REPAIR_UNTRUSTED_SOURCE");
assert(review.durationSeconds>115 && review.durationSeconds<125 &&
 statSync(original).size>500_000,"DEMO_REPAIR_SOURCE_INVALID");

const gaps=review.silencePeriods.filter(x=>x.seconds>=3).sort((a,b)=>a.start-b.start);
assert(gaps.some(x=>x.seconds>15&&x.start>70&&x.end<100),
 "DEMO_REPAIR_EXPECTED_LONG_PAUSE_MISSING");
const cuts=gaps.map(x=>{
 // Leave enough room for scene recognition and sentence transitions.
 const before=x.seconds>=10?1.8:1.0;
 const after=x.seconds>=10?1.4:0.9;
 return {start:Number((x.start+before).toFixed(3)),
  end:Number((x.end-after).toFixed(3)),sourceGap:x.seconds};
}).filter(x=>x.end-x.start>.6);
assert(cuts.length===4 && cuts.every((c,i)=>c.start<c.end &&
 (i===0||c.start>cuts[i-1].end)),"DEMO_REPAIR_CUTS_NOT_EXPECTED");
const removed=cuts.reduce((n,c)=>n+c.end-c.start,0);
assert(removed>15&&removed<27,"DEMO_REPAIR_EDIT_TOO_AGGRESSIVE");
const edges=[0,...cuts.flatMap(c=>[c.start,c.end]),review.durationSeconds];
const keep=[];
for(let i=0;i<edges.length-1;i+=2){
 keep.push({start:edges[i],end:edges[i+1]});
}
assert(keep.every(x=>x.end-x.start>1.0),"DEMO_REPAIR_SHORT_KEEP_SEGMENT");
const filters=[];
for(let i=0;i<keep.length;i++){
 const k=keep[i];
 filters.push("[0:v]trim=start="+k.start.toFixed(3)+":end="+k.end.toFixed(3)+
  ",setpts=PTS-STARTPTS[v"+i+"]");
 filters.push("[0:a]atrim=start="+k.start.toFixed(3)+":end="+k.end.toFixed(3)+
  ",asetpts=PTS-STARTPTS[a"+i+"]");
}
filters.push(keep.map((_,i)=>"[v"+i+"][a"+i+"]").join("")+
 "concat=n="+keep.length+":v=1:a=1[v][a]");
const args=["-hide_banner","-loglevel","error","-y","-i",original,
 "-filter_complex",filters.join(";"),"-map","[v]","-map","[a]",
 "-c:v","libx264","-preset","veryfast","-crf","22",
 "-pix_fmt","yuv420p","-c:a","aac","-b:a","160k",
 "-movflags","+faststart",fixed];
const run=spawnSync(ffmpeg,args,{encoding:"utf8",timeout:180000,maxBuffer:1000000});
assert(run.status===0,"DEMO_REPAIR_TRANSCODE_FAILED "+String(run.stderr).slice(-350));
assert(statSync(fixed).size>500000,"DEMO_REPAIR_EMPTY_OUTPUT");
const probe=spawnSync(ffmpeg,["-hide_banner","-i",fixed],{encoding:"utf8",timeout:15000});
const duration=probe.stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
assert(duration && /Video: h264/.test(probe.stderr)&&/Audio: aac/.test(probe.stderr),
 "DEMO_REPAIR_MEDIA_CODEC_INVALID");
const seconds=Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]);
assert(seconds>85&&seconds<110,"DEMO_REPAIR_DURATION_INVALID_"+seconds);
const check=spawnSync(ffmpeg,["-hide_banner","-i",fixed,
 "-af","silencedetect=n=-38dB:d=0.30","-f","null","-"],{
 encoding:"utf8",timeout:50000,maxBuffer:4000000});
assert(check.status===0,"DEMO_REPAIR_AUDIO_DECODE_FAILED");
const silenceStarts=[...check.stderr.matchAll(/silence_start: ([0-9.]+)/g)].map(m=>Number(m[1]));
const silenceEnds=[...check.stderr.matchAll(/silence_end: ([0-9.]+)/g)].map(m=>Number(m[1]));
const remaining=silenceStarts.map((s,i)=>Number(((silenceEnds[i]??seconds)-s).toFixed(2)));
const maxSilence=Math.max(0,...remaining);
assert(maxSilence<6.0,"DEMO_REPAIR_LONG_SILENCE_REMAINS_"+maxSilence);
const storyboard=resolve("ci-public/demo/storyboard-repaired.jpg");
const pic=spawnSync(ffmpeg,["-hide_banner","-loglevel","error","-y","-i",fixed,
 "-vf","fps=1/7,scale=320:180:flags=lanczos,tile=4x4:padding=3:margin=3:color=black",
 "-frames:v","1","-q:v","7",storyboard],{encoding:"utf8",timeout:40000});
assert(pic.status===0,"DEMO_REPAIR_STORYBOARD_FAILED");
const b64=readFileSync(storyboard).toString("base64");
const chunks=b64.match(/.{1,2800}/g)??[];
console.log("CI_REPAIRED_STORYBOARD_COUNT="+chunks.length);
chunks.forEach((chunk,i)=>console.log("CI_REPAIRED_STORYBOARD_"+String(i).padStart(3,"0")+"="+chunk));
const proof={sourceUrl:review.testedSource,
 videoFile:"mandategate-demo-repaired.mp4",
 sourceDuration:review.durationSeconds,outputDuration:seconds,
 cutSeconds:Number(removed.toFixed(2)),cuts,
 maxSilenceSeconds:maxSilence,
 outputBytes:statSync(fixed).size,
 originalNarrationPreserved:true,
 originalRecordedUiPreserved:true,
 paymentProviderPosts:0,
 claim:"Timing-only edit, no new model inference or PayPal execution",
 review:"Machine-verified only; human playback still required"};
writeFileSync(resolve("ci-public/demo/repair-proof.json"),JSON.stringify(proof,null,2)+"\n");
console.log("CI_DEMO_TIMING_REPAIR_PASS output_seconds="+seconds+
 " removed_seconds="+removed.toFixed(2)+" max_audio_silence="+maxSilence+
 " payout_posts=0");
