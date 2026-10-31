import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync,writeFileSync,statSync} from "node:fs";
import {resolve} from "node:path";

const manifest=JSON.parse(readFileSync("ci-public/demo/manifest.json","utf8"));
const file=resolve("ci-public/demo/mandategate-demo-final.mp4");
const ffmpeg=process.env.CI_DEMO_FFMPEG;
assert(process.env.CI==="true" && process.env.MANDATEGATE_DISABLE_PAYMENTS==="1" &&
 manifest.contract==="mandategate/real-browser-demo/v2" &&
 manifest.commit===process.env.CI_EXPECTED_SHA &&
 manifest.actualUiSubmittedCanonicalDecisions===3 &&
 manifest.fictionalPdfUploaded===true &&
 manifest.humanEscalationDeclined===true &&
 manifest.sourcePdfNotPayPalAuthorized===true &&
 manifest.historicalReceiptSeparate===true && manifest.paymentPosts===0,
 "CI_DEMO_MEDIA_REVIEW_PROVENANCE_INVALID");
assert(ffmpeg?.startsWith("/tmp/mandategate-pg.")||ffmpeg==="/usr/bin/ffmpeg",
 "CI_DEMO_MEDIA_FFMPEG_NOT_PINNED");
assert(statSync(file).size>500000,"CI_DEMO_MEDIA_FILE_MISSING");
const r=spawnSync(ffmpeg,["-hide_banner","-i",file],{
 encoding:"utf8",timeout:15000,maxBuffer:1000000});
const duration=r.stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
assert(duration&&/Video: h264/.test(r.stderr)&&/Audio: aac/.test(r.stderr),
 "CI_DEMO_MEDIA_CODEC_OR_DURATION_INVALID");
const seconds=Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]);
assert(seconds>80&&seconds<178,"CI_DEMO_MEDIA_TOO_LONG_OR_SHORT");
const storyboard=resolve("ci-public/demo/storyboard-final.jpg");
const frames=spawnSync(ffmpeg,["-hide_banner","-loglevel","error","-y",
 "-i",file,"-vf","fps=1/7,scale=320:180:flags=lanczos,tile=4x4:padding=3:margin=3:color=black",
 "-frames:v","1","-q:v","8",storyboard],{encoding:"utf8",timeout:35000});
assert(frames.status===0,"CI_DEMO_MEDIA_FRAME_CHECK_FAILED_"+frames.stderr?.slice(-160));
const b64=readFileSync(storyboard).toString("base64");
const chunks=b64.match(/.{1,2800}/g)??[];
console.log("CI_STORYBOARD_V2_COUNT="+chunks.length);
for(let i=0;i<chunks.length;i++)
 console.log("CI_STORYBOARD_V2_"+String(i).padStart(3,"0")+"="+chunks[i]);
const scan=spawnSync(ffmpeg,["-hide_banner","-i",file,
 "-af","silencedetect=n=-38dB:d=0.30","-f","null","-"],{
  encoding:"utf8",timeout:40000,maxBuffer:5000000});
assert(scan.status===0,"CI_DEMO_MEDIA_AUDIO_DECODE_FAILED");
const starts=[...scan.stderr.matchAll(/silence_start: ([0-9.]+)/g)].map(x=>Number(x[1]));
const ends=[...scan.stderr.matchAll(/silence_end: ([0-9.]+)/g)].map(x=>Number(x[1]));
const gaps=starts.map((start,i)=>({
 start,end:ends[i]??seconds,
 length:Math.round(((ends[i]??seconds)-start)*100)/100,
})).filter(x=>x.length>=0);
const large=gaps.filter(x=>x.length>1);
const totalLarge=large.reduce((n,x)=>n+x.length,0);
const maxGap=Math.max(0,...gaps.map(x=>x.length));
console.log("CI_DEMO_AUDIO_SILENCE="+JSON.stringify({
 durationSeconds:seconds,totalLargeSilenceSeconds:Number(totalLarge.toFixed(2)),
 maxSilenceSeconds:Number(maxGap.toFixed(2)),gaps:large.slice(0,20)}));
const result={contract:"mandategate/media-qa/v2",
 sourceCommit:manifest.commit,outputBytes:statSync(file).size,durationSeconds:seconds,
 audioCodec:"AAC",videoCodec:"H264",
 realUiButtonSubmitted:manifest.actualUiSubmittedCanonicalDecisions,
 fictionalPdfUploadVerified:manifest.fictionalPdfUploaded,
 paymentProviderPosts:0,totalLargeSilenceSeconds:Number(totalLarge.toFixed(2)),
 maxSilenceSeconds:Number(maxGap.toFixed(2)),
 humanEscalationDeclined:true,
 result:"MACHINE_VERIFIED_NOT_HUMAN_PLAYBACK_REVIEWED"};
writeFileSync(resolve("ci-public/demo/media-qa.json"),JSON.stringify(result,null,2)+"\n");
console.log("CI_DEMO_FINAL_MEDIA_MACHINE_QA_PASS");
