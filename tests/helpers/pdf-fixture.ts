export function createPdf(lines: string[]): Buffer {
  // Valid, xref-addressed PDF fixture with real text streams; no model-selected
  // or manually seeded page-text rows. All offsets count actual UTF-8 bytes.
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Count " + lines.length + " /Kids [" +
    lines.map((_,i)=>`${4+i*2} 0 R`).join(" ") + "] >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  for (const [index,line] of lines.entries()) {
    const pageId=4+index*2,contentId=5+index*2;
    const displayedLines=line.split("\n").map(part =>
      "(" + part.replace(/([()\\])/g,"\\$1") + ") Tj"
    ).join(" 0 -16 Td ");
    const text=`BT /F1 12 Tf 30 700 Td ${displayedLines} ET`;
    objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId]=`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`;
  }
  let output="%PDF-1.7\n";
  const offsets=[0];
  for(let n=1;n<objects.length;n++) {
    offsets.push(Buffer.byteLength(output));
    output+=`${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref=Buffer.byteLength(output);
  output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let n=1;n<objects.length;n++){
    output+=String(offsets[n]).padStart(10,"0")+" 00000 n \n";
  }
  output+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}


/**
 * A genuinely image-backed, fictional invoice PDF. It contains legible raster
 * pixels but no searchable PDF text. It must never be treated as a T2 source
 * just because vision can recognize the visible vendor or amount.
 */
export async function createScannedPdf(): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const width=900, height=1200;
  const canvas=createCanvas(width,height);
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#ffffff";
  ctx.fillRect(0,0,width,height);
  ctx.fillStyle="#161616";
  ctx.font="bold 37px sans-serif";
  ctx.fillText("Northstar Components",58,100);
  ctx.font="25px sans-serif";
  ctx.fillText("Invoice SCAN-SYNTH-0001",58,190);
  ctx.fillText("Date 2026-10-15",58,255);
  ctx.fillText("Total Due: USD 125.00",58,340);
  ctx.fillText("Printed receiver: fictional-payee@synthetic.invalid",58,415);
  ctx.font="19px sans-serif";
  ctx.fillText("FICTIONAL DEMO ONLY - NOT A REAL PAYMENT REQUEST",58,510);

  const jpeg=canvas.toBuffer("image/jpeg");
  if(!jpeg.length || jpeg.length>2_000_000) throw Error("SYNTHETIC_JPEG_INVALID");

  const parts: Buffer[]=[];
  const offsets: number[]=[0];
  let cursor=0;
  const append=(value:Buffer|string)=>{
    const bytes=typeof value==="string"?Buffer.from(value,"utf8"):value;
    parts.push(bytes);
    cursor+=bytes.length;
  };
  const obj=(id:number,body:Buffer|string)=>{
    offsets[id]=cursor;
    append(`${id} 0 obj\n`);
    append(body);
    append("\nendobj\n");
  };
  append("%PDF-1.4\n");
  obj(1,"<< /Type /Catalog /Pages 2 0 R >>");
  obj(2,"<< /Type /Pages /Count 1 /Kids [3 0 R] >>");
  obj(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>");
  obj(4,Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
    jpeg,
    Buffer.from("\nendstream"),
  ]));
  const command="q\n612 0 0 792 0 0 cm\n/Im1 Do\nQ\n";
  obj(5,`<< /Length ${Buffer.byteLength(command)} >>\nstream\n${command}endstream`);
  const xref=cursor;
  append("xref\n0 6\n0000000000 65535 f \n");
  for(let id=1;id<=5;id++)append(`${String(offsets[id]).padStart(10,"0")} 00000 n \n`);
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}
