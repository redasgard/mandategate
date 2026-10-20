type Stage="upload"|"review"|"approve"|"pay";
const stages=[
  {key:"upload",title:"Upload",caption:"Invoice received"},
  {key:"review",title:"AI & review",caption:"Check the details"},
  {key:"approve",title:"Approve",caption:"Authorize exact payment"},
  {key:"pay",title:"PayPal",caption:"Execute and track"},
] as const;

/** Visual navigation only. Never represents or grants financial authority. */
export function InvoiceJourney({stage}:{stage:Stage}){
  const current=stages.findIndex(item=>item.key===stage);
  return <nav aria-label="Invoice payment progress" className="invoice-journey">
    <ol>{stages.map((item,index)=><li key={item.key}
      className={index<current?"complete":index===current?"current":"upcoming"}
      aria-current={index===current?"step":undefined}>
      <span className="journey-index" aria-hidden="true">{index<current?"✓":index+1}</span>
      <span className="journey-label"><strong>{item.title}</strong>
        <small>{item.caption}</small>
      </span>
    </li>)}</ol>
  </nav>;
}
