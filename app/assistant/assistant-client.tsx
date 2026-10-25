"use client";
import {useEffect,useState} from "react";
type Message={id?:string;role:string;content:string};
export function AssistantClient(){
 const [messages,setMessages]=useState<Message[]>([]);
 const [input,setInput]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/assistant",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error("Unable to load history");return r.json()}).then(x=>setMessages(x.messages)).catch(()=>setError("History unavailable"));},[]);
 async function submit(e:React.FormEvent){
  e.preventDefault();if(!input.trim()||busy)return;
  const content=input.trim();setBusy(true);setError("");
  try {const r=await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})});
   if(!r.ok)throw Error("Message could not be saved");
   const x=await r.json();setMessages(m=>[...m,{role:"user",content},{role:"assistant",content:x.reply}]);setInput("");
  }catch{setError("Unable to save message. Please retry.");}finally{setBusy(false);}
 }
 return <section className="mg-surface" aria-label="Persistent Assistant">
  <h2>Conversation history</h2><p className="mg-source-note">Messages persist across sessions. This assistant is informational and cannot move money.</p>
  <div aria-live="polite" style={{display:"grid",gap:12,margin:"20px 0"}}>
   {messages.map((m,i)=><article key={m.id??i} className="mg-policy-card"><strong>{m.role==="user"?"You":"Assistant"}</strong><p>{m.content}</p></article>)}
   {!messages.length?<p>No messages yet.</p>:null}
  </div>
  <form onSubmit={submit} style={{display:"grid",gap:12}}>
   <label htmlFor="assistant-input">Message</label>
   <textarea id="assistant-input" rows={3} maxLength={2000} required value={input} onChange={e=>setInput(e.target.value)} />
   <button type="submit" disabled={busy||!input.trim()}>{busy?"Saving...":"Send"}</button>
   {error?<p role="alert">{error}</p>:null}
  </form>
 </section>;
}
