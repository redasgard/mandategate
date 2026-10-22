import {auth} from "@/src/auth/auth";
import {isTrustedMutationOrigin} from "@/src/auth/same-origin";
import {
  openTrustCaseForDeclinedEscalation,VendorTrustCaseError,
} from "@/src/vendor-trust/reverification";

export const runtime="nodejs";
const requestId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Creates a review case, never approves a payment or changes vendor trust. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await params;
  if(!requestId.test(id))return Response.json({error:"NOT_FOUND"},{status:404});
  if(request.body)return Response.json({error:"BODY_NOT_ALLOWED"},{status:422});
  try{
    const result=await openTrustCaseForDeclinedEscalation({
      actorUserId:session.user.id,requestId:id,
    });
    return Response.json({case:result},{status:result.replayed?200:201,
      headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof VendorTrustCaseError)
      return Response.json({error:error.code},{status:error.httpStatus});
    throw error;
  }
}
