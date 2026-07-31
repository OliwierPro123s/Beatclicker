
    import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    const ws = new WebSocket(wsUrl);

    const ui = {
      menu: document.getElementById('menu'),
      hud: document.getElementById('hud'),
      overlay: document.getElementById('overlay'),
      centerMessage: document.getElementById('centerMessage'),
      centerTitle: document.getElementById('centerTitle'),
      centerSub: document.getElementById('centerSub'),
      feed: document.getElementById('feed'),
      crosshair: document.getElementById('crosshair'),
      nameInput: document.getElementById('nameInput'),
      playBtn: document.getElementById('playBtn'),
      refreshBtn: document.getElementById('refreshBtn'),
      menuState: document.getElementById('menuState'),
      menuPlayers: document.getElementById('menuPlayers'),
      menuRound: document.getElementById('menuRound'),
      seekersGrid: document.getElementById('seekersGrid'),
      hidersGrid: document.getElementById('hidersGrid'),
      lobbyList: document.getElementById('lobbyList'),
      seekersPanel: document.getElementById('seekersPanel'),
      hidersPanel: document.getElementById('hidersPanel'),
      rulesPanel: document.getElementById('rulesPanel'),
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
      roleText: document.getElementById('roleText'),
      playerNameText: document.getElementById('playerNameText'),
      timerText: document.getElementById('timerText'),
      visibilityText: document.getElementById('visibilityText'),
      speedText: document.getElementById('speedText'),
      visionText: document.getElementById('visionText'),
      safeText: document.getElementById('safeText'),
      gameText: document.getElementById('gameText'),
    };

    const KEY = { w:false, a:false, s:false, d:false, shift:false };
    let myId = null;
    let latestState = null;
    let localName = '';
    let lastToastHash = '';
    let scanPulseUntil = 0;
    let lastInputSend = 0;
    let mapSignature = '';
    let mapBuilt = false;

    const roleData = {
      seekers: [
        { name:'Tracker', desc:'Większy zasięg wykrywania i stabilny pościg.', speed:'5.15', vision:'34 m', badge:'catch +0.55' },
        { name:'Radar', desc:'Najlepiej widzi cel w średnim dystansie.', speed:'4.95', vision:'38 m', badge:'catch +0.35' },
        { name:'Hunter', desc:'Najszybszy start i agresywny pościg.', speed:'5.75', vision:'28 m', badge:'catch +0.25' },
        { name:'Sentinel', desc:'Stabilny łowca z dobrym balansem prędkości.', speed:'5.05', vision:'32 m', badge:'catch +0.40' },
        { name:'Warden', desc:'Większy zasięg łapania i mocny nacisk.', speed:'4.90', vision:'36 m', badge:'catch +0.60' },
        { name:'Echo', desc:'Dobrze trzyma tempo podczas długiego pościgu.', speed:'5.45', vision:'30 m', badge:'catch +0.30' },
        { name:'Analyst', desc:'Bardzo dobry do wyłapywania ruchu na dystans.', speed:'5.20', vision:'35 m', badge:'catch +0.35' },
        { name:'Snare Master', desc:'Nacisk na kontrolę i zamykanie przestrzeni.', speed:'4.80', vision:'31 m', badge:'catch +0.50' },
        { name:'Night Watch', desc:'Najlepszy wzrok w ciemniejszych fragmentach mapy.', speed:'5.10', vision:'40 m', badge:'catch +0.25' },
        { name:'Pursuer', desc:'Najbardziej zwinny w gonitwie na prostej.', speed:'5.90', vision:'27 m', badge:'catch +0.25' },
        { name:'Pathfinder', desc:'Płynny ruch i dobre ustawianie się na skrzydłach.', speed:'5.35', vision:'32 m', badge:'catch +0.35' },
        { name:'Stalker', desc:'Silny w cichym, stopniowym zawężaniu dystansu.', speed:'5.55', vision:'33 m', badge:'catch +0.35' },
      ],
      hiders: [
        { name:'Ghost', desc:'Cichszy i trudniejszy do zauważenia przy ścianach.', speed:'5.05', vision:'28 m', badge:'stealth 22' },
        { name:'Sprinter', desc:'Bardzo szybki i dobry na krótkie przebiegi.', speed:'5.95', vision:'24 m', badge:'stealth 18' },
        { name:'Blink', desc:'Najlepszy w gwałtownych ucieczkach i skrętach.', speed:'5.55', vision:'24 m', badge:'stealth 18' },
        { name:'Decoy', desc:'Świetny w mieszaniu tropów i myleniu pościgu.', speed:'5.15', vision:'25 m', badge:'stealth 19' },
        { name:'Smoke', desc:'Lubi chaos i zasłanianie własnej trasy.', speed:'5.00', vision:'26 m', badge:'stealth 20' },
        { name:'Shade', desc:'Dobrze znika w bocznych korytarzach.', speed:'5.20', vision:'27 m', badge:'stealth 22' },
        { name:'Acrobat', desc:'Wygodny przy skokach i dynamicznym ruchu.', speed:'5.30', vision:'24 m', badge:'stealth 20' },
        { name:'Burrower', desc:'Najlepiej czuje się przy przeszkodach i zakrętach.', speed:'5.10', vision:'26 m', badge:'stealth 21' },
        { name:'Mimic', desc:'Świetny, gdy trzeba zlać się z otoczeniem.', speed:'5.00', vision:'28 m', badge:'stealth 23' },
        { name:'Runner', desc:'Najdłużej utrzymuje tempo w otwartym terenie.', speed:'5.80', vision:'24 m', badge:'stealth 18' },
        { name:'Quietfoot', desc:'Najsłabszy ślad i bardzo mały zasięg zdrady.', speed:'4.95', vision:'29 m', badge:'stealth 25' },
        { name:'Vanisher', desc:'Idealny do szybkiego znikania po zmianie roli.', speed:'5.25', vision:'24 m', badge:'stealth 16' },
      ]
    };

    function buildRoleCards() {
      const card = (role, side) => `
        <div class="role-card">
          <div class="role-top">
            <div>
              <div class="role-side">${side === 'seekers' ? 'Szukający' : 'Chowający'}</div>
              <div class="role-name">${role.name}</div>
            </div>
            <div class="chip">${role.badge}</div>
          </div>
          <div class="role-desc">${role.desc}</div>
          <div class="role-stats">
            <div class="chip">Szybkość ${role.speed}</div>
            <div class="chip">Widzenie ${role.vision}</div>
          </div>
        </div>`;
      ui.seekersGrid.innerHTML = roleData.seekers.map(r => card(r, 'seekers')).join('');
      ui.hidersGrid.innerHTML = roleData.hiders.map(r => card(r, 'hiders')).join('');
    }
    buildRoleCards();

    for (const el of document.querySelectorAll('[data-tab]')) {
      el.addEventListener('click', () => {
        const tab = el.dataset.tab;
        ui.seekersPanel.classList.toggle('active', tab === 'seekers');
        ui.hidersPanel.classList.toggle('active', tab === 'hiders');
        ui.rulesPanel.classList.toggle('active', tab === 'rules');
      });
    }

    function showToast(text) {
      const hash = `${text}|${Math.floor(Date.now() / 1000)}`;
      if (hash === lastToastHash) return;
      lastToastHash = hash;
      const div = document.createElement('div');
      div.className = 'toast';
      div.textContent = text;
      ui.feed.prepend(div);
      while (ui.feed.children.length > 5) ui.feed.lastElementChild?.remove();
      setTimeout(() => div.remove(), 6000);
    }

    function fmtTime(ms) {
      if (!Number.isFinite(ms) || ms < 0) return '00:00';
      const s = Math.ceil(ms / 1000);
      const m = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      return `${m}:${ss}`;
    }

    function escapeHtml(str) {
      return String(str ?? '').replace(/[&<>"']/g, s => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
      }[s]));
    }

    const canvas = document.getElementById('scene');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b1024, 0.021);

    const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 220);
    camera.position.set(0, 1.7, 0);
    camera.rotation.order = 'YXZ';

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0b1024, 1.35);
    scene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(12, 24, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.camera.left = -40;
    dirLight.shadow.camera.right = 40;
    dirLight.shadow.camera.top = 40;
    dirLight.shadow.camera.bottom = -40;
    scene.add(dirLight);

    const moonLight = new THREE.PointLight(0x7c3aed, 0.6, 70, 2);
    moonLight.position.set(-18, 10, -16);
    scene.add(moonLight);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(130, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x091126, side: THREE.BackSide })
    );
    scene.add(sky);

    function makeTexture(size, painter, repeat = 1) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      painter(ctx, size);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 8;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    const textures = {
      grass: makeTexture(256, (ctx, s) => {
        ctx.fillStyle = '#2f7d32';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 1400; i += 1) {
          const x = Math.random() * s;
          const y = Math.random() * s;
          const v = 100 + Math.floor(Math.random() * 80);
          ctx.fillStyle = `rgb(${35 + Math.floor(Math.random() * 30)},${90 + Math.floor(Math.random() * 50)},${35 + Math.floor(Math.random() * 30)})`;
          ctx.fillRect(x, y, 2, 2);
          ctx.strokeStyle = `rgba(${v},${140 + Math.random() * 60},${v},0.25)`;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (Math.random() * 6 - 3), y - (Math.random() * 10 + 2));
          ctx.stroke();
        }
      }, 24),
      road: makeTexture(256, (ctx, s) => {
        ctx.fillStyle = '#2b3440';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 900; i += 1) {
          const x = Math.random() * s;
          const y = Math.random() * s;
          const shade = 38 + Math.floor(Math.random() * 36);
          ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 6})`;
          ctx.fillRect(x, y, 2, 2);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.34)';
        ctx.lineWidth = 10;
        ctx.setLineDash([24, 18]);
        ctx.beginPath();
        ctx.moveTo(0, s / 2);
        ctx.lineTo(s, s / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(15,23,42,0.8)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.26);
        ctx.lineTo(s, s * 0.26);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, s * 0.74);
        ctx.lineTo(s, s * 0.74);
        ctx.stroke();
      }, 10),
      brick: makeTexture(256, (ctx, s) => {
        ctx.fillStyle = '#7a4b2e';
        ctx.fillRect(0, 0, s, s);
        const bh = 32;
        const bw = 64;
        for (let y = 0; y < s; y += bh) {
          for (let x = 0; x < s; x += bw) {
            const offset = ((y / bh) % 2) * (bw / 2);
            const rx = (x + offset) % s;
            ctx.fillStyle = `rgb(${120 + Math.floor(Math.random() * 30)},${70 + Math.floor(Math.random() * 20)},${45 + Math.floor(Math.random() * 18)})`;
            ctx.fillRect(rx, y, bw - 2, bh - 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.strokeRect(rx + 1, y + 1, bw - 4, bh - 4);
          }
        }
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        for (let i = 0; i < 40; i += 1) {
          ctx.fillRect(Math.random() * s, Math.random() * s, 4, 4);
        }
      }, 1),
      roof: makeTexture(256, (ctx, s) => {
        ctx.fillStyle = '#8f1d24';
        ctx.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 18) {
          for (let x = 0; x < s; x += 36) {
            ctx.fillStyle = 'rgba(255,255,255,0.10)';
            ctx.fillRect(x + 1, y + 1, 34, 8);
            ctx.fillStyle = 'rgba(0,0,0,0.16)';
            ctx.fillRect(x + 1, y + 10, 34, 6);
          }
        }
      }, 2),
      wood: makeTexture(256, (ctx, s) => {
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 24) {
          const tone = 100 + Math.floor(Math.random() * 25);
          ctx.fillStyle = `rgb(${tone},${70 + Math.floor(Math.random() * 15)},${35 + Math.floor(Math.random() * 10)})`;
          ctx.fillRect(0, y, s, 20);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 2;
        for (let x = 0; x < s; x += 42) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, s);
          ctx.stroke();
        }
      }, 4),
      metal: makeTexture(256, (ctx, s) => {
        const grad = ctx.createLinearGradient(0, 0, s, s);
        grad.addColorStop(0, '#6b7280');
        grad.addColorStop(0.5, '#475569');
        grad.addColorStop(1, '#1f2937');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 50; i += 1) {
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.beginPath();
          ctx.moveTo(0, i * 5);
          ctx.lineTo(s, i * 5);
          ctx.stroke();
        }
        for (let i = 0; i < 1800; i += 1) {
          ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
          ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
        }
      }, 2),
      glass: makeTexture(256, (ctx, s) => {
        const grad = ctx.createLinearGradient(0, 0, s, s);
        grad.addColorStop(0, 'rgba(191,219,254,0.95)');
        grad.addColorStop(1, 'rgba(59,130,246,0.45)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(20, 20, s - 40, 28);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        for (let i = 0; i < 12; i += 1) {
          ctx.fillRect(Math.random() * s, Math.random() * s, 36, 8);
        }
      }, 1),
      crate: makeTexture(256, (ctx, s) => {
        ctx.fillStyle = '#8d5a2b';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 8; i += 1) {
          const y = i * 32;
          ctx.fillStyle = `rgb(${125 + Math.floor(Math.random()*25)},${75 + Math.floor(Math.random()*15)},${35 + Math.floor(Math.random()*10)})`;
          ctx.fillRect(0, y, s, 28);
        }
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(0, s); ctx.stroke();
      }, 2),
    };

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90, 1, 1),
      new THREE.MeshStandardMaterial({ map: textures.grass, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    function makeRoadPlane(w, d, x, z, rot = 0) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d, 1, 1),
        new THREE.MeshStandardMaterial({
          map: textures.road,
          roughness: 1,
          metalness: 0.02,
          transparent: true,
          opacity: 0.95,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = rot;
      mesh.position.set(x, 0.03, z);
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    }

    makeRoadPlane(88, 8, 0, 0);
    makeRoadPlane(8, 88, 0, 0);
    makeRoadPlane(26, 5, -13, 10, 0);
    makeRoadPlane(26, 5, 13, -10, 0);

    const obstacleGroup = new THREE.Group();
    scene.add(obstacleGroup);

    const playerMeshes = new Map();
    const tmpVec3 = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const look = {
      yaw: 0,
      pitch: 0,
      targetYaw: 0,
      targetPitch: 0,
    };

    function makeNameTag(name) {
      const tag = document.createElement('div');
      tag.className = 'player-tag';
      tag.style.position = 'fixed';
      tag.style.left = '0';
      tag.style.top = '0';
      tag.style.transform = 'translate(-50%, -120%)';
      tag.style.padding = '6px 10px';
      tag.style.borderRadius = '999px';
      tag.style.background = 'rgba(7,10,18,.82)';
      tag.style.border = '1px solid rgba(255,255,255,.08)';
      tag.style.backdropFilter = 'blur(6px)';
      tag.style.color = '#fff';
      tag.style.fontSize = '12px';
      tag.style.whiteSpace = 'nowrap';
      tag.style.pointerEvents = 'none';
      tag.style.display = 'none';
      tag.textContent = name;
      document.body.appendChild(tag);
      return tag;
    }

    function makeAvatar(colorHex, name) {
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.38, metalness: 0.06 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x10131d, roughness: 0.85, metalness: 0.0 });
      const glowMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: colorHex,
        emissiveIntensity: 0.35,
        roughness: 0.3
      });

      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.65, 8, 16), bodyMat);
      body.position.y = 1.0;
      body.castShadow = true;
      group.add(body);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 18), bodyMat);
      head.position.y = 1.65;
      head.castShadow = true;
      group.add(head);

      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.10, 0.1), glowMat);
      visor.position.set(0, 1.72, 0.30);
      group.add(visor);

      const legGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.7, 10);
      const legA = new THREE.Mesh(legGeo, darkMat);
      const legB = new THREE.Mesh(legGeo, darkMat);
      legA.position.set(-0.16, 0.32, 0);
      legB.position.set(0.16, 0.32, 0);
      legA.castShadow = legB.castShadow = true;
      group.add(legA, legB);

      const armGeo = new THREE.CylinderGeometry(0.09, 0.10, 0.62, 10);
      const armA = new THREE.Mesh(armGeo, darkMat);
      const armB = new THREE.Mesh(armGeo, darkMat);
      armA.position.set(-0.54, 1.15, 0);
      armB.position.set(0.54, 1.15, 0);
      armA.rotation.z = Math.PI * 0.3;
      armB.rotation.z = -Math.PI * 0.3;
      armA.castShadow = armB.castShadow = true;
      group.add(armA, armB);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.05, 10, 22),
        new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.18, transparent: true, opacity: 0.58 })
      );
      ring.position.y = 0.12;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      const tag = makeNameTag(name);
      return { group, tag, body, ring };
    }

    function clearObstacleGroup() {
      while (obstacleGroup.children.length) {
        const obj = obstacleGroup.children.pop();
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
          else obj.material.dispose?.();
        }
      }
    }

    function addBuildingBase(def, wallMap, roofMap, glassMap, metalMap) {
      const w = def.w;
      const d = def.d;
      const h = def.h;

      const wallMaterial = new THREE.MeshStandardMaterial({
        map: def.kind === 'warehouse' ? metalMap : wallMap,
        roughness: 0.95,
        metalness: def.kind === 'warehouse' ? 0.25 : 0.02,
        color: def.kind === 'warehouse' ? 0xe2e8f0 : 0xffffff,
      });

      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMaterial);
      base.position.set(def.x, h / 2, def.z);
      base.castShadow = true;
      base.receiveShadow = true;
      obstacleGroup.add(base);

      if (def.kind !== 'warehouse' && def.kind !== 'wall' && def.kind !== 'fence' && def.kind !== 'crate' && def.kind !== 'tree') {
        const roofHeight = Math.max(0.8, h * 0.26);
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(Math.max(w, d) * 0.68, roofHeight, 4),
          new THREE.MeshStandardMaterial({ map: roofMap, roughness: 1, metalness: 0.01 })
        );
        roof.position.set(def.x, h + roofHeight * 0.45, def.z);
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        roof.receiveShadow = true;
        obstacleGroup.add(roof);
      }

      if (def.kind === 'house' || def.kind === 'shop' || def.kind === 'shed' || def.kind === 'market') {
        const door = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(0.7, w * 0.16), Math.max(1.2, h * 0.34), 0.12),
          new THREE.MeshStandardMaterial({ map: woodMap, roughness: 1, metalness: 0.0 })
        );
        door.position.set(def.x, Math.max(0.62, h * 0.17), def.z + d / 2 + 0.07);
        obstacleGroup.add(door);

        const windowW = Math.max(0.55, w * 0.18);
        const windowH = Math.max(0.55, h * 0.18);
        const winMaterial = new THREE.MeshStandardMaterial({
          map: glassMap,
          transparent: true,
          opacity: 0.90,
          roughness: 0.05,
          metalness: 0.0
        });

        const windowA = new THREE.Mesh(new THREE.BoxGeometry(windowW, windowH, 0.09), winMaterial);
        const windowB = new THREE.Mesh(new THREE.BoxGeometry(windowW, windowH, 0.09), winMaterial);
        windowA.position.set(def.x - w * 0.22, h * 0.52, def.z + d / 2 + 0.06);
        windowB.position.set(def.x + w * 0.22, h * 0.52, def.z + d / 2 + 0.06);
        obstacleGroup.add(windowA, windowB);
      }

      if (def.kind === 'shop') {
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(1.8, w * 0.45), 0.22, 0.08),
          new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x14532d, emissiveIntensity: 0.2 })
        );
        sign.position.set(def.x, h + 0.55, def.z + d / 2 + 0.07);
        obstacleGroup.add(sign);
      }
    }

    function buildObstacle(def, wallMap, roofMap, glassMap, metalMap, crateMap, woodMap) {
      const h = def.h;
      if (def.kind === 'tree') {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.5, h, 8),
          new THREE.MeshStandardMaterial({ map: woodMap, roughness: 1 })
        );
        trunk.position.set(def.x, h / 2, def.z);
        trunk.castShadow = trunk.receiveShadow = true;
        obstacleGroup.add(trunk);

        const crown = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(def.w, def.d) * 0.58, 20, 20),
          new THREE.MeshStandardMaterial({
            color: 0x2dd4bf,
            roughness: 0.95,
            emissive: 0x0f766e,
            emissiveIntensity: 0.08
          })
        );
        crown.position.set(def.x, h + 0.95, def.z);
        crown.castShadow = crown.receiveShadow = true;
        obstacleGroup.add(crown);
        return;
      }

      if (def.kind === 'crate') {
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(def.w, def.h, def.d),
          new THREE.MeshStandardMaterial({ map: crateMap, roughness: 0.95, metalness: 0.02 })
        );
        crate.position.set(def.x, def.h / 2, def.z);
        crate.castShadow = crate.receiveShadow = true;
        obstacleGroup.add(crate);

        const smaller = new THREE.Mesh(
          new THREE.BoxGeometry(def.w * 0.72, def.h * 0.62, def.d * 0.72),
          new THREE.MeshStandardMaterial({ map: crateMap, roughness: 0.98 })
        );
        smaller.position.set(def.x + 0.2, def.h + (def.h * 0.31), def.z - 0.18);
        smaller.castShadow = smaller.receiveShadow = true;
        obstacleGroup.add(smaller);
        return;
      }

      if (def.kind === 'wall' || def.kind === 'fence') {
        const mat = new THREE.MeshStandardMaterial({
          map: def.kind === 'fence' ? woodMap : metalMap,
          roughness: 1,
          metalness: def.kind === 'fence' ? 0.0 : 0.12,
          transparent: def.kind === 'fence',
          opacity: def.kind === 'fence' ? 0.78 : 1
        });
        const wall = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), mat);
        wall.position.set(def.x, def.h / 2, def.z);
        wall.castShadow = wall.receiveShadow = true;
        obstacleGroup.add(wall);
        return;
      }

      if (def.kind === 'market') {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(def.w, def.h, def.d),
          new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.92, metalness: 0.0 })
        );
        base.position.set(def.x, def.h / 2, def.z);
        base.castShadow = base.receiveShadow = true;
        obstacleGroup.add(base);

        const canopy = new THREE.Mesh(
          new THREE.CylinderGeometry(Math.max(def.w, def.d) * 0.72, Math.max(def.w, def.d) * 0.72, 0.55, 4),
          new THREE.MeshStandardMaterial({ map: roofMap, roughness: 0.95, metalness: 0.0 })
        );
        canopy.position.set(def.x, def.h + 0.45, def.z);
        canopy.rotation.y = Math.PI / 4;
        canopy.castShadow = canopy.receiveShadow = true;
        obstacleGroup.add(canopy);

        const stallA = new THREE.Mesh(
          new THREE.BoxGeometry(def.w * 0.45, def.h * 0.55, 0.8),
          new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.95 })
        );
        stallA.position.set(def.x - def.w * 0.22, def.h * 0.28, def.z + def.d / 2 + 0.55);
        obstacleGroup.add(stallA);

        const stallB = stallA.clone();
        stallB.position.x = def.x + def.w * 0.22;
        obstacleGroup.add(stallB);
        return;
      }

      addBuildingBase(def, wallMap, roofMap, glassMap, metalMap);
    }

    function buildMap(state) {
      clearObstacleGroup();

      const wallMap = textures.brick;
      const roofMap = textures.roof;
      const glassMap = textures.glass;
      const metalMap = textures.metal;
      const crateMap = textures.crate;
      const woodMap = textures.wood;

      for (const ob of state.obstacles || []) {
        buildObstacle(ob, wallMap, roofMap, glassMap, metalMap, crateMap, woodMap);
      }

      const lampMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xf59e0b, emissiveIntensity: 0.15 });
      for (const p of [
        [-14, -14], [14, -14], [-14, 14], [14, 14],
        [-12, 2], [12, 2], [-2, -12], [-2, 12]
      ]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.4, 10), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 }));
        pole.position.set(p[0], 2.2, p[1]);
        pole.castShadow = pole.receiveShadow = true;
        obstacleGroup.add(pole);

        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), lampMat);
        lamp.position.set(p[0], 4.45, p[1]);
        obstacleGroup.add(lamp);

        const light = new THREE.PointLight(0xfbbf24, 0.45, 8, 2);
        light.position.set(p[0], 4.5, p[1]);
        scene.add(light);
      }
    }

    function currentPlayer(state) {
      if (!state || !myId) return null;
      return state.players.find(p => p.id === myId) || null;
    }

    function playerVisibleForLocal(other, me, state) {
      if (!me || !other || other.id === me.id) return true;
      const dx = other.x - me.x;
      const dz = other.z - me.z;
      const dist = Math.hypot(dx, dz);

      const revealPulse = Date.now() < scanPulseUntil;
      const side = me.side || 'hider';
      const maxSee = side === 'seeker'
        ? (me.roleName === 'Night Watch' ? 42 : me.roleName === 'Radar' ? 38 : me.roleName === 'Tracker' ? 34 : 30)
        : (me.roleName === 'Mimic' ? 30 : me.roleName === 'Quietfoot' ? 34 : 28);

      if (revealPulse) return true;
      if (other.side === 'seeker') return dist <= Math.max(maxSee, 30);
      if (other.side === 'hider') return dist <= (side === 'seeker' ? maxSee : 28);
      return false;
    }

    function updateSceneFromState(state) {
      if (!state) return;

      const sig = `${(state.obstacles || []).length}:${(state.obstacles || []).map(o => `${o.kind}@${o.x},${o.z}`).join('|')}`;
      if (!mapBuilt || sig !== mapSignature) {
        mapSignature = sig;
        buildMap(state);
        mapBuilt = true;
      }

      const me = currentPlayer(state);
      const now = state.now || Date.now();

      if (me) {
        camera.position.set(me.x, 1.68, me.z);
      }

      const activeIds = new Set();
      for (const p of state.players) {
        if (p.id === myId) continue;
        activeIds.add(p.id);

        let m = playerMeshes.get(p.id);
        if (!m) {
          const color = p.side === 'seeker' ? 0xff6b6b : 0x60a5fa;
          m = makeAvatar(color, p.name);
          playerMeshes.set(p.id, m);
          scene.add(m.group);
        }

        const visible = playerVisibleForLocal(p, me, state);
        m.group.visible = visible;
        m.tag.style.display = visible ? 'block' : 'none';

        if (visible) {
          m.group.position.set(p.x, 0, p.z);
          const bodyColor = p.side === 'seeker' ? 0xff6b6b : 0x60a5fa;
          m.body.material.color.setHex(bodyColor);
          m.ring.material.color.setHex(bodyColor);
          m.ring.material.emissive?.setHex?.(bodyColor);
          m.ring.material.opacity = p.side === 'seeker' ? 0.72 : 0.5;
          m.tag.textContent = `${p.name}${p.side ? ' · ' + (p.side === 'seeker' ? 'szukający' : 'chowający') : ''}`;
        }
      }

      for (const [id, mesh] of playerMeshes) {
        if (!activeIds.has(id)) {
          scene.remove(mesh.group);
          mesh.tag.remove();
          playerMeshes.delete(id);
        }
      }

      ui.menuState.textContent = state.running ? 'Gra trwa' : 'Lobby';
      ui.menuPlayers.textContent = state.players.length;
      ui.menuRound.textContent = state.round;
      ui.statusText.textContent = state.running ? 'W grze' : 'W lobby';
      ui.statusDot.className = 'dot ' + (state.running ? '' : 'warn');
      ui.gameText.textContent = state.running ? `Gra trwa · Runda ${state.round}` : 'Lobby';

      if (me) {
        const roleSide = me.side === 'seeker' ? 'Szukający' : me.side === 'hider' ? 'Chowający' : '—';
        ui.roleText.textContent = me.roleName ? `${roleSide} / ${me.roleName}` : roleSide;
        ui.playerNameText.textContent = me.name || '—';
        ui.speedText.textContent = me.speed ? `${Number(me.speed).toFixed(2)}` : '—';
        ui.visionText.textContent = me.vision ? `${me.vision} m` : '—';
        ui.safeText.textContent = me.safeUntil && now < me.safeUntil ? fmtTime(me.safeUntil - now) : 'Brak';
        ui.visibilityText.textContent = me.blindUntil && now < me.blindUntil ? 'Ślepy' : 'Widzę';
        ui.timerText.textContent = fmtTime(now - (state.startedAt || now));
        ui.statusDot.className = 'dot ' + (me.side === 'seeker' ? 'danger' : me.side === 'hider' ? 'warn' : '');
      } else {
        ui.roleText.textContent = '—';
        ui.playerNameText.textContent = localName || '—';
        ui.speedText.textContent = '—';
        ui.visionText.textContent = '—';
        ui.safeText.textContent = '—';
        ui.visibilityText.textContent = '—';
        ui.timerText.textContent = '00:00';
      }

      ui.centerTitle.textContent = state.running ? 'Hide and Role' : 'Czekamy na graczy';
      ui.centerSub.textContent = state.message || '';
      const blind = !!(me && me.blindUntil && now < me.blindUntil);
      const safe = !!(me && me.safeUntil && now < me.safeUntil);
      ui.centerMessage.classList.toggle('show', !state.running || blind || safe);
      ui.overlay.classList.toggle('show', blind);
      ui.crosshair.classList.toggle('show', !!me && !blind);

      const lobbyPlayers = state.players.map(p => {
        const status = p.id === myId ? 'Ty' : (p.side === 'seeker' ? 'Szukający' : p.side === 'hider' ? 'Chowający' : 'Lobby');
        return `<div class="list-item"><div><strong>${escapeHtml(p.name)}</strong><div class="small">${status}${p.roleName ? ` · ${escapeHtml(p.roleName)}` : ''}</div></div><div class="chip">${p.side || 'lobby'}</div></div>`;
      }).join('');
      ui.lobbyList.innerHTML = lobbyPlayers || '<div class="small">Jeszcze nikt nie wszedł.</div>';

      for (const a of (state.announcements || []).slice(0, 4)) {
        const stamp = `${a.text}|${a.at}`;
        if (!seenAnnouncements.has(stamp)) {
          seenAnnouncements.add(stamp);
          showToast(a.text);
        }
      }
    }

    const seenAnnouncements = new Set();

    const clock = new THREE.Clock();
    let camYaw = 0;
    let camPitch = 0;
    let bobPhase = 0;
    let lastStateSeenAt = 0;

    canvas.addEventListener('click', () => {
      if (ui.hud.style.display === 'flex') {
        canvas.requestPointerLock?.();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      ui.crosshair.style.display = locked ? 'grid' : 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      look.targetYaw -= e.movementX * 0.0022;
      look.targetPitch -= e.movementY * 0.0020;
      look.targetPitch = Math.max(-1.15, Math.min(1.0, look.targetPitch));
    });

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'shift', ' '].includes(k)) e.preventDefault();
      if (k === 'w') KEY.w = true;
      if (k === 'a') KEY.a = true;
      if (k === 's') KEY.s = true;
      if (k === 'd') KEY.d = true;
      if (k === 'shift') KEY.shift = true;
      if (k === 'e' && latestState) {
        const me = currentPlayer(latestState);
        if (me && me.roleName === 'Radar') {
          scanPulseUntil = Date.now() + 3500;
          showToast('Radar: impuls wykrywania!');
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w') KEY.w = false;
      if (k === 'a') KEY.a = false;
      if (k === 's') KEY.s = false;
      if (k === 'd') KEY.d = false;
      if (k === 'shift') KEY.shift = false;
    });

    ui.playBtn.addEventListener('click', () => {
      const name = ui.nameInput.value.trim();
      localName = name || 'Gracz';
      localStorage.setItem('hide-and-role-name', localName);
      ws.send(JSON.stringify({ type: 'join', name: localName }));
      ui.menu.style.display = 'none';
      ui.hud.style.display = 'flex';
      canvas.requestPointerLock?.();
    });

    ui.refreshBtn.addEventListener('click', () => {
      if (latestState) updateSceneFromState(latestState);
    });

    const sendInput = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'input',
        keys: KEY,
        yaw: look.targetYaw,
        pitch: look.targetPitch
      }));
      ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
    };

    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        sendInput();
        lastInputSend = Date.now();
      }
    }, 50);

    ws.addEventListener('open', () => {
      ui.menuState.textContent = 'Połączono';
    });

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'welcome') {
        myId = msg.id;
      } else if (msg.type === 'state') {
        latestState = msg.state;
        lastStateSeenAt = Date.now();
        updateSceneFromState(msg.state);
      }
    });

    ws.addEventListener('close', () => {
      ui.menuState.textContent = 'Rozłączono';
      showToast('Połączenie z serwerem zostało przerwane.');
    });

    function animate() {
      requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const time = clock.elapsedTime;

      camYaw += (look.targetYaw - camYaw) * Math.min(1, dt * 14);
      camPitch += (look.targetPitch - camPitch) * Math.min(1, dt * 14);

      const me = currentPlayer(latestState);
      if (me) {
        const speed = Math.hypot(me.vx || 0, me.vz || 0);
        const bobStrength = Math.min(1, speed / 6);
        bobPhase += dt * (4 + speed * 1.5);

        camera.position.set(me.x, 1.68 + Math.sin(bobPhase) * 0.03 * bobStrength, me.z);
        camera.rotation.y = camYaw;
        camera.rotation.x = camPitch;

        const blind = !!(me.blindUntil && latestState && latestState.now < me.blindUntil);
        ui.crosshair.classList.toggle('show', !blind);
      } else {
        camera.position.lerp(new THREE.Vector3(0, 3, 0), 0.06);
      }

      const currentState = latestState;
      if (currentState?.players) {
        for (const mesh of playerMeshes.values()) {
          mesh.group.rotation.y = 0;
          mesh.ring.rotation.z += dt * 0.9;
        }

        for (const [id, mesh] of playerMeshes.entries()) {
          const p = currentState.players.find(v => v.id === id);
          if (!p) continue;
          const projected = tmpVec3.set(p.x, 2.35, p.z).project(camera);
          const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
          const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
          mesh.tag.style.transform = `translate(-50%, -120%) translate(${x}px, ${y}px)`;
          if (mesh.tag.style.display !== 'none') mesh.tag.style.display = 'block';
        }
      }

      moonLight.position.x = Math.cos(time * 0.15) * 18;
      moonLight.position.z = Math.sin(time * 0.15) * 18;

      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    });

    if (!ui.nameInput.value) {
      ui.nameInput.value = localStorage.getItem('hide-and-role-name') || '';
    }
    ui.nameInput.addEventListener('input', () => {
      localStorage.setItem('hide-and-role-name', ui.nameInput.value);
    });
  