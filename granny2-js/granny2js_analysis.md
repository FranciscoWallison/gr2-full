# Análise do Projeto granny2.js

## Visão Geral

O projeto é um **wrapper JavaScript para a granny2.dll** que roda a DLL nativa via emulação Win32 (usando `Win32Runtime`). Isso permite usar a biblioteca Granny 3D 2.1.0.5 em ambientes JavaScript/Node.js.

---

## ✅ O Que Está Implementado

### 1. Estruturas de Dados (Completas)

| Estrutura | Status | Descrição |
|-----------|--------|-----------|
| `granny_file_info` | ✅ | Informações do arquivo GR2 |
| `granny_file` | ✅ | Handle do arquivo |
| `granny_model` | ✅ | Modelo 3D |
| `granny_mesh` | ✅ | Malha/geometria |
| `granny_skeleton` | ✅ | Esqueleto |
| `granny_bone` | ✅ | Osso individual |
| `granny_transform` | ✅ | Transformação (pos/rot/scale) |
| `granny_animation` | ✅ | Animação |
| `granny_track_group` | ✅ | Grupo de tracks |
| `granny_transform_track` | ✅ | Track de transformação |
| `granny_texture` | ✅ | Textura |
| `granny_material` | ✅ | Material |
| `granny_material_map` | ✅ | Mapa de material |
| `granny_material_binding` | ✅ | Binding de material |

### 2. API de Carregamento de Arquivo

| Função | Status | Descrição |
|--------|--------|-----------|
| `ReadEntireFileFromMemory` | ✅ | Carrega GR2 da memória |
| `GetFileInfo` | ✅ | Obtém informações do arquivo |
| `VersionMatch` | ✅ | Verifica versão da DLL |

### 3. API de Mesh

| Função | Status | Descrição |
|--------|--------|-----------|
| `GetMeshVertexCount` | ✅ | Contagem de vértices |
| `GetMeshIndexCount` | ✅ | Contagem de índices |
| `GetMeshVertexType` | ✅ | Tipo de vértice |
| `MeshIsRigid` | ✅ | Verifica se mesh é rígida |
| `CopyMeshVertices` | ✅ | Copia vértices |
| `CopyMeshIndices` | ✅ | Copia índices |
| `NewMeshBinding` | ✅ | Cria binding mesh-skeleton |
| `NewMeshDeformer` | ✅ | Cria deformador |

### 4. API de Modelo

| Função | Status | Descrição |
|--------|--------|-----------|
| `InstantiateModel` | ✅ | Instancia modelo |
| `FreeModelInstance` | ✅ | Libera instância |
| `GetSourceSkeleton` | ✅ | Obtém skeleton |

### 5. API de Animação (Bem Completa!)

| Função | Status | Descrição |
|--------|--------|-----------|
| `PlayControlledAnimation` | ✅ | Inicia animação |
| `BeginControlledAnimation` | ✅ | Começa animação |
| `EndControlledAnimation` | ✅ | Finaliza animação |
| `FreeControl` | ✅ | Libera controle |
| `FreeControlIfComplete` | ✅ | Libera se completo |
| `SetControlClock` | ✅ | Define tempo |
| `GetControlClock` | ✅ | Obtém tempo |
| `SetControlSpeed` | ✅ | Define velocidade |
| `GetControlSpeed` | ✅ | Obtém velocidade |
| `SetControlWeight` | ✅ | Define peso (blending) |
| `GetControlWeight` | ✅ | Obtém peso |
| `SetControlLoopCount` | ✅ | Define loops |
| `GetControlLoopCount` | ✅ | Obtém loops |
| `GetControlLoopIndex` | ✅ | Índice do loop atual |
| `ControlIsActive` | ✅ | Verifica se ativo |
| `ControlIsComplete` | ✅ | Verifica se completo |
| `SetControlActive` | ✅ | Ativa/desativa |
| `GetControlDuration` | ✅ | Duração total |
| `EaseControlIn` | ✅ | Fade in |
| `EaseControlOut` | ✅ | Fade out |
| `SetModelClock` | ✅ | Define clock do modelo |
| `FreeCompletedModelControls` | ✅ | Limpa controles completos |
| `SampleModelAnimations` | ✅ | Amostra animações |
| `AccumulateModelAnimations` | ✅ | Acumula animações |

