import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Cinematic grade: vignette, grain, chromatic aberration, hit flash, desaturation, split-tone.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.0 },
    uGrain: { value: 0.06 },
    uAberration: { value: 0.00035 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uDesat: { value: 0 },
    uWarm: { value: 0.5 },
    uContrast: { value: 1.08 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uFlash, uDesat, uWarm, uContrast;
    uniform vec3 uFlashColor;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * (uAberration * 40.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      // contrast around mid grey (in linear HDR, pivot low)
      col = max(vec3(0.0), (col - 0.18) * uContrast + 0.18);
      // split tone: teal shadows, warm highlights
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(0.86, 0.98, 1.06);
      vec3 hiTint = vec3(1.08, 0.98, 0.86);
      col *= mix(vec3(1.0), mix(shadowTint, hiTint, smoothstep(0.02, 0.6, l)), uWarm);
      // desaturate
      col = mix(col, vec3(l), uDesat);
      // vignette
      float vig = smoothstep(0.85, 0.18, r2 * 1.9);
      col *= mix(1.0, vig, uVignette);
      // flash
      col = mix(col, uFlashColor * 2.0, uFlash);
      // grain
      float g = hash(vUv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
      col += g * uGrain * (0.25 + l);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 200);
    this.scene = new THREE.Scene();

    const pmrem = new THREE.PMREMGenerator(r);
    this.envMap = pmrem.fromScene(new RoomEnvironment(r), 0.04).texture;

    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.6, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.clock = new THREE.Clock();
    this.timeScale = 1;
    this.updaters = new Set();
    this.shake = 0;
    this.flash = 0;
    this.active = null; // active scene controller

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.grade.uniforms.uRes.value.set(s.x, s.y);
  }

  setScene(ctrl) {
    this.active = ctrl;
    this.scene = ctrl.scene;
    this.renderPass.scene = ctrl.scene;
    if (ctrl.grade) Object.entries(ctrl.grade).forEach(([k, v]) => { if (this.grade.uniforms[k]) this.grade.uniforms[k].value = v; });
    if (ctrl.bloom) { this.bloom.strength = ctrl.bloom[0]; this.bloom.radius = ctrl.bloom[1]; this.bloom.threshold = ctrl.bloom[2]; }
    if (ctrl.exposure) this.renderer.toneMappingExposure = ctrl.exposure;
  }

  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }
  hitFlash(a, color) { this.flash = Math.max(this.flash, a); if (color) this.grade.uniforms.uFlashColor.value.set(color); }

  loop() {
    requestAnimationFrame(this.loop);
    let rawDt = Math.min(this.clock.getDelta(), 1 / 20);
    const dt = rawDt * this.timeScale;
    const t = this.clock.elapsedTime;
    this.grade.uniforms.uTime.value = t;
    if (this.active && this.active.update) this.active.update(dt, rawDt, t);
    for (const u of this.updaters) u(dt, rawDt, t);

    // camera shake applied after controller positioned camera
    if (this.shake > 0.001) {
      const s = this.shake * 0.05;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.rotation.z += (Math.random() - 0.5) * s * 0.6;
      this.shake *= Math.pow(0.0008, rawDt);
    }
    this.flash *= Math.pow(0.0005, rawDt);
    this.grade.uniforms.uFlash.value = this.flash * 0.45;
    this.composer.render(rawDt);
  }
}
