# GR2 to GLB Converter

Conversor de modelos Granny2 (.gr2) para glTF Binary (.glb).

## Estrutura do Projeto

```
gr2-to-glb/
├── gr2-to-glb-converter.html    # Interface web principal
├── README.md                     # Esta documentação
└── (dependências do gr2-web)     # Arquivos necessários do projeto original
```

## Dependências Necessárias

Este projeto depende dos arquivos do **gr2-web**. Copie os seguintes arquivos para o mesmo diretório:

### Arquivos Obrigatórios
- `granny2.bin` - Binário da DLL Granny2
- `granny2.js` - API JavaScript para Granny2
- `granny2.subs.js` - Stubs de funções
- `granny2.def.js` - Definições e exports
- `pe_env.js` - Ambiente de emulação PE

### Emulador x86 (v86)
- `const.js`
- `main.js`
- `memory.js`
- `io.js`
- `v86.js`

### Three.js
- `three.min.js` - Biblioteca 3D (versão r128 ou compatível)

## Como Usar

### Interface Web

1. Copie todos os arquivos necessários para um diretório
2. Inicie um servidor HTTP local:
   ```bash
   python -m http.server 8080
   # ou
   npx serve .
   ```
3. Acesse `http://localhost:8080/gr2-to-glb-converter.html`
4. Arraste um arquivo `.gr2` para a área de drop
5. Configure as opções de exportação
6. Clique em "Convert to GLB"
7. Baixe o arquivo `.glb` gerado

### Opções de Exportação

| Opção | Descrição |
|-------|-----------|
| Include Textures | Embute texturas no GLB como PNG |
| Include Skeleton | Preserva hierarquia de bones (metadados) |
| Include Animations | Exporta animações (em desenvolvimento) |
| Flip UV Y-axis | Inverte coordenada V (necessário para maioria dos modelos) |

## Formato de Vértice

O conversor assume o formato de vértice **PNT332** padrão do Granny2:

| Componente | Tipo | Offset | Tamanho |
|------------|------|--------|---------|
| Position | float[3] | 0 | 12 bytes |
| Normal | float[3] | 12 | 12 bytes |
| TexCoord | float[2] | 24 | 8 bytes |
| **Total** | | | **32 bytes** |

## Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                    GR2 to GLB Converter                       │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐ │
│  │   Input     │──▶│   Granny2   │──▶│   glTF Builder      │ │
│  │   .gr2      │   │   Runtime   │   │   (JavaScript)      │ │
│  └─────────────┘   │   (x86 emu) │   └─────────────────────┘ │
│                    └─────────────┘              │             │
│                          │                      ▼             │
│                          ▼              ┌─────────────────┐  │
│                    ┌───────────┐        │   GLB Encoder   │  │
│                    │ Extract:  │        │   (Binary)      │  │
│                    │ - Meshes  │        └─────────────────┘  │
│                    │ - Textures│               │             │
│                    │ - Skeleton│               ▼             │
│                    │ - Anims   │        ┌─────────────────┐  │
│                    └───────────┘        │   Output .glb   │  │
│                                         └─────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## API Granny2 Utilizada

Funções principais:

```javascript
// Carregar arquivo
gr2.ReadEntireFileFromMemory(arrayBuffer)
gr2.GetFileInfo(grannyFile)

// Texturas
gr2.TextureHasAlpha(texturePtr)
gr2.CopyTextureImage(texturePtr)

// Meshes
gr2.GetMeshVertexCount(meshPtr)
gr2.GetMeshIndexCount(meshPtr)
gr2.CopyMeshVertices(meshPtr)
gr2.CopyMeshIndices(meshPtr)
gr2.GetMeshVertexType(meshPtr)
gr2.MeshIsRigid(meshPtr)

// Skeleton/Animation
gr2.NewMeshDeformer(vertexType)
gr2.NewMeshBinding(meshPtr)
gr2.InstantiateModel(modelPtr)
```

## Estrutura GLB de Saída

```
GLB File
├── Header (12 bytes)
│   ├── Magic: "glTF"
│   ├── Version: 2
│   └── Total Length
├── JSON Chunk
│   ├── asset
│   ├── scene
│   ├── nodes (hierarquia)
│   ├── meshes (geometria)
│   ├── materials (PBR)
│   ├── textures
│   ├── images (embedded PNG)
│   ├── accessors
│   └── bufferViews
└── BIN Chunk
    ├── Vertex positions
    ├── Vertex normals
    ├── Vertex UVs
    ├── Indices
    └── Image data (PNG)
```

## Limitações Conhecidas

1. **Skinning**: Bones são extraídos mas não aplicados como joints glTF (apenas metadados)
2. **Animações**: Estrutura presente mas não totalmente implementada
3. **Formatos de vértice**: Apenas PNT332 é suportado atualmente
4. **Múltiplos modelos**: Apenas o primeiro modelo é processado

## Compatibilidade

### Visualizadores GLB Testados
- ✅ Three.js
- ✅ Babylon.js
- ✅ glTF Viewer (Khronos)
- ✅ Windows 3D Viewer
- ✅ Blender 2.8+

### Navegadores Suportados
- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Edge 80+
- ⚠️ Safari (pode ter problemas com WebGL)

## Troubleshooting

### "Failed to load granny2.bin"
- Verifique se o arquivo `granny2.bin` está no mesmo diretório
- Certifique-se de estar usando um servidor HTTP (não file://)

### Modelo aparece sem texturas
- Verifique se "Include Textures" está marcado
- Tente alternar "Flip UV Y-axis"

### Modelo aparece invertido/espelhado
- Granny2 usa sistema de coordenadas diferente
- Pode ser necessário ajustar a escala Y ou Z no visualizador

### Performance lenta
- Arquivos GR2 grandes podem demorar na emulação x86
- A extração de texturas S3TC/DXT é intensiva

## Referências

- [glTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [Granny2 SDK Documentation](https://www.radgametools.com/granny.html)
- [gr2-web Project](./texture-debug.html) - Base para parsing GR2

## Licença

MIT License - Uso livre para fins educacionais e comerciais.

---

Desenvolvido com base na lógica do `texture-debug.html` do projeto gr2-web.