### 6. API de Pose

| Função | Status | Descrição |
|--------|--------|-----------|
| `NewWorldPose` | ✅ | Cria world pose |
| `FreeWorldPose` | ✅ | Libera world pose |
| `NewLocalPose` | ✅ | Cria local pose |
| `FreeLocalPose` | ✅ | Libera local pose |
| `BuildWorldPose` | ✅ | Constrói world pose |
| `GetWorldPose4x4` | ✅ | Matriz de bone |
| `GetWorldPose4x4Array` | ✅ | Array de matrizes |
| `GetWorldPoseComposite4x4` | ✅ | Matriz composta |
| `GetWorldPoseBoneCount` | ✅ | Contagem de bones |
| `GetWorldPoseMatrices` | ✅ | Helper para Float32Array |

### 7. API de Textura

| Função | Status | Descrição |
|--------|--------|-----------|
| `TextureHasAlpha` | ✅ | Verifica alpha |
| `CopyTextureImage` | ✅ | Copia imagem |

### 8. API de Deformação

| Função | Status | Descrição |
|--------|--------|-----------|
| `DeformVertices` | ✅ | Skinning de vértices |

### 9. Helpers de Alto Nível

| Função | Status | Descrição |
|--------|--------|-----------|
| `GetAnimationByIndex` | ✅ | Animação por índice |
| `GetAnimations` | ✅ | Todas as animações |
| `GetBoneInfo` | ✅ | Info de bone |
| `GetWorldPoseMatrices` | ✅ | Matrizes como Float32Array |

### 10. Hooks de Performance (JS Nativo)

| Hook | Status | Descrição |
|------|--------|-----------|
| `sub_1000DDC0` | ✅ | Decompressão (crítico!) |
| `sub_1000E7F0` | ✅ | Decompressão range |
| `sub_10002B50` | ✅ | Operação bitwise |
| `sub_10017FE0` | ✅ | Logging |

---

## ⚠️ O Que Pode Estar Faltando ou Incompleto

### 1. Funções de Liberação de Memória

```javascript
// FALTANDO: Algumas funções de cleanup
api.FreeMeshBinding = function(binding) { ... }      // ❌ Não implementado
api.FreeMeshDeformer = function(deformer) { ... }    // ❌ Não implementado
api.FreeFile = function(grannyFile) { ... }          // ❌ Não implementado
```

### 2. API de Material/Textura (Parcial)

```javascript
// FALTANDO: Acesso a materiais
api.GetMaterialTextureByType = function(...) { ... }  // ❌ Não implementado
api.GetMeshMaterials = function(mesh) { ... }         // ❌ Helper útil
```

### 3. Estruturas de Dados Adicionais

```javascript
// FALTANDO no Granny2.structs:
'granny_vertex_data': [...]       // ❌ Dados de vértice detalhados
'granny_tri_topology': [...]      // ❌ Topologia de triângulos
'granny_curve': [...]             // ❌ Curvas de animação
'granny_texture_image': [...]     // ❌ Imagem de textura
'granny_bone_binding': [...]      // ❌ Binding de bone
```

### 4. API de Transformação

```javascript
// FALTANDO: Funções de transformação
api.BuildCompositeTransform4x4 = function(...) { ... }  // ❌
api.MakeIdentity = function(transform) { ... }          // ❌
api.TransformPoint = function(...) { ... }              // ❌
```

### 5. API de Curvas B-Spline

```javascript
// FALTANDO: Sampling de curvas (útil para animação customizada)
api.SampleBSpline = function(...) { ... }               // ❌
api.FindKnot = function(...) { ... }                    // ❌
```

### 6. Validação de Erros

```javascript
// FALTANDO: Melhor tratamento de erros
// O código atual não verifica todos os retornos de erro da DLL
```

---

## 🔧 Código Sugerido para Completar

### 1. Funções de Liberação

