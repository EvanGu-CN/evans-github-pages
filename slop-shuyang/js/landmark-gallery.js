import {LANDMARKS,nearestRoadPoint} from './city-config.js';
import {LANDMARK_REFERENCES} from './landmark-references.js';
import {COMMUNITY_DETAILS} from './community-data.js';

function installLandmarkGallery({onOpen,onClose,onTeleport}={}){
  const dialog=document.createElement('dialog');dialog.className='landmark-gallery';dialog.id='landmark-gallery';
  dialog.setAttribute('aria-labelledby','landmark-gallery-title');
  dialog.innerHTML='<div class="landmark-gallery-header"><h2 id="landmark-gallery-title">建筑与小区实景参考</h2><button type="button" aria-label="关闭实景参考">×</button></div><p class="landmark-gallery-progress"></p><select aria-label="选择地标照片" class="landmark-gallery-select"></select><img class="landmark-gallery-image" alt=""><p class="landmark-gallery-caption"></p><p class="landmark-gallery-note"></p><div class="landmark-gallery-actions"><button type="button" data-photo="prev">上一张</button><span class="landmark-gallery-count"></span><button type="button" data-photo="next">下一张</button><button type="button" data-arrive hidden>前往地图通行口</button><a target="_blank" rel="noopener noreferrer">查看原始来源 ↗</a></div>';
  document.body.append(dialog);
  const select=dialog.querySelector('select'),image=dialog.querySelector('img'),caption=dialog.querySelector('.landmark-gallery-caption');
  const records=new Map(LANDMARKS.map(l=>[l.id,{name:l.name,...LANDMARK_REFERENCES[l.id]}]));
  for(const c of COMMUNITY_DETAILS.communities){
    const candidates=(c.mapContext?.matches||[]).flatMap(m=>m.photos).filter(p=>p.image!==c.photo?.image);
    const note=c.photo?(c.gate?c.photo.placementNote:c.photo.identityVisible===false?'地点照片与可见庭院布局交叉核对，照片未见小区题名；具体门址尚未确认。':'已核对具名实拍，具体门址尚未确认，暂不设置门楼。'):'入口外观尚未核对实拍。地点关联图片经名称与位置筛选，外观仍需逐张核验。';
    records.set('community:'+c.id,{name:c.name,note:`小区内建筑仍在逐步核对完善。${c.boundarySource?'小区范围依据参考图近似标注，不是正式红线。':''}${note}`,
      access:c.gate||c.access[0],photos:[...(c.photo?[{...c.photo,caption:(c.photo.caption||'小区入口实景参考。')+' 拍摄日期：'+c.photo.date+'。'}]:[]),...candidates]});
  }
  for(const [label,keys] of [['地标建筑',LANDMARKS.map(l=>l.id)],['小区',COMMUNITY_DETAILS.communities.map(c=>'community:'+c.id)]]){
    const group=document.createElement('optgroup');group.label=label;select.append(group);
    for(const key of keys){const r=records.get(key),o=document.createElement('option');o.value=key;o.textContent=r.name+(r.photos.length?'':' · 照片待补充');group.append(o)}
  }
  dialog.querySelector('.landmark-gallery-progress').textContent=`${LANDMARKS.length}处地标 · ${COMMUNITY_DETAILS.audit.communities}个小区 · ${COMMUNITY_DETAILS.audit.reviewedPhotos}个已核对实景照片 · ${COMMUNITY_DETAILS.audit.withMapPhotoCandidates||0}个有地图地点图片`;
  let index=0;
  const current=()=>records.get(select.value);
  function render(){
    const r=current(),p=r.photos[index];image.hidden=true;
    if(p){image.src=p.image;image.alt=r.name+'实景参考';caption.textContent=p.caption+'　图片：'+p.credit}
    else{image.removeAttribute('src');caption.textContent='尚无通过核对的入口照片。'}
    dialog.querySelector('.landmark-gallery-note').textContent=r.note;
    dialog.querySelector('.landmark-gallery-count').textContent=r.photos.length?`${index+1} / ${r.photos.length}`:'待补充';
    const a=dialog.querySelector('a');a.hidden=!p;if(p)a.href=p.page;
    for(const b of dialog.querySelectorAll('[data-photo]'))b.disabled=r.photos.length<2;
    dialog.querySelector('[data-arrive]').hidden=!r.access||!onTeleport;
  }
  image.addEventListener('load',()=>{if(current()?.photos[index]?.image===image.getAttribute('src'))image.hidden=false});
  image.addEventListener('error',()=>{image.hidden=true;if(current()?.photos.length)caption.textContent+='　图片暂未加载，可打开原始来源查看。'});
  select.addEventListener('change',()=>{index=0;render()});
  for(const b of dialog.querySelectorAll('[data-photo]'))b.addEventListener('click',()=>{const n=current().photos.length;if(n){index=(index+(b.dataset.photo==='next'?1:n-1))%n;render()}});
  dialog.querySelector('[data-arrive]').addEventListener('click',()=>{
    const a=current().access;if(!a)return;
    const p=nearestRoadPoint(a.x+Math.sin(a.heading)*24,a.z+Math.cos(a.heading)*24,120)||a;
    dialog.close();onTeleport?.(p.x,p.z,Math.atan2(a.x-p.x,a.z-p.z));
  });
  dialog.querySelector('[aria-label="关闭实景参考"]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>onClose?.());
  function open(community){
    if(community)select.value='community:'+COMMUNITY_DETAILS.communities.find(c=>c.photo).id;
    else if(select.value.startsWith('community:'))select.value=LANDMARKS[0].id;
    index=0;onOpen?.();render();dialog.showModal();select.focus();
  }
  document.getElementById('btn-landmark-photos')?.addEventListener('click',()=>open(false));
  document.getElementById('btn-community-photos')?.addEventListener('click',()=>open(true));
  return {dialog};
}
export {installLandmarkGallery};
