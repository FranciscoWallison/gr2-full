/**
 * granny2_test_cli.js
 * 
 * Script de teste para linha de comando (Node.js)
 * 
 * USO:
 *   node granny2_test_cli.js <granny2.dll> <arquivo.gr2>
 * 
 * EXEMPLO:
 *   node granny2_test_cli.js ./granny2.dll ./model.gr2
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============================================
// CARREGA DEPENDÊNCIAS NA ORDEM CORRETA
// ============================================

console.log('Carregando dependências...\n');

// Simula ambiente de browser para os scripts
global.window = global;
global.performance = {
    now: function() {
        const hr = process.hrtime();
        return hr[0] * 1000 + hr[1] / 1000000;
    }
};

// Diretório dos scripts
const scriptDir = __dirname;

// Função para carregar script no contexto global (como browser)
function loadScriptGlobal(filename) {
    const filepath = path.join(scriptDir, filename);
    const code = fs.readFileSync(filepath, 'utf8');
    vm.runInThisContext(code, { filename: filepath });
}

try {
    // 1. Carrega granny2_runtime.js (fornece v86, constantes, FPU)
    console.log('  Carregando granny2_runtime.js...');
    loadScriptGlobal('granny2_runtime.js');
    console.log('  ✓ granny2_runtime.js carregado');
    
    // 2. Carrega pe_env.js (fornece Win32Runtime, WIN32API)
    console.log('  Carregando pe_env.js...');
    loadScriptGlobal('pe_env.js');
    console.log('  ✓ pe_env.js carregado');
    
    // Verifica se Win32Runtime está disponível
    if (typeof Win32Runtime === 'undefined') {
        throw new Error('Win32Runtime não foi exportado corretamente');
    }
    console.log('  ✓ Win32Runtime disponível');
    
    // 3. Carrega granny2.js
    console.log('  Carregando granny2.js...');
    loadScriptGlobal('granny2.js');
    console.log('  ✓ granny2.js carregado');
    
    // Verifica se Granny2 está disponível
    if (typeof Granny2 === 'undefined') {
        throw new Error('Granny2 não foi exportado corretamente');
    }
    console.log('  ✓ Granny2 disponível');
    
    // 4. Carrega additions (opcional)
    try {
        console.log('  Carregando granny2_additions.js...');
        loadScriptGlobal('granny2_additions.js');
        if (typeof Granny2Additions !== 'undefined') {
            Granny2Additions.apply(Granny2);
            console.log('  ✓ Granny2Additions carregado e aplicado');
        }
    } catch (e) {
        console.log('  ⚠ granny2_additions.js não encontrado (opcional)');
    }
    
    // 5. Carrega testes
    console.log('  Carregando granny2_test.js...');
    loadScriptGlobal('granny2_test.js');
    console.log('  ✓ granny2_test.js carregado');
    
} catch (e) {
    console.error('\n✗ Erro ao carregar dependências:', e.message);
    console.error('\nCertifique-se de que os arquivos estão no diretório:');
    console.error('  ' + scriptDir);
    console.error('\nArquivos necessários:');
    console.error('  - granny2_runtime.js');
    console.error('  - pe_env.js');
    console.error('  - granny2.js');
    console.error('  - granny2_test.js');
    process.exit(1);
}

console.log('\n✓ Todas as dependências carregadas!\n');

// ============================================
// PROCESSA ARGUMENTOS
// ============================================

const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('USO: node granny2_test_cli.js <granny2.dll> <arquivo.gr2> [opções]');
    console.log('');
    console.log('OPÇÕES:');
    console.log('  --quick       Executa apenas teste rápido');
    console.log('  --verbose     Mostra logs detalhados');
    console.log('  --stop        Para no primeiro erro');
    console.log('');
    console.log('EXEMPLO:');
    console.log('  node granny2_test_cli.js granny2.dll model.gr2 --verbose');
    process.exit(1);
}

const dllPath = args[0];
const gr2Path = args[1];
const options = {
    quick: args.includes('--quick'),
    verbose: args.includes('--verbose'),
    stopOnError: args.includes('--stop')
};

// ============================================
// CARREGA ARQUIVOS
// ============================================

console.log('Carregando arquivos...');

let dllBuffer, gr2Buffer;

try {
    if (!fs.existsSync(dllPath)) {
        throw new Error('DLL não encontrada: ' + dllPath);
    }
    dllBuffer = new Uint8Array(fs.readFileSync(dllPath));
    console.log('✓ DLL carregada: ' + path.basename(dllPath) + ' (' + dllBuffer.length + ' bytes)');
} catch (e) {
    console.error('✗ Erro ao carregar DLL:', e.message);
    process.exit(1);
}

try {
    if (!fs.existsSync(gr2Path)) {
        throw new Error('Arquivo GR2 não encontrado: ' + gr2Path);
    }
    const gr2Data = fs.readFileSync(gr2Path);
    gr2Buffer = gr2Data.buffer.slice(gr2Data.byteOffset, gr2Data.byteOffset + gr2Data.byteLength);
    console.log('✓ GR2 carregado: ' + path.basename(gr2Path) + ' (' + gr2Buffer.byteLength + ' bytes)');
} catch (e) {
    console.error('✗ Erro ao carregar GR2:', e.message);
    process.exit(1);
}

// ============================================
// INICIALIZA E EXECUTA TESTES
// ============================================

console.log('\nInicializando Granny2...');

let granny;

try {
    granny = new Granny2(dllBuffer);
    console.log('✓ Granny2 inicializado\n');
} catch (e) {
    console.error('✗ Erro ao inicializar Granny2:', e.message);
    console.error(e.stack);
    process.exit(1);
}

// Executa testes
if (options.quick) {
    console.log('Executando Quick Test...\n');
    const success = Granny2Test.quick(granny, gr2Buffer);
    process.exit(success ? 0 : 1);
} else {
    console.log('Executando Full Test Suite...\n');
    const results = Granny2Test.runAll(granny, gr2Buffer, {
        verbose: options.verbose,
        stopOnError: options.stopOnError
    });
    
    // Exit code baseado nos resultados
    process.exit(results.failed > 0 ? 1 : 0);
}
