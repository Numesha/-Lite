const imageOcrAssets=new URL('./ocr/',document.currentScript.src);
let imageOcrBatch=null,imageOcrWorker=null,imageOcrRun=0,imageOcrRuntime=null;

function imageOcrLoadRuntime(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(!imageOcrRuntime)imageOcrRuntime=new Promise((resolve,reject)=>{
    let script=document.createElement('script');script.src=new URL('tesseract.min.js',imageOcrAssets).href;
    script.onload=()=>resolve(window.Tesseract);
    script.onerror=()=>{imageOcrRuntime=null;script.remove();reject(Error('OCR本体を読み込めませんでした。'))};
    document.head.append(script);
  });
  return imageOcrRuntime;
}
function imageOcrCreateDialog(){
  let dialog=document.getElementById('imageOcrDialog');if(dialog)return dialog;
  let style=document.createElement('style');
  style.textContent=`#imageOcrDialog{width:min(94vw,640px);max-height:92dvh;overflow:auto}#imageOcrDialog .card{margin:0;box-shadow:none}#imageOcrDialog h2{margin:0}.image-ocr-group{border-top:1px solid var(--line);padding-top:12px;min-width:0}.image-ocr-group h3{margin:0;overflow-wrap:anywhere}.image-ocr-group summary{display:flex;align-items:center;gap:10px;margin:8px 0}.image-ocr-thumb{width:64px;height:104px;object-fit:contain;background:white;border:1px solid var(--line)}.image-ocr-full{display:block;max-width:100%;height:auto}.image-ocr-entry{border-top:1px solid var(--line);padding-top:10px;margin-top:10px;min-width:0}.image-ocr-entry label{margin:8px 0}.image-ocr-entry input,.image-ocr-entry select{min-width:0}.image-ocr-crop{display:block;width:100%;height:auto;max-height:80px;object-fit:contain;object-position:left;background:white;margin:8px 0}.image-ocr-note{overflow-wrap:anywhere;margin:6px 0}.image-ocr-tools{display:flex;gap:6px;flex-wrap:wrap}.image-ocr-footer{position:sticky;bottom:-12px;background:var(--panel);padding:10px 0;border-top:1px solid var(--line);z-index:1}.image-ocr-error{color:var(--danger)}#imageOcrProgress,#imageOcrTarget,#imageOcrWarning{overflow-wrap:anywhere;margin:0}#imageOcrGroups{min-width:0}`;
  document.head.append(style);
  dialog=document.createElement('dialog');dialog.id='imageOcrDialog';
  dialog.innerHTML='<form class="card grid"><h2>スクショ読み取りの確認</h2><p class="small" id="imageOcrTarget"></p><p class="small" id="imageOcrProgress" role="status" aria-live="polite"></p><div class="row wrap"><span class="pill" id="imageOcrSummary"></span></div><p class="small image-ocr-error" id="imageOcrWarning"></p><div id="imageOcrGroups"></div><datalist id="imageOcrNames"></datalist><div class="row wrap image-ocr-footer"><button type="button" class="primary" id="imageOcrApply" disabled>このリサーチに追加</button><button type="button" id="imageOcrClose">閉じる</button></div></form>';
  dialog.addEventListener('submit',ev=>ev.preventDefault());
  dialog.addEventListener('cancel',ev=>{ev.preventDefault();imageOcrClose()});
  dialog.addEventListener('close',()=>{if(imageOcrBatch)imageOcrDispose()});
  dialog.addEventListener('input',()=>imageOcrSync());
  dialog.addEventListener('change',()=>imageOcrSync());
  dialog.addEventListener('click',ev=>{
    let button=ev.target.closest('button');if(!button)return;
    if(button.id==='imageOcrClose'){imageOcrClose();return}
    if(button.id==='imageOcrApply'){imageOcrApply();return}
    if(!imageOcrBatch||imageOcrBatch.running)return;
    imageOcrSync();
    let group=imageOcrBatch.groups.find(g=>g.id===button.dataset.group);
    if(!group)return;
    let index=Number(button.dataset.index);
    if(button.dataset.insert!==undefined){group.entries.splice(index,0,{rawName:'手動追加',name:'',options:[],issue:'名前を選択',preview:''});imageOcrRender()}
    if(button.dataset.removeEntry!==undefined){group.entries.splice(index,1);imageOcrRender()}
    if(button.dataset.removeImage!==undefined){URL.revokeObjectURL(group.url);imageOcrBatch.groups=imageOcrBatch.groups.filter(g=>g!==group);imageOcrRender()}
    if(button.dataset.move!==undefined){let from=imageOcrBatch.groups.indexOf(group),to=from+Number(button.dataset.move);if(to>=0&&to<imageOcrBatch.groups.length){imageOcrBatch.groups.splice(from,1);imageOcrBatch.groups.splice(to,0,group);imageOcrRender()}}
    if(button.dataset.retry!==undefined)imageOcrProcess([group]);
  });
  document.body.append(dialog);return dialog;
}
function imageOcrTargetText(){
  let target=imageOcrBatch?.target,e=state.events.find(e=>e.id===target?.eventId);
  return e&&target?e.name+' / '+target.date+' / '+(target.research+1)+'回目':'';
}
function imageOcrRender(){
  let batch=imageOcrBatch;if(!batch)return;
  let disabled=batch.running?' disabled':'';
  document.getElementById('imageOcrGroups').innerHTML=batch.groups.map((group,gi)=>{
    let tools='<button type="button" class="icon" data-group="'+group.id+'" data-move="-1" title="画像を前へ" aria-label="画像を前へ" '+(gi===0?'disabled':disabled)+'>↑</button><button type="button" class="icon" data-group="'+group.id+'" data-move="1" title="画像を後へ" aria-label="画像を後へ" '+(gi===batch.groups.length-1?'disabled':disabled)+'>↓</button><button type="button" class="icon danger" data-group="'+group.id+'" data-remove-image title="画像を除外" aria-label="画像を除外"'+disabled+'>×</button>';
    let rows=group.entries.map((entry,i)=>{
      let field=entry.options.length?'<select data-image-name="'+group.id+'-'+i+'" aria-label="画像'+(gi+1)+'・'+(i+1)+'匹目の姿"'+disabled+'><option value="">選択してください</option>'+entry.options.map(n=>'<option value="'+esc(n)+'" '+(entry.name===n?'selected':'')+'>'+esc(n)+'</option>').join('')+'</select>':'<input list="imageOcrNames" data-image-name="'+group.id+'-'+i+'" value="'+esc(entry.name)+'" placeholder="'+esc(entry.rawName)+'" aria-label="画像'+(gi+1)+'・'+(i+1)+'匹目の名前"'+disabled+'>';
      return '<div class="image-ocr-entry"><div class="between wrap"><strong>'+(i+1)+'匹目</strong><div class="image-ocr-tools"><button type="button" class="icon" data-group="'+group.id+'" data-index="'+(i+1)+'" data-insert title="この後に1匹追加" aria-label="この後に1匹追加"'+disabled+'>＋</button><button type="button" class="icon danger" data-group="'+group.id+'" data-index="'+i+'" data-remove-entry title="候補を削除" aria-label="候補を削除"'+disabled+'>×</button></div></div>'+(entry.preview?'<img class="image-ocr-crop" src="'+entry.preview+'" alt="'+(i+1)+'匹目の読み取り部分">':'')+'<label>ポケモン'+field+'</label><p class="small muted image-ocr-note">読取：'+esc(entry.rawName)+'</p><p class="small image-ocr-note" data-image-status="'+group.id+'-'+i+'"></p></div>';
    }).join('');
    return '<section class="image-ocr-group" data-image-group="'+group.id+'"><div class="between wrap"><h3>画像'+(gi+1)+' <span class="small muted">'+group.entries.length+'匹</span></h3><div class="image-ocr-tools">'+tools+'</div></div><p class="small muted image-ocr-note">'+esc(group.file.name)+'</p><p class="small muted image-ocr-note">読み取り日付：'+esc(group.date||'未読取')+'</p><details><summary><img class="image-ocr-thumb" src="'+group.url+'" alt="画像'+(gi+1)+'の縮小表示"><span class="small">元画像を表示</span></summary><img class="image-ocr-full" src="'+group.url+'" alt="画像'+(gi+1)+'"></details><p class="small image-ocr-note '+(group.status==='error'?'image-ocr-error':'muted')+'">'+esc(group.error||({waiting:'待機中',reading:'読み取り中',done:group.entries.length?'読み取り完了':'候補なし'}[group.status]||''))+'</p>'+(group.status==='error'?'<button type="button" data-group="'+group.id+'" data-retry'+disabled+'>再試行</button>':'')+'<button type="button" data-group="'+group.id+'" data-index="0" data-insert'+disabled+'>先頭に1匹追加</button>'+rows+'</section>';
  }).join('');
  imageOcrSummary();
}
function imageOcrSync(){
  if(!imageOcrBatch||imageOcrBatch.running)return;
  imageOcrBatch.groups.forEach(g=>g.entries.forEach((entry,i)=>{
    let input=document.querySelector('[data-image-name="'+g.id+'-'+i+'"]');if(input)entry.name=input.value.trim();
  }));
  imageOcrSummary();
}
function imageOcrSummary(){
  let batch=imageOcrBatch;if(!batch)return;
  let catalog=getOcrCatalog(),total=0,pending=0;
  batch.groups.forEach(g=>g.entries.forEach((entry,i)=>{
    total++;let name=catalog.exact.get(ocrNameKey(entry.name));if(!name)pending++;
    let status=document.querySelector('[data-image-status="'+g.id+'-'+i+'"]');
    if(status){status.textContent=name?(pokemonTypeMaster[name]||'')+' / 1匹':'要確認：'+(entry.issue||'名前を確認');status.className='small image-ocr-note '+(name?'muted':'image-ocr-error')}
  }));
  let dates=[...new Set(batch.groups.map(g=>g.date).filter(Boolean))],warnings=[];
  if(dates.length>1)warnings.push('異なる日付の画像があります：'+dates.join('、'));
  else if(dates[0]&&dates[0]!==batch.target.date)warnings.push('読み取り日付 '+dates[0]+' と追加先の日付が異なります。');
  let missing=batch.groups.filter(g=>g.status==='done'&&!g.date).length;
  if(missing)warnings.push('日付を読み取れない画像：'+missing+'枚');
  let failed=batch.groups.filter(g=>g.status==='error').length;
  if(failed)warnings.push('読み取り失敗：'+failed+'枚');
  if(batch.error)warnings.push(batch.error);
  document.getElementById('imageOcrTarget').textContent='追加先：'+imageOcrTargetText();
  document.getElementById('imageOcrSummary').textContent='画像 '+batch.groups.length+'枚 / 合計 '+total+'匹 / 要確認 '+pending+'件';
  document.getElementById('imageOcrWarning').textContent=warnings.join('\n');
  document.getElementById('imageOcrProgress').textContent=batch.progress||'';
  document.getElementById('imageOcrApply').disabled=batch.running||!total||pending>0||dates.length>1||!!batch.error||batch.groups.some(g=>g.status!=='done'||!g.entries.length);
}
function imageOcrCanvas(source,left,top,width,height,outWidth){
  let canvas=document.createElement('canvas');canvas.width=outWidth;canvas.height=Math.round(height*outWidth/width);
  let ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingQuality='high';ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,left,top,width,height,0,0,canvas.width,canvas.height);
  let pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<pixels.data.length;i+=4){let gray=Math.round(.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2]);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray}
  ctx.putImageData(pixels,0,0);return canvas;
}
function imageOcrThreshold(source,threshold,invert=false){
  let canvas=imageOcrCanvas(source,0,0,source.width,source.height,source.width),ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<pixels.data.length;i+=4){let gray=invert?255-pixels.data[i]:pixels.data[i],value=gray<threshold?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value}
  ctx.putImageData(pixels,0,0);return canvas;
}
function imageOcrResolve(rawName,preview){
  let catalog=getOcrCatalog(),key=ocrNameKey(rawName),exact=catalog.exact.get(key)||'',family=catalog.families.get(key)||[],ambiguous=family.length>1;
  return{rawName,name:ambiguous?'':exact,options:ambiguous?family:[],issue:ambiguous?'姿・シーズンを選択':'名前を確認',preview};
}
function imageOcrHasTypeBadge(img,lineY){
  let w=img.naturalWidth,h=img.naturalHeight,scale=Math.round(w*.69)/1400,y=Math.round(h*.13)+lineY*scale;
  let canvas=document.createElement('canvas');canvas.width=120;canvas.height=40;
  let ctx=canvas.getContext('2d');ctx.drawImage(img,w*.245,Math.max(0,y-w*.12),w*.23,w*.085,0,0,120,40);
  let pixels=ctx.getImageData(0,0,120,40).data,count=0;
  for(let i=0;i<pixels.length;i+=4){let r=pixels[i],g=pixels[i+1],b=pixels[i+2];if((r>200&&g>180&&b<170)||(r<180&&g>200&&b>190))count++}
  canvas.width=canvas.height=1;return count>120*40*.04;
}
async function imageOcrReadGroup(group,worker,token){
  let img=new Image();img.src=group.url;
  try{await img.decode()}catch(error){throw Error('画像を開けませんでした。別の画像を選択するか再試行してください。')}
  if(token!==imageOcrRun)throw Error('中止');
  let width=img.naturalWidth,height=img.naturalHeight;
  if(width<250||height<400)throw Error('画像が小さすぎます。元のスクショを選択してください。');
  let canvas=imageOcrCanvas(img,Math.round(width*.24),Math.round(height*.13),Math.round(width*.69),Math.round(height*.75),1400);
  await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1',tessedit_char_whitelist:''});
  let {data}=await worker.recognize(canvas,{}, {text:true,blocks:true});
  if(token!==imageOcrRun)throw Error('中止');
  let lines=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
  let candidates=lines.filter(l=>l.bbox.x0<70&&l.bbox.x1<1190&&l.bbox.y1-l.bbox.y0>45&&l.bbox.y1-l.bbox.y0<110&&imageOcrHasTypeBadge(img,l.bbox.y0)).sort((a,b)=>a.bbox.y0-b.bbox.y0);
  let entries=[];
  for(let line of candidates){
    let raw=line.text.split(/[#＃]/)[0].trim(),catalog=getOcrCatalog(),key=ocrNameKey(raw);
    let b=line.bbox,left=Math.max(0,b.x0-12),top=Math.max(0,b.y0-15),cropWidth=Math.min(canvas.width-left,b.x1-left+16),cropHeight=Math.min(canvas.height-top,b.y1-b.y0+32);
    let crop=imageOcrCanvas(canvas,left,top,cropWidth,cropHeight,cropWidth);
    if(!catalog.exact.has(key)&&!catalog.families.has(key)){
      let retries=[];await worker.setParameters({tessedit_pageseg_mode:'7'});
      for(let threshold of [200,210,220,230]){
        let padded=document.createElement('canvas');padded.width=crop.width+40;padded.height=crop.height+40;
        let ctx=padded.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,padded.width,padded.height);ctx.drawImage(imageOcrThreshold(crop,threshold),20,20);
        let result=await worker.recognize(padded);retries.push(catalog.exact.get(ocrNameKey(result.data.text.split(/[#＃]/)[0].trim()))||'');padded.width=padded.height=1;
        if(token!==imageOcrRun)throw Error('中止');
      }
      let agreed=[...new Set(retries.filter(Boolean))];if(agreed.length===1)raw=agreed[0];
    }
    entries.push(imageOcrResolve(raw,crop.toDataURL('image/png')));crop.width=crop.height=1;
  }
  let header=imageOcrCanvas(img,Math.round(width*.185),Math.round(height*.09),Math.round(width*.48),Math.round(height*.028),1200);
  await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789年月日'});
  let date=null;
  for(let skew of [.22,.38,0]){
    let corrected=document.createElement('canvas');corrected.width=header.width+Math.round(header.height*skew);corrected.height=header.height;
    let ctx=corrected.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,corrected.width,corrected.height);ctx.transform(1,0,skew,1,0,0);ctx.drawImage(imageOcrThreshold(header,55,true),0,0);
    let dateResult=await worker.recognize(corrected);
    let match=dateResult.data.text.normalize('NFKC').replace(/\s/g,'').match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    corrected.width=corrected.height=1;
    if(match){let y=Number(match[1]),m=Number(match[2]),d=Number(match[3]),test=new Date(y,m-1,d);if(y>=2000&&y<=2100&&test.getFullYear()===y&&test.getMonth()===m-1&&test.getDate()===d){date=match;break}}
  }
  if(date){let y=Number(date[1]),m=Number(date[2]),d=Number(date[3]),test=new Date(y,m-1,d);if(y<2000||y>2100||test.getFullYear()!==y||test.getMonth()!==m-1||test.getDate()!==d)date=null}
  header.width=header.height=canvas.width=canvas.height=1;img.src='';
  return{entries,date:date?date[1]+'-'+date[2].padStart(2,'0')+'-'+date[3].padStart(2,'0'):''};
}
async function imageOcrProcess(groups){
  let batch=imageOcrBatch;if(!batch||batch.running)return;
  let token=++imageOcrRun,worker=null;
  batch.running=true;batch.error='';batch.progress='文字認識を準備中';
  groups.forEach(g=>{g.status='waiting';g.error=''});imageOcrRender();
  try{
    let runtime=await imageOcrLoadRuntime();if(token!==imageOcrRun)return;
    worker=await runtime.createWorker('jpn',1,{workerPath:new URL('worker.min.js',imageOcrAssets).href,corePath:new URL('core/',imageOcrAssets).href,langPath:imageOcrAssets.href.replace(/\/$/,''),gzip:false,workerBlobURL:false,cachePath:'pokesuri-jpn-v7'});
    if(token!==imageOcrRun){await worker.terminate();return}imageOcrWorker=worker;
    for(let i=0;i<groups.length;i++){
      let group=groups[i];group.status='reading';batch.progress='画像 '+(i+1)+' / '+groups.length+'枚を読み取り中';imageOcrRender();
      try{let result=await imageOcrReadGroup(group,worker,token);if(token!==imageOcrRun)return;Object.assign(group,result,{status:'done',error:''})}
      catch(error){if(token!==imageOcrRun)return;group.status='error';group.entries=[];group.error=error.message||'画像を読み取れませんでした。'}
    }
    batch.progress='読み取り終了';
  }catch(error){if(token===imageOcrRun){batch.error='文字認識を開始できませんでした。ページを開き直して再試行してください。';batch.progress='読み取り失敗';groups.forEach(g=>{if(g.status!=='done'){g.status='error';g.error='読み取り未完了'}})}}
  finally{
    if(imageOcrWorker===worker)imageOcrWorker=null;
    if(worker)await worker.terminate().catch(()=>{});
    if(token===imageOcrRun&&imageOcrBatch===batch){batch.running=false;imageOcrRender()}
  }
}
function startScreenshotBatch(files){
  let e=curEvent();if(!e||!files.length)return;
  curResearch();
  if(imageOcrBatch)imageOcrClose();
  let dialog=imageOcrCreateDialog();
  imageOcrBatch={target:{eventId:e.id,date:e.days[activeDay].date,research:activeResearch},groups:files.map((file,i)=>({id:'img'+i,file,url:URL.createObjectURL(file),date:'',entries:[],status:'waiting',error:''})),running:false,error:'',progress:''};
  document.getElementById('imageOcrNames').innerHTML=sortByDex(pokemonMaster).map(n=>'<option value="'+esc(n)+'"></option>').join('');
  imageOcrRender();dialog.showModal();imageOcrProcess(imageOcrBatch.groups);
}
function imageOcrDispose(){
  imageOcrRun++;let worker=imageOcrWorker;imageOcrWorker=null;
  if(worker)worker.terminate().catch(()=>{});
  if(imageOcrBatch)imageOcrBatch.groups.forEach(g=>URL.revokeObjectURL(g.url));imageOcrBatch=null;
  document.getElementById('imageOcrGroups').innerHTML='';
}
function imageOcrClose(){imageOcrDispose();document.getElementById('imageOcrDialog').close()}
function imageOcrApply(){
  imageOcrSync();let batch=imageOcrBatch;if(!batch||document.getElementById('imageOcrApply').disabled)return;
  let e=curEvent(),day=e?.days[activeDay],target=batch.target;
  if(e?.id!==target.eventId||day?.date!==target.date||activeResearch!==target.research){alert('追加先が変わりました。閉じて読み込み直してください。');return}
  let research=day.researches[activeResearch];
  if(research.sleepType==='リサーチなし'){alert('追加先が「リサーチなし」です。睡眠タイプを選び直してください。');return}
  let entries=batch.groups.flatMap(g=>g.entries),existing=research.pokemon.reduce((sum,p)=>sum+(Number(p.count)||1),0),dates=[...new Set(batch.groups.map(g=>g.date).filter(Boolean))];
  let warning=dates[0]&&dates[0]!==target.date?'読み取り日付は '+dates[0]+' です。\n':'';
  if(!confirm(warning+imageOcrTargetText()+'\n画像 '+batch.groups.length+'枚・'+entries.length+'匹を追加します。現在 '+existing+'匹 → '+(existing+entries.length)+'匹\n追加しますか？'))return;
  let catalog=getOcrCatalog(),rows=research.pokemon.map(p=>({...p}));
  entries.forEach(entry=>{let name=catalog.exact.get(ocrNameKey(entry.name)),found=rows.find(p=>p.name===name);if(found)found.count=(Number(found.count)||1)+1;else rows.push({name,count:1,sleepType:state.pokemonTypes[name]||pokemonTypeMaster[name]||'うとうと'})});
  research.pokemon=rows;let total=entries.length;imageOcrClose();refreshPokemonInputArea();renderLog();saveNow();ocrStatus.textContent=total+'匹を追加しました。';
}
