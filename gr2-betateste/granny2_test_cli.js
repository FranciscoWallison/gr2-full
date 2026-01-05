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
 * 
 * REQUISITOS:
 *   - Node.js
 *   - win32runtime.js (emulador Win32)
 *   - granny2.js
 *   - granny2_additions.js (opcional)
 *   - granny2_test.js
 */

const fs = require('fs');
const path = require('path');

// ============================================
// CARREGA DEPENDÊNCIAS
// ============================================

console.log('Carregando dependências...\n');

let Granny2, Granny2Test, Granny2Additions;

// Ajuste estes caminhos conforme sua estrutura de projeto
try {
    // Carrega Win32Runtime (obrigatório)
    // Se esse arquivo não existir no diretório, não tem como rodar.
    require('./win32runtime.js');

    // Carrega Granny2 (CommonJS -> pega do retorno do require)
    ({ Granny2 } = require('./granny2.js'));
    globalThis.Granny2 = Granny2; // granny2_test.js usa Granny2 global

    // Carrega additions (opcional)
    try {
        ({ Granny2Additions } = require('./granny2_additions.js'));
        if (Granny2Additions) {
            Granny2Additions.apply(Granny2);
            console.log('✓ Granny2Additions carregado');
        } else {
            console.log('⚠ granny2_additions.js carregou, mas não exportou Granny2Additions');
        }
    } catch (e) {
        console.log('⚠ Granny2Additions não encontrado (opcional)');
    }

    // Carrega testes
    ({ Granny2Test } = require('./granny2_test.js'));
    globalThis.Granny2Test = Granny2Test;

} catch (e) {
    console.error('Erro ao carregar dependências:', e.message);
    console.error('\nCertifique-se de que os arquivos estão no diretório correto:');
    console.error('  - win32runtime.js');
    console.error('  - granny2.js');
    console.error('  - granny2_test.js');
    process.exit(1);
}

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
    const dllNodeBuf = fs.readFileSync(dllPath);
    dllBuffer = new Uint8Array(dllNodeBuf.buffer.slice(dllNodeBuf.byteOffset, dllNodeBuf.byteOffset + dllNodeBuf.byteLength));
    console.log('✓ DLL carregada: ' + path.basename(dllPath) + ' (' + dllBuffer.length + ' bytes)');
} catch (e) {
    console.error('✗ Erro ao carregar DLL:', e.message);
    process.exit(1);
}

try {
    if (!fs.existsSync(gr2Path)) {
        throw new Error('Arquivo GR2 não encontrado: ' + gr2Path);
    }
    const gr2NodeBuf = fs.readFileSync(gr2Path);
    gr2Buffer = gr2NodeBuf.buffer.slice(gr2NodeBuf.byteOffset, gr2NodeBuf.byteOffset + gr2NodeBuf.byteLength);
    console.log('✓ GR2 carregado: ' + path.basename(gr2Path) + ' (' + gr2NodeBuf.byteLength + ' bytes)');
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
