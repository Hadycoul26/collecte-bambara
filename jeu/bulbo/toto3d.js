// Toto en 3D : Bulbo (modèle Hunyuan riggé, design/toto/LISEZMOI.md) dans la scène du jeu.
// Le visage n'est pas dans la texture : il est PROJETÉ DE FACE depuis l'atlas visage.webp (24 expressions), sur la
// position de repos des points (il suit donc la tête). Yeux et bouche sont deux calques indépendants (clignements,
// lèvres). Les animations sont calculées ici, os par os (pas de fichier d'animation).
// API : window.Toto3D = { expr(nom), yeux(nom), parle(niveau 0..1 | null), anim(nom), etat(nom, oui), degats(n) }.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const ICI = new URL(".", import.meta.url).href;
const DRACO = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/";

// repères du visage sur le modèle (mètres, repère glTF : Y en haut, AVANT = +Z, gauche du personnage = +X)
// ⭐ calés sur la référence (design/toto_casting.png, personnage A) : yeux au MILIEU de la tête (60 % du sommet au
//    menton), juste au-dessus du nez, rapprochés ; bouche juste sous le nez. ⛔ (19/11) 0,865 / 0,15 : yeux trop hauts
//    (dans les creux sculptés), trop grands, trop écartés.
const YEUX_Y = 0.83, ECART_YEUX = 0.135, BOUCHE_Y = 0.748;

const stage = document.getElementById("stage");
const robotSvg = document.getElementById("robot");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const canvas = renderer.domElement;
canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none";
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 2, 0.1, 20);
camera.position.set(0, 0.74, 3.4);
camera.lookAt(0, 0.70, 0);
scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a7a68, 1.6));
const soleil = new THREE.DirectionalLight(0xffffff, 1.7);
soleil.position.set(1.2, 2.4, 2.2);
scene.add(soleil);
const contre = new THREE.DirectionalLight(0xbfe3ff, 0.8);
contre.position.set(-1.5, 1.2, -1.5);
scene.add(contre);

// ---------- chargement ----------
const draco = new DRACOLoader().setDecoderPath(DRACO);
const loader = new GLTFLoader().setDRACOLoader(draco);
async function essais(f, n = 3) {        // réseau mobile faible : on retente avant d'abandonner (robot dessiné)
  for (let i = 1; ; i++) {
    try { return await f(); } catch (e) { if (i >= n) throw e; await new Promise(r => setTimeout(r, 700 * i)); }
  }
}
const [gltf, atlasTex, atlasInfo] = await Promise.all([
  essais(() => loader.loadAsync(ICI + "bulbo.glb")),
  essais(() => new THREE.TextureLoader().loadAsync(ICI + "visage.webp")),
  essais(() => fetch(ICI + "visage.json").then(r => r.json()))
]);
atlasTex.colorSpace = THREE.SRGBColorSpace;
atlasTex.anisotropy = 4;

const pivot = new THREE.Group();          // les pieds : sauts, envol, écrasement
const corpsG = new THREE.Group();
pivot.add(corpsG);
corpsG.add(gltf.scene);
scene.add(pivot);
const os = {};
gltf.scene.traverse(o => { if (o.isBone) os[o.name.replace(/[.\s]/g, "")] = o; });
let maillage = null;
gltf.scene.traverse(o => { if (o.isSkinnedMesh || o.isMesh) maillage = maillage || o; });
maillage.frustumCulled = false;

