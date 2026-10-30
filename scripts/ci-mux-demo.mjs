/**
 * Merge one consented narration take with a real Playwright browser recording.
 * Payment-disabled CI, no provider payment credentials or live customer data.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

const source=resolve('ci-public/demo/mandategate-real-browser-demo.webm');
const target=resolve('ci-public/demo/mandategate-demo-final.mp4');
const manifestPath=resolve('ci-public/demo/manifest.json');
const ffmpeg=process.env.CI_DEMO_FFMPEG;
const urlString=process.env.CI_DEMO_VOICEOVER_URL;
if(!urlString){
 console.log('CI_DEMO_VOICEOVER_NOT_CONFIGURED; silent genuine-browser video retained');
 process.exit(0);
}
assert(process.env.CI==='true'&&process.env.MANDATEGATE_DISABLE_PAYMENTS==='1'&&
 process.env.CI_EXPECTED_SHA&&process.env.MANDATEGATE_RUNTIME_MODE==='legacy'&&
 process.env.DATABASE_URL?.includes('@127.0.0.1:55432/mandategate')&&
 process.env.BETTER_AUTH_URL==='http://127.0.0.1:3000',
 'CI_DEMO_MUX_REQUIRES_PAYMENT_DISABLED_DISPOSABLE_DATABASE');
assert(ffmpeg?.startsWith('/tmp/mandategate-pg.')||ffmpeg==='/usr/bin/ffmpeg',
 'CI_DEMO_FFMPEG_UNTRUSTED');
const url=new URL(urlString);
assert(url.protocol==='https:'&&url.hostname==='storage.googleapis.com'&&
 url.pathname==='/xi-backend/database/workspace/7fabfb9b85e8407b8ae20d815c58a053/content_generation/CMItzllkFNiQtVPFgRn3/J92LMKujKAJPc6Y2RvSG/content.mp3',
 'CI_DEMO_AUDIO_SOURCE_NOT_ALLOWLISTED');
const response=await fetch(urlString,{signal:AbortSignal.timeout(30000),redirect:'error'});
assert(response.ok,'CI_DEMO_AUDIO_FETCH_'+response.status);
assert(/audio|octet-stream/.test(response.headers.get('content-type')??''),
 'CI_DEMO_AUDIO_NOT_MPEG');
const buffer=Buffer.from(await response.arrayBuffer());
assert(buffer.length>25000&&buffer.length<10_000_000,'CI_DEMO_AUDIO_BYTE_LIMIT');
assert(process.env.CI_CAPTURE_AUTH_STATE?.startsWith('/tmp/mandategate-pg.'),
 'CI_DEMO_TMP_PATH_REQUIRED');
const audio=resolve(dirname(process.env.CI_CAPTURE_AUTH_STATE),'voiceover-source.mp3');
writeFileSync(audio,buffer,{mode:0o600});
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
assert(manifest.commit===process.env.CI_EXPECTED_SHA&&
 manifest.paymentsDisabled===true&&manifest.paymentPosts===0&&
 manifest.historicalReceiptSeparate===true&&
 manifest.captureDurationSeconds<175,
 'CI_DEMO_RECORDING_PROVENANCE_INVALID');
assert(statSync(source).size>150000,'CI_DEMO_RECORDING_MISSING');
const probe=spawnSync(ffmpeg,['-hide_banner','-i',audio,'-af',
 'silencedetect=n=-32dB:d=0.20','-f','null','-'],{
  encoding:'utf8',maxBuffer:6*1024*1024,timeout:30000});
assert(probe.status===0,'CI_DEMO_AUDIO_PROBE_FAILED');
const durationLine=(probe.stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)||[]);
assert(durationLine.length===4,'CI_DEMO_AUDIO_DURATION_UNAVAILABLE');
const audioDuration=Number(durationLine[1])*3600+
 Number(durationLine[2])*60+Number(durationLine[3]);
assert(audioDuration>70&&audioDuration<140,'CI_DEMO_AUDIO_LENGTH_OUT_OF_RANGE');
const candidate=[];
const re=/silence_start:\s*([0-9.]+)/g;
let m;
while((m=re.exec(probe.stderr))!==null){
 const text=probe.stderr.slice(m.index);
 const end=text.match(/silence_end:\s*([0-9.]+)/);
 const nextStart=text.indexOf('silence_start:',1);
 if(!end||(nextStart>=0&&end.index>nextStart))continue;
 const a=Number(m[1]),b=Number(end[1]);
 if(b-a>.19&&a>=1&&b<audioDuration)
  candidate.push({time:(a+b)/2,length:b-a});
}
const wordCounts=[16,25,39,17,24,25,33,21];
const count=wordCounts.reduce((a,b)=>a+b,0);
let elapsed=0;
const boundaries=[];
for(let i=0;i<wordCounts.length-1;i++){
 elapsed+=wordCounts[i];
 const estimate=audioDuration*(elapsed/count);
 const previous=boundaries.at(-1)??0;
 const valid=candidate.filter(x=>x.time>previous+4&&x.time<
  audioDuration-4*(wordCounts.length-i-1)&&Math.abs(x.time-estimate)<4);
 valid.sort((a,b)=>Math.abs(a.time-estimate)-Math.abs(b.time-estimate));
 boundaries.push(Number((valid[0]?.time??estimate).toFixed(3)));
}
const starts=[0.8,14.0,26.0,44.0,62.0,80.0,98.0,120.0];
const edges=[0,...boundaries,audioDuration];
const split=Array.from({length:8},(_,i)=>'[a'+i+']').join('');
const filters=['[1:a]asplit=8'+split];
for(let i=0;i<8;i++){
 assert(edges[i+1]>edges[i]+3,'CI_DEMO_AUDIO_SEGMENT_TOO_SHORT_'+i);
 filters.push('[a'+i+']atrim=start='+edges[i].toFixed(3)+
  ':end='+edges[i+1].toFixed(3)+
  ',asetpts=PTS-STARTPTS,adelay='+Math.round(starts[i]*1000)+
  ':all=1[o'+i+']');
}
filters.push(Array.from({length:8},(_,i)=>'[o'+i+']').join('')+
 'amix=inputs=8:normalize=0:duration=longest,atrim=duration='+
 manifest.captureDurationSeconds+',asetpts=N/SR/TB[aout]');
const args=['-hide_banner','-y','-i',source,'-i',audio,
 '-filter_complex',filters.join(';'),
 '-map','0:v:0','-map','[aout]','-c:v','libx264','-preset','veryfast',
 '-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k',
 '-movflags','+faststart','-t',String(manifest.captureDurationSeconds),target];
const mux=spawnSync(ffmpeg,args,{
 encoding:'utf8',maxBuffer:6*1024*1024,timeout:180000});
if(mux.status!==0){
 console.error((mux.stderr??'').slice(-2000));
 throw Error('CI_DEMO_MUX_FFMPEG_FAILED');
}
const outputBytes=statSync(target).size;
assert(outputBytes>500_000,'CI_DEMO_MUX_EMPTY');
writeFileSync(manifestPath,JSON.stringify({
 ...manifest,
 narratedFile:'mandategate-demo-final.mp4',
 narratedBytes:outputBytes,
 narrationSeconds:Number(audioDuration.toFixed(2)),
 narrationSource:'ElevenLabs single licensed natural-speech take, 8 aligned real-browser scenes',
 narrationSplits:edges.map(x=>Number(x.toFixed(2))),
 demoVideoHasAudio:true,
},null,2)+'\n');
console.log('CI_DEMO_NARRATED_MP4_PASS bytes='+outputBytes+
 ' audio_seconds='+audioDuration.toFixed(2)+
 ' video_seconds='+manifest.captureDurationSeconds+
 ' scene_segments=8 payment_posts=0');
