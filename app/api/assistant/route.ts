import {auth} from "@/src/auth/auth";
import {pool} from "@/src/db/pool";
import {isTrustedMutationOrigin} from "@/src/auth/same-origin";

export const runtime="nodejs";
export const dynamic="force-dynamic";

async function sessionFor(request:Request) {
  return auth.api.getSession({headers:request.headers});
}
export async function GET(request:Request) {
  const session=await sessionFor(request);
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const result=await pool.query("SELECT id,role,content,created_at FROM (SELECT id,role,content,created_at FROM assistant_messages WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 60) m ORDER BY created_at,id",[session.user.id]);
  return Response.json({messages:result.rows},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request) {
  if(!isTrustedMutationOrigin(request))return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await sessionFor(request);
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.content!=="string"||body.content.trim().length<1||body.content.length>2000)
    return Response.json({error:"INVALID_MESSAGE"},{status:400});
  const content=body.content.trim();
  const reply="I can help inspect payment decisions and explain policy, but I cannot authorize, schedule, or execute payments. Review the Payments, Vendors, and Policies sections for current evidence. Your conversation is saved to this account.";
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO assistant_messages(user_id,role,content) VALUES ($1,'user',$2)",[session.user.id,content]);
    await client.query("INSERT INTO assistant_messages(user_id,role,content) VALUES ($1,'assistant',$2)",[session.user.id,reply]);
    await client.query("COMMIT");
  } catch(e) {await client.query("ROLLBACK");throw e;} finally {client.release();}
  return Response.json({reply},{headers:{"Cache-Control":"private, no-store"}});
}
