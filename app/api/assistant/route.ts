import {auth} from "@/src/auth/auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// Free-form assistant requests are intentionally disabled.
// AI analysis is exposed only through separately authorized, typed operations.
async function disabled(request:Request){
 const session=await auth.api.getSession({headers:request.headers});
 if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401,headers:{"Cache-Control":"no-store"}});
 return Response.json({error:"FREEFORM_ASSISTANT_DISABLED"},{status:410,headers:{"Cache-Control":"no-store"}});
}

export const GET=disabled;
export const POST=disabled;
