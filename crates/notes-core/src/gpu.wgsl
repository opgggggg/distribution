struct Camera { area:vec4<f32>, pixels:vec4<f32> }
@group(0) @binding(0) var<uniform> camera:Camera;
@group(1) @binding(0) var pigment:texture_2d<f32>;
@group(1) @binding(1) var linear:sampler;
struct Out {
 @builtin(position) position:vec4<f32>,
 @location(0) uv:vec2<f32>,
 @location(1) color:vec4<f32>,
 @location(2) world:vec2<f32>
}
fn project(p:vec2<f32>,uv:vec2<f32>,color:vec4<f32>)->Out {
 var o:Out;
 o.position=vec4<f32>((p-camera.area.xy)/camera.area.zw*vec2<f32>(2.,-2.)+vec2<f32>(-1.,1.),0.,1.);
 o.uv=uv;o.color=color;o.world=p;return o;
}
@vertex fn vertex(@location(0) p:vec2<f32>,@location(1) uv:vec2<f32>,@location(2) color:vec4<f32>)->Out {return project(p,uv,color);}
@fragment fn fragment(in:Out)->@location(0) vec4<f32> {return textureSample(pigment,linear,in.uv)*in.color;}
// Paper is procedural in world coordinates and is drawn above the background photo,
// matching the existing document renderer. No grid bitmap is enlarged on zoom.
@fragment fn paper(in:Out)->@location(0) vec4<f32> {
 let kind=camera.pixels.z;
 if kind<0.5 {return vec4<f32>(0.);}
 let footprint=camera.area.zw/camera.pixels.xy;
 let p=in.world;
 var alpha=0.;
 var rgb=vec3<f32>(205.,212.,223.)/255.;
 if kind>2.5 {
  let d=length((fract((p-10.)/20.+0.5)-0.5)*20.);
  alpha=1.-smoothstep(0.8-max(footprint.x,footprint.y)*0.5,0.8+max(footprint.x,footprint.y)*0.5,d);
  rgb=vec3<f32>(184.,194.,210.)/255.;
 } else {
  // The original SVG pattern clips the outer half of its 0.5pt stroke
  // at each tile's right/bottom edge. Integrate that one-sided 0.25pt
  // coverage over the pixel footprint, preserving its position and weight.
  let d=(fract(p/20.+0.5)-0.5)*20.;
  let coverage=clamp((min(d+footprint*0.5,vec2<f32>(0.))-max(d-footprint*0.5,vec2<f32>(-0.25)))/footprint,vec2<f32>(0.),vec2<f32>(1.));
  alpha=coverage.y;
  if kind<1.5 {alpha=1.-(1.-alpha)*(1.-coverage.x);}
 }
 // Avoid moire when zoomed far out; preserve the average paper density.
 alpha*=clamp(20./max(footprint.x,footprint.y)-0.5,0.,1.);
 return vec4<f32>(rgb*alpha,alpha);
}

@vertex fn depth_clear(@location(0) p:vec2<f32>,@location(1) uv:vec2<f32>,@location(2) color:vec4<f32>)->Out {var o=project(p,uv,color);o.position.z=1.;return o;}

@vertex fn winding_vertex(@location(0) p:vec2<f32>)->Out {return project(p,vec2<f32>(0.5),vec4<f32>(1.));}
