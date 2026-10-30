import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync,statSync} from "node:fs";
import {resolve} from "node:path";

assert(process.env.CI_VIDEO_INSPECT_ONLY==="1" &&
 process.env.MANDATEGATE_DISABLE_PAYMENTS==="1" &&
 process.env.CI_EXPECTED_SHA && process.env.CI==="true",
 "MEDIA_INSPECTION_REQUIRES_ISOLATED_NONPAYING_BUILD");

const sourceUrl="https://mg-review-ci.onrender.com/demo/mandategate-demo-final.mp4";
const outputDir=resolve("ci-public/demo");
mkdirSync(outputDir,{recursive:true});
const output=resolve(outputDir,"mandategate-demo-final.mp4");
const request=await fetch(sourceUrl,{redirect:"error",signal:AbortSignal.timeout(40000)});
assert(request.status===200,"MEDIA_INSPECTION_SOURCE_NOT_ACCESSIBLE_"+request.status);
const contentType=request.headers.get("content-type")??"";
assert(contentType.includes("video")||contentType.includes("octet-stream"),
 "MEDIA_INSPECTION_UNEXPECTED_CONTENT_TYPE_"+contentType);
const buffer=Buffer.from(await request.arrayBuffer());
assert(buffer.length>500000 && buffer.length<30000000,"MEDIA_INSPECTION_VIDEO_SIZE_INVALID");
writeFileSync(output,buffer);
console.log("CI_MEDIA_SOURCE_BYTES="+buffer.length);
const ffmpeg=process.env.CI_VIDEO_FFMPEG;
assert(ffmpeg?.startsWith("/tmp/mandategate-video-")||ffmpeg==="/usr/bin/ffmpeg",
 "MEDIA_INSPECTION_FFMPEG_NOT_APPROVED");
const probe=spawnSync(ffmpeg,["-hide_banner","-i",output],{encoding:"utf8",timeout:15000});
const duration=probe.stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
assert(duration,"MEDIA_INSPECTION_NO_DURATION");
const seconds=Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]);
console.log("CI_MEDIA_DURATION_SECONDS="+seconds);
console.log("CI_MEDIA_VIDEO_CODEC="+(probe.stderr.match(/Video: ([^\n]+)/)?.[1]??"unknown").slice(0,240));
console.log("CI_MEDIA_AUDIO_CODEC="+(probe.stderr.match(/Audio: ([^\n]+)/)?.[1]??"unknown").slice(0,240));
assert(seconds<180 && seconds>60,"MEDIA_INSPECTION_NOT_CONTEST_DURATION");

const storyboard=resolve(outputDir,"storyboard.jpg");
const frames=spawnSync(ffmpeg,["-hide_banner","-loglevel","error","-y",
 "-i",output,"-vf","fps=1/9,scale=320:180:flags=lanczos,tile=4x4:padding=3:margin=3:color=black",
 "-frames:v","1","-q:v","9",storyboard],{encoding:"utf8",timeout:35000});
assert(frames.status===0,"MEDIA_INSPECTION_FRAME_EXTRACTION_FAILED_"+frames.stderr?.slice(-300));
const b64=readFileSync(storyboard).toString("base64");
const chunks=b64.match(/.{1,2800}/g)??[];
console.log("CI_STORYBOARD_COUNT="+chunks.length);
chunks.forEach((chunk,i)=>console.log("CI_STORYBOARD_"+String(i).padStart(3,"0")+"="+chunk));

const silence=spawnSync(ffmpeg,["-hide_banner","-i",output,"-af","silencedetect=n=-38dB:d=0.30",
 "-f","null","-"],{encoding:"utf8",timeout:35000,maxBuffer:4000000});
const intervals=[...silence.stderr.matchAll(/silence_start: ([0-9.]+)/g)].map(x=>Number(x[1]));
const ends=[...silence.stderr.matchAll(/silence_end: ([0-9.]+)/g)].map(x=>Number(x[1]));
const all=intervals.map((start,i)=>({start,end:ends[i]??seconds,seconds:Math.round(((ends[i]??seconds)-start)*100)/100})).filter(x=>x.seconds>=0);
console.log("CI_MEDIA_SILENCE_PERIODS="+JSON.stringify(all.filter(x=>x.seconds>=1).slice(0,24)));
writeFileSync(resolve(outputDir,"media-review.json"),JSON.stringify({
 testedSource:sourceUrl,bytes:buffer.length,durationSeconds:seconds,
 silencePeriods:all,assessment:"Machine-derived storyboard; human visual/audio review still required",
},null,2)+"\n");
console.log("CI_VIDEO_INSPECTION_DONE");
