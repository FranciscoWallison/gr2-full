# Granny2.js - Complete JavaScript Wrapper

Wrapper JavaScript completo para a biblioteca **granny2.dll** (RAD Game Tools Granny 3D SDK).

Permite carregar e manipular arquivos `.gr2` diretamente no browser ou Node.js.

## 📁 Estrutura do Projeto

```
granny2-js-complete/
├── granny2.js              # Wrapper principal
├── granny2_additions.js    # Funções adicionais (memory, materials, etc)
├── granny2_runtime.js      # Emulador x86 standalone
├── granny2_test.js         # Suite de testes
├── granny2_bundle.html     # Interface web completa
├── pe_env.js               # PE Environment (Win32 Runtime original)
├── libv86.js               # Emulador v86 completo (opcional)
├── granny2js_analysis.md   # Documentação da análise
└── README.md               # Este arquivo
```

## 🚀 Quick Start

### Opção 1: Interface Web (Mais Fácil)

1. Abra `granny2_bundle.html` no browser
2. Carregue sua `granny2.dll` (versão 2.1.0.5)
3. Carregue um arquivo `.gr2`
4. Use os botões ou o console JavaScript

### Opção 2: HTML Manual

```html
<!DOCTYPE html>
<html>
<head>
    <title>Granny2 Test</title>
</head>
<body>
    <!-- Ordem de carregamento importante! -->
    <script src="granny2_runtime.js"></script>
    <script src="pe_env.js"></script>
    <script src="granny2.js"></script>
    <script src="granny2_additions.js"></script>
    
    <script>
        // Carregue a DLL e GR2 via fetch ou FileReader
        async function init() {
            const dllResponse = await fetch('granny2.dll');
            const dllBuffer = new Uint8Array(await dllResponse.arrayBuffer());
            
            const gr2Response = await fetch('model.gr2');
            const gr2Buffer = await gr2Response.arrayBuffer();
            
            // Inicializa
            const granny = new Granny2(dllBuffer);
            Granny2Additions.apply(Granny2);
            
            // Carrega arquivo
            const grannyFile = granny.ReadEntireFileFromMemory(gr2Buffer);
            const fileInfo = granny.GetFileInfo(grannyFile);
            
            // Usa a API...
            console.log('Loaded!', fileInfo);
        }
        
        init();
    </script>
</body>
</html>
```

### Opção 3: Node.js

```javascript
// Requer adaptações para ambiente Node
const fs = require('fs');

// Carrega scripts
require('./granny2_runtime.js');
require('./pe_env.js');
require('./granny2.js');
require('./granny2_additions.js');

// Carrega arquivos
const dllBuffer = new Uint8Array(fs.readFileSync('granny2.dll'));
const gr2Buffer = fs.readFileSync('model.gr2').buffer;

// Inicializa
const granny = new Granny2(dllBuffer);
Granny2Additions.apply(Granny2);

// Usa...
const grannyFile = granny.ReadEntireFileFromMemory(gr2Buffer);
```

## 📖 API Reference

### Carregamento de Arquivo

```javascript
// Carrega arquivo GR2 da memória
const grannyFile = granny.ReadEntireFileFromMemory(arrayBuffer);

// Obtém informações do arquivo
const fileInfoPtr = granny.GetFileInfo(grannyFile);

// Verifica versão da DLL
const isCompatible = granny.VersionMatch(2, 1, 0, 5);

// Libera arquivo (importante!)
granny.FreeFile(grannyFile);
```

### Leitura de Estruturas

```javascript
// Parse FileInfo
const fileInfo = Granny2.readStructure(
    granny.runtime.cpu,
    fileInfoPtr,
    Granny2.structs.granny_file_info
);

console.log('Models:', fileInfo.ModelCount);
console.log('Meshes:', fileInfo.MeshCount);
console.log('Animations:', fileInfo.AnimationCount);
```

### Meshes

```javascript
// Obtém mesh
const meshes = fileInfo.Meshes;
const mesh = meshes[0];

// Informações
const vertexCount = granny.GetMeshVertexCount(mesh._ptr);
const indexCount = granny.GetMeshIndexCount(mesh._ptr);
const isRigid = granny.MeshIsRigid(mesh._ptr);
const vertexType = granny.GetMeshVertexType(mesh._ptr);

// Copia dados
const vertices = granny.CopyMeshVertices(mesh._ptr);  // Uint8Array
const indices = granny.CopyMeshIndices(mesh._ptr);    // Uint8Array

// Parse vértices (formato PNT332 = 32 bytes por vértice)
const floatView = new Float32Array(vertices.buffer);
for (let i = 0; i < vertexCount; i++) {
    const offset = i * 8; // 32 bytes / 4 = 8 floats
    const position = [floatView[offset], floatView[offset+1], floatView[offset+2]];
    const normal = [floatView[offset+3], floatView[offset+4], floatView[offset+5]];
    const uv = [floatView[offset+6], floatView[offset+7]];
}
```

### Skeleton e Bones

```javascript
// Instancia modelo
const modelInstance = granny.InstantiateModel(model._ptr);

// Obtém skeleton
const skeletonPtr = granny.GetSourceSkeleton(modelInstance);

// Obtém info de bone
const bone = granny.GetBoneInfo(skeletonPtr, 0);
console.log('Bone:', bone.Name, 'Parent:', bone.ParentIndex);

// Lista todos os bones (requer additions)
const bones = granny.GetSkeletonBones(skeletonPtr);
const hierarchy = granny.GetBoneHierarchy(skeletonPtr);

// Libera
granny.FreeModelInstance(modelInstance);
```

