import * as THREE from 'three';
import { initialPositions, viewFromReveal, type Site, type PhysarumParameters } from './model';
import {observationField,type ObservationFrame} from './observations';
import type { SimulationSnapshot } from './snapshot';
import {quadVertex,moveFragment,depositVertex,depositFragment,trailFragment,displayFragment,foodFragment,burstVertex,burstFragment} from './shaders';
export const FIELD_SIZE=768,FIELD_WIDTH=1280,PARTICLE_SIDE=576;
/** Host-only atmosphere; never changes simulation parameters or saved shape. */
export type PhysarumPresentation={ambient?:number;pointer?:{x:number;y:number}};
export function createPhysarumEngine(renderer:THREE.WebGLRenderer,seed:number,initialSites:Site[],initialParameters:PhysarumParameters,observations:ObservationFrame[]=[]){
 if(!renderer.extensions.has('EXT_color_buffer_float'))throw new Error('此设备不支持模拟所需的浮点绘制。');
 let disposed=false,iteration=0,parameters=initialParameters,sites=[...initialSites],positionIndex=0,trailIndex=0;
 const width=FIELD_WIDTH,height=FIELD_SIZE,side=PARTICLE_SIDE;
 const geometry=new THREE.PlaneGeometry(2,2),camera=new THREE.Camera(),scene=new THREE.Scene();
 const quad=new THREE.Mesh(geometry);quad.frustumCulled=false;scene.add(quad);
 const target=(w:number,h:number,type:THREE.TextureDataType=THREE.FloatType)=>new THREE.WebGLRenderTarget(w,h,{type,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false});
 const positions=[target(side,side),target(side,side)],trails=[target(width,height,THREE.HalfFloatType),target(width,height,THREE.HalfFloatType)],count=target(width,height,THREE.UnsignedByteType),food=target(width,height,THREE.HalfFloatType);
 trails.forEach(t=>{t.texture.minFilter=THREE.LinearFilter;t.texture.magFilter=THREE.LinearFilter;});
 const material=(fragmentShader:string,uniforms:Record<string,THREE.IUniform>)=>new THREE.ShaderMaterial({vertexShader:quadVertex,fragmentShader,uniforms,depthTest:false,depthWrite:false,toneMapped:false});
 const sharedSites={uSites:{value:Array.from({length:32},()=>new THREE.Vector4())},uSiteCount:{value:0}};
 function syncSites(){const food=sites.filter(s=>s.kind==='nutrient').slice(0,32);sharedSites.uSiteCount.value=food.length;sharedSites.uSites.value.forEach((v,i)=>{const s=food[i];v.set(s?.x??0,s?.y??0,(s?.radius??.02)*height*2.5,s?1:0);});}
 syncSites();
 const observationValues=observationField(observations,parameters.observationTime),observation=new THREE.DataTexture(observationValues,24,24,THREE.RGBAFormat,THREE.FloatType);observation.minFilter=observation.magFilter=THREE.LinearFilter;observation.needsUpdate=true;
 const moving=material(moveFragment,{...sharedSites,uPositions:{value:positions[0].texture},uTrail:{value:trails[0].texture},uFoodField:{value:food.texture},uObservation:{value:observation},uObservationInfluence:{value:parameters.observationInfluence},uSize:{value:new THREE.Vector2(width,height)},uStep:{value:0},uSensor:{value:0},uAngle:{value:0},uTurn:{value:0},uSpeed:{value:0},uResponse:{value:0},uFood:{value:0},uRenewal:{value:0},uBrush:{value:new THREE.Vector4(-2,-2,25,0)}});
 const nutrition=material(foodFragment,{...sharedSites,uSize:{value:new THREE.Vector2(width,height)}});
 const field=material(trailFragment,{uTrail:{value:trails[0].texture},uCount:{value:count.texture},uPixel:{value:new THREE.Vector2(1/width,1/height)},uDeposit:{value:0},uDecay:{value:0}});
 const display=material(displayFragment,{...sharedSites,uCount:{value:count.texture},uTrail:{value:trails[0].texture},uPixel:{value:new THREE.Vector2(1/width,1/height)},uContrast:{value:1},uAspect:{value:1},uZoom:{value:1},uSources:{value:0},uView:{value:new THREE.Vector4(1,0,0,0)},uSplit:{value:0},uBurst:{value:0}});
 const copy=material('uniform sampler2D uData;varying vec2 vUv;void main(){gl_FragColor=texture2D(uData,vUv);}',{uData:{value:null}});
 const lookup=new Float32Array(side*side*2);for(let i=0;i<side*side;i++){lookup[i*2]=(i%side+.5)/side;lookup[i*2+1]=(Math.floor(i/side)+.5)/side;}
 const particleGeometry=new THREE.BufferGeometry();particleGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(side*side*3),3));particleGeometry.setAttribute('aLookup',new THREE.BufferAttribute(lookup,2));
 const deposit=new THREE.ShaderMaterial({vertexShader:depositVertex,fragmentShader:depositFragment,uniforms:{uPositions:{value:positions[0].texture}},depthTest:false,depthWrite:false,transparent:true,blending:THREE.AdditiveBlending,toneMapped:false});
 const points=new THREE.Points(particleGeometry,deposit);points.frustumCulled=false;const particleScene=new THREE.Scene();particleScene.add(points);
 const burst=new THREE.ShaderMaterial({vertexShader:burstVertex,fragmentShader:burstFragment,
  uniforms:{uPositions:{value:positions[0].texture},uView:display.uniforms.uView,uAspect:display.uniforms.uAspect,uZoom:display.uniforms.uZoom,uSplit:display.uniforms.uSplit,uBurst:display.uniforms.uBurst,
   uBrush:moving.uniforms.uBrush,uDpr:{value:1},uTime:{value:0},uHeight:{value:900},uAmbient:{value:0},uAmbientPointer:{value:new THREE.Vector2()}},
  depthTest:false,depthWrite:false,transparent:true,blending:THREE.AdditiveBlending,toneMapped:false});
 const burstPoints=new THREE.Points(particleGeometry,burst);burstPoints.frustumCulled=false;const burstScene=new THREE.Scene();burstScene.add(burstPoints);
 function pass(mat:THREE.ShaderMaterial,to:THREE.WebGLRenderTarget){const previous=renderer.getRenderTarget();quad.material=mat;renderer.setRenderTarget(to);renderer.render(scene,camera);renderer.setRenderTarget(previous);}
 function clear(to:THREE.WebGLRenderTarget){const previous=renderer.getRenderTarget(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();renderer.setClearColor(0,0);renderer.setRenderTarget(to);renderer.clear();renderer.setRenderTarget(previous);renderer.setClearColor(color,alpha);}
 function upload(values:Float32Array,w:number,h:number,targets:THREE.WebGLRenderTarget[]){const t=new THREE.DataTexture(values,w,h,THREE.RGBAFormat,THREE.FloatType);t.needsUpdate=true;copy.uniforms.uData.value=t;targets.forEach(to=>pass(copy,to));t.dispose();copy.uniforms.uData.value=null;}
 positions.forEach(clear);trails.forEach(clear);clear(count);upload(initialPositions(side,seed,sites),side,side,positions);pass(nutrition,food);
 const previousAutoClear=renderer.autoClear; // Each count pass explicitly clears once, before point accumulation.
 function depositCounts(){
  clear(count);const previous=renderer.getRenderTarget();deposit.uniforms.uPositions.value=positions[positionIndex].texture;renderer.autoClear=false;renderer.setRenderTarget(count);renderer.render(particleScene,camera);renderer.setRenderTarget(previous);renderer.autoClear=previousAutoClear;
 }
 function step(){if(disposed)return;
  const u=moving.uniforms;u.uPositions.value=positions[positionIndex].texture;u.uTrail.value=trails[trailIndex].texture;u.uStep.value=iteration;u.uSensor.value=parameters.sensorDistance;u.uAngle.value=parameters.sensorAngle*Math.PI/180;u.uTurn.value=parameters.turnAngle*Math.PI/180;u.uSpeed.value=parameters.stepSize;u.uResponse.value=parameters.response;u.uFood.value=parameters.foodInfluence;u.uRenewal.value=parameters.renewal;u.uObservationInfluence.value=parameters.observationInfluence;
  pass(moving,positions[1-positionIndex]);positionIndex=1-positionIndex;
  depositCounts();
  field.uniforms.uTrail.value=trails[trailIndex].texture;field.uniforms.uDeposit.value=parameters.deposit;field.uniforms.uDecay.value=parameters.decay;pass(field,trails[1-trailIndex]);trailIndex=1-trailIndex;iteration++;
 }
 function snapshot():SimulationSnapshot{const p=new Float32Array(side*side*4),t=new Float32Array(width*height*4);renderer.readRenderTargetPixels(positions[positionIndex],0,0,side,side,p);const half=new Uint16Array(width*height*4);renderer.readRenderTargetPixels(trails[trailIndex],0,0,width,height,half);for(let i=0;i<half.length;i++)t[i]=THREE.DataUtils.fromHalfFloat(half[i]);return{version:1,width,height,particleSide:side,seed:seed>>>0,step:iteration,positions:p,trail:t};}
 function restore(s:SimulationSnapshot){if(s.width!==width||s.height!==height||s.particleSide!==side||s.seed!==(seed>>>0))throw new Error('形态快照与当前模拟规格不一致。');upload(s.positions,side,side,positions);upload(s.trail,width,height,trails);positionIndex=trailIndex=0;iteration=s.step;depositCounts();}
 return {scene,camera:new THREE.PerspectiveCamera(),get stepCount(){return iteration;},get sites(){return sites.map(s=>({...s}));},setSites(next:Site[]){sites=next.map(s=>({...s})).slice(0,32);syncSites();pass(nutrition,food);},setParameters(next:PhysarumParameters){if(next.observationTime!==parameters.observationTime){observationField(observations,next.observationTime,observationValues);observation.needsUpdate=true;}parameters=next;},step,
  async warmup(steps=400,onProgress?:(n:number)=>void){for(let i=0;i<steps;i++){if(disposed)throw new Error('模拟已关闭');step();if(i%20===19){onProgress?.(i+1);await new Promise<void>(resolve=>setTimeout(resolve,0));}}},
  pointer(x:number,y:number,radius:number,strength:number){moving.uniforms.uBrush.value.set(x,y,radius,strength);},
  render(w:number,h:number,presentation:PhysarumPresentation={}){display.uniforms.uTrail.value=trails[trailIndex].texture;display.uniforms.uContrast.value=parameters.contrast;display.uniforms.uAspect.value=w/Math.max(1,h);const view=viewFromReveal(parameters.reveal,parameters.zoom);display.uniforms.uZoom.value=view.zoom;display.uniforms.uView.value.set(Math.cos(view.angle),Math.sin(view.angle),view.panX,view.panY);display.uniforms.uSplit.value=view.split;display.uniforms.uBurst.value=view.burst;display.uniforms.uSources.value=parameters.showSources?1:0;burst.uniforms.uAmbient.value=Math.max(0,Math.min(1,presentation.ambient??0));burst.uniforms.uAmbientPointer.value.set(presentation.pointer?.x??0,presentation.pointer?.y??0);const previous=renderer.getRenderTarget();quad.material=display;renderer.render(scene,camera);
   if(view.burst>.0001){burst.uniforms.uPositions.value=positions[positionIndex].texture;burst.uniforms.uDpr.value=renderer.getPixelRatio();burst.uniforms.uTime.value=iteration/36;burst.uniforms.uHeight.value=h;const clear=renderer.autoClear;renderer.autoClear=false;try{renderer.render(burstScene,camera);}finally{renderer.autoClear=clear;}}
   renderer.setRenderTarget(previous);},snapshot,restore,
  dispose(){disposed=true;[...positions,...trails,count,food].forEach(t=>t.dispose());[moving,field,display,copy,deposit,nutrition,burst].forEach(m=>m.dispose());observation.dispose();geometry.dispose();particleGeometry.dispose();scene.clear();particleScene.clear();burstScene.clear();renderer.autoClear=previousAutoClear;}
 };
}
