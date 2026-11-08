import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function extractPdf(bytes){
  return new Promise((resolve,reject)=>{
    const python=process.env.PDF_PYTHON;
    const command=python||process.env.PDFTOTEXT||'pdftotext';
    const args=python?[fileURLToPath(new URL('./scripts/pdf_text.py',import.meta.url))]:['-layout','-','-'];
    const proc=spawn(command,args,{windowsHide:true,stdio:['pipe','pipe','ignore']});
    const chunks=[];
    let count=0;
    const timer=setTimeout(()=>proc.kill(),15000);
    proc.stdin.on('error',()=>{});
    proc.stdout.on('data',chunk=>{
      count+=chunk.length;
      if(count>12000000) proc.kill();
      else chunks.push(chunk);
    });
    proc.on('error',error=>{clearTimeout(timer);reject(error);});
    proc.on('close',code=>{clearTimeout(timer);if(code===0) resolve(Buffer.concat(chunks).toString()); else reject(Error('PDF text extraction failed'));});
    proc.stdin.end(bytes);
  });
}
