import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

interface NovaRobot3DProps {
  onInteract?: () => void;
  reducedMotion?: boolean;
}

function createParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.32, 'rgba(255, 255, 255, 0.78)');
    grad.addColorStop(0.68, 'rgba(255, 255, 255, 0.22)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function NovaRobot3D({ onInteract, reducedMotion = false }: NovaRobot3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const waveTriggerRef = useRef<number>(0);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;

  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReduced =
      reducedMotion ||
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0x000000, 0);

    const initWidth = Math.max(260, container.clientWidth || 420);
    const initHeight = Math.max(260, container.clientHeight || 420);
    renderer.setSize(initWidth, initHeight);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      36,
      initWidth / initHeight,
      0.1,
      50
    );
    camera.position.set(0, 0.35, 5.1);
    camera.lookAt(0, 0.12, 0);

    // Three-point studio lighting with warm golden & purple contrast
    const hemiLight = new THREE.HemisphereLight(0xd8b4fe, 0x1e1035, 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfef9c3, 2.1);
    keyLight.position.set(3.5, 5, 4);
    scene.add(keyLight);

    const fillLeft = new THREE.PointLight(0xfacc15, 4.4, 14, 1.8);
    fillLeft.position.set(-2.8, 1.0, 2.2);
    scene.add(fillLeft);

    const rimRight = new THREE.PointLight(0xa855f7, 4.4, 14, 1.8);
    rimRight.position.set(2.8, 1.5, -2.0);
    scene.add(rimRight);

    // Materials
    const silverShellMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2e8f0,
      metalness: 0.85,
      roughness: 0.2,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
    });

    const titaniumTrimMat = new THREE.MeshStandardMaterial({
      color: 0x3b2f56,
      metalness: 0.78,
      roughness: 0.44,
    });

    const darkVisorMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b0716,
      metalness: 0.25,
      roughness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    });

    const eyeGlowMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfacc15,
      emissiveIntensity: 0.0,
      roughness: 0.12,
      metalness: 0.05,
    });

    const purpleAccentMat = new THREE.MeshStandardMaterial({
      color: 0xc084fc,
      emissive: 0x9333ea,
      emissiveIntensity: 1.45,
      roughness: 0.25,
      metalness: 0.2,
    });

    const blueAccentMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xeab308,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.2,
    });

    // Assemble Composite Robot Group (Nova)
    const novaGroup = new THREE.Group();
    scene.add(novaGroup);

    // 1. Torso group
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, -0.32, 0);
    novaGroup.add(torsoGroup);

    const torsoBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.46, 0.38, 16, 28),
      silverShellMat
    );
    torsoBody.scale.set(1.06, 0.96, 0.92);
    torsoGroup.add(torsoBody);

    const chestBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.045, 16, 36),
      titaniumTrimMat
    );
    chestBand.rotation.x = Math.PI / 2;
    chestBand.position.y = 0.24;
    torsoGroup.add(chestBand);

    const coreRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.025, 16, 32),
      blueAccentMat
    );
    coreRing.position.set(0, 0.06, 0.41);
    torsoGroup.add(coreRing);

    const coreCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.085, 1),
      purpleAccentMat
    );
    coreCrystal.position.set(0, 0.06, 0.42);
    torsoGroup.add(coreCrystal);

    // Hover thruster base
    const thrusterSkirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.36, 0.16, 28),
      titaniumTrimMat
    );
    thrusterSkirt.position.y = -0.52;
    torsoGroup.add(thrusterSkirt);

    const hoverHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.022, 14, 48),
      blueAccentMat
    );
    hoverHalo.rotation.x = Math.PI / 2;
    hoverHalo.position.y = -0.66;
    torsoGroup.add(hoverHalo);

    const hoverHaloOuter = new THREE.Mesh(
      new THREE.TorusGeometry(0.56, 0.012, 12, 48),
      purpleAccentMat
    );
    hoverHaloOuter.rotation.x = Math.PI / 2;
    hoverHaloOuter.position.y = -0.74;
    torsoGroup.add(hoverHaloOuter);

    // 2. Neck & Head group
    const neckMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 0.16, 20),
      titaniumTrimMat
    );
    neckMesh.position.set(0, 0.32, 0);
    novaGroup.add(neckMesh);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.78, 0);
    novaGroup.add(headGroup);

    const helmetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.56, 32, 24),
      silverShellMat
    );
    helmetMesh.scale.set(1.14, 0.94, 0.98);
    headGroup.add(helmetMesh);

    const visorMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 32, 24),
      darkVisorMat
    );
    visorMesh.scale.set(1.04, 0.76, 0.80);
    visorMesh.position.set(0, -0.01, 0.10);
    headGroup.add(visorMesh);

    // Glowing Expressive Eyes positioned cleanly proud of the visor surface
    const leftEye = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.068, 0.09, 8, 16),
      eyeGlowMat
    );
    leftEye.position.set(-0.18, 0.02, 0.53);
    leftEye.rotation.z = 0.06;
    headGroup.add(leftEye);

    const rightEye = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.068, 0.09, 8, 16),
      eyeGlowMat
    );
    rightEye.position.set(0.18, 0.02, 0.53);
    rightEye.rotation.z = -0.06;
    headGroup.add(rightEye);

    // Cute glowing cheek micro-accents
    const cheekLeft = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 12, 12),
      purpleAccentMat
    );
    cheekLeft.position.set(-0.34, -0.09, 0.45);
    headGroup.add(cheekLeft);

    const cheekRight = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 12, 12),
      purpleAccentMat
    );
    cheekRight.position.set(0.34, -0.09, 0.45);
    headGroup.add(cheekRight);

    // Ear pods & antennae
    const earGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 24);
    const leftEar = new THREE.Mesh(earGeo, titaniumTrimMat);
    leftEar.rotation.z = Math.PI / 2;
    leftEar.position.set(-0.63, 0.02, 0);
    headGroup.add(leftEar);

    const rightEar = new THREE.Mesh(earGeo, titaniumTrimMat);
    rightEar.rotation.z = Math.PI / 2;
    rightEar.position.set(0.63, 0.02, 0);
    headGroup.add(rightEar);

    const antennaStemGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.24, 12);
    const antennaTipGeo = new THREE.SphereGeometry(0.045, 16, 16);

    const leftAnt = new THREE.Group();
    leftAnt.position.set(-0.56, 0.22, -0.04);
    leftAnt.rotation.z = 0.22;
    const leftStem = new THREE.Mesh(antennaStemGeo, silverShellMat);
    leftStem.position.y = 0.12;
    const leftTip = new THREE.Mesh(antennaTipGeo, blueAccentMat);
    leftTip.position.y = 0.25;
    leftAnt.add(leftStem, leftTip);
    headGroup.add(leftAnt);

    const rightAnt = new THREE.Group();
    rightAnt.position.set(0.56, 0.22, -0.04);
    rightAnt.rotation.z = -0.22;
    const rightStem = new THREE.Mesh(antennaStemGeo, silverShellMat);
    rightStem.position.y = 0.12;
    const rightTip = new THREE.Mesh(antennaTipGeo, blueAccentMat);
    rightTip.position.y = 0.25;
    rightAnt.add(rightStem, rightTip);
    headGroup.add(rightAnt);

    // 3. Articulated Arms (Left & Right)
    function buildArm(side: -1 | 1): THREE.Group {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(side * 0.58, 0.1, 0);

      const shoulderBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 16, 16),
        titaniumTrimMat
      );
      shoulderPivot.add(shoulderBall);

      const upperArm = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.09, 0.26, 10, 16),
        silverShellMat
      );
      upperArm.position.set(side * 0.05, -0.22, 0);
      upperArm.rotation.z = side * 0.16;
      shoulderPivot.add(upperArm);

      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.105, 16, 16),
        silverShellMat
      );
      hand.scale.set(0.95, 1.15, 0.95);
      hand.position.set(side * 0.09, -0.45, 0.04);
      shoulderPivot.add(hand);

      const handRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.075, 0.012, 10, 24),
        blueAccentMat
      );
      handRing.rotation.x = Math.PI / 2;
      handRing.position.set(side * 0.08, -0.36, 0.02);
      shoulderPivot.add(handRing);

      return shoulderPivot;
    }

    const leftArm = buildArm(-1);
    const rightArm = buildArm(1);
    torsoGroup.add(leftArm, rightArm);

    // 4. Expanded dual-layer digital orbital particles around Nova (yellow & purple)
    const particleTex = createParticleTexture();
    const yellowBright = new THREE.Color(0xfef08a);
    const yellowGold = new THREE.Color(0xfacc15);
    const purpleBright = new THREE.Color(0xd8b4fe);
    const purpleVivid = new THREE.Color(0xa855f7);

    const particleCount = 140;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const particleBase = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + (i % 7) * 0.42;
      const radius = 1.05 + ((i * 37) % 100) / 100 * 2.25;
      const y = (((i * 53) % 100) / 100 - 0.5) * 3.1;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * 0.72;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      particleBase[i * 3] = angle;
      particleBase[i * 3 + 1] = radius;
      particleBase[i * 3 + 2] = y;

      const c =
        i % 3 === 0 ? yellowBright : i % 2 === 0 ? yellowGold : purpleBright;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.19,
      map: particleTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 4b. Larger soft bokeh aura particles floating wider around Nova
    const bokehCount = 42;
    const bokehPositions = new Float32Array(bokehCount * 3);
    const bokehColors = new Float32Array(bokehCount * 3);
    const bokehBase = new Float32Array(bokehCount * 3);
    for (let i = 0; i < bokehCount; i++) {
      const angle = (i / bokehCount) * Math.PI * 2 + (i % 5) * 0.55;
      const radius = 1.35 + ((i * 61) % 100) / 100 * 2.45;
      const y = (((i * 79) % 100) / 100 - 0.5) * 3.4;
      bokehPositions[i * 3] = Math.cos(angle) * radius;
      bokehPositions[i * 3 + 1] = y;
      bokehPositions[i * 3 + 2] = Math.sin(angle) * radius * 0.68;
      bokehBase[i * 3] = angle;
      bokehBase[i * 3 + 1] = radius;
      bokehBase[i * 3 + 2] = y;

      const c = i % 2 === 0 ? yellowGold : purpleVivid;
      bokehColors[i * 3] = c.r;
      bokehColors[i * 3 + 1] = c.g;
      bokehColors[i * 3 + 2] = c.b;
    }
    const bokehGeo = new THREE.BufferGeometry();
    bokehGeo.setAttribute('position', new THREE.BufferAttribute(bokehPositions, 3));
    bokehGeo.setAttribute('color', new THREE.BufferAttribute(bokehColors, 3));
    const bokehMat = new THREE.PointsMaterial({
      size: 0.48,
      map: particleTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const bokehParticles = new THREE.Points(bokehGeo, bokehMat);
    scene.add(bokehParticles);

    // Pointer tracking
    const pointerTarget = { x: 0, y: 0 };
    const handlePointerMove = (evt: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((evt.clientY - rect.top) / rect.height) * 2 - 1);
      pointerTarget.x = THREE.MathUtils.clamp(nx, -1, 1);
      pointerTarget.y = THREE.MathUtils.clamp(ny, -1, 1);
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    const handleClick = () => {
      waveTriggerRef.current = performance.now();
      onInteractRef.current?.();
    };
    renderer.domElement.addEventListener('click', handleClick);

    // ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(200, Math.floor(entry.contentRect.width));
        const h = Math.max(200, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    // Initial state for intro animation
    novaGroup.scale.setScalar(prefersReduced ? 1 : 0.68);
    waveTriggerRef.current = performance.now() + 550; // Initial greeting wave shortly after mount

    let frameId = 0;
    let disposed = false;
    const startTime = performance.now();
    let lastTime = startTime;
    let currentScale = prefersReduced ? 1 : 0.68;
    let eyeIntensity = prefersReduced ? 2.1 : 0.0;
    let headLookX = 0;
    let headLookY = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const elapsed = (now - startTime) / 1000;

      if (!prefersReduced) {
        // 1. Scale-up intro
        currentScale = THREE.MathUtils.damp(currentScale, 1.0, 5.5, dt);
        novaGroup.scale.setScalar(currentScale);

        // 2. Gradual eye ignition
        const targetEye = elapsed > 0.25 ? 2.15 : 0.0;
        eyeIntensity = THREE.MathUtils.damp(eyeIntensity, targetEye, 4.0, dt);
        eyeGlowMat.emissiveIntensity = eyeIntensity;

        // 3. Natural blinking every ~3.8 seconds
        const blinkCycle = elapsed % 3.8;
        let blinkScaleY = 1.0;
        if (blinkCycle > 3.55 && blinkCycle < 3.72) {
          const p = (blinkCycle - 3.55) / 0.17;
          blinkScaleY = Math.max(0.08, Math.abs(Math.cos(p * Math.PI)));
        }
        leftEye.scale.y = blinkScaleY;
        rightEye.scale.y = blinkScaleY;

        // 4. Floating idle & subtle head turn left/right + pointer tracking
        novaGroup.position.y = Math.sin(elapsed * 1.6) * 0.09;
        novaGroup.rotation.y = Math.sin(elapsed * 0.55) * 0.08;

        const targetYaw = pointerTarget.x * 0.34 + Math.sin(elapsed * 0.9) * 0.12;
        const targetPitch = -pointerTarget.y * 0.18 + Math.cos(elapsed * 0.7) * 0.04;
        headLookY = THREE.MathUtils.damp(headLookY, targetYaw, 5.0, dt);
        headLookX = THREE.MathUtils.damp(headLookX, targetPitch, 5.0, dt);
        headGroup.rotation.y = headLookY;
        headGroup.rotation.x = headLookX;

        // 5. Greeting wave gesture on intro & on click
        const waveAge = (now - waveTriggerRef.current) / 1000;
        if (waveAge >= 0 && waveAge < 2.2) {
          const env = Math.sin((waveAge / 2.2) * Math.PI);
          rightArm.rotation.z = THREE.MathUtils.damp(
            rightArm.rotation.z,
            2.1 * env + Math.sin(waveAge * 10.5) * 0.32 * env,
            10,
            dt
          );
          rightArm.rotation.x = THREE.MathUtils.damp(
            rightArm.rotation.x,
            -0.35 * env,
            10,
            dt
          );
        } else {
          rightArm.rotation.z = THREE.MathUtils.damp(
            rightArm.rotation.z,
            Math.sin(elapsed * 1.6) * 0.06,
            5,
            dt
          );
          rightArm.rotation.x = THREE.MathUtils.damp(rightArm.rotation.x, 0, 5, dt);
        }

        leftArm.rotation.z = -Math.sin(elapsed * 1.6) * 0.06;
        coreCrystal.rotation.y = elapsed * 1.2;
        coreCrystal.rotation.x = elapsed * 0.7;
        hoverHalo.scale.setScalar(1 + Math.sin(elapsed * 3.0) * 0.04);

        // 6. Expanded dual-layer orbital particles around Nova
        const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < particleCount; i++) {
          const baseAngle = particleBase[i * 3];
          const radius = particleBase[i * 3 + 1];
          const baseY = particleBase[i * 3 + 2];
          const a = baseAngle + elapsed * (0.2 + (i % 5) * 0.045);
          posAttr.setXYZ(
            i,
            Math.cos(a) * radius,
            baseY + Math.sin(elapsed * 0.95 + i) * 0.18,
            Math.sin(a) * radius * 0.72
          );
        }
        posAttr.needsUpdate = true;

        const bokehAttr = bokehGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < bokehCount; i++) {
          const baseAngle = bokehBase[i * 3];
          const radius = bokehBase[i * 3 + 1];
          const baseY = bokehBase[i * 3 + 2];
          const a = baseAngle - elapsed * (0.11 + (i % 4) * 0.03);
          bokehAttr.setXYZ(
            i,
            Math.cos(a) * radius,
            baseY + Math.cos(elapsed * 0.65 + i) * 0.22,
            Math.sin(a) * radius * 0.68
          );
        }
        bokehAttr.needsUpdate = true;
      } else {
        eyeGlowMat.emissiveIntensity = 2.15;
      }

      renderer.render(scene, camera);

      if (prefersReduced) return;
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      particleTex.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [reducedMotion]);

  if (webglFailed) {
    return (
      <div
        data-testid="nova-robot-fallback"
        onClick={onInteract}
        className="flex h-full w-full cursor-pointer items-center justify-center"
      >
        <svg viewBox="0 0 220 220" className="h-56 w-56 drop-shadow-[0_0_28px_rgba(250,204,21,0.35)]">
          <defs>
            <linearGradient id="novaSilver" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F1F5F9" />
              <stop offset="100%" stopColor="#94A3B8" />
            </linearGradient>
          </defs>
          <ellipse cx="110" cy="188" rx="44" ry="8" fill="#FACC15" fillOpacity="0.35" />
          <rect x="74" y="108" width="72" height="58" rx="28" fill="url(#novaSilver)" />
          <circle cx="110" cy="136" r="10" fill="#130928" stroke="#A855F7" strokeWidth="3" />
          <rect x="64" y="40" width="92" height="64" rx="30" fill="url(#novaSilver)" />
          <rect x="76" y="54" width="68" height="36" rx="18" fill="#0B0716" />
          <rect x="90" y="66" width="12" height="14" rx="6" fill="#FACC15" />
          <rect x="118" y="66" width="12" height="14" rx="6" fill="#FACC15" />
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      data-testid="nova-robot-3d"
      role="img"
      aria-label="Nova, maskot robot 3D interaktif NEXAVAULT. Klik untuk menyapa."
      className="h-full w-full cursor-pointer select-none"
    />
  );
}
