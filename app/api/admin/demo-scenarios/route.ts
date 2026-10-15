import {auth} from "@/src/auth/auth";
import {isTrustedMutationOrigin} from "@/src/auth/same-origin";
import {assertDemoPreview,createDemoScenarios,DemoScenarioError} from "@/src/demo/scenarios-store";

export const runtime="nodejs";

export async function POST(request:Request) {
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  try {
    assertDemoPreview();
    const session=await auth.api.getSession({headers:request.headers});
    if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
    const result=await createDemoScenarios(session.user.id);
    return Response.json({scenarios:result},{status:200,headers:{"Cache-Control":"private, no-store"}});
  } catch(e) {
    if(e instanceof DemoScenarioError)
      return Response.json({error:e.code},{status:e.httpStatus});
    throw e;
  }
}
