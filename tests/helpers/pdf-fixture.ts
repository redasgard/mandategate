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
