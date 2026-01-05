/**
 * granny2_additions.js
 * 
 * Funções adicionais para completar o wrapper granny2.js
 * 
 * COMO USAR:
 * 1. Copie o conteúdo deste arquivo para dentro do granny2.js
 * 2. Ou carregue após granny2.js e chame: Granny2Additions.apply(Granny2)
 * 
 * @version 1.0.0
 * @requires granny2.js
 */

(function(exports) {

	// ============================================
	// ESTRUTURAS DE DADOS ADICIONAIS
	// ============================================

	var additionalStructs = {

		// Dados de vértice detalhados
		'granny_vertex_data': [
			['void*', 'VertexType', {}],
			['int', 'VertexCount', {}],
			['void*', 'Vertices', {}],
			['int', 'VertexComponentCount', {}],
			['void*', 'VertexComponentNames', {}],
			['int', 'VertexAnnotationSetCount', {}],
			['void*', 'VertexAnnotationSets', {}]
		],

		// Topologia de triângulos
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

		// Grupo de material por triângulos
		'granny_tri_material_group': [
			['int', 'MaterialIndex', {}],
			['int', 'TriFirst', {}],
			['int', 'TriCount', {}]
		],

		// Binding de bone
		'granny_bone_binding': [
			['char*', 'BoneName', { string: true }],
			['float[3]', 'OBBMin', {}],
			['float[3]', 'OBBMax', {}],
			['int', 'TriangleCount', {}],
			['void*', 'TriangleIndices', {}]
		],

		// Imagem de textura
		'granny_texture_image': [
			['int', 'MIPLevelCount', {}],
			['void*', 'MIPLevels', {}]
		],

		// Nível MIP de textura
		'granny_texture_mip_level': [
			['int', 'Stride', {}],
			['int', 'PixelByteCount', {}],
			['void*', 'PixelBytes', {}]
		],

		// Curva genérica
		'granny_curve': [
			['void*', 'CurveData', {}]
		],

		// Info de ferramenta de arte (exportador)
		'granny_art_tool_info': [
			['char*', 'FromArtToolName', { string: true }],
			['int', 'ArtToolMajorRevision', {}],
			['int', 'ArtToolMinorRevision', {}],
			['float', 'UnitsPerMeter', {}],
			['float[3]', 'Origin', {}],
			['float[3]', 'RightVector', {}],
			['float[3]', 'UpVector', {}],
			['float[3]', 'BackVector', {}],
			['int', 'ExtendedData_Type', {}],
			['void*', 'ExtendedData_Object', {}]
		],

		// Info do exportador
		'granny_exporter_info': [
			['char*', 'ExporterName', { string: true }],
			['int', 'ExporterMajorRevision', {}],
			['int', 'ExporterMinorRevision', {}],
			['int', 'ExporterCustomization', {}],
			['int', 'ExporterBuildNumber', {}],
			['int', 'ExtendedData_Type', {}],
			['void*', 'ExtendedData_Object', {}]
		]

	};

	// ============================================
	// FUNÇÕES DE LIBERAÇÃO DE MEMÓRIA
	// ============================================

	/**
	 * Libera um mesh binding
	 * @param {number} meshBinding - Ponteiro do mesh binding
	 */
	function FreeMeshBinding(meshBinding) {
		if (!meshBinding) return;
		this.runtime.stdcall(
			Granny2.exports.GrannyFreeMeshBinding,
			meshBinding
		);
	}

	/**
	 * Libera um mesh deformer
	 * @param {number} meshDeformer - Ponteiro do mesh deformer
	 */
	function FreeMeshDeformer(meshDeformer) {
		if (!meshDeformer) return;
		this.runtime.stdcall(
			Granny2.exports.GrannyFreeMeshDeformer,
			meshDeformer
		);
	}

	/**
	 * Libera um arquivo Granny
	 * @param {number} grannyFile - Ponteiro do arquivo
	 */
	function FreeFile(grannyFile) {
		if (!grannyFile) return;
		this.runtime.stdcall(
			Granny2.exports.GrannyFreeFile,
			grannyFile
		);
	}

	/**
	 * Libera uma seção específica do arquivo
	 * @param {number} grannyFile - Ponteiro do arquivo
	 * @param {number} sectionIndex - Índice da seção (0-5)
	 */
	function FreeFileSection(grannyFile, sectionIndex) {
		if (!grannyFile) return;
		this.runtime.stdcall(
			Granny2.exports.GrannyFreeFileSection,
			grannyFile,
			sectionIndex
		);
	}

	/**
	 * Libera todas as seções do arquivo
	 * @param {number} grannyFile - Ponteiro do arquivo
	 */
	function FreeAllFileSections(grannyFile) {
		if (!grannyFile) return;
		this.runtime.stdcall(
			Granny2.exports.GrannyFreeAllFileSections,
			grannyFile
		);
	}

	/**
	 * Libera um track mask
	 * @param {number} trackMask - Ponteiro do track mask
	 */
	function FreeTrackMask(trackMask) {
		if (!trackMask) return;
		this.runtime.stdcall(
			Granny2.exports.GrannyFreeTrackMask,
			trackMask
		);
	}

	// ============================================
	// FUNÇÕES DE MESH BINDING E BONE INDICES
	// ============================================

	/**
	 * Obtém os índices de bones para um mesh binding
	 * @param {number} meshBinding - Ponteiro do mesh binding
	 * @returns {number} Ponteiro para array de índices de bones
	 */
	function GetMeshBindingToBoneIndices(meshBinding) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyGetMeshBindingToBoneIndices,
			meshBinding
		);
	}

	/**
	 * Verifica se o mesh binding foi transferido
	 * @param {number} meshBinding - Ponteiro do mesh binding
	 * @returns {boolean}
	 */
	function MeshBindingIsTransferred(meshBinding) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyMeshBindingIsTransferred,
			meshBinding
		) !== 0;
	}

	/**
	 * Obtém o tamanho do array de matrizes 4x4 para binding
	 * @param {number} meshBinding - Ponteiro do mesh binding
	 * @param {number} worldPose - Ponteiro do world pose
	 * @returns {number} Tamanho em bytes
	 */
	function GetMeshBinding4x4ArraySize(meshBinding, worldPose) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyGetMeshBinding4x4ArraySize,
			meshBinding,
			worldPose
		);
	}

	/**
	 * Constrói array de matrizes 4x4 para mesh binding
	 * @param {number} meshBinding - Ponteiro do mesh binding
	 * @param {number} worldPose - Ponteiro do world pose
	 * @param {number} matrixBuffer - Buffer de saída para matrizes
	 */
	function BuildMeshBinding4x4Array(meshBinding, worldPose, matrixBuffer) {
		// Precisa obter offset e inverse world primeiro
		this.runtime.stdcall(
			Granny2.exports.GrannyBuildMeshBinding4x4Array,
			meshBinding,
			worldPose,
			0, // Offset 4x4 (identity)
			0, // Count
			matrixBuffer
		);
	}

	/**
	 * Obtém os bone indices como array JavaScript
	 * @param {number} meshBinding - Ponteiro do mesh binding
	 * @param {number} boneCount - Número de bones
	 * @returns {Int32Array} Array de índices
	 */
	function GetMeshBindingBoneIndicesArray(meshBinding, boneCount) {
		var indicesPtr = this.GetMeshBindingToBoneIndices(meshBinding);
		if (!indicesPtr) return new Int32Array(0);

		var indices = new Int32Array(boneCount);
		var physAddr = this.runtime.cpu.translate_address_read(indicesPtr);

		for (var i = 0; i < boneCount; i++) {
			indices[i] = this.runtime.cpu.memory.read32s(physAddr + i * 4);
		}

		return indices;
	}

	// ============================================
	// FUNÇÕES DE MATERIAL E TEXTURA
	// ============================================

	/**
	 * Obtém textura de um material por tipo
	 * @param {number} materialPtr - Ponteiro do material
	 * @param {string} textureType - Tipo da textura (ex: "DiffuseTexture")
	 * @returns {number} Ponteiro da textura ou 0
	 */
	function GetMaterialTextureByType(materialPtr, textureType) {
		// Aloca string na memória
		var typeBytes = [];
		for (var i = 0; i < textureType.length; i++) {
			typeBytes.push(textureType.charCodeAt(i));
		}
		typeBytes.push(0); // null terminator

		var typePtr = this.runtime.allocator.alloc(typeBytes.length);
		for (var i = 0; i < typeBytes.length; i++) {
			this.runtime.cpu.memory.write8(
				this.runtime.cpu.translate_address_write(typePtr + i),
				typeBytes[i]
			);
		}

		var result = this.runtime.stdcall(
			Granny2.exports.GrannyGetMaterialTextureByType,
			materialPtr,
			typePtr
		);

		this.runtime.allocator.free(typePtr);
		return result;
	}

	/**
	 * Obtém todos os materiais de um mesh
	 * @param {number} meshPtr - Ponteiro do mesh
	 * @returns {Array} Array de objetos material
	 */
	function GetMeshMaterials(meshPtr) {
		var mesh = Granny2.readStructure(
			this.runtime.cpu,
			meshPtr,
			Granny2.structs.granny_mesh
		);

		var materials = [];

		for (var i = 0; i < mesh.MaterialsBindingCount; i++) {
			var bindingPtr = this.runtime.get_dword_ptr(mesh.MaterialBindings + i * 4);

			if (bindingPtr) {
				var binding = Granny2.readStructure(
					this.runtime.cpu,
					bindingPtr,
					Granny2.structs.granny_material_binding
				);

				if (binding.Material) {
					var material = Granny2.readStructure(
						this.runtime.cpu,
						binding.Material,
						Granny2.structs.granny_material
					);
					material._ptr = binding.Material;
					material._index = i;
					materials.push(material);
				}
			}
		}

		return materials;
	}

	/**
	 * Obtém os mapas de um material
	 * @param {number} materialPtr - Ponteiro do material
	 * @returns {Array} Array de objetos material map
	 */
	function GetMaterialMaps(materialPtr) {
		var material = Granny2.readStructure(
			this.runtime.cpu,
			materialPtr,
			Granny2.structs.granny_material
		);

		var maps = [];

		for (var i = 0; i < material.MapCount; i++) {
			var mapPtr = this.runtime.get_dword_ptr(material.Maps + i * 4);

			if (mapPtr) {
				var map = Granny2.readStructure(
					this.runtime.cpu,
					mapPtr,
					Granny2.structs.granny_material_map
				);
				map._ptr = mapPtr;
				maps.push(map);
			}
		}

		return maps;
	}

	// ============================================
	// FUNÇÕES DE TOPOLOGIA E GRUPOS DE TRIÂNGULOS
	// ============================================

	/**
	 * Obtém grupos de triângulos do mesh (por material)
	 * @param {number} meshPtr - Ponteiro do mesh
	 * @returns {Array} Array de { materialIndex, triFirst, triCount }
	 */
	function GetMeshTriangleGroups(meshPtr) {
		var mesh = Granny2.readStructure(
			this.runtime.cpu,
			meshPtr,
			Granny2.structs.granny_mesh
		);

		if (!mesh.PrimaryTopology) return [];

		var groupCount = this.runtime.stdcall(
			Granny2.exports.GrannyGetMeshTriangleGroupCount,
			meshPtr
		);

		var groupsPtr = this.runtime.stdcall(
			Granny2.exports.GrannyGetMeshTriangleGroups,
			meshPtr
		);

		var groups = [];

		for (var i = 0; i < groupCount; i++) {
			var groupOffset = groupsPtr + i * 12; // 3 ints * 4 bytes
			groups.push({
				materialIndex: this.runtime.get_dword_ptr(groupOffset),
				triFirst: this.runtime.get_dword_ptr(groupOffset + 4),
				triCount: this.runtime.get_dword_ptr(groupOffset + 8)
			});
		}

		return groups;
	}

	/**
	 * Obtém contagem de grupos de triângulos
	 * @param {number} meshPtr - Ponteiro do mesh
	 * @returns {number}
	 */
	function GetMeshTriangleGroupCount(meshPtr) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyGetMeshTriangleGroupCount,
			meshPtr
		);
	}

	/**
	 * Obtém bytes por índice do mesh
	 * @param {number} meshPtr - Ponteiro do mesh
	 * @returns {number} 2 ou 4
	 */
	function GetMeshBytesPerIndex(meshPtr) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyGetMeshBytesPerIndex,
			meshPtr
		);
	}

	// ============================================
	// FUNÇÕES DE SKELETON E BONES
	// ============================================

	/**
	 * Encontra bone por nome
	 * @param {number} skeletonPtr - Ponteiro do skeleton
	 * @param {string} boneName - Nome do bone
	 * @returns {number} Índice do bone ou -1 se não encontrado
	 */
	function FindBoneByName(skeletonPtr, boneName) {
		// Aloca string na memória
		var nameBytes = [];
		for (var i = 0; i < boneName.length; i++) {
			nameBytes.push(boneName.charCodeAt(i));
		}
		nameBytes.push(0);

		var namePtr = this.runtime.allocator.alloc(nameBytes.length);
		for (var i = 0; i < nameBytes.length; i++) {
			this.runtime.cpu.memory.write8(
				this.runtime.cpu.translate_address_write(namePtr + i),
				nameBytes[i]
			);
		}

		// Aloca espaço para resultado
		var resultPtr = this.runtime.allocator.alloc(4);

		var found = this.runtime.stdcall(
			Granny2.exports.GrannyFindBoneByName,
			skeletonPtr,
			namePtr,
			resultPtr
		);

		var boneIndex = -1;
		if (found) {
			boneIndex = this.runtime.get_dword_ptr(resultPtr);
		}

		this.runtime.allocator.free(namePtr);
		this.runtime.allocator.free(resultPtr);

		return boneIndex;
	}

	/**
	 * Obtém todos os bones de um skeleton
	 * @param {number} skeletonPtr - Ponteiro do skeleton
	 * @returns {Array} Array de objetos bone
	 */
	function GetSkeletonBones(skeletonPtr) {
		var skeleton = Granny2.readStructure(
			this.runtime.cpu,
			skeletonPtr,
			Granny2.structs.granny_skeleton
		);

		var bones = [];

		for (var i = 0; i < skeleton.BoneCount; i++) {
			var bone = this.GetBoneInfo(skeletonPtr, i);
			if (bone) {
				bone._index = i;
				bones.push(bone);
			}
		}

		return bones;
	}

	/**
	 * Obtém hierarquia de bones como árvore
	 * @param {number} skeletonPtr - Ponteiro do skeleton
	 * @returns {Object} Objeto com estrutura de árvore
	 */
	function GetBoneHierarchy(skeletonPtr) {
		var bones = this.GetSkeletonBones(skeletonPtr);
		var roots = [];
		var boneMap = {};

		// Primeiro passo: criar mapa e identificar roots
		for (var i = 0; i < bones.length; i++) {
			var bone = bones[i];
			bone.children = [];
			boneMap[i] = bone;

			if (bone.ParentIndex === -1) {
				roots.push(bone);
			}
		}

		// Segundo passo: construir hierarquia
		for (var i = 0; i < bones.length; i++) {
			var bone = bones[i];
			if (bone.ParentIndex !== -1 && boneMap[bone.ParentIndex]) {
				boneMap[bone.ParentIndex].children.push(bone);
			}
		}

		return {
			roots: roots,
			bones: bones,
			boneMap: boneMap
		};
	}

	// ============================================
	// FUNÇÕES DE TRANSFORMAÇÃO
	// ============================================

	/**
	 * Cria uma transformação identidade
	 * @returns {number} Ponteiro para transformação
	 */
	function MakeIdentity() {
		var transformPtr = this.runtime.allocator.alloc(68); // sizeof(granny_transform)

		this.runtime.stdcall(
			Granny2.exports.GrannyMakeIdentity,
			transformPtr
		);

		return transformPtr;
	}

	/**
	 * Zera uma transformação
	 * @param {number} transformPtr - Ponteiro da transformação
	 */
	function ZeroTransform(transformPtr) {
		this.runtime.stdcall(
			Granny2.exports.GrannyZeroTransform,
			transformPtr
		);
	}

	/**
	 * Constrói matriz 4x4 composta de uma transformação
	 * @param {number} transformPtr - Ponteiro da transformação
	 * @returns {Float32Array} Matriz 4x4
	 */
	function BuildCompositeTransform4x4(transformPtr) {
		var matrixPtr = this.runtime.allocator.alloc(64); // 16 floats

		this.runtime.stdcall(
			Granny2.exports.GrannyBuildCompositeTransform4x4,
			transformPtr,
			matrixPtr
		);

		var physAddr = this.runtime.cpu.translate_address_read(matrixPtr);
		var matrix = new Float32Array(16);
		var floatView = new Float32Array(
			this.runtime.cpu.memory.buffer,
			physAddr,
			16
		);
		matrix.set(floatView);

		this.runtime.allocator.free(matrixPtr);

		return matrix;
	}

	/**
	 * Transforma um ponto
	 * @param {number} transformPtr - Ponteiro da transformação
	 * @param {Array} point - Ponto [x, y, z]
	 * @returns {Array} Ponto transformado [x, y, z]
	 */
	function TransformPoint(transformPtr, point) {
		var srcPtr = this.runtime.allocator.alloc(12);
		var dstPtr = this.runtime.allocator.alloc(12);

		// Copia ponto de entrada
		var srcPhys = this.runtime.cpu.translate_address_write(srcPtr);
		var floatView = new Float32Array(this.runtime.cpu.memory.buffer, srcPhys, 3);
		floatView[0] = point[0];
		floatView[1] = point[1];
		floatView[2] = point[2];

		this.runtime.stdcall(
			Granny2.exports.GrannyTransformPoint,
			transformPtr,
			srcPtr,
			dstPtr
		);

		// Lê resultado
		var dstPhys = this.runtime.cpu.translate_address_read(dstPtr);
		var resultView = new Float32Array(this.runtime.cpu.memory.buffer, dstPhys, 3);
		var result = [resultView[0], resultView[1], resultView[2]];

		this.runtime.allocator.free(srcPtr);
		this.runtime.allocator.free(dstPtr);

		return result;
	}

	// ============================================
	// FUNÇÕES DE TIMING
	// ============================================

	/**
	 * Obtém tempo atual do sistema Granny
	 * @returns {number} Ponteiro para estrutura de tempo (16 bytes)
	 */
	function GetSystemSeconds() {
		var timePtr = this.runtime.allocator.alloc(16);

		this.runtime.stdcall(
			Granny2.exports.GrannyGetSystemSeconds,
			timePtr
		);

		return timePtr;
	}

	/**
	 * Calcula segundos decorridos entre dois timestamps
	 * @param {number} startTimePtr - Ponteiro do tempo inicial
	 * @param {number} endTimePtr - Ponteiro do tempo final
	 * @returns {number} Segundos decorridos
	 */
	function GetSecondsElapsed(startTimePtr, endTimePtr) {
		var bits = this.runtime.stdcall(
			Granny2.exports.GrannyGetSecondsElapsed,
			startTimePtr,
			endTimePtr
		);
		return Granny2.bitsToFloat(bits);
	}

	/**
	 * Libera ponteiro de tempo
	 * @param {number} timePtr - Ponteiro do tempo
	 */
	function FreeTimePointer(timePtr) {
		if (timePtr) {
			this.runtime.allocator.free(timePtr);
		}
	}

	// ============================================
	// FUNÇÕES DE ANIMAÇÃO ADICIONAIS
	// ============================================

	/**
	 * Obtém tempo restante de um controle
	 * @param {number} control - Handle do controle
	 * @returns {number} Tempo restante em segundos
	 */
	function GetControlDurationLeft(control) {
		var bits = this.runtime.stdcall(
			Granny2.exports.GrannyGetControlDurationLeft,
			control
		);
		return Granny2.bitsToFloat(bits);
	}

	/**
	 * Obtém tempo local clampeado do controle
	 * @param {number} control - Handle do controle
	 * @returns {number} Tempo local
	 */
	function GetControlClampedLocalClock(control) {
		var bits = this.runtime.stdcall(
			Granny2.exports.GrannyGetControlClampedLocalClock,
			control
		);
		return Granny2.bitsToFloat(bits);
	}

	/**
	 * Obtém duração local do controle
	 * @param {number} control - Handle do controle
	 * @returns {number} Duração local
	 */
	function GetControlLocalDuration(control) {
		var bits = this.runtime.stdcall(
			Granny2.exports.GrannyGetControlLocalDuration,
			control
		);
		return Granny2.bitsToFloat(bits);
	}

	/**
	 * Define índice do loop atual
	 * @param {number} control - Handle do controle
	 * @param {number} loopIndex - Índice do loop
	 */
	function SetControlLoopIndex(control, loopIndex) {
		this.runtime.stdcall(
			Granny2.exports.GrannySetControlLoopIndex,
			control,
			loopIndex
		);
	}

	/**
	 * Cria um novo track mask
	 * @param {number} defaultWeight - Peso padrão
	 * @param {number} boneCount - Número de bones
	 * @returns {number} Ponteiro do track mask
	 */
	function NewTrackMask(defaultWeight, boneCount) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyNewTrackMask,
			Granny2.floatToBits(defaultWeight),
			boneCount
		);
	}

	/**
	 * Define peso de um bone no track mask
	 * @param {number} trackMask - Ponteiro do track mask
	 * @param {number} boneIndex - Índice do bone
	 * @param {number} weight - Peso (0.0 - 1.0)
	 */
	function SetTrackMaskBoneWeight(trackMask, boneIndex, weight) {
		this.runtime.stdcall(
			Granny2.exports.GrannySetTrackMaskBoneWeight,
			trackMask,
			boneIndex,
			Granny2.floatToBits(weight)
		);
	}

	/**
	 * Define track mask para um grupo de tracks
	 * @param {number} control - Handle do controle
	 * @param {number} trackGroupIndex - Índice do grupo
	 * @param {number} trackMask - Ponteiro do track mask
	 */
	function SetTrackGroupTrackMask(control, trackGroupIndex, trackMask) {
		this.runtime.stdcall(
			Granny2.exports.GrannySetTrackGroupTrackMask,
			control,
			trackGroupIndex,
			trackMask
		);
	}

	// ============================================
	// FUNÇÕES DE LOCAL POSE
	// ============================================

	/**
	 * Obtém transformação de um bone na local pose
	 * @param {number} localPose - Ponteiro da local pose
	 * @param {number} boneIndex - Índice do bone
	 * @returns {number} Ponteiro da transformação
	 */
	function GetLocalPoseTransform(localPose, boneIndex) {
		return this.runtime.stdcall(
			Granny2.exports.GrannyGetLocalPoseTransform,
			localPose,
			boneIndex
		);
	}

	/**
	 * Inicia acumulação de local pose
	 * @param {number} localPose - Ponteiro da local pose
	 * @param {number} boneCount - Número de bones
	 * @param {number} fillThreshold - Threshold de preenchimento
	 */
	function BeginLocalPoseAccumulation(localPose, boneCount, fillThreshold) {
		this.runtime.stdcall(
			Granny2.exports.GrannyBeginLocalPoseAccumulation,
			localPose,
			boneCount,
			Granny2.floatToBits(fillThreshold)
		);
	}

	/**
	 * Finaliza acumulação de local pose
	 * @param {number} localPose - Ponteiro da local pose
	 * @param {number} boneCount - Número de bones
	 * @param {number} skeleton - Ponteiro do skeleton
	 */
	function EndLocalPoseAccumulation(localPose, boneCount, skeleton) {
		this.runtime.stdcall(
			Granny2.exports.GrannyEndLocalPoseAccumulation,
			localPose,
			boneCount,
			skeleton,
			0, // allowUnfilledBones
			0  // fillUnfilledBonesWithIdentity
		);
	}

	// ============================================
	// FUNÇÕES DE ARQUIVO ADICIONAIS
	// ============================================

	/**
	 * Obtém informações da ferramenta de arte
	 * @param {number} fileInfoPtr - Ponteiro do file info
	 * @returns {Object|null} Informações ou null
	 */
	function GetArtToolInfo(fileInfoPtr) {
		var fileInfo = Granny2.readStructure(
			this.runtime.cpu,
			fileInfoPtr,
			Granny2.structs.granny_file_info
		);

		if (!fileInfo.ArtToolInfo) return null;

		return Granny2.readStructure(
			this.runtime.cpu,
			fileInfo.ArtToolInfo,
			additionalStructs.granny_art_tool_info
		);
	}

	/**
	 * Obtém informações do exportador
	 * @param {number} fileInfoPtr - Ponteiro do file info
	 * @returns {Object|null} Informações ou null
	 */
	function GetExporterInfo(fileInfoPtr) {
		var fileInfo = Granny2.readStructure(
			this.runtime.cpu,
			fileInfoPtr,
			Granny2.structs.granny_file_info
		);

		if (!fileInfo.ExporterInfo) return null;

		return Granny2.readStructure(
			this.runtime.cpu,
			fileInfo.ExporterInfo,
			additionalStructs.granny_exporter_info
		);
	}

	/**
	 * Obtém todas as texturas do arquivo
	 * @param {number} fileInfoPtr - Ponteiro do file info
	 * @returns {Array} Array de objetos textura
	 */
	function GetTextures(fileInfoPtr) {
		var fileInfo = Granny2.readStructure(
			this.runtime.cpu,
			fileInfoPtr,
			Granny2.structs.granny_file_info
		);

		var textures = [];

		for (var i = 0; i < fileInfo.TextureCount; i++) {
			var texPtr = this.runtime.get_dword_ptr(fileInfo.Textures + i * 4);
			if (texPtr) {
				var texture = Granny2.readStructure(
					this.runtime.cpu,
					texPtr,
					Granny2.structs.granny_texture
				);
				texture._ptr = texPtr;
				texture._index = i;
				textures.push(texture);
			}
		}

		return textures;
	}

	/**
	 * Obtém todos os track groups de uma animação
	 * @param {number} animationPtr - Ponteiro da animação
	 * @returns {Array} Array de objetos track group
	 */
	function GetAnimationTrackGroups(animationPtr) {
		var animation = Granny2.readStructure(
			this.runtime.cpu,
			animationPtr,
			Granny2.structs.granny_animation
		);

		var trackGroups = [];

		for (var i = 0; i < animation.TrackGroupCount; i++) {
			var tgPtr = this.runtime.get_dword_ptr(animation.TrackGroups + i * 4);
			if (tgPtr) {
				var trackGroup = Granny2.readStructure(
					this.runtime.cpu,
					tgPtr,
					Granny2.structs.granny_track_group
				);
				trackGroup._ptr = tgPtr;
				trackGroup._index = i;
				trackGroups.push(trackGroup);
			}
		}

		return trackGroups;
	}

	// ============================================
	// FUNÇÃO DE APLICAÇÃO
	// ============================================

	/**
	 * Aplica todas as funções adicionais ao Granny2
	 * @param {Function} Granny2Constructor - Construtor Granny2
	 */
	function applyAdditions(Granny2Constructor) {

		// Adiciona estruturas
		for (var key in additionalStructs) {
			if (!Granny2Constructor.structs[key]) {
				Granny2Constructor.structs[key] = additionalStructs[key];
			}
		}

		var api = Granny2Constructor.prototype;

		// Funções de liberação de memória
		api.FreeMeshBinding = FreeMeshBinding;
		api.FreeMeshDeformer = FreeMeshDeformer;
		api.FreeFile = FreeFile;
		api.FreeFileSection = FreeFileSection;
		api.FreeAllFileSections = FreeAllFileSections;
		api.FreeTrackMask = FreeTrackMask;

		// Funções de mesh binding
		api.GetMeshBindingToBoneIndices = GetMeshBindingToBoneIndices;
		api.MeshBindingIsTransferred = MeshBindingIsTransferred;
		api.GetMeshBinding4x4ArraySize = GetMeshBinding4x4ArraySize;
		api.BuildMeshBinding4x4Array = BuildMeshBinding4x4Array;
		api.GetMeshBindingBoneIndicesArray = GetMeshBindingBoneIndicesArray;

		// Funções de material
		api.GetMaterialTextureByType = GetMaterialTextureByType;
		api.GetMeshMaterials = GetMeshMaterials;
		api.GetMaterialMaps = GetMaterialMaps;

		// Funções de topologia
		api.GetMeshTriangleGroups = GetMeshTriangleGroups;
		api.GetMeshTriangleGroupCount = GetMeshTriangleGroupCount;
		api.GetMeshBytesPerIndex = GetMeshBytesPerIndex;

		// Funções de skeleton
		api.FindBoneByName = FindBoneByName;
		api.GetSkeletonBones = GetSkeletonBones;
		api.GetBoneHierarchy = GetBoneHierarchy;

		// Funções de transformação
		api.MakeIdentity = MakeIdentity;
		api.ZeroTransform = ZeroTransform;
		api.BuildCompositeTransform4x4 = BuildCompositeTransform4x4;
		api.TransformPoint = TransformPoint;

		// Funções de timing
		api.GetSystemSeconds = GetSystemSeconds;
		api.GetSecondsElapsed = GetSecondsElapsed;
		api.FreeTimePointer = FreeTimePointer;

		// Funções de animação adicionais
		api.GetControlDurationLeft = GetControlDurationLeft;
		api.GetControlClampedLocalClock = GetControlClampedLocalClock;
		api.GetControlLocalDuration = GetControlLocalDuration;
		api.SetControlLoopIndex = SetControlLoopIndex;
		api.NewTrackMask = NewTrackMask;
		api.SetTrackMaskBoneWeight = SetTrackMaskBoneWeight;
		api.SetTrackGroupTrackMask = SetTrackGroupTrackMask;

		// Funções de local pose
		api.GetLocalPoseTransform = GetLocalPoseTransform;
		api.BeginLocalPoseAccumulation = BeginLocalPoseAccumulation;
		api.EndLocalPoseAccumulation = EndLocalPoseAccumulation;

		// Funções de arquivo adicionais
		api.GetArtToolInfo = GetArtToolInfo;
		api.GetExporterInfo = GetExporterInfo;
		api.GetTextures = GetTextures;
		api.GetAnimationTrackGroups = GetAnimationTrackGroups;

		console.log('[granny2_additions] Applied ' + Object.keys(api).length + ' functions to Granny2');
	}

	// ============================================
	// EXPORTS
	// ============================================

	exports.Granny2Additions = {
		apply: applyAdditions,
		structs: additionalStructs,

		// Exporta funções individuais caso precise
		functions: {
			FreeMeshBinding: FreeMeshBinding,
			FreeMeshDeformer: FreeMeshDeformer,
			FreeFile: FreeFile,
			FreeFileSection: FreeFileSection,
			FreeAllFileSections: FreeAllFileSections,
			FreeTrackMask: FreeTrackMask,
			GetMeshBindingToBoneIndices: GetMeshBindingToBoneIndices,
			MeshBindingIsTransferred: MeshBindingIsTransferred,
			GetMaterialTextureByType: GetMaterialTextureByType,
			GetMeshMaterials: GetMeshMaterials,
			GetMeshTriangleGroups: GetMeshTriangleGroups,
			FindBoneByName: FindBoneByName,
			GetSkeletonBones: GetSkeletonBones,
			GetBoneHierarchy: GetBoneHierarchy,
			MakeIdentity: MakeIdentity,
			BuildCompositeTransform4x4: BuildCompositeTransform4x4,
			TransformPoint: TransformPoint,
			GetSystemSeconds: GetSystemSeconds,
			GetSecondsElapsed: GetSecondsElapsed,
			GetControlDurationLeft: GetControlDurationLeft,
			NewTrackMask: NewTrackMask,
			SetTrackMaskBoneWeight: SetTrackMaskBoneWeight,
			GetLocalPoseTransform: GetLocalPoseTransform,
			GetArtToolInfo: GetArtToolInfo,
			GetExporterInfo: GetExporterInfo,
			GetTextures: GetTextures,
			GetAnimationTrackGroups: GetAnimationTrackGroups
		}
	};

})(this);
