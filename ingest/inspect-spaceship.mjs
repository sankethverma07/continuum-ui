import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;

const inspect = async (label, p) => {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
  const doc = await io.read(p);
  const root = doc.getRoot();
  const exts = root.listExtensionsUsed().map(e => e.extensionName);
  const required = root.listExtensionsRequired().map(e => e.extensionName);
  const meshes = root.listMeshes();
  const materials = root.listMaterials();
  const textures = root.listTextures();
  console.log(`\n=== ${label} ===`);
  console.log(`extensionsUsed:    ${JSON.stringify(exts)}`);
  console.log(`extensionsRequired:${JSON.stringify(required)}`);
  console.log(`meshes:    ${meshes.length}`);
  console.log(`materials: ${materials.length}`);
  console.log(`textures:  ${textures.length}`);
  console.log('\nMATERIALS:');
  materials.forEach((m, i) => {
    const slot = (label) => {
      const t = m[`get${label}Texture`]?.bind(m)?.();
      return t ? `${t.getMimeType()} ${t.getSize()?.join('x')}` : '—';
    };
    const matExts = m.listExtensions().map(e => e.extensionName);
    console.log(`  [${i}] "${m.getName()}" alpha=${m.getAlphaMode()} cutoff=${m.getAlphaCutoff()} doubleSided=${m.getDoubleSided()} metallic=${m.getMetallicFactor()} rough=${m.getRoughnessFactor()}`);
    console.log(`       baseColor=${slot('BaseColor')} normal=${slot('Normal')} mr=${slot('MetallicRoughness')} occ=${slot('Occlusion')} emit=${slot('Emissive')}`);
    if (matExts.length) console.log(`       ext: ${matExts.join(', ')}`);
  });
  console.log('\nTEXTURES (first 10):');
  textures.slice(0, 10).forEach((t, i) => {
    const sz = t.getSize();
    console.log(`  [${i}] "${t.getName()}" ${t.getMimeType()} ${sz ? sz.join('x') : '?'} bytes=${t.getImage()?.byteLength ?? 0}`);
  });
};

await inspect('ORIGINAL  (27 MB)', '../public/spaceship.glb');
await inspect('COMPRESSED (2 MB)', '../public/spaceship-compressed.glb');
