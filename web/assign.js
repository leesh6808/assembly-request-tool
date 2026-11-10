// 배분 화면의 접수 미리보기, 저장, 담당 과 확정을 연결한다.
const $=selector=>document.querySelector(selector), C=RequestCommon, esc=C.escape;
let preview=[],org=[],busy=false;
function message(text,error=false){$('#message').textContent=text;$('#message').className='notice'+(error?' error':'');}
function table(headers,rows){return `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
function render(){
  const data=C.load(),query=$('#search').value.trim(),status=$('#filter').value;
  const rows=data.cases.filter(r=>(!status||r.상태===status)&&(!query||`${r.의원} ${r.요구내용}`.includes(query)));
  $('#caseCount').textContent=`전체 ${data.cases.length}문항 · 표시 ${rows.length}문항 · 배분확정 ${data.cases.filter(r=>r.상태==='배분확정').length}문항`;
  $('#assignments').innerHTML=rows.length?`<table class="assignment"><thead><tr><th>상태</th><th>의원·문항</th><th>요구내용</th><th>후보 3순위</th><th>주관 과 · 협조 과</th><th>확정</th></tr></thead><tbody>${rows.map(r=>{
    const candidates=RequestEngine.classify(r.요구내용),lead=r.주관과||candidates[0]?.과||'';
    return `<tr data-id="${esc(r.id)}"><td><span class="badge ${r.상태==='배분확정'?'done':''}">${esc(r.상태)}</span></td><td><b>${esc(r.의원)} · ${esc(r.문항번호)}번</b><small class="subtitle">${esc(r.위원회)}<br>기한 ${esc(r.제출기한)}</small></td><td>${esc(r.요구내용)}${r.세부항목||r.비고?`<details><summary>세부항목·비고</summary><p>${esc(r.세부항목)}</p><p>${esc(r.비고)}</p></details>`:''}</td><td>${candidates.length?`<ol class="candidates">${candidates.map(c=>`<li>${esc(c.과)} · ${c.점수}<small>${esc(c.근거키워드.join(', '))}</small></li>`).join('')}</ol>${candidates[0]?.점수===candidates[1]?.점수?'<small class="subtitle">동점 · 확인필요</small>':''}`:'확인필요 · 후보 없음'}</td><td><select class="lead" aria-label="${esc(r.의원)} ${esc(r.문항번호)}번 주관 과"><option value="">주관 과 선택</option>${org.map(d=>`<option ${lead===d.과?'selected':''}>${esc(d.과)}</option>`).join('')}</select><details><summary>협조 과 선택</summary><div class="partners">${org.map(d=>`<label><input type="checkbox" value="${esc(d.과)}" ${(r.협조과||[]).includes(d.과)?'checked':''}>${esc(d.과)}</label>`).join('')}</div></details></td><td><button class="confirm">${r.상태==='배분확정'?'변경 확정':'배분 확정'}</button><small class="subtitle">${esc(r.확정방법)}</small></td></tr>`;
  }).join('')}</tbody></table>`:'<div class="empty">표시할 문항이 없습니다. 위에서 요구서를 접수해 주세요.</div>';
  $('#history').innerHTML=table(['일시','작업','문항','주관 과','확정방법'],data.log.slice().reverse().map(l=>{const r=data.cases.find(r=>r.id===l.문항);return [new Date(l.일시).toLocaleString('ko-KR'),l.작업,r?`${r.의원} ${r.문항번호}번`:'',l.주관과||'',l.확정방법||''];}));
}
$('#files').addEventListener('change',()=>{preview=[];$('#register').disabled=true;$('#preview').innerHTML='';$('#checks').innerHTML='';$('#previewCount').textContent='문항 읽기를 눌러 선택한 파일을 확인하세요.';});
$('#read').addEventListener('click',async()=>{
  if(busy)return;const files=[...$('#files').files].sort((a,b)=>a.name.localeCompare(b.name,'ko'));if(!files.length){message('파일을 먼저 선택하세요.',true);return;}
  busy=true;preview=[];$('#register').disabled=true;$('#read').disabled=true;$('#files').disabled=true;$('#preview').innerHTML='';$('#checks').innerHTML='';$('#progress').hidden=false;
  try{
    const pending=[];
    for(const file of files){
      $('#progressText').textContent=`${file.name} 읽는 중`;
      if(/\.pdf$/i.test(file.name))pending.push(...await RequestSplit.readPdf(file,(page,total)=>{$('#progress').max=total;$('#progress').value=page;$('#progressText').textContent=`${file.name} · ${page}/${total}쪽`;}));
      else if(/\.csv$/i.test(file.name)){const rows=C.parseCsv(await file.text());pending.push(...rows.map(r=>Object.fromEntries(RequestSplit.fields.map(k=>[k,r[k]??'']))));}
      else throw Error('PDF 또는 CSV 파일을 선택하세요.');
    }
    const checks=RequestSplit.validate(pending);preview=pending;
    $('#checks').innerHTML=table(['파일명','파일명의 문항 수','뽑은 문항 수','마지막 번호','번호 연속','일치'],checks.map(r=>Object.values(r)));
    $('#preview').innerHTML=table(['의원','문항번호','제출기한','요구내용','세부항목','비고'],preview.map(r=>[r.의원,r.문항번호,r.제출기한,r.요구내용,r.세부항목,r.비고]));
    $('#previewCount').textContent=`${preview.length}문항 확인 완료 · 접수 등록 전입니다.`;$('#register').disabled=false;message('문항 수와 내용을 확인한 뒤 접수 등록을 눌러 주세요.');
  }catch(e){message(e.message,true);$('#previewCount').textContent='문항 읽기 실패 · 저장하지 않았습니다.';}
  finally{busy=false;$('#read').disabled=false;$('#files').disabled=false;$('#progress').hidden=true;$('#progressText').textContent='';}
});
$('#register').addEventListener('click',()=>{try{const result=C.register(preview);preview=[];$('#register').disabled=true;$('#previewCount').textContent='접수 등록 완료';render();message(`${result.count}문항 접수 등록 · 중복 ${result.duplicates}문항 제외`);}catch(e){message(e.message,true);}});
$('#assignments').addEventListener('click',event=>{if(!event.target.matches('.confirm'))return;const tr=event.target.closest('tr');try{const item=C.confirm(tr.dataset.id,tr.querySelector('.lead').value,[...tr.querySelectorAll('input:checked')].map(e=>e.value),org.map(d=>d.과));render();message(`${item.의원} ${item.문항번호}번 · ${item.주관과} 배분확정 (${item.확정방법})`);}catch(e){message(e.message,true);}});
$('#search').addEventListener('input',()=>{try{render();}catch(e){message(e.message,true);}});$('#filter').addEventListener('change',render);
addEventListener('storage',()=>{try{render();message('다른 탭에서 변경한 저장 자료를 반영했습니다.');}catch(e){message(e.message,true);}});
(async()=>{try{if(location.protocol==='file:')throw Error('로컬 서버로 열어 주세요: python -m http.server 8000 -d web → http://localhost:8000');await RequestEngine.ready;org=await C.readCsv('A부_조직도_26개과.csv');render();$('#files').disabled=false;$('#read').disabled=false;message('기준 자료를 불러왔습니다. 요구서를 선택해 주세요.');}catch(e){message(e.message,true);}})();
