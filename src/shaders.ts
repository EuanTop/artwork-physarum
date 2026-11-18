// Independent local-agent model. Trail guides motion; visible pigment comes from particle exposure.
export const quadVertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
export const foodFragment=`precision highp float;uniform vec4 uSites[32];uniform int uSiteCount;uniform vec2 uSize;varying vec2 vUv;
void main(){float f=0.;for(int i=0;i<32;i++){if(i>=uSiteCount)break;vec2 d=(vUv-uSites[i].xy)*uSize;f+=exp(-dot(d,d)/(uSites[i].z*uSites[i].z));}gl_FragColor=vec4(min(f,3.),0.,0.,1.);}`;
export const moveFragment=`precision highp float;
uniform sampler2D uPositions,uTrail,uFoodField,uObservation;uniform vec2 uSize;uniform float uStep,uSensor,uAngle,uTurn,uSpeed,uResponse,uFood,uRenewal,uObservationInfluence;uniform vec4 uBrush;varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(123.57,318.91)))*43758.5453);}
float random(vec2 p){return hash(p+vec2(uStep*.0137,uStep*.0071));}
float sense(vec2 p){p=fract(p);float t=texture2D(uTrail,p).r;vec4 o=texture2D(uObservation,p);return t+texture2D(uFoodField,p).r*uFood*.018+o.a*(o.g*.014+o.b*.018)*uObservationInfluence;}
void main(){vec4 item=texture2D(uPositions,vUv);vec2 p=item.xy;float heading=item.z;float species=hash(vUv+vec2(7.83,2.19));
 float raw=texture2D(uTrail,p).r;float food=texture2D(uFoodField,p).r;float density=clamp(texture2D(uTrail,fract(p+vec2(cos(heading),sin(heading))*5./uSize)).r*2.4,0.,1.);vec4 observed=texture2D(uObservation,p);float tissue=smoothstep(.025,.4,food*.65);tissue=clamp(tissue+observed.a*(observed.g*.35+observed.b*.3)*uObservationInfluence,0.,1.);vec2 brushDelta=(p-uBrush.xy)*uSize;float pen=exp(-dot(brushDelta,brushDelta)/(uBrush.z*uBrush.z))*uBrush.w;tissue=mix(tissue,.85,pen*.8);
 // Fine scouts, branching intermediates and conducting bundles share one chemical field.
 float family=species<.58?.45:species<.88?1.15:3.1;
 float phase=fract(item.w+.0012*(.7+species));float pulse=sin(phase*6.2831853+dot(p,vec2(7.,4.)));
 float sensor=uSensor*family*(1.+observed.a*(observed.r-.5)*.5*uObservationInfluence)*(.8+uResponse*pow(density,1.5)*4.0)*(1.+pulse*.14);
 float angle=clamp(uAngle*(1.35-density*.95+food*uFood*.08),.15,1.7);
 float turn=uTurn*(.4+uResponse*(1.-density)*1.4);
 sensor=mix(sensor,uSensor*(.8+5.5*pow(density,1.6)),tissue*.7);
 angle=mix(angle,-.35+2.7*pow(density,1.3),tissue);
 turn=mix(turn,-.5+2.3*pow(density,.7),tissue);sensor*=1.+pen*.8;angle=mix(angle,1.1,pen);turn=mix(turn,.8,pen*.7);
 float a=sense(p+vec2(cos(heading),sin(heading))*sensor/uSize);float l=sense(p+vec2(cos(heading+angle),sin(heading+angle))*sensor/uSize);float r=sense(p+vec2(cos(heading-angle),sin(heading-angle))*sensor/uSize);
 if(a<l&&a<r)heading+=random(vUv)>.5?turn:-turn;else if(!(a>l&&a>r)){if(l>r)heading+=turn;else if(r>l)heading-=turn;}
 // Crowded branches shed scouts; sparse tips keep exploring. No decorative curve overlay.
 heading+=(random(vUv+vec2(.19,.73))-.5)*(.05+max(raw-.65,0.)*.7)*uResponse;
 if(pen>.001)heading+=pen*sin(atan(brushDelta.y,brushDelta.x)+1.57-heading)*.65;
 float speed=uSpeed*(.8+species*.55)*(1.-density*.28);speed=mix(speed,uSpeed*(2.6-3.1*pow(density,.9)),tissue*.85);
 p+=vec2(cos(heading),sin(heading))*speed/uSize;
 if(random(vUv+vec2(3.71,8.19))<uRenewal*(.25+pow(density,3.)*1.8)){
   // Turnover is an artistic rule. Most recruits stay near existing growth, a few seed new territory.
   if(random(vUv+vec2(4.82,1.37))<.8){float angle=random(vUv+vec2(2.93,4.21))*6.2831853;p+=vec2(cos(angle),sin(angle))*(12.+random(vUv)*45.)/uSize;}
   else p=vec2(random(vUv+vec2(9.13,2.67)),random(vUv+vec2(4.18,5.92)));
   heading=random(vUv+vec2(1.83,7.14))*6.2831853;phase=0.;
 }
 gl_FragColor=vec4(fract(p),mod(heading+6.2831853,6.2831853),phase);
}`;
export const depositVertex=`uniform sampler2D uPositions;attribute vec2 aLookup;varying float vBundle;float hash(vec2 p){return fract(sin(dot(p,vec2(123.57,318.91)))*43758.5453);}void main(){vec2 p=texture2D(uPositions,aLookup).xy;vBundle=step(.88,hash(aLookup+vec2(7.83,2.19)));gl_Position=vec4(p*2.-1.,0.,1.);gl_PointSize=1.;}`;
export const depositFragment=`varying float vBundle;void main(){gl_FragColor=vec4(1./255.,vBundle/255.,0.,1.);}`;
export const trailFragment=`precision highp float;uniform sampler2D uTrail,uCount;uniform vec2 uPixel;uniform float uDeposit,uDecay;varying vec2 vUv;
void main(){vec4 old=texture2D(uTrail,vUv);float avg=old.r*.28;
 avg+=texture2D(uTrail,fract(vUv+vec2(uPixel.x,0.))).r*.12;avg+=texture2D(uTrail,fract(vUv-vec2(uPixel.x,0.))).r*.12;avg+=texture2D(uTrail,fract(vUv+vec2(0.,uPixel.y))).r*.12;avg+=texture2D(uTrail,fract(vUv-vec2(0.,uPixel.y))).r*.12;
 avg+=texture2D(uTrail,fract(vUv+uPixel)).r*.06;avg+=texture2D(uTrail,fract(vUv-uPixel)).r*.06;avg+=texture2D(uTrail,fract(vUv+vec2(uPixel.x,-uPixel.y))).r*.06;avg+=texture2D(uTrail,fract(vUv+vec2(-uPixel.x,uPixel.y))).r*.06;
 vec2 counts=texture2D(uCount,vUv).rg*255.;float next=min(2.,(avg+sqrt(counts.x)*uDeposit)*uDecay);
 gl_FragColor=vec4(next,mix(old.g,next,.025),mix(old.b,counts.x,.24),mix(old.a,counts.y,.18));
}`;
export const displayFragment=`precision highp float;uniform sampler2D uTrail,uCount;uniform vec2 uPixel;uniform float uContrast,uAspect,uZoom,uSources,uSplit,uBurst;uniform vec4 uView;uniform vec4 uSites[32];uniform int uSiteCount;varying vec2 vUv;
void main(){float fieldAspect=uPixel.y/uPixel.x;vec2 base=(vUv-.5)*vec2(uAspect/fieldAspect,1.)/uZoom;vec2 p=fract(vec2(base.x*uView.x-base.y*uView.y,base.x*uView.y+base.y*uView.x)+.5+uView.zw);
 vec2 fine=fract(p+vec2(uSplit,uSplit*.35)),coarse=fract(p-vec2(uSplit,uSplit*.35));vec4 t=texture2D(uTrail,fine),bundle=texture2D(uTrail,coarse);vec2 current=vec2(texture2D(uCount,fine).r,texture2D(uCount,coarse).g)*255.;
 float separated=smoothstep(0.,.025,uSplit);t.b=mix(t.b,max(0.,t.b-t.a)+bundle.a,separated);t.a=bundle.a;
 // Unblurred counts and short particle exposure preserve microfilaments. Pheromone is never the bright tube.
 float exposure=max(t.b,current.x*.28);float strand=1.-exp(-exposure*uContrast*.75);float body=smoothstep(.7,8.,exposure);float fresh=clamp((t.r-t.g)*9.,0.,1.);float retract=clamp((t.g-t.r)*8.,0.,1.);
 float conducting=clamp(t.a/max(.1,t.b)*3.,0.,1.);
 vec3 deep=vec3(.003,.0015,.012);vec3 lace=mix(vec3(.085,.075,.22),vec3(.16,.35,.44),conducting);
 vec3 tissue=mix(vec3(.45,.10,.075),vec3(.9,.53,.20),sqrt(body));tissue=mix(tissue,vec3(.95,.82,.52),smoothstep(8.,25.,exposure));
 vec3 ink=mix(lace,tissue,body);ink=mix(ink,vec3(.72,.27,.22),fresh*.5);ink=mix(ink,vec3(.19,.10,.30),retract*.5);
 vec3 color=mix(deep,ink,pow(strand,1.15));color+=vec3(.14,.12,.17)*(1.-exp(-current.x*.35))*.22;
 if(uSources>.5){for(int i=0;i<32;i++){if(i>=uSiteCount)break;float d=length((p-uSites[i].xy)/uPixel);float ring=1.-smoothstep(.5,1.3,abs(d-5.));color=mix(color,vec3(.9,.55,.26),ring*.65);}}
 color=mix(color,deep,smoothstep(.18,.96,uBurst));
 gl_FragColor=vec4(color,1.);
 #include <colorspace_fragment>
}`;

