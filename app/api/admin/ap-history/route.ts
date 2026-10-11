import {auth} from "@/src/auth/auth";
import {pool} from "@/src/db/pool";
import {isTrustedMutationOrigin} from "@/src/auth/same-origin";
import {importApHistory,ApImportPermissionError} from "@/src/history/store";
import {ApCsvError,MAX_AP_CSV_BYTES} from "@/src/history/csv-import";
export const runtime="nodejs";
const orgPattern=/^[A-Za-z0-9_-]{1,120}$/;
const allowedMime=new Set(["text/csv","application/csv","text/plain","application/vnd.ms-excel"]);
export async function POST(request:Request){
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const organizationId=request.headers.get("x-mandategate-organization-id")??"";
  if(!orgPattern.test(organizationId))
    return Response.json({error:"ORGANIZATION_REQUIRED"},{status:400});
  const check=await pool.query([
    "select 1 from organization_admin_memberships",
    "where organization_id=$1 and user_id=$2 and role='ADMIN' and active=true",
  ].join(" "),[organizationId,session.user.id]);
  if(check.rows.length!==1)return Response.json({error:"ORGANIZATION_NOT_FOUND"},{status:404});
  const media=request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()??"";
  if(!allowedMime.has(media))
    return Response.json({error:"AP_CSV_MEDIA_UNSUPPORTED"},{status:415});
  const length=Number(request.headers.get("content-length")??"");
  if(request.headers.has("content-length") &&
     (!Number.isSafeInteger(length)||length<0||length>MAX_AP_CSV_BYTES))
    return Response.json({error:"AP_CSV_TOO_LARGE"},{status:413});
  if(!request.body)return Response.json({error:"AP_CSV_EMPTY"},{status:400});
  const reader=request.body.getReader(),chunks:Buffer[]=[];
  let bytes=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_AP_CSV_BYTES){
        await reader.cancel().catch(()=>undefined);
        return Response.json({error:"AP_CSV_TOO_LARGE"},{status:413});
      }
      chunks.push(Buffer.from(value));
    }
  }finally{reader.releaseLock();}
  if(request.headers.has("content-length")&&bytes!==length)
    return Response.json({error:"AP_CSV_LENGTH_MISMATCH"},{status:400});
  try{
    const imported=await importApHistory({
      organizationId,actorUserId:session.user.id,content:Buffer.concat(chunks,bytes),
    });
    return Response.json({import:imported},{status:imported.replayed?200:201,
      headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof ApCsvError ||error instanceof ApImportPermissionError)
      return Response.json({error:error.code},{status:error.httpStatus,
        headers:{"Cache-Control":"private, no-store"}});
    throw error;
  }
}
