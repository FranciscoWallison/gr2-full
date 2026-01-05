/**
 * granny2_test.js
 * 
 * Suite de testes para validar o wrapper granny2.js
 * 
 * REQUISITOS:
 * - granny2.js
 * - granny2_additions.js (opcional)
 * - granny2.dll (binário)
 * - Arquivo .gr2 de teste
 * - Win32Runtime (emulador)
 * 
 * USO:
 * 1. No browser: inclua os scripts e chame Granny2Test.runAll(granny, gr2Buffer)
 * 2. No Node.js: require e execute
 */

(function(exports) {

    'use strict';

    // ============================================
    // CONFIGURAÇÃO DE TESTES
    // ============================================

    var TestConfig = {
        verbose: true,          // Log detalhado
        stopOnError: false,     // Para no primeiro erro
        timeout: 5000,          // Timeout por teste (ms)
        expectedVersion: [2, 1, 0, 5]  // Versão esperada da DLL
    };

    // ============================================
    // UTILIDADES DE TESTE
    // ============================================

    var testResults = {
        passed: 0,
        failed: 0,
        skipped: 0,
        errors: []
    };

    function log(message, type) {
        if (!TestConfig.verbose && type === 'info') return;
        
        var prefix = {
            'info': '[INFO]',
            'pass': '[PASS]',
            'fail': '[FAIL]',
            'warn': '[WARN]',
            'error': '[ERROR]'
        }[type] || '[LOG]';

        var color = {
            'pass': '\x1b[32m',
            'fail': '\x1b[31m',
            'warn': '\x1b[33m',
            'error': '\x1b[31m',
            'info': '\x1b[36m'
        }[type] || '';

        var reset = '\x1b[0m';

        console.log(color + prefix + reset + ' ' + message);
    }

    function assert(condition, message) {
        if (condition) {
            testResults.passed++;
            log(message, 'pass');
            return true;
        } else {
            testResults.failed++;
            testResults.errors.push(message);
            log(message, 'fail');
            if (TestConfig.stopOnError) {
                throw new Error('Test failed: ' + message);
            }
            return false;
        }
    }

    function assertEqual(actual, expected, message) {
        var condition = actual === expected;
        var fullMessage = message + ' (expected: ' + expected + ', got: ' + actual + ')';
        return assert(condition, fullMessage);
    }

    function assertNotNull(value, message) {
        return assert(value !== null && value !== undefined && value !== 0, message);
    }

    function assertGreaterThan(actual, threshold, message) {
        var condition = actual > threshold;
        var fullMessage = message + ' (got: ' + actual + ', threshold: ' + threshold + ')';
        return assert(condition, fullMessage);
    }

    function assertArray(value, message) {
        return assert(Array.isArray(value), message + ' (is array)');
    }

    function assertType(value, type, message) {
        return assert(typeof value === type, message + ' (type: ' + typeof value + ', expected: ' + type + ')');
    }

    function skip(message) {
        testResults.skipped++;
        log(message + ' - SKIPPED', 'warn');
    }

    // ============================================
    // TESTES DE INICIALIZAÇÃO
    // ============================================

    function testVersionMatch(granny) {
        log('=== Teste de Versão ===', 'info');

        var v = TestConfig.expectedVersion;
        var result = granny.VersionMatch(v[0], v[1], v[2], v[3]);
        
        assert(result, 'Versão da DLL deve ser ' + v.join('.'));

        // Testa versão inválida
        var wrongVersion = granny.VersionMatch(3, 0, 0, 0);
        assert(!wrongVersion, 'Versão 3.0.0.0 deve falhar');

        return result;
    }

    // ============================================
    // TESTES DE CARREGAMENTO DE ARQUIVO
    // ============================================

    function testFileLoading(granny, gr2Buffer) {
        log('=== Teste de Carregamento ===', 'info');

        // Carrega arquivo
        var grannyFile = granny.ReadEntireFileFromMemory(gr2Buffer);
        assertNotNull(grannyFile, 'ReadEntireFileFromMemory deve retornar ponteiro válido');

        if (!grannyFile) return null;

        // Obtém file info
        var fileInfo = granny.GetFileInfo(grannyFile);
        assertNotNull(fileInfo, 'GetFileInfo deve retornar ponteiro válido');

        return { grannyFile: grannyFile, fileInfo: fileInfo };
    }

    // ============================================
    // TESTES DE FILE INFO
    // ============================================

    function testFileInfoStructure(granny, fileInfoPtr) {
        log('=== Teste de FileInfo ===', 'info');

        var fileInfo = Granny2.readStructure(
            granny.runtime.cpu,
            fileInfoPtr,
            Granny2.structs.granny_file_info
        );

        assertNotNull(fileInfo, 'FileInfo structure deve ser válida');

        log('FileInfo contents:', 'info');
        log('  - TextureCount: ' + fileInfo.TextureCount, 'info');
        log('  - MaterialCount: ' + fileInfo.MaterialCount, 'info');
        log('  - SkeletonCount: ' + fileInfo.SkeletonCount, 'info');
        log('  - MeshCount: ' + fileInfo.MeshCount, 'info');
        log('  - ModelCount: ' + fileInfo.ModelCount, 'info');
        log('  - AnimationCount: ' + fileInfo.AnimationCount, 'info');
        log('  - FromFileName: ' + fileInfo.FromFileName, 'info');

        // Validações básicas
        assertGreaterThan(fileInfo.ModelCount, -1, 'ModelCount deve ser >= 0');
        assertGreaterThan(fileInfo.MeshCount, -1, 'MeshCount deve ser >= 0');

        return fileInfo;
    }

    // ============================================
    // TESTES DE MODELO
    // ============================================

    function testModel(granny, fileInfo) {
        log('=== Teste de Modelo ===', 'info');

        if (fileInfo.ModelCount === 0) {
            skip('Nenhum modelo no arquivo');
            return null;
        }

        // Lê primeiro modelo
        var models = fileInfo.Models;
        assertArray(models, 'Models deve ser array');
        
        if (models.length === 0) {
            skip('Array de modelos vazio');
            return null;
        }

        var model = models[0];
        assertNotNull(model, 'Primeiro modelo deve existir');

        log('Model: ' + model.Name, 'info');
        log('  - MeshBindingsCount: ' + model.MeshBindingsCount, 'info');

        // Testa instanciação
        var modelInstance = granny.InstantiateModel(model._ptr);
        assertNotNull(modelInstance, 'InstantiateModel deve retornar instância válida');

        return { model: model, instance: modelInstance };
    }

    // ============================================
    // TESTES DE SKELETON
    // ============================================

    function testSkeleton(granny, fileInfo, modelInstance) {
        log('=== Teste de Skeleton ===', 'info');

        if (fileInfo.SkeletonCount === 0) {
            skip('Nenhum skeleton no arquivo');
            return null;
        }

        // Obtém skeleton do modelo
        var skeletonPtr = granny.GetSourceSkeleton(modelInstance);
        assertNotNull(skeletonPtr, 'GetSourceSkeleton deve retornar ponteiro válido');

        if (!skeletonPtr) return null;

        var skeleton = Granny2.readStructure(
            granny.runtime.cpu,
            skeletonPtr,
            Granny2.structs.granny_skeleton
        );

        assertNotNull(skeleton, 'Skeleton structure deve ser válida');
        assertGreaterThan(skeleton.BoneCount, 0, 'Skeleton deve ter pelo menos 1 bone');

        log('Skeleton: ' + skeleton.Name, 'info');
        log('  - BoneCount: ' + skeleton.BoneCount, 'info');

        // Testa leitura de bones
        if (granny.GetBoneInfo) {
            var bone = granny.GetBoneInfo(skeletonPtr, 0);
            if (bone) {
                log('  - First bone: ' + bone.Name + ' (parent: ' + bone.ParentIndex + ')', 'info');
            }
        }

        return { skeleton: skeleton, ptr: skeletonPtr };
    }

    // ============================================
    // TESTES DE MESH
    // ============================================

    function testMesh(granny, fileInfo) {
        log('=== Teste de Mesh ===', 'info');

        if (fileInfo.MeshCount === 0) {
            skip('Nenhuma mesh no arquivo');
            return null;
        }

        var meshes = fileInfo.Meshes;
        assertArray(meshes, 'Meshes deve ser array');

        if (meshes.length === 0) {
            skip('Array de meshes vazio');
            return null;
        }

        var mesh = meshes[0];
        assertNotNull(mesh, 'Primeira mesh deve existir');

        log('Mesh: ' + mesh.Name, 'info');

        // Testa contagens
        var vertexCount = granny.GetMeshVertexCount(mesh._ptr);
        var indexCount = granny.GetMeshIndexCount(mesh._ptr);

        assertGreaterThan(vertexCount, 0, 'Mesh deve ter vértices');
        assertGreaterThan(indexCount, 0, 'Mesh deve ter índices');

        log('  - VertexCount: ' + vertexCount, 'info');
        log('  - IndexCount: ' + indexCount, 'info');

        // Testa tipo de vértice
        var vertexType = granny.GetMeshVertexType(mesh._ptr);
        assertNotNull(vertexType, 'GetMeshVertexType deve retornar tipo válido');

        // Testa se é rígida
        var isRigid = granny.MeshIsRigid(mesh._ptr);
        log('  - IsRigid: ' + isRigid, 'info');

        // Testa cópia de vértices
        var vertices = granny.CopyMeshVertices(mesh._ptr);
        assertNotNull(vertices, 'CopyMeshVertices deve retornar dados');
        assertEqual(vertices.length, vertexCount * 32, 'Tamanho de vértices deve ser correto (PNT332 = 32 bytes)');

        // Testa cópia de índices
        var indices = granny.CopyMeshIndices(mesh._ptr);
        assertNotNull(indices, 'CopyMeshIndices deve retornar dados');

        return { mesh: mesh, vertexCount: vertexCount, indexCount: indexCount };
    }

    // ============================================
    // TESTES DE ANIMAÇÃO
    // ============================================

    function testAnimation(granny, fileInfoPtr) {
        log('=== Teste de Animação ===', 'info');

        // Usa helper se disponível
        var animations = granny.GetAnimations ? 
            granny.GetAnimations(fileInfoPtr) : [];

        if (animations.length === 0) {
            skip('Nenhuma animação no arquivo');
            return null;
        }

        var anim = animations[0];
        assertNotNull(anim, 'Primeira animação deve existir');

        log('Animation: ' + anim.name, 'info');
        log('  - Duration: ' + anim.duration + 's', 'info');
        log('  - TimeStep: ' + anim.timeStep, 'info');
        log('  - TrackGroupCount: ' + anim.trackGroupCount, 'info');

        assertGreaterThan(anim.duration, 0, 'Duração deve ser > 0');

        return anim;
    }

    // ============================================
    // TESTES DE CONTROLE DE ANIMAÇÃO
    // ============================================

    function testAnimationControl(granny, modelInstance, animationPtr) {
        log('=== Teste de Controle de Animação ===', 'info');

        if (!modelInstance || !animationPtr) {
            skip('Modelo ou animação não disponível');
            return null;
        }

        // Inicia animação
        var control = granny.PlayControlledAnimation(0.0, animationPtr, modelInstance);
        assertNotNull(control, 'PlayControlledAnimation deve retornar controle válido');

        if (!control) return null;

        // Testa propriedades do controle
        var isActive = granny.ControlIsActive(control);
        assert(isActive, 'Controle deve estar ativo inicialmente');

        var isComplete = granny.ControlIsComplete(control);
        assert(!isComplete, 'Controle não deve estar completo no início');

        // Testa set/get clock
        granny.SetControlClock(control, 0.5);
        var clock = granny.GetControlClock(control);
        log('  - Clock após SetControlClock(0.5): ' + clock, 'info');

        // Testa set/get speed
        granny.SetControlSpeed(control, 2.0);
        var speed = granny.GetControlSpeed(control);
        log('  - Speed após SetControlSpeed(2.0): ' + speed, 'info');

        // Testa set/get weight
        granny.SetControlWeight(control, 0.75);
        var weight = granny.GetControlWeight(control);
        log('  - Weight após SetControlWeight(0.75): ' + weight, 'info');

        // Testa loop count
        granny.SetControlLoopCount(control, 3);
        var loopCount = granny.GetControlLoopCount(control);
        assertEqual(loopCount, 3, 'Loop count deve ser 3');

        // Testa duração
        var duration = granny.GetControlDuration(control);
        assertGreaterThan(duration, 0, 'Duração do controle deve ser > 0');
        log('  - Duration: ' + duration + 's', 'info');

        // Cleanup
        granny.FreeControl(control);
        log('  - Controle liberado com FreeControl', 'info');

        return true;
    }

    // ============================================
    // TESTES DE POSE
    // ============================================

    function testPose(granny, skeletonData, modelInstance) {
        log('=== Teste de Pose ===', 'info');

        if (!skeletonData) {
            skip('Skeleton não disponível');
            return null;
        }

        var boneCount = skeletonData.skeleton.BoneCount;

        // Cria world pose
        var worldPose = granny.NewWorldPose(boneCount);
        assertNotNull(worldPose, 'NewWorldPose deve retornar ponteiro válido');

        if (!worldPose) return null;

        // Cria local pose
        var localPose = granny.NewLocalPose(boneCount);
        assertNotNull(localPose, 'NewLocalPose deve retornar ponteiro válido');

        // Testa GetWorldPoseBoneCount
        var poseBoneCount = granny.GetWorldPoseBoneCount(worldPose);
        assertEqual(poseBoneCount, boneCount, 'WorldPose bone count deve corresponder');

        // Testa BuildWorldPose
        granny.BuildWorldPose(
            skeletonData.ptr,
            0,              // firstBone
            boneCount,      // boneCount
            localPose,      // localPose
            0,              // offset4x4 (identity)
            worldPose       // worldPose
        );
        log('  - BuildWorldPose executado', 'info');

        // Testa GetWorldPoseMatrices (helper)
        if (granny.GetWorldPoseMatrices) {
            var matrices = granny.GetWorldPoseMatrices(worldPose, boneCount);
            assertNotNull(matrices, 'GetWorldPoseMatrices deve retornar Float32Array');
            assertEqual(matrices.length, boneCount * 16, 'Matrizes devem ter tamanho correto');
            log('  - GetWorldPoseMatrices retornou ' + matrices.length + ' floats', 'info');
        }

        // Cleanup
        granny.FreeWorldPose(worldPose);
        granny.FreeLocalPose(localPose);
        log('  - Poses liberadas', 'info');

        return true;
    }

    // ============================================
    // TESTES DE MESH BINDING E DEFORMAÇÃO
    // ============================================

    function testMeshBindingAndDeform(granny, meshData, skeletonData) {
        log('=== Teste de Mesh Binding e Deformação ===', 'info');

        if (!meshData || !skeletonData) {
            skip('Mesh ou skeleton não disponível');
            return null;
        }

        var meshPtr = meshData.mesh._ptr;
        var skeletonPtr = skeletonData.ptr;

        // Verifica se mesh é rígida
        var isRigid = granny.MeshIsRigid(meshPtr);
        if (isRigid) {
            log('  - Mesh é rígida, pulando teste de skinning', 'info');
            return true;
        }

        // Cria mesh binding
        var meshBinding = granny.NewMeshBinding(meshPtr, skeletonPtr, skeletonPtr);
        assertNotNull(meshBinding, 'NewMeshBinding deve retornar ponteiro válido');

        if (!meshBinding) return null;

        // Testa GetMeshBindingToBoneIndices (se disponível)
        if (granny.GetMeshBindingToBoneIndices) {
            var boneIndices = granny.GetMeshBindingToBoneIndices(meshBinding);
            assertNotNull(boneIndices, 'GetMeshBindingToBoneIndices deve retornar ponteiro');
            log('  - BoneIndices pointer: 0x' + boneIndices.toString(16), 'info');
        }

        // Cria mesh deformer
        var vertexType = granny.GetMeshVertexType(meshPtr);
        var deformer = granny.NewMeshDeformer(vertexType);
        assertNotNull(deformer, 'NewMeshDeformer deve retornar ponteiro válido');

        // Cleanup
        if (granny.FreeMeshDeformer) {
            granny.FreeMeshDeformer(deformer);
            log('  - Deformer liberado', 'info');
        }

        if (granny.FreeMeshBinding) {
            granny.FreeMeshBinding(meshBinding);
            log('  - MeshBinding liberado', 'info');
        }

        return true;
    }

    // ============================================
    // TESTES DE MATERIAL (se additions carregado)
    // ============================================

    function testMaterials(granny, meshData) {
        log('=== Teste de Materiais ===', 'info');

        if (!granny.GetMeshMaterials) {
            skip('GetMeshMaterials não disponível (additions não carregado)');
            return null;
        }

        if (!meshData) {
            skip('Mesh não disponível');
            return null;
        }

        var materials = granny.GetMeshMaterials(meshData.mesh._ptr);
        assertArray(materials, 'GetMeshMaterials deve retornar array');

        log('  - MaterialCount: ' + materials.length, 'info');

        for (var i = 0; i < materials.length; i++) {
            var mat = materials[i];
            log('  - Material[' + i + ']: ' + mat.Name, 'info');
        }

        return materials;
    }

    // ============================================
    // TESTES DE TRIANGLE GROUPS (se additions carregado)
    // ============================================

    function testTriangleGroups(granny, meshData) {
        log('=== Teste de Triangle Groups ===', 'info');

        if (!granny.GetMeshTriangleGroups) {
            skip('GetMeshTriangleGroups não disponível');
            return null;
        }

        if (!meshData) {
            skip('Mesh não disponível');
            return null;
        }

        var groups = granny.GetMeshTriangleGroups(meshData.mesh._ptr);
        assertArray(groups, 'GetMeshTriangleGroups deve retornar array');

        log('  - GroupCount: ' + groups.length, 'info');

        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            log('  - Group[' + i + ']: material=' + g.materialIndex + 
                ', triFirst=' + g.triFirst + ', triCount=' + g.triCount, 'info');
        }

        return groups;
    }

    // ============================================
    // TESTE DE MEMORY LEAK (básico)
    // ============================================

    function testMemoryLeak(granny, gr2Buffer) {
        log('=== Teste de Memory Leak (básico) ===', 'info');

        var iterations = 10;
        var initialAllocs = granny.runtime.allocator.getAllocCount ? 
            granny.runtime.allocator.getAllocCount() : -1;

        for (var i = 0; i < iterations; i++) {
            var file = granny.ReadEntireFileFromMemory(gr2Buffer);
            var info = granny.GetFileInfo(file);

            // Processa minimamente
            var fileInfo = Granny2.readStructure(
                granny.runtime.cpu,
                info,
                Granny2.structs.granny_file_info
            );

            // Libera
            if (granny.FreeFile) {
                granny.FreeFile(file);
            }
        }

        var finalAllocs = granny.runtime.allocator.getAllocCount ?
            granny.runtime.allocator.getAllocCount() : -1;

        if (initialAllocs >= 0 && finalAllocs >= 0) {
            var leaked = finalAllocs - initialAllocs;
            log('  - Allocações iniciais: ' + initialAllocs, 'info');
            log('  - Allocações finais: ' + finalAllocs, 'info');
            log('  - Possível leak: ' + leaked + ' allocações', leaked > 0 ? 'warn' : 'info');
        } else {
            log('  - Allocator não suporta contagem de allocações', 'info');
        }

        return true;
    }

    // ============================================
    // EXECUTOR PRINCIPAL
    // ============================================

    function runAllTests(granny, gr2Buffer, options) {
        options = options || {};
        
        if (options.verbose !== undefined) TestConfig.verbose = options.verbose;
        if (options.stopOnError !== undefined) TestConfig.stopOnError = options.stopOnError;

        // Reset resultados
        testResults = { passed: 0, failed: 0, skipped: 0, errors: [] };

        console.log('\n========================================');
        console.log('  GRANNY2.JS TEST SUITE');
        console.log('========================================\n');

        var startTime = Date.now();

        try {
            // 1. Teste de versão
            testVersionMatch(granny);

            // 2. Carrega arquivo
            var fileData = testFileLoading(granny, gr2Buffer);
            if (!fileData) {
                throw new Error('Falha ao carregar arquivo - abortando testes');
            }

            // 3. Testa estrutura do FileInfo
            var fileInfo = testFileInfoStructure(granny, fileData.fileInfo);

            // 4. Testa modelo
            var modelData = testModel(granny, fileInfo);

            // 5. Testa skeleton
            var skeletonData = null;
            if (modelData && modelData.instance) {
                skeletonData = testSkeleton(granny, fileInfo, modelData.instance);
            }

            // 6. Testa mesh
            var meshData = testMesh(granny, fileInfo);

            // 7. Testa animação
            var animation = testAnimation(granny, fileData.fileInfo);

            // 8. Testa controle de animação
            if (modelData && animation) {
                testAnimationControl(granny, modelData.instance, animation.ptr);
            }

            // 9. Testa pose
            testPose(granny, skeletonData, modelData ? modelData.instance : null);

            // 10. Testa mesh binding e deformação
            testMeshBindingAndDeform(granny, meshData, skeletonData);

            // 11. Testa materiais (additions)
            testMaterials(granny, meshData);

            // 12. Testa triangle groups (additions)
            testTriangleGroups(granny, meshData);

            // 13. Teste de memory leak
            testMemoryLeak(granny, gr2Buffer);

            // Cleanup final
            if (modelData && modelData.instance) {
                granny.FreeModelInstance(modelData.instance);
            }
            if (granny.FreeFile) {
                granny.FreeFile(fileData.grannyFile);
            }

        } catch (e) {
            log('Exceção durante testes: ' + e.message, 'error');
            console.error(e.stack);
            testResults.failed++;
            testResults.errors.push(e.message);
        }

        var endTime = Date.now();
        var duration = (endTime - startTime) / 1000;

        // Sumário
        console.log('\n========================================');
        console.log('  RESULTADOS');
        console.log('========================================');
        console.log('  Passou:  ' + testResults.passed);
        console.log('  Falhou:  ' + testResults.failed);
        console.log('  Pulados: ' + testResults.skipped);
        console.log('  Tempo:   ' + duration.toFixed(2) + 's');
        console.log('========================================\n');

        if (testResults.errors.length > 0) {
            console.log('ERROS:');
            testResults.errors.forEach(function(err, i) {
                console.log('  ' + (i + 1) + '. ' + err);
            });
            console.log('');
        }

        return testResults;
    }

    // ============================================
    // TESTE RÁPIDO (apenas carregamento)
    // ============================================

    function quickTest(granny, gr2Buffer) {
        console.log('\n=== QUICK TEST ===\n');

        try {
            // Versão
            var versionOk = granny.VersionMatch(2, 1, 0, 5);
            console.log('Version match: ' + (versionOk ? 'OK' : 'FAIL'));

            // Carrega
            var file = granny.ReadEntireFileFromMemory(gr2Buffer);
            console.log('File loaded: ' + (file ? 'OK (0x' + file.toString(16) + ')' : 'FAIL'));

            // FileInfo
            var info = granny.GetFileInfo(file);
            console.log('FileInfo: ' + (info ? 'OK (0x' + info.toString(16) + ')' : 'FAIL'));

            // Parse
            var fileInfo = Granny2.readStructure(
                granny.runtime.cpu,
                info,
                Granny2.structs.granny_file_info
            );

            console.log('\nFile contents:');
            console.log('  Models:     ' + fileInfo.ModelCount);
            console.log('  Meshes:     ' + fileInfo.MeshCount);
            console.log('  Skeletons:  ' + fileInfo.SkeletonCount);
            console.log('  Animations: ' + fileInfo.AnimationCount);
            console.log('  Textures:   ' + fileInfo.TextureCount);
            console.log('  Materials:  ' + fileInfo.MaterialCount);

            console.log('\n=== QUICK TEST PASSED ===\n');
            return true;

        } catch (e) {
            console.error('Quick test failed:', e);
            return false;
        }
    }

    // ============================================
    // VALIDAÇÃO DE DADOS EXPORTADOS
    // ============================================

    function validateExportedMesh(vertices, indices, vertexCount, indexCount) {
        var errors = [];

        // Valida vértices
        if (!vertices || vertices.length === 0) {
            errors.push('Vertices array is empty');
        } else {
            var expectedSize = vertexCount * 32; // PNT332
            if (vertices.length !== expectedSize) {
                errors.push('Vertices size mismatch: expected ' + expectedSize + ', got ' + vertices.length);
            }

            // Verifica se há NaN nos vértices
            var floatView = new Float32Array(vertices.buffer);
            for (var i = 0; i < floatView.length; i++) {
                if (isNaN(floatView[i])) {
                    errors.push('NaN found in vertices at index ' + i);
                    break;
                }
            }
        }

        // Valida índices
        if (!indices || indices.length === 0) {
            errors.push('Indices array is empty');
        } else {
            var indexView = new Uint16Array(indices.buffer);
            for (var i = 0; i < indexView.length; i++) {
                if (indexView[i] >= vertexCount) {
                    errors.push('Invalid index ' + indexView[i] + ' at position ' + i + ' (max: ' + (vertexCount - 1) + ')');
                    break;
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    // ============================================
    // EXPORTS
    // ============================================

    exports.Granny2Test = {
        runAll: runAllTests,
        quick: quickTest,
        validateMesh: validateExportedMesh,
        config: TestConfig,
        results: testResults,

        // Testes individuais
        tests: {
            version: testVersionMatch,
            fileLoading: testFileLoading,
            fileInfo: testFileInfoStructure,
            model: testModel,
            skeleton: testSkeleton,
            mesh: testMesh,
            animation: testAnimation,
            animationControl: testAnimationControl,
            pose: testPose,
            meshBinding: testMeshBindingAndDeform,
            materials: testMaterials,
            triangleGroups: testTriangleGroups,
            memoryLeak: testMemoryLeak
        },

        // Utilidades
        utils: {
            assert: assert,
            assertEqual: assertEqual,
            assertNotNull: assertNotNull,
            log: log
        }
    };

})(typeof exports !== 'undefined' ? exports : this);
