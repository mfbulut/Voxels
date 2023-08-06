const shader = `
struct Uniforms {
  position : vec3f,
  time : f32,
  rotation : vec3f,
}

@group(0) @binding(0) var screen: texture_storage_2d<bgra8unorm,write>;
@group(1) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(1) var myData: texture_3d<u32>;

fn mod289(x: vec4<f32>) -> vec4<f32> { return x - floor(x * (1. / 289.)) * 289.; }
fn perm4(x: vec4<f32>) -> vec4<f32> { return mod289(((x * 34.) + 1.) * x); }

fn noise3(p: vec3<f32>) -> f32 {
  let a = floor(p);
  var d: vec3<f32> = p - a;
  d = d * d * (3. - 2. * d);

  let b = a.xxyy + vec4<f32>(0., 1., 0., 1.);
  let k1 = perm4(b.xyxy);
  let k2 = perm4(k1.xyxy + b.zzww);

  let c = k2 + a.zzzz;
  let k3 = perm4(c);
  let k4 = perm4(c + 1.);

  let o1 = fract(k3 * (1. / 41.));
  let o2 = fract(k4 * (1. / 41.));

  let o3 = o2 * d.z + o1 * (1. - d.z);
  let o4 = o3.yw * d.x + o3.xz * (1. - d.x);

  return o4.y * d.y + o4.x * (1. - d.y);
}

fn GetVoxel(c : vec3<f32>) -> u32 {
  if(c.x < 0. || c.y < 0.|| c.z < 0. || c.x > 128. || c.y > 128.|| c.z > 128.) {
    if(length(c - vec3f(64.)) < 128) {
      return 0;
    }

    if(u32(noise3(c * 0.05) * 2) > 0) {
      return u32(noise3(c) * 8) + 2;
    }
    
    return 0;
  }
  return textureLoad(myData, vec3u(u32(c.x), u32(c.y), u32(c.z)), 0).r;
}

fn Rotate2D(v : vec2<f32>, a : f32) -> vec2<f32>{
    let SinA : f32 = sin(a);
    let CosA : f32 = cos(a);
    return vec2<f32>(v.x * CosA - v.y * SinA, v.y * CosA + v.x * SinA);
}

fn getRandomColor(input: vec3<f32>) -> vec3<f32> {
  var r = fract(sin(dot(input, vec3<f32>(12.9898, 78.233, 45.543))) * 43758.5453);
  var g = fract(sin(dot(input, vec3<f32>(34.456, 98.765, 67.891))) * 23543.345);
  var b = fract(sin(dot(input, vec3<f32>(87.654, 21.987, 43.219))) * 87654.123);
  return vec3<f32>(r, g, b);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) Pixel: vec3<u32>) {
    let Resolution = textureDimensions(screen).xy;
    let AspectRatio = f32(Resolution.y) / f32(Resolution.x);

    if (Pixel.x >= Resolution.x || Pixel.y >= Resolution.y){
        return;
    }
    
    let FragCoord = vec2<f32>(f32(Pixel.x) + .5, f32(Resolution.y - Pixel.y) - .5);

    let UV = 2. * FragCoord / vec2<f32>(Resolution) - 1.;
    
    var RayDirection = vec3<f32>(UV.x, UV.y * AspectRatio, .8);
    var RayPosition = uniforms.position;

    let RotationYZ = Rotate2D(RayDirection.yz, uniforms.rotation.x);
    RayDirection = vec3<f32>(RayDirection.x, RotationYZ.x, RotationYZ.y);

    let RotationXZ = Rotate2D(RayDirection.xz, uniforms.rotation.y);
    RayDirection = vec3<f32>(RotationXZ.x, RayDirection.y, RotationXZ.y);

    let DeltaDistance = abs(vec3(length(RayDirection)) / RayDirection);
    let RayStep = sign(RayDirection);

    var MapPosition = floor(RayPosition);
    var SideDistance = (sign(RayDirection) * (MapPosition - RayPosition) + (sign(RayDirection) * .5) + .5) * DeltaDistance;
    var Normal = vec3<f32>(0.);

    var block = 0u;
    for(var i : u32 = 0u; i < 768u; i++){
        block = GetVoxel(MapPosition);
        if(block != 0){
            break;
        }

        Normal = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
        SideDistance = fma(Normal, DeltaDistance, SideDistance);
        MapPosition = fma(Normal, RayStep, MapPosition);
    }

    if(block == 0) { 
      textureStore(screen, Pixel.xy, vec4<f32>(0., 0., 0., 1.));
      return; 
    }

    let HitPosition: vec3f = RayDirection / dot(Normal, RayDirection) * dot(Normal, MapPosition + vec3f(RayDirection < vec3f(0.0)) - RayPosition) + RayPosition;
    let voxelUv: vec2f = vec2f(fract(dot(Normal * HitPosition.yzx, vec3f(1.0))), fract(dot(Normal * HitPosition.zxy, vec3f(1.0))));
    let voxelNormal = Normal * -RayStep;

    let LightPosition = normalize(vec3f(1.0));
    let LightDirection = normalize(LightPosition - HitPosition);

    let ambient : vec4f = voxelAo(vec3f(MapPosition - RayStep * Normal), Normal.zxy, Normal.yzx);
    var interpAo : f32 = mix(mix(ambient.z, ambient.w, voxelUv.x), mix(ambient.y, ambient.x, voxelUv.x), voxelUv.y);
    interpAo = pow(interpAo, 1.0 / 3.0);

    let diff: f32 = clamp(dot(voxelNormal, LightPosition), 0.0, 1.0);

    var myColor = vec3f(1);
    if(block > 1) {
      myColor = getRandomColor(MapPosition);
    }

    let Color = myColor * vec3<f32>(0.25 + diff * 0.5 + interpAo * 0.50);
    textureStore(screen, Pixel.xy, vec4<f32>(Color, 1.));
}

fn voxelAo(pos: vec3f, d1: vec3f, d2: vec3f) -> vec4f {
  let side: vec4f = vec4f(
    f32(GetVoxel(pos + d1) > 0), 
    f32(GetVoxel(pos + d2) > 0), 
    f32(GetVoxel(pos - d1) > 0), 
    f32(GetVoxel(pos - d2) > 0)
  );

  let corner: vec4f = vec4f(
    f32(GetVoxel(pos + d1 + d2) > 0), 
    f32(GetVoxel(pos - d1 + d2) > 0), 
    f32(GetVoxel(pos - d1 - d2) > 0), 
    f32(GetVoxel(pos + d1 - d2) > 0)
  );

  var ao: vec4f = vec4f(0.0);
  ao.x = (side.x + side.y + max(corner.x, side.x * side.y)) / 3.0;
  ao.y = (side.y + side.z + max(corner.y, side.y * side.z)) / 3.0;
  ao.z = (side.z + side.w + max(corner.z, side.z * side.w)) / 3.0;
  ao.w = (side.w + side.x + max(corner.w, side.w * side.x)) / 3.0;
  return vec4f(1.0) - ao;
}
`;

