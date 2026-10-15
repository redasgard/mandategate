import { auth } from "../src/auth/auth";
import { authenticateAgent } from "../src/auth/machine";
import { pool } from "../src/db/pool";
const required=(n:string)=>{ const s=process.env[n]; if(!s)throw Error(n+" missing"); return s };
try {
 const invoice=required("DEMO_AGENT_API_KEY"), payment=required("DEMO_PAYMENT_AGENT_API_KEY");
 if(invoice===payment)throw Error("shared agent key");
 const email=process.env.DEMO_ADMIN_EMAIL??"admin@mandategate.local";
 await auth.api.signInEmail({body:{email,password:required("DEMO_ADMIN_PASSWORD"),rememberMe:false}});
 const checks=[
  ["invoice allowed",await authenticateAgent("Bearer "+invoice,"invoice:upload")!==null],
  ["invoice payment denied",await authenticateAgent("Bearer "+invoice,"payment:submit")===null],
  ["payment allowed",await authenticateAgent("Bearer "+payment,"payment:submit")!==null],
  ["payment invoice denied",await authenticateAgent("Bearer "+payment,"invoice:upload")===null],
  ["anonymous denied",await authenticateAgent(null,"payment:submit")===null],
  ["wrong token denied",await authenticateAgent("Bearer invalid-synthetic-key","payment:submit")===null],
 ];
 for(const [name,pass] of checks){ console.log(name+": "+(pass?"PASS":"FAIL")); if(!pass)throw Error(String(name));}
 const payout=await pool.query("select count(*)::int as n from payment_executions");
 if(payout.rows[0].n!==0)throw Error("Unexpected payment executions");
 console.log("Neon auth/agent authorization checks passed. No payment executions.");
}finally{await pool.end()}