/** The very same agents leave their filaments; no unrelated background star field. */
export const burstVertex=`precision highp float;
uniform sampler2D uPositions;uniform vec4 uView,uBrush;
uniform float uAspect,uZoom,uSplit,uBurst,uDpr,uTime,uHeight,uAmbient;uniform vec2 uAmbientPointer;
attribute vec2 aLookup;varying vec3 vColor;varying float vEnergy,vGlint;
float hash(vec2 p){return fract(sin(dot(p,vec2(123.57,318.91)))*43758.5453);}
void main(){
 float seed=hash(aLookup+vec2(5.91,2.43));
 if(seed>.24){gl_Position=vec4(3.,3.,0.,1.);gl_PointSize=1.;vEnergy=0.;vGlint=0.;vColor=vec3(0.);return;}
 vec4 agent=texture2D(uPositions,aLookup);
 float family=hash(aLookup+vec2(7.83,2.19)),warm=step(.88,family);
 float spread=hash(aLookup+vec2(1.37,8.53)),depthSeed=hash(aLookup+vec2(9.13,4.71));
 // The inverse of the existing count-field view, including its two pigment layers.
 vec2 shift=vec2(uSplit,uSplit*.35)*mix(-1.,1.,warm);
 vec2 d=fract(agent.xy+shift-uView.zw)-.5;
 vec2 rotated=vec2(d.x*uView.x+d.y*uView.y,-d.x*uView.y+d.y*uView.x);
 vec2 base=rotated*uZoom*vec2((1280./768.)/uAspect,1.)*2.;
 vec2 tangent=vec2(cos(agent.z),sin(agent.z));
 vec2 direction=normalize(base*.7+tangent*.38+vec2(.003));
 float travel=uBurst*(.16+spread*.65)+uBurst*uBurst*(.25+spread*.45);
 vec2 flight=base*(1.+uBurst*.28)+direction*travel;
 flight+=vec2(-direction.y,direction.x)*sin(spread*6.283+uBurst*3.4)*uBurst*.24;
 flight+=vec2(sin(uTime*.21+spread*17.),cos(uTime*.18+depthSeed*19.))*uBurst*.035;
 float z=(depthSeed*2.6-1.3+warm*.55)*uBurst;
 float perspective=1./max(.3,1.-z*.4);
 vec2 pointer=clamp(uBrush.xy-.5,vec2(-.4),vec2(.4))*step(.01,uBrush.w);
 flight+=(pointer+uAmbientPointer)*z*.11;
 gl_Position=vec4(flight*perspective,0.,1.);
 float near=smoothstep(-.7,1.4,z),rare=step(.992,spread);
 float size=mix(8.,12.,warm)+near*10.+rare*26.;
 gl_PointSize=clamp(size*perspective*uDpr*clamp(uHeight/900.,.75,2.),2.,64.);
 vColor=mix(vec3(.15,.37,.68),vec3(1.,.68,.27),warm);
 vColor=mix(vColor,vec3(1.,.89,.61),rare*.5);
 float appear=smoothstep(spread*.15,spread*.15+.18,uBurst);
 float density=mix(.24,.035,uAmbient);
 float atmosphere=1.-smoothstep(density-.012,density,seed);
 vEnergy=appear*atmosphere*(.55+near*.6+warm*.25)*(1.+rare*.5)*(1.+sin(uBurst*3.14159)*.6)*(.9+.1*sin(uTime*.7+spread*31.));
 vGlint=rare*warm;
}`;
export const burstFragment=`precision highp float;varying vec3 vColor;varying float vEnergy,vGlint;
void main(){
 vec2 p=gl_PointCoord-.5;float radius=length(p);if(radius>.5||vEnergy<.001)discard;
 float edge=1.-smoothstep(.32,.5,radius);
 float core=exp(-dot(p,p)*100.);
 float halo=exp(-dot(p,p)*16.)*.16;
 float rays=(exp(-abs(p.x)*100.)*exp(-abs(p.y)*9.)+exp(-abs(p.y)*100.)*exp(-abs(p.x)*9.))*vGlint*.18;
 gl_FragColor=vec4(vColor+vec3(.25)*core,vEnergy*(core+halo+rays)*edge);
 #include <colorspace_fragment>
}`;
