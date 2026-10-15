import { createHash } from 'node:crypto';
export const EXPECTED = Object.freeze({
  vendor_name: 'Northstar Components',
  invoice_number: 'DEMO-GLM-004',
  invoice_date: '2026-10-15',
  currency: 'USD',
  total_amount_decimal: '125.00',
  invoice_payment_destination: 'fictional-payee@synthetic.invalid',
});
export const EXPECTED_SHA256 = '1008e32cc27dfe9e3f232aa126c84aca1ad1ad76e6a93e2a05b4ff47991192f2';
function literal(v) { return '(' + v.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)') + ')'; }
function drawText(x,y,size,str,font='F1') { return 'BT /'+font+' '+size+' Tf 1 0 0 1 '+x+' '+y+' Tm '+literal(str)+' Tj ET'; }
export function makeSyntheticPdf() {
  const cmds = [
    '0.11 0.18 0.31 rg',
    '38 670 536 80 re f',
    '1 1 1 rg',
    drawText(54,716,19,'FICTIONAL INVOICE - TEST ONLY','F2'),
    drawText(54,690,10,'NOT A PAYMENT REQUEST. DO NOT PAY.'),
    '0 0 0 rg',
    drawText(50,631,12,'Vendor','F2'),
    drawText(50,607,17,EXPECTED.vendor_name,'F2'),
    drawText(50,554,12,'Invoice number','F2'),
    drawText(50,532,15,EXPECTED.invoice_number),
    drawText(338,554,12,'Invoice date','F2'),
    drawText(338,532,15,EXPECTED.invoice_date),
    '0.75 0.78 0.83 RG', '50 510 m 562 510 l S',
    drawText(50,480,12,'Description','F2'),
    drawText(50,453,13,'One replacement assembly'),
    drawText(50,408,12,'Payment destination printed on invoice','F2'),
    drawText(50,385,13,EXPECTED.invoice_payment_destination),
    '0.92 0.96 1 rg', '50 274 512 76 re f',
    '0 0 0 rg',
    drawText(64,322,12,'TOTAL AMOUNT DUE','F2'),
    drawText(64,289,24,'USD 125.00','F2'),
    drawText(50,215,10,'Fictional vendor. Fictional payee. No bank account.'),
    drawText(50,194,10,'For GLM invoice-observation evaluation only.'),
  ];
  const stream = cmds.join('\n')+'\n';
  const objects = [];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[2]='<< /Type /Pages /Count 1 /Kids [5 0 R] >>';
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  objects[5]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>';
  objects[6]='<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'endstream';
  let out = '%PDF-1.7\n';
  const offsets=[0];
  for(let i=1;i<objects.length;i++){
    offsets.push(Buffer.byteLength(out));
    out += i+' 0 obj\n'+objects[i]+'\nendobj\n';
  }
  const startxref = Buffer.byteLength(out);
  out += 'xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let i=1;i<objects.length;i++)out+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  out+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+startxref+'\n%%EOF\n';
  const bytes=Buffer.from(out);
  if(createHash('sha256').update(bytes).digest('hex')!==EXPECTED_SHA256)throw Error('FIXTURE_BYTES_CHANGED');
  return bytes;
}