async function init() {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice({
    requiredFeatures: ["bgra8unorm-storage"],
  });

  const shaderModule = device.createShaderModule({
    code: shader,
  });

  const canvas = document.getElementById("gpuCanvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const context = canvas.getContext("webgpu");

  context.configure({
    device,
    format: "bgra8unorm",
    alphaMode: "premultiplied",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING,
  });

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: shaderModule,
      entryPoint: "main",
    },
  });

  const dataTexture = device.createTexture({
    size: {
      width: modelSize,
      height: modelSize,
      depthOrArrayLayers: modelSize,
    },
    dimension: "3d",
    format: "r8uint",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  device.queue.writeTexture(
    { texture: dataTexture },
    model.buffer,
    {
      bytesPerRow: modelSize,
      rowsPerImage: modelSize,
    },
    { width: modelSize, height: modelSize, depthOrArrayLayers: modelSize }
  );

  const uniformBufferSize = 32;
  uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uniformBindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(1),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
        },
      },
      {
        binding: 1,
        resource: dataTexture.createView(),
      },
    ],
  });

  const camera = new Camera(canvas, [64, 108, -30]);
  let lastTime = 0;
  function frame(time) {
    const deltaTime = time - lastTime;
    lastTime = time;

    camera.update(deltaTime / 100);

    device.queue.writeBuffer(
      uniformBuffer,
      0,
      new Float32Array([...camera.position, time / 1000, ...camera.rotation, 0])
        .buffer,
      0,
      32
    );

    const bindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: context.getCurrentTexture().createView(),
        },
      ],
    });

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setBindGroup(1, uniformBindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(canvas.width / 16),
      Math.ceil(canvas.height / 16)
    );
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

init();
