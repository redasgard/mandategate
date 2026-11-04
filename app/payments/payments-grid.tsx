"use client";

import {useMemo,useState,useCallback} from "react";
import Link from "next/link";
import {AgGridReact} from "ag-grid-react";
import {AllCommunityModule,ModuleRegistry,themeQuartz,type ColDef,type ICellRendererParams} from "ag-grid-community";

/* v33+ AG Grid requires explicit module registration. All Community modules
   are registered once here; the grid itself is read-only. */
ModuleRegistry.registerModules([AllCommunityModule]);

export type PaymentsGridRow={
  requestId:string;
  vendorName:string;
  invoiceNumber:string;
  source:string;
  amountLabel:string;
  outcome:string;
  status:string;
  executionLabel:string;
  recordedUtc:string;
};

/* AG Grid (Community, MIT) themed to the MandateGate operations shell.
   This overrides nothing about authority: the grid is a read-only view of
   records the server already returned for the signed-in administrator. */
const mgGridTheme=themeQuartz.withParams({
  backgroundColor:"#181e20",
  foregroundColor:"#f0eee9",
  borderColor:"#323a3c",
  chromeBackgroundColor:"#1d2526",
  headerBackgroundColor:"#1d2526",
  headerTextColor:"#b9c4c0",
  headerFontWeight:700,
  headerFontSize:11,
  fontSize:12,
  fontFamily:"inherit",
  rowHoverColor:"#202629",
  oddRowBackgroundColor:"#161c1e",
  accentColor:"#d4a473",
  wrapperBorderRadius:0,
  wrapperBorder:false,
  rowHeight:46,
  headerHeight:38,
});

function VendorCell(params:ICellRendererParams<PaymentsGridRow>){
  const row=params.data;
  if(!row)return null;
  return <Link href={"/payments/"+encodeURIComponent(row.requestId)}
    style={{display:"grid",gap:4,textDecoration:"none",color:"#f2e7d7"}}>
    <strong style={{fontSize:12}}>{row.vendorName}</strong>
    <span style={{fontSize:10.5,color:"#c8a77e",fontWeight:650}}>{row.invoiceNumber} ↗</span>
  </Link>;
}

function DecisionCell(params:ICellRendererParams<PaymentsGridRow>){
  const row=params.data;
  if(!row)return null;
  return <span className={"mg-mini-state "+row.outcome.toLowerCase()}>{row.outcome}</span>;
}

export function PaymentsGrid({rows}:{rows:PaymentsGridRow[]}){
  const [quick,setQuick]=useState("");
  const columns=useMemo<ColDef<PaymentsGridRow>[]>(()=>[
    {field:"vendorName",headerName:"Vendor / invoice",flex:2,minWidth:210,
      cellRenderer:VendorCell,sortable:true,resizable:true},
    {field:"amountLabel",headerName:"Amount",width:110,sortable:true,
      cellStyle:{fontVariantNumeric:"tabular-nums",fontWeight:750,textAlign:"right"}},
    {field:"outcome",headerName:"Decision",width:118,
      cellRenderer:DecisionCell,sortable:true},
    {field:"status",headerName:"Request",width:120,sortable:true},
    {field:"executionLabel",headerName:"PayPal outcome",width:160,sortable:true},
    {field:"source",headerName:"Origin",width:150,sortable:true},
    {field:"recordedUtc",headerName:"Recorded UTC",width:140,sortable:true},
  ],[]);

  const onFilterChange=useCallback((event:React.ChangeEvent<HTMLInputElement>)=>{
    setQuick(event.target.value);
  },[]);

  return <div className="mg-grid-block">
    <div className="mg-grid-toolbar">
      <label className="mg-grid-search">
        <span className="sr-only">Filter payment records</span>
        <input type="search" value={quick} onChange={onFilterChange}
          placeholder="Filter by vendor, invoice, decision…" aria-label="Filter payment records"/>
      </label>
      <span className="mg-mini-state">{rows.length} records</span>
    </div>
    <AgGridReact<PaymentsGridRow>
      rowData={rows}
      columnDefs={columns}
      theme={mgGridTheme}
      quickFilterText={quick}
      pagination
      paginationPageSize={12}
      paginationPageSizeSelector={false}
      domLayout="autoHeight"
      suppressCellFocus={false}
      enableCellTextSelection
      getRowId={p=>p.data.requestId}
      defaultColDef={{sortable:false,resizable:true}}
      aria-label="Payment decision ledger"/>
  </div>;
}