```javascript
/**
 * Free mesh binding
 */
api.FreeMeshBinding = function(meshBinding) {
    this.runtime.stdcall(
        Granny2.exports.GrannyFreeMeshBinding,
        meshBinding
    );
};

/**
 * Free mesh deformer
 */
api.FreeMeshDeformer = function(meshDeformer) {
    this.runtime.stdcall(
        Granny2.exports.GrannyFreeMeshDeformer,
        meshDeformer
    );
};

/**
 * Free granny file
 */
api.FreeFile = function(grannyFile) {
    this.runtime.stdcall(
        Granny2.exports.GrannyFreeFile,
        grannyFile
    );
};

/**
 * Free file section
 */
api.FreeFileSection = function(grannyFile, sectionIndex) {
    this.runtime.stdcall(
        Granny2.exports.GrannyFreeFileSection,
        grannyFile,
        sectionIndex
    );
};
```

### 2. API de Material

```javascript
/**
 * Get material texture by type
 * @param materialPtr Material pointer
 * @param textureType Texture type string (e.g., "DiffuseTexture")
 * @returns Texture pointer or 0
 */
api.GetMaterialTextureByType = function(materialPtr, textureType) {
    // Allocate string in memory
    var typePtr = this.runtime.allocator.alloc(textureType.length + 1);
    this.runtime.copy_string_to_mem(typePtr, textureType);
    
    var result = this.runtime.stdcall(
        Granny2.exports.GrannyGetMaterialTextureByType,
        materialPtr,
        typePtr
    );
    
    this.runtime.allocator.free(typePtr);
    return result;
};

/**
 * Get all materials from a mesh
 * @param meshPtr Mesh pointer
 * @returns Array of material info objects
 */
api.GetMeshMaterials = function(meshPtr) {
    var mesh = resolve_struct(this.runtime.cpu, meshPtr, Granny2.structs.granny_mesh);
    var materials = [];
    
    for (var i = 0; i < mesh.MaterialsBindingCount; i++) {
        var bindingPtr = this.runtime.get_dword_ptr(mesh.MaterialBindings + i * 4);
        var binding = resolve_struct(this.runtime.cpu, bindingPtr, 
                                     Granny2.structs.granny_material_binding);
        
        if (binding.Material) {
            var material = resolve_struct(this.runtime.cpu, binding.Material,
                                         Granny2.structs.granny_material);
            materials.push(material);
        }
    }
    
    return materials;
};
```

### 3. Estruturas Faltantes

```javascript
// Adicionar a Granny2.structs:

'granny_vertex_data': [
    ['void*', 'VertexType', {}],
    ['int', 'VertexCount', {}],
    ['void*', 'Vertices', {}],
    ['int', 'VertexComponentCount', {}],
    ['void*', 'VertexComponentNames', {}],
    ['void*', 'VertexAnnotationSetCount', {}],
    ['void*', 'VertexAnnotationSets', {}]
],

'granny_tri_topology': [
    ['int', 'GroupCount', {}],
    ['void*', 'Groups', {}],
    ['int', 'IndexCount', {}],
    ['void*', 'Indices', {}],
    ['int', 'Index16Count', {}],
    ['void*', 'Indices16', {}],
    ['int', 'VertexToVertexCount', {}],
    ['void*', 'VertexToVertexMap', {}],
    ['int', 'VertexToTriangleCount', {}],
    ['void*', 'VertexToTriangleMap', {}],
    ['int', 'SideToNeighborCount', {}],
    ['void*', 'SideToNeighborMap', {}],
    ['int', 'BonesForTriangleCount', {}],
    ['void*', 'BonesForTriangle', {}],
    ['int', 'TriangleToBoneCount', {}],
    ['void*', 'TriangleToBoneIndices', {}],
    ['int', 'TriAnnotationSetCount', {}],
    ['void*', 'TriAnnotationSets', {}]
],

'granny_tri_material_group': [
    ['int', 'MaterialIndex', {}],
    ['int', 'TriFirst', {}],
    ['int', 'TriCount', {}]
],

'granny_bone_binding': [
    ['char*', 'BoneName', { string: true }],
    ['float[3]', 'OBBMin', {}],
    ['float[3]', 'OBBMax', {}],
    ['int', 'TriangleCount', {}],
    ['void*', 'TriangleIndices', {}]
]
```

### 4. Helper para Obter Triângulos por Material

