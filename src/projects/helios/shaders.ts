export const noiseGLSL = `
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
                 mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                 mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) { return .52*noise(p)+.27*noise(p*2.03)+.14*noise(p*4.09)+.07*noise(p*8.13); }
float lunarAlbedo(vec3 n) {
  float maria=smoothstep(.41,.57,fbm(n*3.8+vec3(3,7,2)));
  float fine=fbm(n*75.0);
  float crater=pow(max(0.0,1.0-abs(noise(n*27.0)-.51)*15.0),4.0);
  return .47 + .25*maria + .08*fine + .05*crater;
}`;
export const planetVertex = `
varying vec3 localNormal;
void main() { localNormal=normal; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
export const planetFragment = `
precision highp float;
varying vec3 localNormal;
uniform vec3 sunlight;
uniform vec3 baseColor;
uniform float kind;
uniform sampler2D atlas;
${noiseGLSL}
void main() {
  vec3 n=normalize(localNormal);
  float terrain=fbm(n*5.0);
  vec3 color=baseColor*(.65+.5*terrain);
  if (kind < .5) {
    float granules=fbm(n*36.0);
    gl_FragColor=vec4(baseColor*(.85+.25*granules),1.0);
    #include <colorspace_fragment>
    return;
  }
  if (kind > 8.5 || (kind > .5 && kind < 1.5)) color=baseColor*lunarAlbedo(n);
  if (kind > 1.5 && kind < 2.5) color=baseColor*(.72+.28*fbm(vec3(n.x*5.0,n.y*18.0,n.z*5.0)));
  if (kind > 2.5 && kind < 3.5) {
    vec2 uv=vec2(atan(-n.z,n.x)/6.2831853+.5,asin(n.y)/3.1415927+.5);
    color=texture2D(atlas,uv).rgb;
    float cloud=smoothstep(.57,.72,fbm(n*7.0+vec3(0,2,0)));
    color=mix(color,vec3(.88,.91,.87),cloud*.75);
  }
  if (kind > 3.5 && kind < 4.5) {
    color*=.65+.55*fbm(n*7.0);
    color=mix(color,vec3(.85,.85,.78),smoothstep(.92,.98,abs(n.y)));
  }
  if (kind > 4.5 && kind < 8.5) {
    float bands=sin(n.y*68.0+fbm(n*9.0)*5.0);
    color=baseColor*(.75+.18*bands+.18*terrain);
    if (kind < 5.5) {
      float storm=exp(-pow((n.y+.23)*16.0,2.0)-pow((atan(n.z,n.x)-.6)*7.0,2.0));
      color=mix(color,vec3(.55,.22,.12),storm*.8);
    }
  }
  float light=max(0.0,dot(n,normalize(sunlight)));
  // A small, explicitly illustrative fill keeps the reference globe legible.
  color*=.045+.955*pow(light,.72);
  gl_FragColor=vec4(color,1.0);
  #include <colorspace_fragment>
}`;
export const ringVertex = `
varying vec3 ringPoint;
void main() { ringPoint=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
export const ringFragment = `
precision highp float;
varying vec3 ringPoint;
uniform vec3 sunlight;
void main() {
  float r=length(ringPoint.xy);
  float bands=.67+.13*sin(r*87.0)+.06*sin(r*271.0)+.03*sin(r*613.0);
  float gap=1.0-smoothstep(1.925,1.94,r)*(1.0-smoothstep(1.99,2.01,r));
  float density=smoothstep(1.32,1.43,r)*(1.0-smoothstep(2.25,2.3,r))*gap;
  vec3 p=vec3(ringPoint.x,0.0,ringPoint.y);
  vec3 light=normalize(sunlight);
  float t=-dot(p,light);
  float shadow=t>0.0 && length(p+t*light)<1.0 ? .12 : 1.0;
  vec3 color=vec3(.61,.49,.32)*bands*(.25+.75*sqrt(abs(light.y)))*shadow;
  gl_FragColor=vec4(color,.82*density);
  #include <colorspace_fragment>
}`;
export const skyVertex = `varying vec2 vUv; void main() { vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;
export const skyFragment = `
precision highp float;
varying vec2 vUv;
uniform float aspect;
uniform float tangent;
uniform float sunRadius;
uniform float moonRadius;
uniform float totality;
uniform float wide;
uniform float viewportHeight;
uniform vec3 forward;
uniform vec3 rightward;
uniform vec3 upward;
uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform vec3 moonLight;
uniform vec3 moonPrime;
uniform vec3 moonEast;
uniform vec3 moonNorth;
${noiseGLSL}
void main() {
  vec2 screen=vUv*2.0-1.0;
  vec3 ray=normalize(forward+rightward*screen.x*tangent*aspect+upward*screen.y*tangent);
  float sunAngle=atan(length(cross(ray,sunDirection)),dot(ray,sunDirection));
  float pixel=tangent*2.0/viewportHeight;
  vec3 color=vec3(.018,.025,.034);
  float altitude=asin(clamp(ray.z,-1.0,1.0));
  color+=vec3(.026,.033,.039)*exp(-abs(altitude)*5.0)*wide;
  if (totality > .5 && dot(ray,sunDirection)>0.0) {
    float rr=sunAngle/sunRadius;
    float theta=atan(dot(ray,rightward)-dot(sunDirection,rightward),dot(ray,upward)-dot(sunDirection,upward));
    float rays=.7+.17*sin(theta*7.0)+.08*sin(theta*17.0+1.2)+.05*sin(theta*41.0);
    float corona=exp(-max(0.0,rr-1.0)*4.0)*.44+exp(-max(0.0,rr-1.0)*1.25)*.1*rays;
    color+=vec3(.86,.91,1.0)*corona*step(1.0,rr);
  }
  float sunMask=1.0-smoothstep(sunRadius-pixel,sunRadius+pixel,sunAngle);
  float limb=sqrt(max(0.0,1.0-pow(sunAngle/sunRadius,2.0)));
  color=mix(color,vec3(1.0,.79,.40)*(.66+.34*limb),sunMask);
  float miss=length(cross(ray,moonDirection));
  float radius=sin(moonRadius);
  if (dot(ray,moonDirection)>0.0 && miss<radius) {
    float along=dot(ray,moonDirection)-sqrt(max(0.0,radius*radius-miss*miss));
    vec3 normal=normalize(ray*along-moonDirection);
    vec3 surface=vec3(dot(normal,moonPrime),dot(normal,moonNorth),-dot(normal,moonEast));
    float lit=max(0.0,dot(normal,moonLight));
    float nearSun=1.0-smoothstep(.02,.10,atan(length(cross(moonDirection,sunDirection)),dot(moonDirection,sunDirection)));
    float fill=.032*(1.0-nearSun);
    vec3 moonColor=vec3(.93,.94,.91)*lunarAlbedo(surface)*(pow(lit,.8)+fill);
    color=moonColor;
  }
  if (wide>.01) {
    float az=atan(-ray.y,ray.x);
    float gridAlt=abs(sin(altitude*18.0));
    float gridAz=abs(sin(az*6.0));
    float grid=(1.0-smoothstep(.005,.012,min(gridAlt,gridAz)))*.10*wide;
    color+=vec3(.42,.53,.56)*grid;
  }
  // The opaque geometric horizon clips every ray, including partial disks.
  if (ray.z < 0.0) color=vec3(.025,.035,.035)+vec3(.025,.025,.018)*exp(altitude*20.0);
  float horizon=(1.0-smoothstep(0.0,max(pixel*1.5,.00001),abs(altitude)));
  color=mix(color,vec3(.66,.58,.39),horizon*.7);
  float vignette=1.0-.13*dot(screen,screen);
  gl_FragColor=vec4(color*vignette,1.0);
}`;
