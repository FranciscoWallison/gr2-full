/**
 * GLB Exporter Module
 * Exporta dados GR2 extraídos para formato glTF Binary (GLB)
 * 
 * Suporta:
 * - Meshes com posições, normais e UVs
 * - Texturas embarcadas (PNG)
 * - Materiais PBR básicos
 * - Skeleton/Joints para skinning
 * - (Futuro) Animações
 */

const GLBExporter = (function() {
  'use strict';

  // glTF constants
  const GLTF = {
    BYTE: 5120,
    UNSIGNED_BYTE: 5121,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    UNSIGNED_INT: 5125,
    FLOAT: 5126,
    
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    
    POINTS: 0,
    LINES: 1,
    LINE_LOOP: 2,
    LINE_STRIP: 3,
    TRIANGLES: 4,
    TRIANGLE_STRIP: 5,
    TRIANGLE_FAN: 6,
    
    LINEAR: 9729,
    LINEAR_MIPMAP_LINEAR: 9987,
    REPEAT: 10497
  };

  /**
   * Main exporter class
   */
  class Exporter {
    constructor(options = {}) {
      this.options = {
        includeTextures: true,
        includeSkeleton: true,
        includeAnimations: false,
        flipUV: true,
        embedImages: true,
        ...options
      };

      this.reset();
    }

    reset() {
      this.gltf = {
        asset: {
          version: '2.0',
          generator: 'GR2-GLB-Exporter'
        },
        scene: 0,
        scenes: [{ nodes: [] }],
        nodes: [],
        meshes: [],
        accessors: [],
        bufferViews: [],
        buffers: [],
        materials: [],
        images: [],
        textures: [],
        samplers: [],
        skins: [],
        animations: []
      };

      this.bufferData = [];
      this.byteOffset = 0;
      this.nodeIndex = 0;
    }

    /**
     * Export extracted GR2 data to GLB
     * @param {Object} data - Extracted data from GR2 file
     * @returns {ArrayBuffer} GLB file as ArrayBuffer
     */
    export(data) {
      this.reset();
      
      // Add sampler if textures present
      if (this.options.includeTextures && data.textures && data.textures.length > 0) {
        this.addSampler();
        this.addTextures(data.textures);
      }

      // Add materials
      this.addMaterials(data.meshes, data.textures);

      // Add skeleton if present
      let skinIndex = -1;
      let jointNodeIndices = [];
      
      if (this.options.includeSkeleton && data.skeleton) {
        const skeletonResult = this.addSkeleton(data.skeleton);
        skinIndex = skeletonResult.skinIndex;
        jointNodeIndices = skeletonResult.jointNodeIndices;
      }

      // Add meshes
      const meshNodeIndices = this.addMeshes(data.meshes, skinIndex);

      // Create root node
      const rootNode = {
        name: data.filename || 'Model',
        children: [...meshNodeIndices, ...jointNodeIndices.filter(i => {
          // Only include root bones (parentIndex === -1)
          const bone = data.skeleton?.bones[jointNodeIndices.indexOf(i)];
          return bone && bone.parentIndex === -1;
        })]
      };
      
      // If no children, add all mesh nodes directly
      if (rootNode.children.length === 0) {
        rootNode.children = meshNodeIndices;
      }

      this.gltf.nodes.push(rootNode);
      this.gltf.scenes[0].nodes = [this.gltf.nodes.length - 1];

      // Add animations (if enabled and present)
      if (this.options.includeAnimations && data.animations) {
        this.addAnimations(data.animations, jointNodeIndices);
      }

      // Finalize buffer
      this.finalizeBuffer();

      // Encode to GLB
      return this.encodeGLB();
    }

    addSampler() {
      this.gltf.samplers.push({
        magFilter: GLTF.LINEAR,
        minFilter: GLTF.LINEAR_MIPMAP_LINEAR,
        wrapS: GLTF.REPEAT,
        wrapT: GLTF.REPEAT
      });
    }

    addTextures(textures) {
      textures.forEach((tex, i) => {
        // Get PNG data
        let pngData;
        if (tex.dataURL) {
          const base64 = tex.dataURL.split(',')[1];
          pngData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        } else if (tex.canvas) {
          const dataURL = tex.canvas.toDataURL('image/png');
          const base64 = dataURL.split(',')[1];
          pngData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        } else {
          console.warn(`Texture ${i} has no image data`);
          return;
        }

        const bufferViewIndex = this.addBufferView(pngData);

        this.gltf.images.push({
          bufferView: bufferViewIndex,
          mimeType: 'image/png',
          name: tex.info?.FromFileName || `Texture_${i}`
        });

        this.gltf.textures.push({
          sampler: 0,
          source: this.gltf.images.length - 1
        });
      });
    }

    addMaterials(meshes, textures) {
      meshes.forEach((meshData, i) => {
        const material = {
          name: `Material_${meshData.name || i}`,
          pbrMetallicRoughness: {
            baseColorFactor: [0.8, 0.8, 0.8, 1.0],
            metallicFactor: 0.0,
            roughnessFactor: 0.8
          },
          doubleSided: true
        };

        if (this.options.includeTextures && 
            meshData.textureIndex >= 0 && 
            meshData.textureIndex < (textures?.length || 0)) {
          material.pbrMetallicRoughness.baseColorTexture = {
            index: meshData.textureIndex
          };
          material.pbrMetallicRoughness.baseColorFactor = [1.0, 1.0, 1.0, 1.0];
        }

        this.gltf.materials.push(material);
      });
    }

    addSkeleton(skeleton) {
      const jointNodeIndices = [];
      const inverseBindMatrices = [];

      // Create nodes for each bone
      skeleton.bones.forEach((bone, i) => {
        const node = {
          name: bone.name,
          children: []
        };

        // Apply local transform
        if (bone.localTransform) {
          const t = bone.localTransform;
          
          // Position
          if (t.Position && (t.Position[0] !== 0 || t.Position[1] !== 0 || t.Position[2] !== 0)) {
            node.translation = [t.Position[0], t.Position[1], t.Position[2]];
          }
          
          // Rotation (quaternion)
          if (t.Orientation) {
            node.rotation = [
              t.Orientation[0],
              t.Orientation[1],
              t.Orientation[2],
              t.Orientation[3]
            ];
          }
          
          // Scale (extract from ScaleShear matrix)
          if (t.ScaleShear) {
            const sx = Math.sqrt(t.ScaleShear[0] * t.ScaleShear[0] + t.ScaleShear[3] * t.ScaleShear[3] + t.ScaleShear[6] * t.ScaleShear[6]);
            const sy = Math.sqrt(t.ScaleShear[1] * t.ScaleShear[1] + t.ScaleShear[4] * t.ScaleShear[4] + t.ScaleShear[7] * t.ScaleShear[7]);
            const sz = Math.sqrt(t.ScaleShear[2] * t.ScaleShear[2] + t.ScaleShear[5] * t.ScaleShear[5] + t.ScaleShear[8] * t.ScaleShear[8]);
            
            if (sx !== 1 || sy !== 1 || sz !== 1) {
              node.scale = [sx, sy, sz];
            }
          }
        }

        const nodeIndex = this.gltf.nodes.length;
        this.gltf.nodes.push(node);
        jointNodeIndices.push(nodeIndex);

        // Inverse bind matrix (4x4)
        if (bone.inverseWorld4x4) {
          // Granny stores as flat array or 4x4 matrix
          const ibm = bone.inverseWorld4x4;
          if (Array.isArray(ibm[0])) {
            // 4x4 nested array
            inverseBindMatrices.push(...ibm.flat());
          } else {
            // Flat array
            inverseBindMatrices.push(...ibm);
          }
        } else {
          // Identity matrix as fallback
          inverseBindMatrices.push(
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
          );
        }
      });

      // Build hierarchy (set children)
      skeleton.bones.forEach((bone, i) => {
        if (bone.parentIndex >= 0 && bone.parentIndex < skeleton.bones.length) {
          const parentNode = this.gltf.nodes[jointNodeIndices[bone.parentIndex]];
          if (!parentNode.children.includes(jointNodeIndices[i])) {
            parentNode.children.push(jointNodeIndices[i]);
          }
        }
      });

      // Create inverse bind matrices accessor
      const ibmData = new Float32Array(inverseBindMatrices);
      const ibmBufferView = this.addBufferView(new Uint8Array(ibmData.buffer));
      const ibmAccessor = this.addAccessor(
        ibmBufferView,
        GLTF.FLOAT,
        skeleton.bones.length,
        'MAT4'
      );

      // Create skin
      const skin = {
        name: skeleton.name || 'Skeleton',
        joints: jointNodeIndices,
        inverseBindMatrices: ibmAccessor
      };

      // Find skeleton root (bone with parentIndex === -1)
      const rootBoneIndex = skeleton.bones.findIndex(b => b.parentIndex === -1);
      if (rootBoneIndex >= 0) {
        skin.skeleton = jointNodeIndices[rootBoneIndex];
      }

      this.gltf.skins.push(skin);

      return {
        skinIndex: this.gltf.skins.length - 1,
        jointNodeIndices
      };
    }

    addMeshes(meshes, skinIndex = -1) {
      const meshNodeIndices = [];

      meshes.forEach((meshData, i) => {
        // Calculate bounds
        const posMin = [Infinity, Infinity, Infinity];
        const posMax = [-Infinity, -Infinity, -Infinity];

        for (let v = 0; v < meshData.positions.length; v += 3) {
          posMin[0] = Math.min(posMin[0], meshData.positions[v]);
          posMin[1] = Math.min(posMin[1], meshData.positions[v + 1]);
          posMin[2] = Math.min(posMin[2], meshData.positions[v + 2]);
          posMax[0] = Math.max(posMax[0], meshData.positions[v]);
          posMax[1] = Math.max(posMax[1], meshData.positions[v + 1]);
          posMax[2] = Math.max(posMax[2], meshData.positions[v + 2]);
        }

        // Positions
        const posView = this.addBufferView(
          new Uint8Array(meshData.positions.buffer.slice(
            meshData.positions.byteOffset,
            meshData.positions.byteOffset + meshData.positions.byteLength
          )),
          GLTF.ARRAY_BUFFER
        );
        const posAccessor = this.addAccessor(
          posView, GLTF.FLOAT, meshData.vertexCount, 'VEC3',
          posMin, posMax
        );

        // Normals
        const normView = this.addBufferView(
          new Uint8Array(meshData.normals.buffer.slice(
            meshData.normals.byteOffset,
            meshData.normals.byteOffset + meshData.normals.byteLength
          )),
          GLTF.ARRAY_BUFFER
        );
        const normAccessor = this.addAccessor(
          normView, GLTF.FLOAT, meshData.vertexCount, 'VEC3'
        );

        // UVs (with flip option)
        const uvArray = new Float32Array(meshData.uvs.length);
        for (let u = 0; u < meshData.uvs.length; u += 2) {
          uvArray[u] = meshData.uvs[u];
          uvArray[u + 1] = this.options.flipUV ? (1 - meshData.uvs[u + 1]) : meshData.uvs[u + 1];
        }
        const uvView = this.addBufferView(
          new Uint8Array(uvArray.buffer),
          GLTF.ARRAY_BUFFER
        );
        const uvAccessor = this.addAccessor(
          uvView, GLTF.FLOAT, meshData.vertexCount, 'VEC2'
        );

        // Indices
        const indexView = this.addBufferView(
          new Uint8Array(meshData.indices.buffer.slice(
            meshData.indices.byteOffset,
            meshData.indices.byteOffset + meshData.indices.byteLength
          )),
          GLTF.ELEMENT_ARRAY_BUFFER
        );
        const indexAccessor = this.addAccessor(
          indexView, GLTF.UNSIGNED_SHORT, meshData.indexCount, 'SCALAR'
        );

        // Build primitive
        const primitive = {
          attributes: {
            POSITION: posAccessor,
            NORMAL: normAccessor,
            TEXCOORD_0: uvAccessor
          },
          indices: indexAccessor,
          material: i,
          mode: GLTF.TRIANGLES
        };

        // Add skinning attributes if available
        if (meshData.joints && meshData.weights) {
          const jointsView = this.addBufferView(
            new Uint8Array(meshData.joints.buffer),
            GLTF.ARRAY_BUFFER
          );
          const jointsAccessor = this.addAccessor(
            jointsView, GLTF.UNSIGNED_SHORT, meshData.vertexCount, 'VEC4'
          );

          const weightsView = this.addBufferView(
            new Uint8Array(meshData.weights.buffer),
            GLTF.ARRAY_BUFFER
          );
          const weightsAccessor = this.addAccessor(
            weightsView, GLTF.FLOAT, meshData.vertexCount, 'VEC4'
          );

          primitive.attributes.JOINTS_0 = jointsAccessor;
          primitive.attributes.WEIGHTS_0 = weightsAccessor;
        }

        // Create mesh
        this.gltf.meshes.push({
          name: meshData.name,
          primitives: [primitive]
        });

        // Create node
        const node = {
          name: meshData.name,
          mesh: this.gltf.meshes.length - 1
        };

        if (skinIndex >= 0) {
          node.skin = skinIndex;
        }

        this.gltf.nodes.push(node);
        meshNodeIndices.push(this.gltf.nodes.length - 1);
      });

      return meshNodeIndices;
    }

    addAnimations(animations, jointNodeIndices) {
      // TODO: Implement animation export
      // This requires sampling Granny2 animation curves and converting to glTF format
      console.log('Animation export not yet implemented');
    }

    addBufferView(data, target = null) {
      const view = {
        buffer: 0,
        byteOffset: this.byteOffset,
        byteLength: data.byteLength
      };

      if (target) {
        view.target = target;
      }

      this.gltf.bufferViews.push(view);
      this.bufferData.push(data);

      // Align to 4 bytes
      const paddedLength = Math.ceil(data.byteLength / 4) * 4;
      if (paddedLength > data.byteLength) {
        this.bufferData.push(new Uint8Array(paddedLength - data.byteLength));
      }
      this.byteOffset += paddedLength;

      return this.gltf.bufferViews.length - 1;
    }

    addAccessor(bufferViewIndex, componentType, count, type, min = null, max = null) {
      const accessor = {
        bufferView: bufferViewIndex,
        componentType,
        count,
        type
      };

      if (min) accessor.min = min;
      if (max) accessor.max = max;

      this.gltf.accessors.push(accessor);
      return this.gltf.accessors.length - 1;
    }

    finalizeBuffer() {
      // Concatenate all buffer data
      const totalBuffer = new Uint8Array(this.byteOffset);
      let offset = 0;

      this.bufferData.forEach(data => {
        totalBuffer.set(data instanceof Uint8Array ? data : new Uint8Array(data), offset);
        offset += data.byteLength;
        const padding = Math.ceil(data.byteLength / 4) * 4 - data.byteLength;
        offset += padding;
      });

      this.gltf.buffers.push({
        byteLength: totalBuffer.byteLength
      });

      this.binaryBuffer = totalBuffer;

      // Clean up empty arrays
      if (this.gltf.skins.length === 0) delete this.gltf.skins;
      if (this.gltf.animations.length === 0) delete this.gltf.animations;
      if (this.gltf.images.length === 0) delete this.gltf.images;
      if (this.gltf.textures.length === 0) delete this.gltf.textures;
      if (this.gltf.samplers.length === 0) delete this.gltf.samplers;
    }

    encodeGLB() {
      const jsonString = JSON.stringify(this.gltf);
      const jsonBuffer = new TextEncoder().encode(jsonString);

      // Pad JSON to 4 bytes
      const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
      const paddedJsonLength = jsonBuffer.length + jsonPadding;

      // Pad binary to 4 bytes
      const binPadding = (4 - (this.binaryBuffer.byteLength % 4)) % 4;
      const paddedBinLength = this.binaryBuffer.byteLength + binPadding;

      // GLB structure: Header (12) + JSON chunk (8 + data) + BIN chunk (8 + data)
      const totalLength = 12 + 8 + paddedJsonLength + 8 + paddedBinLength;

      const glb = new ArrayBuffer(totalLength);
      const view = new DataView(glb);
      const uint8 = new Uint8Array(glb);

      let offset = 0;

      // Header
      view.setUint32(offset, 0x46546C67, true); // "glTF" magic
      offset += 4;
      view.setUint32(offset, 2, true); // version 2
      offset += 4;
      view.setUint32(offset, totalLength, true);
      offset += 4;

      // JSON chunk
      view.setUint32(offset, paddedJsonLength, true);
      offset += 4;
      view.setUint32(offset, 0x4E4F534A, true); // "JSON"
      offset += 4;
      uint8.set(jsonBuffer, offset);
      offset += jsonBuffer.length;
      for (let i = 0; i < jsonPadding; i++) {
        uint8[offset++] = 0x20; // Space padding
      }

      // BIN chunk
      view.setUint32(offset, paddedBinLength, true);
      offset += 4;
      view.setUint32(offset, 0x004E4942, true); // "BIN\0"
      offset += 4;
      uint8.set(this.binaryBuffer, offset);
      offset += this.binaryBuffer.byteLength;
      for (let i = 0; i < binPadding; i++) {
        uint8[offset++] = 0x00; // Zero padding
      }

      return glb;
    }
  }

  // Public API
  return {
    Exporter,
    
    /**
     * Quick export function
     * @param {Object} data - Extracted GR2 data
     * @param {Object} options - Export options
     * @returns {ArrayBuffer} GLB file
     */
    export(data, options = {}) {
      const exporter = new Exporter(options);
      return exporter.export(data);
    },

    /**
     * Export and create downloadable blob
     * @param {Object} data - Extracted GR2 data
     * @param {Object} options - Export options
     * @returns {Blob} GLB blob
     */
    exportToBlob(data, options = {}) {
      const glb = this.export(data, options);
      return new Blob([glb], { type: 'model/gltf-binary' });
    },

    /**
     * Export and trigger download
     * @param {Object} data - Extracted GR2 data
     * @param {string} filename - Output filename
     * @param {Object} options - Export options
     */
    downloadGLB(data, filename = 'model.glb', options = {}) {
      const blob = this.exportToBlob(data, options);
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.glb') ? filename : `${filename}.glb`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
    }
  };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GLBExporter;
}
