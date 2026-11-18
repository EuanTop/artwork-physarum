import {encodeSnapshot,decodeSnapshot,type SimulationSnapshot} from './snapshot';
import {readSites,parametersFrom,type Site,type PhysarumParameters} from './model';
export type SavedState={kind:'physarum.gzip';version:1;data:string};
const LIMIT=32_000_000;
const base64=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
// Lossless RGBA byte planes expose repeated float exponents/half-float zero bits to gzip.
function planes(value:unknown,reverse=false){
 if(typeof value!=='string'||value.length>LIMIT)throw new Error('形态缓冲无效');
 const raw=atob(value);if(raw.length%16)throw new Error('形态缓冲长度无效');
 const bytes=new Uint8Array(raw.length),count=raw.length/16;
 for(let lane=0;lane<16;lane++)for(let i=0;i<count;i++){if(reverse)bytes[i*16+lane]=raw.charCodeAt(lane*count+i);else bytes[lane*count+i]=raw.charCodeAt(i*16+lane);}
 return base64(bytes);
}
async function bounded(stream:ReadableStream<Uint8Array>){const reader=stream.getReader(),chunks:Uint8Array[]=[];let size=0;try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>LIMIT)throw new Error('形态文件过大');chunks.push(r.value);}}finally{await reader.cancel();}const out=new Uint8Array(size);let offset=0;for(const part of chunks){out.set(part,offset);offset+=part.length;}return out;}
export async function packState(snapshot:SimulationSnapshot,source:string,sites:Site[],parameters:PhysarumParameters):Promise<SavedState>{const encoded=JSON.parse(encodeSnapshot(snapshot));encoded.positions=planes(encoded.positions);encoded.trail=planes(encoded.trail);const raw=JSON.stringify({version:2,source,sites,parameters,snapshot:encoded});if(raw.length>LIMIT)throw new Error('形态超出保存限制');const bytes=await bounded(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip')));const data=base64(bytes);if(data.length>16_000_000)throw new Error('形态超出分享大小限制，请使用较低模拟规格');return{kind:'physarum.gzip',version:1,data};}
export async function unpackState(value:unknown,source:string){const v=value as SavedState;if(!v||v.kind!=='physarum.gzip'||v.version!==1||typeof v.data!=='string'||v.data.length>16_000_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(v.data))throw new Error('无法读取此形态文件');const raw=atob(v.data),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);const decoded=await bounded(new Blob([bytes.buffer]).stream().pipeThrough(new DecompressionStream('gzip')));const p=JSON.parse(new TextDecoder().decode(decoded));if(![1,2].includes(p.version)||p.source!==source)throw new Error('形态文件与当前实验布局不一致');const sites=readSites(p.sites);if(sites.length!==p.sites?.length)throw new Error('形态点位无效');let snapshot:string;if(p.version===2){if(!p.snapshot||typeof p.snapshot!=='object')throw new Error('形态缓冲无效');snapshot=JSON.stringify({...p.snapshot,positions:planes(p.snapshot.positions,true),trail:planes(p.snapshot.trail,true)});}else snapshot=p.snapshot;return{snapshot:decodeSnapshot(snapshot),sites,parameters:parametersFrom(p.parameters??{})};}
