/**
 * granny2_init_patch.js
 * 
 * Este arquivo inicializa os ponteiros de função globais necessários para granny2.dll
 * Deve ser incluído DEPOIS de carregar o granny2.js e criar o objeto Granny2
 * 
 * Uso:
 *   var granny = new Granny2(bin_data);
 *   initializeGrannyCallbacks(granny.runtime);
 */

function initializeGrannyCallbacks(runtime) {
    var cpu = runtime.cpu;
    var base_addr = runtime.base_addr;
    
    console.log("Initializing Granny2 global function pointers...");
    
    // Endereços dos ponteiros de função (offsets relativos ao base_addr)
    var PTR_ALLOC = 0x10033620;    // off_10033620 - função de alocação
    var PTR_FREE = 0x10033624;     // off_10033624 - função de liberação
    
    // Criar funções de trampolim na memória
    // Vamos usar uma área de memória livre para criar pequenas funções
    var TRAMPOLINE_ALLOC = 0x10057000;
    var TRAMPOLINE_FREE = 0x10057100;
    
    // Converter para endereços físicos
    var alloc_ptr_phys = cpu.translate_address_write(PTR_ALLOC);
    var free_ptr_phys = cpu.translate_address_write(PTR_FREE);
    
    console.log("  PTR_ALLOC virtual: 0x" + PTR_ALLOC.toString(16) + ", physical: 0x" + alloc_ptr_phys.toString(16));
    console.log("  PTR_FREE virtual: 0x" + PTR_FREE.toString(16) + ", physical: 0x" + free_ptr_phys.toString(16));
    
    // Verificar valores atuais antes de escrever
    var old_alloc = cpu.memory.mem32s[alloc_ptr_phys / 4];
    var old_free = cpu.memory.mem32s[free_ptr_phys / 4];
    console.log("  Current value at off_10033620: 0x" + (old_alloc >>> 0).toString(16));
    console.log("  Current value at off_10033624: 0x" + (old_free >>> 0).toString(16));
    
    // Função de alocação
    runtime.add_hook(TRAMPOLINE_ALLOC, function(rt, cpu) {
        // off_10033620(file, line, alignment, size)
        var arg_file = rt.get_arg(1);
        var arg_line = rt.get_arg(2);
        var arg_align = rt.get_arg(3);
        var arg_size = rt.get_arg(4);
        
        console.log("GrannyAlloc: size=" + arg_size + ", align=" + arg_align);
        
        var ptr = rt.allocator.alloc(arg_size);
        rt.cpu.reg32[reg_eax] = ptr;
        rt.instruction_ret(4 * 4); // 4 argumentos cdecl
    });
    
    // Função de liberação
    runtime.add_hook(TRAMPOLINE_FREE, function(rt, cpu) {
        // off_10033624(file, line, ptr)
        var arg_file = rt.get_arg(1);
        var arg_line = rt.get_arg(2);
        var arg_ptr = rt.get_arg(3);
        
        console.log("GrannyFree: ptr=0x" + (arg_ptr >>> 0).toString(16));
        
        if (arg_ptr) {
            rt.allocator.free(arg_ptr);
        }
        rt.cpu.reg32[reg_eax] = arg_ptr; // Retorna o ponteiro original
        rt.instruction_ret(3 * 4); // 3 argumentos cdecl
    });
    
    // Escrever os endereços das funções de trampolim nos ponteiros globais
    cpu.memory.mem32s[alloc_ptr_phys / 4] = TRAMPOLINE_ALLOC;
    cpu.memory.mem32s[free_ptr_phys / 4] = TRAMPOLINE_FREE;
    
    console.log("  Writing 0x" + TRAMPOLINE_ALLOC.toString(16) + " to physical 0x" + alloc_ptr_phys.toString(16));
    console.log("  Writing 0x" + TRAMPOLINE_FREE.toString(16) + " to physical 0x" + free_ptr_phys.toString(16));
    
    // Verificar os valores escritos
    var val_alloc = cpu.memory.mem32s[alloc_ptr_phys / 4];
    var val_free = cpu.memory.mem32s[free_ptr_phys / 4];
    console.log("  Verification - off_10033620 = 0x" + (val_alloc >>> 0).toString(16));
    console.log("  Verification - off_10033624 = 0x" + (val_free >>> 0).toString(16));
    
    // Verificar imports
    console.log("  imports[TRAMPOLINE_ALLOC] = " + runtime.imports[TRAMPOLINE_ALLOC]);
    console.log("  imports[TRAMPOLINE_FREE] = " + runtime.imports[TRAMPOLINE_FREE]);
    
    console.log("Granny2 global function pointers initialized!");
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.initializeGrannyCallbacks = initializeGrannyCallbacks;
}
