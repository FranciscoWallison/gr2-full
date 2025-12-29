/**
 * GR2 Data Extractor Module
 * Extrai meshes, texturas, skeleton e animações de arquivos GR2
 * 
 * Requer: Granny2 runtime inicializado (gr2-web)
 */

const GR2Extractor = (function() {
  'use strict';

  /**
   * Main extractor class
   */
  class Extractor {
    constructor(granny2Instance) {
      if (!granny2Instance) {
        throw new Error('Granny2 instance is required');
      }
      this.gr2 = granny2Instance;
    }

    /**
     * Extract all data from a GR2 file
     * @param {ArrayBuffer} buffer - GR2 file contents
     * @param {string} filename - Original filename
     * @returns {Object} Extracted data
     */
    extract(buffer, filename = 'model') {
      // Load file
      const grannyFile = this.gr2.ReadEntireFileFromMemory(buffer);
      if (!grannyFile) {
        throw new Error('Failed to parse GR2 file');
      }

      const fileInfoPtr = this.gr2.GetFileInfo(grannyFile);
      if (!fileInfoPtr) {
        throw new Error('Failed to get file info');
      }

      const fileInfo = Granny2.readStructure(
        this.gr2.runtime.cpu,
        fileInfoPtr,
        Granny2.structs.granny_file_info
      );

      // Build material -> texture mapping
      const materialMapping = this.buildMaterialMapping(fileInfo);

      // Extract all components
      const textures = this.extractTextures(fileInfo);
      const meshes = this.extractMeshes(fileInfo, textures, materialMapping);
      const skeleton = this.extractSkeleton(fileInfo);
      const animations = this.extractAnimations(fileInfo);

      return {
        filename: filename.replace(/\.gr2$/i, ''),
        fileInfo: {
          fromFileName: fileInfo.FromFileName,
          modelCount: fileInfo.ModelCount,
          meshCount: fileInfo.MeshCount,
          textureCount: fileInfo.TextureCount,
          materialCount: fileInfo.MaterialCount,
          skeletonCount: fileInfo.SkeletonCount,
          animationCount: fileInfo.AnimationCount
        },
        textures,
        meshes,
        skeleton,
        animations,
        totalVertices: meshes.reduce((sum, m) => sum + m.vertexCount, 0),
        totalIndices: meshes.reduce((sum, m) => sum + m.indexCount, 0)
      };
    }

    /**
     * Build material to texture mapping
     */
    buildMaterialMapping(fileInfo) {
      const materialsMap = new Map();
      const materialToTexture = new Map();

      if (!fileInfo.Materials || fileInfo.MaterialCount === 0) {
        return { materialsMap, materialToTexture };
      }

      // First pass: read all materials
      for (let m = 0; m < fileInfo.MaterialCount; m++) {
        const matPtr = this.gr2.runtime.get_dword_ptr(fileInfo.Materials + 4 * m);
        
        try {
          const matInfo = Granny2.readStructure(
            this.gr2.runtime.cpu,
            matPtr,
            Granny2.structs.granny_material
          );
          matInfo._ptr = matPtr;
          materialsMap.set(matPtr, matInfo);

          // Check for direct texture link
          if (matInfo.Texture) {
            // Find texture index
            for (let t = 0; t < fileInfo.TextureCount; t++) {
              const texPtr = this.gr2.runtime.get_dword_ptr(fileInfo.Textures + 4 * t);
              if (texPtr === matInfo.Texture) {
                materialToTexture.set(matPtr, t);
                break;
              }
            }
          }
        } catch (e) {
          console.warn(`Failed to read material ${m}:`, e);
        }
      }

      // Second pass: resolve material maps
      for (const [matPtr, matInfo] of materialsMap) {
        if (materialToTexture.has(matPtr)) continue;

        if (matInfo.MapCount > 0 && matInfo.Maps) {
          for (let mapIdx = 0; mapIdx < matInfo.MapCount; mapIdx++) {
            const mapPtr = matInfo.Maps + mapIdx * 8;
            const refMatPtr = this.gr2.runtime.get_dword_ptr(mapPtr + 4);

            if (materialsMap.has(refMatPtr) && materialToTexture.has(refMatPtr)) {
              materialToTexture.set(matPtr, materialToTexture.get(refMatPtr));
              break;
            }
          }
        }
      }

      return { materialsMap, materialToTexture };
    }

    /**
     * Extract textures
     */
    extractTextures(fileInfo) {
      const textures = [];

      for (let i = 0; i < fileInfo.TextureCount; i++) {
        const texturePtr = this.gr2.runtime.get_dword_ptr(fileInfo.Textures + 4 * i);
        
        try {
          const textureInfo = Granny2.readStructure(
            this.gr2.runtime.cpu,
            texturePtr,
            Granny2.structs.granny_texture
          );

          const hasAlpha = this.gr2.TextureHasAlpha(texturePtr);
          const pixelData = this.gr2.CopyTextureImage(texturePtr);

          // Create canvas
          const canvas = document.createElement('canvas');
          canvas.width = textureInfo.Width;
          canvas.height = textureInfo.Height;

          const ctx = canvas.getContext('2d');
          const imageData = ctx.createImageData(textureInfo.Width, textureInfo.Height);
          imageData.data.set(pixelData);
          ctx.putImageData(imageData, 0, 0);

          textures.push({
            index: i,
            ptr: texturePtr,
            info: {
              FromFileName: textureInfo.FromFileName,
              Width: textureInfo.Width,
              Height: textureInfo.Height,
              TextureType: textureInfo.TextureType,
              Encoding: textureInfo.Encoding,
              SubFormat: textureInfo.SubFormat
            },
            hasAlpha,
            canvas,
            dataURL: canvas.toDataURL('image/png')
          });

        } catch (e) {
          console.warn(`Failed to extract texture ${i}:`, e);
        }
      }

      return textures;
    }

    /**
     * Extract meshes
     */
    extractMeshes(fileInfo, textures, materialMapping) {
      const meshes = [];
      const { materialsMap, materialToTexture } = materialMapping;

      for (let i = 0; i < fileInfo.MeshCount; i++) {
        const mesh = fileInfo.Meshes[i];
        const meshPtr = mesh._ptr;

        try {
          const vertexCount = this.gr2.GetMeshVertexCount(meshPtr);
          const indexCount = this.gr2.GetMeshIndexCount(meshPtr);

          if (vertexCount === 0) {
            console.warn(`Mesh ${i} (${mesh.Name}) has 0 vertices, skipping`);
            continue;
          }

          // Get raw data
          const vertices = this.gr2.CopyMeshVertices(meshPtr);
          const indices = this.gr2.CopyMeshIndices(meshPtr);

          // Find texture for this mesh
          let textureIndex = -1;
          if (mesh.MaterialBindings && mesh.MaterialsBindingCount > 0) {
            for (let mb = 0; mb < mesh.MaterialsBindingCount; mb++) {
              const matBindPtr = this.gr2.runtime.get_dword_ptr(mesh.MaterialBindings + 4 * mb);
              if (materialToTexture.has(matBindPtr)) {
                textureIndex = materialToTexture.get(matBindPtr);
                break;
              }
            }
          }

          // Fallback to first texture
          if (textureIndex < 0 && textures.length > 0) {
            textureIndex = 0;
          }

          // Parse PNT332 format: Position(3) + Normal(3) + UV(2) = 8 floats = 32 bytes
          const floats = new Float32Array(vertices.buffer);
          const positions = new Float32Array(vertexCount * 3);
          const normals = new Float32Array(vertexCount * 3);
          const uvs = new Float32Array(vertexCount * 2);

          for (let v = 0; v < vertexCount; v++) {
            const srcOffset = v * 8;
            const posOffset = v * 3;
            const uvOffset = v * 2;

            // Position
            positions[posOffset] = floats[srcOffset];
            positions[posOffset + 1] = floats[srcOffset + 1];
            positions[posOffset + 2] = floats[srcOffset + 2];

            // Normal
            normals[posOffset] = floats[srcOffset + 3];
            normals[posOffset + 1] = floats[srcOffset + 4];
            normals[posOffset + 2] = floats[srcOffset + 5];

            // UV
            uvs[uvOffset] = floats[srcOffset + 6];
            uvs[uvOffset + 1] = floats[srcOffset + 7];
          }

          // Check for skinning data
          let joints = null;
          let weights = null;

          // Try to extract bone weights if mesh is not rigid
          const isRigid = this.gr2.MeshIsRigid(meshPtr);
          if (!isRigid && mesh.BoneBindingsCount > 0) {
            console.log(`Mesh ${i} has ${mesh.BoneBindingsCount} bone bindings`);
          }

          meshes.push({
            name: mesh.Name || `Mesh_${i}`,
            vertexCount,
            indexCount,
            positions,
            normals,
            uvs,
            indices: new Uint16Array(indices.buffer),
            textureIndex,
            isRigid,
            boneBindingsCount: mesh.BoneBindingsCount,
            joints,
            weights
          });

        } catch (e) {
          console.warn(`Failed to extract mesh ${i}:`, e);
        }
      }

      return meshes;
    }

    /**
     * Extract skeleton
     */
    extractSkeleton(fileInfo) {
      if (!fileInfo.Skeletons || fileInfo.SkeletonCount === 0) {
        return null;
      }

      const skeleton = fileInfo.Skeletons[0];
      const bones = [];

      for (let i = 0; i < skeleton.BoneCount; i++) {
        const bone = skeleton.Bones[i];
        
        bones.push({
          name: bone.Name || `Bone_${i}`,
          parentIndex: bone.ParentIndex,
          localTransform: bone.LocalTransform ? {
            Flags: bone.LocalTransform.Flags,
            Position: bone.LocalTransform.Position,
            Orientation: bone.LocalTransform.Orientation,
            ScaleShear: bone.LocalTransform.ScaleShear
          } : null,
          inverseWorld4x4: bone.InverseWorld4x4,
          lodError: bone.LODError
        });
      }

      return {
        name: skeleton.Name || 'Skeleton',
        boneCount: skeleton.BoneCount,
        bones
      };
    }

    /**
     * Extract animations
     */
    extractAnimations(fileInfo) {
      if (!fileInfo.Animations || fileInfo.AnimationCount === 0) {
        return [];
      }

      const animations = [];

      for (let i = 0; i < fileInfo.AnimationCount; i++) {
        try {
          const animPtr = this.gr2.runtime.get_dword_ptr(fileInfo.Animations + 4 * i);
          const animInfo = Granny2.readStructure(
            this.gr2.runtime.cpu,
            animPtr,
            Granny2.structs.granny_animation
          );

          animations.push({
            index: i,
            ptr: animPtr,
            name: animInfo.Name || `Animation_${i}`,
            duration: animInfo.Duration,
            timeStep: animInfo.TimeStep,
            oversampling: animInfo.Oversampling,
            trackGroupCount: animInfo.TrackGroupCount
          });

        } catch (e) {
          console.warn(`Failed to extract animation ${i}:`, e);
        }
      }

      return animations;
    }
  }

  // Public API
  return {
    Extractor,

    /**
     * Quick extraction function
     */
    extract(gr2, buffer, filename) {
      const extractor = new Extractor(gr2);
      return extractor.extract(buffer, filename);
    },

    /**
     * Extract with Three.js textures
     */
    extractForThreeJS(gr2, buffer, filename) {
      const data = this.extract(gr2, buffer, filename);

      if (typeof THREE !== 'undefined') {
        data.textures.forEach(tex => {
          tex.threeTexture = new THREE.CanvasTexture(tex.canvas);
          tex.threeTexture.flipY = false;
          tex.threeTexture.needsUpdate = true;
        });
      }

      return data;
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GR2Extractor;
}
