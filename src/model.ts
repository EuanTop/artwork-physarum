/** Independent Physarum-inspired artistic model. Positions are layout constraints, not predictions. */
export type Site={id:string;kind:'nutrient'|'inoculum';x:number;y:number;radius:number;origin:string};
export type PhysarumParameters={growing:boolean;sensorDistance:number;sensorAngle:number;turnAngle:number;stepSize:number;deposit:number;decay:number;response:number;foodInfluence:number;renewal:number;contrast:number;zoom:number;speed:number;regrow:number;showSources:boolean;reveal:number;observationTime:number;observationInfluence:number};
export const DEFAULTS:PhysarumParameters={growing:false,sensorDistance:4,sensorAngle:60,turnAngle:45,stepSize:1.2,deposit:.04,decay:.83,response:1.05,foodInfluence:.35,renewal:.003,contrast:1.4,zoom:1.04,speed:2,regrow:0,showSources:false,reveal:0,observationTime:0,observationInfluence:.65};
const finite=(v:unknown,f:number)=>typeof v==='number'&&Number.isFinite(v)?v:f;
export function parametersFrom(values:Record<string,unknown>):PhysarumParameters{
 const p={...DEFAULTS};for(const k of Object.keys(p) as (keyof PhysarumParameters)[]){if(typeof p[k]==='boolean')(p as any)[k]=typeof values[k]==='boolean'?values[k]:p[k];else(p as any)[k]=finite(values[k],p[k] as number);}
 p.sensorDistance=Math.max(2,Math.min(40,p.sensorDistance));p.sensorAngle=Math.max(5,Math.min(90,p.sensorAngle));p.turnAngle=Math.max(2,Math.min(90,p.turnAngle));p.stepSize=Math.max(.2,Math.min(3,p.stepSize));p.deposit=Math.max(.01,Math.min(.3,p.deposit));p.decay=Math.max(.75,Math.min(.995,p.decay));p.response=Math.max(0,Math.min(2,p.response));p.foodInfluence=Math.max(0,Math.min(2,p.foodInfluence));p.renewal=Math.max(0,Math.min(.02,p.renewal));p.contrast=Math.max(.3,Math.min(3,p.contrast));p.zoom=Math.max(.75,Math.min(3,p.zoom));p.speed=Math.max(1,Math.min(6,Math.round(p.speed)));p.regrow=Math.max(0,Math.min(100000,Math.round(p.regrow)));p.reveal=Math.max(0,Math.min(1,p.reveal));p.observationTime=Math.max(0,Math.min(1,p.observationTime));p.observationInfluence=Math.max(0,Math.min(2,p.observationInfluence));return p;
}
export function readSites(rows:unknown):Site[]{
 if(!Array.isArray(rows))return[];
 const coordinate=(value:unknown)=>typeof value==='number'?value:typeof value==='string'&&value.trim()!==''?Number(value):NaN;
 return rows.flatMap((value:unknown)=>{if(!value||typeof value!=='object'||Array.isArray(value))return[];const r=value as Record<string,unknown>,x=coordinate(r.x),y=coordinate(r.y),radius=coordinate(r.radius);if(!['nutrient','inoculum'].includes(String(r.kind))||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1||typeof r.id!=='string'||!r.id.trim())return[];return[{id:r.id.slice(0,120),kind:r.kind as Site['kind'],x,y,radius:Number.isFinite(radius)&&radius>0?Math.min(r.kind==='inoculum'?.46:.15,radius):.025,origin:typeof r.origin==='string'?r.origin.slice(0,120):'unknown'}];}).slice(0,32);
}
export function randomSource(seed:number){let n=seed>>>0||0x9e3779b9;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};}
export function initialPositions(side:number,seed:number,sites:Site[]){
 const random=randomSource(seed),out=new Float32Array(side*side*4),starts=sites.filter(s=>s.kind==='inoculum');
 for(let i=0;i<side*side;i++){let x:number,y:number;if(starts.length){const start=starts[i%starts.length],r=start.radius*(i%5===0?Math.sqrt(random()):Math.pow(random(),1.6)),a=random()*Math.PI*2;x=start.x+r*Math.cos(a);y=start.y+r*Math.sin(a);}else{const a=random()*Math.PI*2,r=.46*Math.sqrt(random());x=.5+r*Math.cos(a);y=.5+r*Math.sin(a);}out.set([x,y,random()*Math.PI*2,0],i*4);}return out;
}

/** Separation continues into a depth burst; the simulation buffers remain unchanged. */
export function viewFromReveal(pick:number,zoom:number){
 const p=Math.max(0,Math.min(1,pick)),first=Math.min(p,.5),wave=Math.sin(Math.PI*first);
 const t=Math.max(0,Math.min(1,(p-.52)/.48)),burst=t*t*(3-2*t);
 return{zoom:zoom*(1+1.65*wave*wave)*(1-.5*burst),angle:.65*wave+.12*burst,
  panX:.12*Math.sin(2*Math.PI*first)*(1-burst),panY:.07*wave*(1-.6*burst),split:.13*Math.pow(wave,4)*(1+.35*burst),burst};
}
export function screenToField(x:number,y:number,aspect:number,p:PhysarumParameters){const v=viewFromReveal(p.reveal,p.zoom),a=(x-.5)*aspect/(1280/768)/v.zoom,b=(.5-y)/v.zoom;return{x:.5+Math.cos(v.angle)*a-Math.sin(v.angle)*b+v.panX,y:.5+Math.sin(v.angle)*a+Math.cos(v.angle)*b+v.panY};}
