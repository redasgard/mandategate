/** Bounded JSON reader for consequential admin mutations. */
export async function readSmallJson(request:Request,maxBytes=4096):
  Promise<{ok:true;value:unknown}|{ok:false;error:string;status:number}> {
  if(request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")
    return {ok:false,error:"JSON_REQUIRED",status:415};
  const header=request.headers.get("content-length");
  const length=header===null?null:Number(header);
  if(length!==null&&(!Number.isSafeInteger(length)||length<0||length>maxBytes))
    return {ok:false,error:"POLICY_BODY_TOO_LARGE",status:413};
  if(!request.body)return {ok:false,error:"EMPTY_POLICY_BODY",status:400};
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];
  let total=0;
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>maxBytes){await reader.cancel().catch(()=>undefined);return {ok:false,error:"POLICY_BODY_TOO_LARGE",status:413};}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  if(length!==null&&total!==length)return {ok:false,error:"POLICY_LENGTH_MISMATCH",status:400};
  try{return {ok:true,value:JSON.parse(Buffer.concat(chunks.map(c=>Buffer.from(c)),total).toString("utf8"))};}
  catch{return {ok:false,error:"INVALID_JSON",status:400};}
}
