// 화면 공통 자료 읽기와 브라우저 저장. 원문 파일은 저장하지 않는다.
(function () {
  'use strict';
  const KEY='assembly-cases-v1';
  function parseCsv(text) {
    let field='',row=[],quoted=false; const rows=[];
    text=text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(field);field='';}
      else if((c==='\n'||c==='\r')&&!quoted){row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';if(c==='\r'&&text[i+1]==='\n')i++;}
      else field+=c;
    }
    if(quoted)throw Error('CSV 따옴표가 닫히지 않았습니다.');
    if(field||row.length){row.push(field);rows.push(row);}
    const head=rows.shift();if(!head)throw Error('CSV가 비어 있습니다.');
    return rows.map((values,i)=>{if(values.length!==head.length)throw Error(`CSV ${i+2}행의 열 수가 다릅니다.`);return Object.fromEntries(head.map((key,j)=>[key.trim(),values[j].trim()]));});
  }
  async function readCsv(name){const response=await fetch(new URL(`data/${name}`,document.baseURI));if(!response.ok)throw Error(`자료를 읽지 못했습니다: ${name}`);return parseCsv(await response.text());}
  function load(){const raw=localStorage.getItem(KEY);if(!raw)return {version:1,cases:[],log:[]};const data=JSON.parse(raw);if(!Array.isArray(data.cases)||!Array.isArray(data.log))throw Error('저장 자료 형식이 올바르지 않습니다.');return data;}
  function save(data){localStorage.setItem(KEY,JSON.stringify(data));}
  function key(row){return JSON.stringify([row['파일명'],row['위원회'],row['의원'],row['문항번호']]);}
  function register(rows){
    RequestSplit.validate(rows);const data=load();const keys=new Set(data.cases.map(key));let count=0;const now=new Date().toISOString();
    for(const row of rows){if(keys.has(key(row)))continue;const item={...Object.fromEntries(RequestSplit.fields.map(k=>[k,row[k]])),id:crypto.randomUUID(),상태:'접수',주관과:'',협조과:[],확정방법:'',후보:RequestEngine.classify(row['요구내용']),일시:now};data.cases.push(item);data.log.push({일시:now,작업:'접수',문항:item.id});keys.add(key(row));count++;}
    save(data);return {count,duplicates:rows.length-count};
  }
  function confirm(id,lead,partners,departments){
    const allowed=new Set(departments);if(!allowed.has(lead)||partners.some(p=>!allowed.has(p)))throw Error('조직도에 있는 주관·협조 과를 선택하세요.');
    if(partners.includes(lead))throw Error('주관 과와 협조 과는 다르게 선택하세요.');
    const data=load(),item=data.cases.find(r=>r.id===id);if(!item||!['접수','배분확정','재배정요청'].includes(item.상태))throw Error('배분할 수 없는 상태입니다.');
    const before={주관과:item.주관과,협조과:item.협조과,상태:item.상태};
    const candidates=RequestEngine.classify(item['요구내용']);const method=lead===candidates[0]?.과&&partners.length===0?'규칙':'수정';
    Object.assign(item,{상태:'배분확정',주관과:lead,협조과:[...new Set(partners)],확정방법:method,후보:candidates,일시:new Date().toISOString()});
    data.log.push({일시:item.일시,작업:'배분확정',문항:id,이전:before,주관과:lead,협조과:item.협조과,확정방법:method});save(data);return item;
  }
  function escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  globalThis.RequestCommon={parseCsv,readCsv,load,save,register,confirm,escape};
})();