// ---------- le visage : projection de face dans le shader ----------
const NOMS = atlasInfo.noms, [CW, CH] = atlasInfo.case, COLS = atlasInfo.colonnes, RANGS = atlasInfo.rangees;
const centreYeux = [(atlasInfo.yeux[0][0] + atlasInfo.yeux[1][0]) / 2, (atlasInfo.yeux[0][1] + atlasInfo.yeux[1][1]) / 2];
const mParPx = ECART_YEUX / (atlasInfo.yeux[1][0] - atlasInfo.yeux[0][0]);
const U = {
  tVisage: { value: atlasTex },
  caseYeux: { value: new THREE.Vector2(0, 0) },
  caseBouche: { value: new THREE.Vector2(0, 0) },
  // case (px) = repère + (x, y) / mParPx ; yeux et bouche ont chacun leur ancrage vertical
  ancreYeux: { value: new THREE.Vector4(centreYeux[0], centreYeux[1], 0, YEUX_Y) },
  ancreBouche: { value: new THREE.Vector4(atlasInfo.bouche[0], atlasInfo.bouche[1], 0, BOUCHE_Y) },
  mParPx: { value: mParPx },
  coupe: { value: atlasInfo.coupe },
  tailleCase: { value: new THREE.Vector2(CW, CH) },
  grille: { value: new THREE.Vector2(COLS, RANGS) },
  teinte: { value: new THREE.Color(1, 1, 1) },
  eclair: { value: 0 },
  casse: { value: 0 }
};
const mat = maillage.material;
mat.metalness = 0;
mat.roughness = 0.62;
mat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vRepos;\nvarying vec3 vNormRepos;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRepos = position;\nvNormRepos = normal;");
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", `#include <common>
varying vec3 vRepos; varying vec3 vNormRepos;
uniform sampler2D tVisage; uniform vec2 caseYeux, caseBouche, tailleCase, grille; uniform vec4 ancreYeux, ancreBouche;
uniform float mParPx, coupe, eclair, casse; uniform vec3 teinte;
vec4 calque(vec2 cel, vec4 ancre, bool haut) {
  vec2 p = vec2(ancre.x + vRepos.x / mParPx, ancre.y - (vRepos.y - ancre.w) / mParPx);
  if (p.x < 1.0 || p.x > tailleCase.x - 1.0 || p.y < 1.0 || p.y > tailleCase.y - 1.0) return vec4(0.0);
  if (haut && p.y > coupe) return vec4(0.0);
  if (!haut && p.y <= coupe) return vec4(0.0);
  vec2 uv = vec2((cel.x * tailleCase.x + p.x) / (grille.x * tailleCase.x), 1.0 - (cel.y * tailleCase.y + p.y) / (grille.y * tailleCase.y));
  return texture2D(tVisage, uv);
}`)
    .replace("#include <map_fragment>", `#include <map_fragment>
{
  float devant = smoothstep(0.30, 0.62, normalize(vNormRepos).z) * step(0.69, vRepos.y) * step(0.0, vRepos.z);
  vec4 y = calque(caseYeux, ancreYeux, true);
  vec4 b = calque(caseBouche, ancreBouche, false);
  diffuseColor.rgb = mix(diffuseColor.rgb, y.rgb, y.a * devant);
  diffuseColor.rgb = mix(diffuseColor.rgb, b.rgb, b.a * devant);
  // boules des antennes éteintes quand Toto est très abîmé
  float boule = smoothstep(1.055, 1.065, vRepos.y) * step(0.15, abs(vRepos.x));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2))) * 0.55, boule * casse);
  diffuseColor.rgb *= teinte;
}`)
    .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.95, 0.4) * eclair;");
};
mat.needsUpdate = true;

function cellule(nom) {
  const i = Math.max(0, NOMS.indexOf(nom));
  return [i % COLS, Math.floor(i / COLS)];
}
let exprCourante = "neutre", yeuxForces = null, boucheParle = null;
function appliquerVisage() {
  const ye = cellule(yeuxForces || exprCourante), bo = cellule(boucheParle || exprCourante);
  U.caseYeux.value.set(ye[0], ye[1]);
  U.caseBouche.value.set(bo[0], bo[1]);
}
appliquerVisage();

// ---------- la tablette ----------
const tablette = new THREE.Group();
const cadre = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.165, 0.014), new THREE.MeshStandardMaterial({ color: 0x45484f, roughness: 0.35, metalness: 0.2 }));
tablette.add(cadre);
const ecranCanvas = document.createElement("canvas");
ecranCanvas.width = 256; ecranCanvas.height = 176;
const ecranTex = new THREE.CanvasTexture(ecranCanvas);
ecranTex.colorSpace = THREE.SRGBColorSpace;
const ecran = new THREE.Mesh(new THREE.PlaneGeometry(0.218, 0.142),
  new THREE.MeshBasicMaterial({ map: ecranTex, toneMapped: false }));
ecran.position.z = 0.0075;
tablette.add(ecran);
scene.add(tablette);
function dessinerEcran(lu = -1) {
  const c = ecranCanvas.getContext("2d");
  c.fillStyle = "#1b2a44"; c.fillRect(0, 0, 256, 176);
  c.fillStyle = "#ff6a3d"; c.beginPath(); c.arc(228, 22, 7, 0, 7); c.fill();
  const lignes = [[22, 34, 170], [22, 64, 200], [22, 94, 150], [22, 124, 186]];
  lignes.forEach(([x, y, l], i) => { c.fillStyle = i === lu ? "#ffe27a" : "#7cf3c1"; c.fillRect(x, y, l, 12); });
  ecranTex.needsUpdate = true;
}
dessinerEcran();

// ---------- les poses : rotations autour d'axes du MONDE, à partir du repos ----------
const repos = {}, parentRepos = {};
scene.updateMatrixWorld(true);
for (const [n, b] of Object.entries(os)) {
  repos[n] = b.quaternion.clone();
  parentRepos[n] = b.parent.getWorldQuaternion(new THREE.Quaternion());
}
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion();
// l'axe de chaque main au repos (du poignet au bout des doigts), pour la faire rouler sur elle-même
const axeMain = {};
for (const c of ["L", "R"]) {
  const a = os["Hand" + c].getWorldPosition(new THREE.Vector3()), b = os["Hand" + c].localToWorld(new THREE.Vector3(0, 0.1, 0));
  axeMain[c] = b.sub(a).normalize();
}
let rot = {};
function tourne(n, axe, deg) { (rot[n] = rot[n] || []).push([axe, deg]); }
function poser() {
  for (const [n, b] of Object.entries(os)) {
    const l = rot[n];
    if (!l) { b.quaternion.copy(repos[n]); continue; }
    _r.identity();
    for (const [axe, deg] of l) _r.premultiply(_q.setFromAxisAngle(axe, deg * Math.PI / 180));
    // local = P⁻¹ · R · P · repos  (P : orientation du parent au repos)
    b.quaternion.copy(parentRepos[n]).invert().multiply(_r).multiply(parentRepos[n]).multiply(repos[n]);
  }
}

// ---------- état et animations ----------
const etats = { lit: false, mouille: false, ecoute: false, parleNous: false };
// la tenue de la tablette (degrés autour des axes du monde ; positions en mètres) — réglable en direct (_debug.REG)
const REG = { epauleZ: 34, bras: -30, avantBras: -68, torsion: 44, main: -5, roule: -80, tabY: 0.015, tabZ: 0.0, tabRot: -2.75 };
let voix = 0, voixLissee = 0, oreille = 0;      // niveau de la voix de Toto ; niveau du micro (il écoute)
let anime = null;            // {nom, t0, ms}
let tenir = 1;               // 1 = la tablette dans les mains, 0 = mains libres
let degats = 0;
const ressort = { x: 0, v: 0 };          // secousse de la tête (claques)
const antennes = { x: 0, v: 0 };
function choc(force) { ressort.v += force; antennes.v += force * 2.2; }

const t0 = performance.now();
let derniere = t0, clignement = 0, prochainClin = 2500;
function boucle(maintenant) {
  requestAnimationFrame(boucle);
  if (!stage.offsetParent) return;
  const dt = Math.min(0.05, (maintenant - derniere) / 1000);
  derniere = maintenant;
  const t = (maintenant - t0) / 1000;
  rot = {};
  pivot.position.set(0, 0, 0); pivot.rotation.set(0, 0, 0); pivot.scale.set(1, 1, 1);
  U.eclair.value = 0;

  // ressorts amortis (tête, antennes)
  for (const [s, k, a] of [[ressort, 140, 9], [antennes, 90, 4]]) { s.v += (-k * s.x - a * s.v) * dt; s.x += s.v * dt; }

  // respiration et balancement
  const souffle = Math.sin(t * 2.1);
  tourne("Spine", X, -1.5 * souffle);
  tourne("Head", Z, 2.2 * Math.sin(t * 0.9));
  tourne("Head", X, 1.5 * Math.sin(t * 1.3));
  tourne("Antenna1L", Z, -4 * Math.sin(t * 2.7) - 25 * antennes.x);
  tourne("Antenna1R", Z, 4 * Math.sin(t * 2.9 + 1) + 25 * antennes.x);
  tourne("Antenna2L", X, 6 * Math.sin(t * 3.3));
  tourne("Antenna2R", X, 6 * Math.sin(t * 3.1 + 2));
  tourne("Head", Z, 28 * ressort.x);
  tourne("Spine", Z, 10 * ressort.x);

  // les bras : tenir la tablette (devant le ventre) ou les laisser en pose A
  let viser = 1;
  const lecture = etats.lit ? 1 : 0;
  let danse = 0, pa = 0;
  if (anime) {
    pa = (maintenant - anime.t0) / anime.ms;
    if (pa >= 1) { anime = null; pa = 0; }
  }
  const nom = anime?.nom;
  if (nom === "happy" || nom === "danse") danse = 1;
  if (danse) viser = 0;
  tenir += (viser - tenir) * Math.min(1, dt * 8);
  const h = tenir;
  // ⭐ comme la référence : coudes au corps, avant-bras relevés, tablette à hauteur de poitrine, ÉCRAN VERS LUI
  //    (on en voit le dos). En lecture elle descend un peu : sa bouche reste visible.
  const ecoute = etats.ecoute ? 1 : 0, nous = etats.parleNous && !etats.lit ? 1 : 0;
  voixLissee += (voix - voixLissee) * Math.min(1, dt * 18);
  for (const [c, s] of [["L", -1], ["R", 1]]) {
    tourne("UpperArm" + c, Z, s * REG.epauleZ * h);
    tourne("UpperArm" + c, X, (REG.bras + 8 * lecture + 10 * ecoute) * h);
    tourne("ForeArm" + c, X, (REG.avantBras + 14 * lecture + 22 * ecoute) * h);
    tourne("ForeArm" + c, Y, s * REG.torsion * h);
    tourne("Hand" + c, Z, -s * REG.main * h);
    tourne("Hand" + c, axeMain[c], REG.roule * h);      // la main roule sur elle-même (paume vers la tablette)
  }
  // il LIT : tête penchée vers la tablette, petits hochements sur les syllabes
  tourne("Head", X, (12 + 5 * voixLissee) * lecture);
  if (lecture) tourne("Spine", X, 4);
  // il NOUS PARLE : tête relevée vers nous, hochements et balancement avec la voix
  tourne("Head", X, (-4 + 7 * voixLissee) * nous);
  tourne("Head", Z, 4 * Math.sin(t * 2.3) * voixLissee * nous);
  tourne("Spine", Y, 5 * Math.sin(t * 1.7) * nous);
  // il ÉCOUTE : tête inclinée, buste penché vers nous, antennes tendues en avant qui frémissent au son du micro
  oreille *= Math.pow(0.02, dt);
  tourne("Head", Z, 13 * ecoute);
  tourne("Head", X, (-3 + 4 * oreille) * ecoute);
  tourne("Spine", X, 7 * ecoute);
  for (const [c, s] of [["L", 1], ["R", -1]]) {
    tourne("Antenna1" + c, X, (28 + 10 * oreille) * ecoute);
    tourne("Antenna2" + c, Z, s * 18 * oreille * Math.sin(t * 40) * ecoute);
  }
  // les antennes sautillent quand il parle
  tourne("Antenna2L", X, 14 * voixLissee * Math.sin(t * 25)); tourne("Antenna2R", X, 14 * voixLissee * Math.sin(t * 23));

  // animations ponctuelles
  if (nom === "hit") {
    const e = Math.sin(pa * Math.PI);
    tourne("Spine", Z, -16 * e); tourne("Head", Z, -18 * e); corpsG.rotation.z = 0;
  } else if (nom === "squash") {
    const k = pa < 0.3 ? pa / 0.3 : 1 - (pa - 0.3) / 0.7;
    const e = Math.max(0, k) * (pa < 0.3 ? 1 : Math.cos((pa - 0.3) * 9));
    pivot.scale.set(1 + 0.28 * e, 1 - 0.4 * e, 1 + 0.28 * e);
  } else if (nom === "zap") {
    U.eclair.value = Math.floor(pa * 10) % 2 ? 0.9 : 0;
    pivot.position.x = (Math.random() - 0.5) * 0.03; pivot.position.y = Math.random() * 0.02;
    tourne("Antenna1L", Z, 30 * Math.sin(t * 60)); tourne("Antenna1R", Z, -30 * Math.sin(t * 55));
  } else if (danse) {
    const saut = Math.abs(Math.sin(pa * Math.PI * (nom === "danse" ? 4 : 2)));
    pivot.position.y = 0.12 * saut;
    const g = Math.sin(pa * Math.PI * 4);
    tourne("Hips", Z, 8 * g); tourne("Head", Z, -10 * g);
    // (autour de +Z, un angle POSITIF lève le bras gauche ; négatif, le droit)
    tourne("UpperArmL", Z, 55 + 45 * Math.max(0, g)); tourne("UpperArmR", Z, -(55 + 45 * Math.max(0, -g)));
    tourne("ForeArmL", Z, 35); tourne("ForeArmR", Z, -35);
    tourne("UpLegL", X, -25 * Math.max(0, g)); tourne("LegL", X, 40 * Math.max(0, g));
    tourne("UpLegR", X, -25 * Math.max(0, -g)); tourne("LegR", X, 40 * Math.max(0, -g));
  } else if (nom === "fly") {
    // envolé vers la droite en tournant, revient par la gauche
    if (pa < 0.36) { const k = pa / 0.36; pivot.position.set(1.6 * k, 0.9 * Math.sin(k * Math.PI * 0.8), 0); pivot.rotation.z = -k * 4.5; }
    else if (pa < 0.64) pivot.position.set(9, 0, 0);
    else { const k = (pa - 0.64) / 0.36; pivot.position.set(-1.6 * (1 - k), 0.5 * Math.sin(k * Math.PI), 0); pivot.rotation.z = -(1 - k) * 6.3; }
  }
  U.teinte.value.setRGB(etats.mouille ? 0.62 : 1, etats.mouille ? 0.8 : 1, etats.mouille ? 1.15 : 1);

  // clignements (yeux ouverts seulement)
  if (maintenant > prochainClin && !yeuxForces) {
    clignement = maintenant + 130; prochainClin = maintenant + 1800 + Math.random() * 3500;
  }
  const ouvertes = !["clos", "rieur", "joyeux", "fier", "aie", "sonne"].includes(exprCourante);
  const cligne = maintenant < clignement && ouvertes && !yeuxForces;
  const ye = cellule(cligne ? "clos" : (yeuxForces || exprCourante));
  U.caseYeux.value.set(ye[0], ye[1]);

  poser();
  gltf.scene.updateMatrixWorld(true);

  // la tablette entre les deux mains, inclinée vers le visage
  // (le milieu des paumes : 6 cm le long de l'os de la main, depuis le poignet)
  const mg = os.HandL.localToWorld(new THREE.Vector3(0, 0.06, 0)), md = os.HandR.localToWorld(new THREE.Vector3(0, 0.06, 0));
  const milieu = mg.clone().add(md).multiplyScalar(0.5);
  tablette.visible = h > 0.6;
  tablette.position.copy(milieu).add(new THREE.Vector3(0, REG.tabY, REG.tabZ));
  tablette.rotation.set(REG.tabRot + 0.25 * lecture, 0, 0);
  renderer.render(scene, camera);
}

function taille() {
  const l = stage.clientWidth, h = stage.clientHeight;
  if (!l || !h) return;
  renderer.setSize(l, h, false);
  camera.aspect = l / h;
  // assez de recul pour que Bulbo (1,11 m) tienne en hauteur, même en écran étroit
  // ⭐ Bulbo en BAS de la scène : la bulle de texte occupe le haut (jusqu'à un tiers) et ne doit pas cacher son visage
  const vue = 1.62, dist = vue / 2 / Math.tan(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect / 0.9);
  camera.position.set(0, 0.74, dist);
  camera.lookAt(0, 0.70, 0);
  camera.updateProjectionMatrix();
}
new ResizeObserver(taille).observe(stage);
stage.prepend(canvas);
taille();
robotSvg.style.visibility = "hidden";
requestAnimationFrame(boucle);

let finParole = 0, pic = 0.3, picT = 0, clairMoy = 0.5;
window.Toto3D = {
  ready: true,
  expr(nom) { if (NOMS.includes(nom)) exprCourante = nom; appliquerVisage(); },
  yeux(nom) { yeuxForces = nom && NOMS.includes(nom) ? nom : null; appliquerVisage(); },
  // LÈVRES. niveau de voix 0..1 (null = se tait), clair 0..1 (part des aigus). Silence : la bouche fermée de
  // l'expression (ou la neutre si l'expression a la bouche ouverte) ; faible : O ; fort et clair : I (dents) ;
  // fort et sourd : A. Une bouche tient au moins 70 ms (sinon elle papillote).
  parle(niveau, clair = 0.4) {
    if (niveau == null) { voix = 0; boucheParle = null; appliquerVisage(); dessinerEcran(); return; }
    // ⭐ ADAPTATIF (19/11) : la voix robot de Toto est faible (médiane 0,15, pic 0,42) et ses aigus varient peu
    //    (0,46–0,55) : ⛔ seuils fixes → bouche fermée la moitié du temps, jamais de A. Le volume est rapporté au pic
    //    récent, les aigus à leur moyenne.
    const t = performance.now();
    pic = Math.max(niveau, pic * Math.pow(0.5, (t - picT) / 1500), 0.12); picT = t;
    clairMoy += (clair - clairMoy) * 0.05;
    const n = niveau / pic;
    voix = Math.min(1, n);
    const ouverte = ["A", "I", "rieur", "triomphe", "peur", "surpris", "O", "aie"].includes(exprCourante);
    const m = n < 0.13 ? (ouverte ? "neutre" : null) : n < 0.38 ? "O" : n > 0.75 ? "A" : clair > clairMoy + 0.006 ? "I" : "A";
    if (m !== boucheParle && performance.now() > finParole) { boucheParle = m; finParole = performance.now() + 70; appliquerVisage(); }
  },
  // il ÉCOUTE le joueur : niveau du micro 0..1
  entend(niveau) { oreille = Math.max(oreille, Math.min(1, niveau * 2.5)); },
  ligneLue(i) { dessinerEcran(i); },
  anim(nom, ms = 700) { anime = { nom, t0: performance.now(), ms }; if (nom === "hit") choc(-2.4); },
  etat(nom, oui) { etats[nom] = !!oui; },
  degats(n) { degats = n; U.casse.value = n >= 4 ? 1 : 0; },
  _debug: { os, pivot, camera, U, tablette, REG, etats }
};
window.dispatchEvent(new Event("toto3d"));
