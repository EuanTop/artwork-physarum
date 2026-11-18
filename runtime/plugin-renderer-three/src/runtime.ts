import {RUNTIME_STATE_MAX_CHARACTERS,ARTWORK_FILE_MAX_CHARACTERS} from '../../contracts/src/index';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Project, RenderSnapshot, CaptureRequest, PlaybackInfo, Value, RuntimeState } from '@art/contracts';
type Artwork = {scene: THREE.Scene; ready?:Promise<void>; camera?: THREE.PerspectiveCamera; objects?: {id:string;label:string;object:THREE.Object3D}[]; update?:(ctx:Record<string,any>)=>void;render?:(ctx:Record<string,any>)=>void;orbitControls?:boolean;timeline?:PlaybackInfo;dispose?:()=>void};
type Factory = (ctx: Record<string,any>) => Artwork;
export function boot(createArtwork:Factory) {
  let project:Project, art:Artwork|undefined, previousData='', last=performance.now(), time=0, buildHash='';
  let lastClockSent=-Infinity,ended=false,applyGeneration=0;
  const fileReads=new Map<string,{resolve:(text:string|undefined)=>void;reject:(e:Error)=>void}>();
  const stateWrites=new Map<string,{resolve:()=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  let timeline:PlaybackInfo|undefined;
  const clock=(finished=false)=>{lastClockSent=performance.now();if(project)send('clock',{clock:{revision:project.revision,buildHash,time,ended:finished}});};
  let width=Math.max(1,window.innerWidth),height=Math.max(1,window.innerHeight),capturing=false;
  const standalone=Boolean((window as any).__ART_BOOT__)||window.parent===window;
  const send=(type:string,data:Record<string,unknown>={})=>{ if(!standalone)parent.postMessage({channel:'art-runtime-v1',type,...data},'*');else if(type==='applied')document.documentElement.dataset.visloomRender='ready';else if(type==='error'){document.documentElement.dataset.visloomRender='error';let status=document.getElementById('art-load-error');if(!status){status=document.createElement('p');status.id='art-load-error';status.setAttribute('role','alert');status.style.cssText='position:fixed;inset:16px 16px auto;padding:12px;background:#fff1df;color:#441b0d;z-index:100;font:13px system-ui';document.body.append(status);}status.textContent='作品暂时无法载入，请刷新重试。';} };
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(width,height); renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor('#101516'); document.body.style.margin='0';document.body.append(renderer.domElement);
  let camera=new THREE.PerspectiveCamera(40,width/height,0.1,2000);camera.position.set(0,5,17);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
  controls.addEventListener('end',()=>send('camera',{camera:{position:camera.position.toArray(),target:controls.target.toArray()}}));
  const context=()=>{
    const data=project.result?.rows??[];
    const values=data.map(r=>r[project.state.mapping.field]).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));
    const transformed=values.map(v=>project.state.mapping.transform==='log'?Math.log1p(Math.max(0,v)):v);
    const lo=Math.min(...transformed),hi=Math.max(...transformed);
    const weights=transformed.map(v=>{const n=hi===lo?0.5:(v-lo)/(hi-lo);return project.state.mapping.transform==='reverse'?1-n:n;});
    return {THREE,standalone,fileIOAvailable:!standalone||parent===window,onOpenFile:standalone?undefined:()=>new Promise<string|undefined>((resolve,reject)=>{const id=crypto.randomUUID();fileReads.set(id,{resolve,reject});send('open-file',{id});}),onDownloadFile:standalone?undefined:(name:string,content:string)=>{if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(name)||typeof content!=='string'||content.length>ARTWORK_FILE_MAX_CHARACTERS)throw new Error('导出文件无效或过大');send('download-file',{name,content});},runtimeState:project.state.runtime,onRuntimeState:(runtime:RuntimeState,parameters:Record<string,Value>={})=>{
      if(!runtime||typeof runtime.data!=='string'||runtime.data.length>RUNTIME_STATE_MAX_CHARACTERS)throw new Error('形态快照超过保存限制。');
      const valid=Object.fromEntries(Object.entries(parameters).filter(([id])=>project.schema.some(p=>p.id===id)));
      project={...project,state:{...project.state,runtime,parameters:{...project.state.parameters,...valid}}};
      if(standalone)return Promise.resolve();
      return new Promise<void>((resolve,reject)=>{const id=crypto.randomUUID();const timer=setTimeout(()=>{stateWrites.delete(id);reject(new Error('形态保存超时，请重试。'));},25000);stateWrites.set(id,{resolve,reject,timer});send('runtime-state',{id,runtime,parameters:valid,revision:project.revision});});
    },parameters:project.state.parameters,data,mapping:project.state.mapping,weights,seed:project.state.seed,time,width,height,renderer,camera,capturing,pageScroll:standalone&&parent!==window,onParameters:(values:Record<string,Value>)=>{
      const parameters=Object.fromEntries(Object.entries(values).filter(([id,value])=>project.schema.some(p=>p.id===id)&&['string','boolean','number'].includes(typeof value)));
      if(!Object.keys(parameters).length)return;
      project={...project,state:{...project.state,parameters:{...project.state.parameters,...parameters}}};
      send('parameters',{revision:project.revision,parameters});
    }};
  };
  function rebuild(){
    art?.dispose?.(); art?.scene.traverse(o=>{const m=o as THREE.Mesh;m.geometry?.dispose();const materials=Array.isArray(m.material)?m.material:[m.material];materials.forEach(v=>v?.dispose());});
    art=createArtwork(context());if(!art?.scene?.isScene)throw new Error('createArtwork must return { scene: THREE.Scene }');
    if(art.camera){camera=art.camera;controls.object=camera;}
    controls.enabled=art.orbitControls!==false;
  }
  function resizeViewport(){const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);if(w!==width||h!==height){width=w;height=h;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}}
  function draw(at:number){if(!capturing)resizeViewport();time=at;art?.update?.(context());if(controls.enabled)controls.update();if(art?.render)art.render(context());else if(art)renderer.render(art.scene,camera);}
  async function apply(snapshot:RenderSnapshot,draft=false){
    const generation=++applyGeneration;
    project=snapshot.project;buildHash=snapshot.buildHash;time=snapshot.time;ended=false;
    const nextData=JSON.stringify([project.result?.id,project.state.seed,project.state.mapping]);
    if(!art||nextData!==previousData){rebuild();previousData=nextData;}
    // Snapshots created before explicit playback retain their implicit clock.
    timeline=art?.timeline??(project.playbackMode==='explicit'?undefined:{enabled:true,label:'作品动画',duration:30,usesSeed:true});
    const instance=art;await instance?.ready;if(generation!==applyGeneration||instance!==art)return;
    if(project.state.camera){camera.position.fromArray(project.state.camera.position);controls.target.fromArray(project.state.camera.target);}
    draw(time);
    // Stateful artworks may begin an asynchronous restore while consuming the new state.
    await instance?.ready;if(generation!==applyGeneration||instance!==art)return;
    if(art?.render)art.render(context());
    if(!draft)send('applied',{ack:{revision:project.revision,buildHash,frameTime:time,timeline,objects:art?.objects?.map(({id,label})=>({id,label}))??[],diagnostics:{width,height,pixelWidth:renderer.domElement.width,pixelHeight:renderer.domElement.height,children:art?.scene.children.length}}});
    if(!draft)clock();
  }
  async function capture(req:CaptureRequest){
    if(!project||project.revision!==req.revision||buildHash!==req.buildHash)throw new Error('Capture version is no longer active');
    const previous={time,pixelRatio:renderer.getPixelRatio()};
    capturing=true;
    renderer.setPixelRatio(1);renderer.setSize(req.width,req.height);camera.aspect=req.width/req.height;camera.updateProjectionMatrix();width=req.width;height=req.height;
    try { draw(req.time);return renderer.domElement.toDataURL('image/png'); }
    finally { capturing=false;width=Math.max(1,window.innerWidth);height=Math.max(1,window.innerHeight);renderer.setPixelRatio(previous.pixelRatio);renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();draw(previous.time); }
  }
  window.addEventListener('message',async event=>{
    if(event.source!==parent||event.data?.channel!=='art-host-v1')return;
    const message=event.data;
    try{
      if(message.type==='file-opened'){const pending=fileReads.get(message.id);if(pending){fileReads.delete(message.id);if(message.error)pending.reject(new Error(message.error));else if(message.content===undefined||typeof message.content==='string'&&message.content.length<=ARTWORK_FILE_MAX_CHARACTERS)pending.resolve(message.content);else pending.reject(new Error('文件内容无效或过大'));}}
      if(message.type==='runtime-state-saved'){const pending=stateWrites.get(message.id);if(pending){clearTimeout(pending.timer);stateWrites.delete(message.id);if(message.error)pending.reject(new Error(message.error));else pending.resolve();}}
      if(message.type==='apply')await apply(message.snapshot,Boolean(message.draft));
      if(message.type==='capture')send('capture',{id:message.request.id,png:await capture(message.request),revision:project.revision,buildHash});
      if(message.type==='select'&&art){const object=art.objects?.find(o=>o.id===message.id)?.object;if(object){const box=new THREE.Box3().setFromObject(object);if(!box.isEmpty())controls.target.copy(box.getCenter(new THREE.Vector3()));}}
    }catch(error){send('error',{message:String(error),requestId:message.request?.id});}
  });
  const raycaster=new THREE.Raycaster();
  renderer.domElement.addEventListener('pointerdown',event=>{
    if(!art)return;const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    const hits=raycaster.intersectObjects(art.objects?.map(o=>o.object)??[],true);
    if(hits.length){let object:THREE.Object3D|null=hits[0].object;while(object){const registered=art.objects?.find(o=>o.object===object);if(registered){send('selected',{id:registered.id});break;}object=object.parent;}}
  });
  window.addEventListener('resize',()=>{width=innerWidth;height=innerHeight;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();if(art)draw(time);});
  window.addEventListener('error',e=>send('error',{message:e.message}));
  window.addEventListener('unhandledrejection',e=>send('error',{message:String(e.reason)}));
  function frame(now:number) {
    const delta=Math.min((now-last)/1000,0.1);
    last=now;
    if(project&&art) {
      const playing=timeline?.enabled&&!project.state.paused&&!ended?timeline:undefined;
      if(playing)time=Math.min(playing.duration,time+delta);
      try {
        draw(time);
        if(playing&&time>=playing.duration){ended=true;clock(true);}
        else if(playing&&now-lastClockSent>=200)clock();
      } catch(error) {
        send('error',{message:String(error)});
        return;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const initial=(window as any).__ART_BOOT__ as RenderSnapshot|undefined;
  if(standalone&&initial){void apply(initial).catch(error=>send('error',{message:String(error)}));document.title=initial.project.name;}
  else send('ready');
}
