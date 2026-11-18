/** Image-derived observations, not segmentation or inferred biological measurements. */
export type ObservationFrame={frame:number;seconds:number;cells:Float32Array;sampleCount:number};
export const OBSERVATION_SIDE=24;
const number=(v:unknown)=>typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):NaN;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function readObservations(rows:unknown):ObservationFrame[]{
 if(!Array.isArray(rows))return[];const frames=new Map<number,ObservationFrame>(),seen=new Set<string>();
 for(const row of rows){if(!row||typeof row!=='object'||row.kind!=='tile')continue;
  const frame=number(row.frame),seconds=number(row.seconds),gx=number(row.grid_x),gy=number(row.grid_y),luma=number(row.luma),texture=number(row.texture),change=number(row.change),count=number(row.samples);
  if(![frame,seconds,gx,gy,luma,texture,change,count].every(Number.isFinite)||frame<0||!Number.isInteger(frame)||seconds<0||!Number.isInteger(gx)||!Number.isInteger(gy)||gx<0||gx>=24||gy<0||gy>=24||[luma,texture,change].some(v=>v<0||v>1)||count<1)throw new Error('观测网格数据无效');
  const key=`${frame}:${gx}:${gy}`;if(seen.has(key))throw new Error('观测网格重复');seen.add(key);
  let f=frames.get(frame);if(!f){if(frames.size>=32)throw new Error('观测时刻过多');f={frame,seconds,cells:new Float32Array(24*24*4),sampleCount:0};frames.set(frame,f);}if(f.seconds!==seconds)throw new Error('同一帧的观测时间不一致');
  // Native raster Y points down; GPU Y points up, matching the layout point table.
  f.cells.set([luma,texture,change,1],((23-gy)*24+gx)*4);f.sampleCount+=count;
 }
 const result=[...frames.values()].sort((a,b)=>a.seconds-b.seconds);for(let i=1;i<result.length;i++)if(result[i].seconds<=result[i-1].seconds)throw new Error('观测时刻重复');return result;
}
/** Interpolate by actual elapsed time, not by evenly spaced frame labels. */
export function observationAt(frames:ObservationFrame[],progress:number){
 const seconds=frames.length?frames[0].seconds+clamp(progress)*(frames.at(-1)!.seconds-frames[0].seconds):0;
 let index=0;while(index+1<frames.length&&frames[index+1].seconds<=seconds)index++;
 const a=frames[index],b=frames[Math.min(index+1,frames.length-1)],mix=a&&b&&b.seconds>a.seconds?(seconds-a.seconds)/(b.seconds-a.seconds):0;
 return{a,b,mix,seconds,nearest:mix<.5?a:b};
}
export function observationField(frames:ObservationFrame[],progress:number,out=new Float32Array(24*24*4)){
 const {a,b,mix}=observationAt(frames,progress);out.fill(0);if(!a||!b)return out;
 // Fixed artistic transfer functions; raw metrics remain available in the data table.
 for(let i=0;i<out.length;i+=4){const av=a.cells[i+3],bv=b.cells[i+3],valid=Math.max(av,bv);if(!valid)continue;
  for(let c=0;c<3;c++){const x=av?a.cells[i+c]:b.cells[i+c],y=bv?b.cells[i+c]:a.cells[i+c];const value=x+(y-x)*mix;out[i+c]=c===0?value:c===1?clamp(value*40):clamp(value*5);}
  out[i+3]=valid;
 }return out;
}
export async function observationSource(sites:unknown,frames:ObservationFrame[]){
 const layout=JSON.stringify(sites);if(!frames.length)return layout;const bytes=new TextEncoder().encode(JSON.stringify(frames.map(f=>({frame:f.frame,seconds:f.seconds,cells:Array.from(f.cells),samples:f.sampleCount}))));
 const hash=await crypto.subtle.digest('SHA-256',bytes);return layout+':observations:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