```javascript
/**
 * Get triangle groups from mesh topology
 * @param meshPtr Mesh pointer
 * @returns Array of { materialIndex, triFirst, triCount }
 */
api.GetMeshTriangleGroups = function(meshPtr) {
    var mesh = resolve_struct(this.runtime.cpu, meshPtr, Granny2.structs.granny_mesh);
    
    if (!mesh.PrimaryTopology) return [];
    
    var topology = resolve_struct(this.runtime.cpu, mesh.PrimaryTopology,
                                  Granny2.structs.granny_tri_topology);
    var groups = [];
    
    for (var i = 0; i < topology.GroupCount; i++) {
        var groupPtr = topology.Groups + i * 12; // 3 ints * 4 bytes
        groups.push({
            materialIndex: this.runtime.get_dword_ptr(groupPtr),
            triFirst: this.runtime.get_dword_ptr(groupPtr + 4),
            triCount: this.runtime.get_dword_ptr(groupPtr + 8)
        });
    }
    
    return groups;
};
```

### 5. Função de Timing (GetSecondsElapsed)

```javascript
/**
 * Get seconds elapsed between two time stamps
 * Note: Uses Granny's internal timing system
 */
api.GetSecondsElapsed = function(startTimePtr, endTimePtr) {
    var bits = this.runtime.stdcall(
        Granny2.exports.GrannyGetSecondsElapsed,
        startTimePtr,
        endTimePtr
    );
    return bitsToFloat(bits);
};

/**
 * Get current system time
 * @param outputPtr Pointer to store time (16 bytes)
 */
api.GetSystemSeconds = function(outputPtr) {
    this.runtime.stdcall(
        Granny2.exports.GrannyGetSystemSeconds,
        outputPtr
    );
};
```

### 6. Função de Binding para Bone Indices

```javascript
/**
 * Get mesh binding to bone indices
 * @param meshBinding Mesh binding pointer
 * @returns Pointer to bone indices array
 */
api.GetMeshBindingToBoneIndices = function(meshBinding) {
    return this.runtime.stdcall(
        Granny2.exports.GrannyGetMeshBindingToBoneIndices,
        meshBinding
    );
};
```

---

## 📋 Checklist de Completude

| Categoria | Status | Prioridade |
|-----------|--------|------------|
| Carregamento de arquivo | ✅ 100% | - |
| Leitura de mesh | ✅ 95% | Baixa |
| Leitura de skeleton | ✅ 90% | Baixa |
| Instanciação de modelo | ✅ 100% | - |
| Controle de animação | ✅ 100% | - |
| Poses (Local/World) | ✅ 100% | - |
| Deformação de vértices | ✅ 90% | Média |
| Texturas | ✅ 80% | Média |
| Materiais | ⚠️ 50% | Média |
| Liberação de memória | ⚠️ 60% | **Alta** |
| Curvas/B-Splines | ❌ 0% | Baixa |
| Transformações | ⚠️ 30% | Baixa |

---

## 🎯 Recomendações Prioritárias

### Alta Prioridade
1. **Implementar funções de liberação** (`FreeMeshBinding`, `FreeMeshDeformer`, `FreeFile`) - Evita memory leaks
2. **Adicionar `GetMeshBindingToBoneIndices`** - Necessário para skinning correto

### Média Prioridade
3. **Completar API de materiais** - Útil para renderização
4. **Adicionar estruturas de topologia** - Para acesso a grupos de triângulos

### Baixa Prioridade
5. **API de curvas B-Spline** - Só se precisar de sampling manual
6. **Funções de transformação** - A maioria dos casos já está coberta

---

## Conclusão

O projeto está **~85% completo** para uso geral. As funcionalidades principais de:
- ✅ Carregar arquivos GR2
- ✅ Extrair geometria (vértices/índices)
- ✅ Tocar animações
- ✅ Obter poses de bones
- ✅ Fazer skinning

Estão todas implementadas e funcionais. Os pontos faltantes são principalmente:
- Funções de cleanup (memory leaks potenciais)
- Acesso detalhado a materiais
- Algumas estruturas de dados auxiliares

Para uso em produção, recomendo adicionar as funções de liberação de memória primeiro.