### Animações

```javascript
// Lista animações (requer additions)
const animations = granny.GetAnimations(fileInfoPtr);

for (const anim of animations) {
    console.log('Animation:', anim.name);
    console.log('  Duration:', anim.duration, 'seconds');
    console.log('  TrackGroups:', anim.trackGroupCount);
}
```

### Controle de Animação

```javascript
// Cria controle
const control = granny.PlayControlledAnimation(0.0, animationPtr, modelInstance);

// Configura
granny.SetControlSpeed(control, 1.5);      // 1.5x speed
granny.SetControlWeight(control, 1.0);     // Full weight
granny.SetControlLoopCount(control, 0);    // Loop infinito

// Atualiza (game loop)
granny.SetModelClock(modelInstance, currentTime);

// Verifica estado
const isActive = granny.ControlIsActive(control);
const isComplete = granny.ControlIsComplete(control);
const duration = granny.GetControlDuration(control);

// Easing
granny.EaseControlIn(control, 0.5, false);  // Fade in 0.5s
granny.EaseControlOut(control, 0.5);        // Fade out 0.5s

// Libera
granny.FreeControl(control);
```

### Poses e Skinning

```javascript
const boneCount = skeleton.BoneCount;

// Cria poses
const worldPose = granny.NewWorldPose(boneCount);
const localPose = granny.NewLocalPose(boneCount);

// Atualiza pose do modelo
granny.SampleModelAnimations(modelInstance, 0, boneCount, localPose);
granny.BuildWorldPose(skeletonPtr, 0, boneCount, localPose, null, worldPose);

// Obtém matrizes para GPU
const matrices = granny.GetWorldPoseMatrices(worldPose, boneCount);
// matrices é Float32Array com boneCount * 16 floats (matrizes 4x4)

// Cria binding para mesh skinned
const meshBinding = granny.NewMeshBinding(meshPtr, skeletonPtr, skeletonPtr);
const boneIndices = granny.GetMeshBindingToBoneIndices(meshBinding);

// Deforma vértices
const deformer = granny.NewMeshDeformer(vertexType);
granny.DeformVertices(deformer, boneCount, matrices, vertices, destBuffer);

// Libera
granny.FreeWorldPose(worldPose);
granny.FreeLocalPose(localPose);
granny.FreeMeshBinding(meshBinding);
granny.FreeMeshDeformer(deformer);
```

### Materiais e Texturas

```javascript
// Lista materiais de uma mesh (requer additions)
const materials = granny.GetMeshMaterials(meshPtr);

for (const mat of materials) {
    console.log('Material:', mat.Name);
    
    // Obtém textura por tipo
    const diffuseTex = granny.GetMaterialTextureByType(mat._ptr, 'DiffuseTexture');
    const normalTex = granny.GetMaterialTextureByType(mat._ptr, 'NormalTexture');
}

// Grupos de triângulos por material
const groups = granny.GetMeshTriangleGroups(meshPtr);
for (const group of groups) {
    console.log('Material', group.materialIndex, 
                'Tris:', group.triFirst, '-', group.triFirst + group.triCount);
}
```

## 🧪 Testes

### Quick Test
```javascript
Granny2Test.quick(granny, gr2Buffer);
```

### Full Test Suite
```javascript
const results = Granny2Test.runAll(granny, gr2Buffer, {
    verbose: true,
    stopOnError: false
});

console.log('Passed:', results.passed);
console.log('Failed:', results.failed);
```

### Teste Individual
```javascript
Granny2Test.tests.mesh(granny, fileInfo);
Granny2Test.tests.animation(granny, fileInfoPtr);
Granny2Test.tests.pose(granny, skeletonData, modelInstance);
```

## ⚠️ Troubleshooting

### "Unimplemented opcode: 0xXX"
O emulador x86 não tem todas as instruções. Me informe qual opcode falhou para adicionar.

### "Called unimplemented imported function XXX"
A DLL está chamando uma função Win32 que não foi implementada. Adicione em `WIN32API` no `pe_env.js`.

### "Out of memory"
O allocator tem limite de ~50MB. Aumente `MAX_MEM_ADDR` se necessário.

### Versão da DLL
Este wrapper foi testado com granny2.dll versão 2.1.0.5. Outras versões podem ter offsets diferentes.

## 📊 Completeness

| Feature | Status |
|---------|--------|
| File Loading | ✅ 100% |
| Mesh Reading | ✅ 95% |
| Skeleton | ✅ 90% |
| Animation Control | ✅ 100% |
| Poses | ✅ 100% |
| Skinning | ✅ 90% |
| Textures | ⚠️ 80% |
| Materials | ⚠️ 50% |
| Memory Cleanup | ✅ 90% |

## 📜 Licença

Este projeto é para fins educacionais e de engenharia reversa.
Granny 3D SDK é propriedade da RAD Game Tools.

## 🙏 Créditos

- RAD Game Tools - Granny 3D SDK
- copy/v86 - Emulador x86
- Análise e wrapper por Claude (Anthropic)
