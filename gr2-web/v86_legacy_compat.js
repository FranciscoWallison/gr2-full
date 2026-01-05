/**
 * v86_legacy_compat.js
 * 
 * Camada de compatibilidade que implementa a API LEGADA do v86
 * necessária para o Win32Runtime/Granny2.
 * 
 * O código original foi escrito para uma versão antiga do v86 (~2014-2016)
 * que tinha uma API síncrona. A versão moderna usa WebAssembly e é assíncrona.
 * 
 * Esta implementação cria um "CPU falso" que executa código x86 de forma
 * simplificada, suficiente para rodar a granny2.dll.
 */

(function(global) {
    'use strict';

    // Constantes de registradores (devem corresponder ao pe_env.js)
    const reg_eax = 0, reg_ecx = 1, reg_edx = 2, reg_ebx = 3;
    const reg_esp = 4, reg_ebp = 5, reg_esi = 6, reg_edi = 7;
    
    const reg_es = 0, reg_cs = 1, reg_ss = 2, reg_ds = 3, reg_fs = 4, reg_gs = 5;
    
    const flag_carry = 1, flag_parity = 4, flag_adjust = 16, flag_zero = 64;
    const flag_sign = 128, flag_trap = 256, flag_interrupt = 512;
    const flag_direction = 1024, flag_overflow = 2048;

    const OPSIZE_8 = 8, OPSIZE_16 = 16, OPSIZE_32 = 32;
    const REPEAT_STRING_PREFIX_NONE = 0, REPEAT_STRING_PREFIX_Z = 1, REPEAT_STRING_PREFIX_NZ = 2;

    // Expor constantes globalmente (necessário para pe_env.js)
    global.reg_eax = reg_eax; global.reg_ecx = reg_ecx; global.reg_edx = reg_edx; global.reg_ebx = reg_ebx;
    global.reg_esp = reg_esp; global.reg_ebp = reg_ebp; global.reg_esi = reg_esi; global.reg_edi = reg_edi;
    global.reg_es = reg_es; global.reg_cs = reg_cs; global.reg_ss = reg_ss;
    global.reg_ds = reg_ds; global.reg_fs = reg_fs; global.reg_gs = reg_gs;
    global.flag_carry = flag_carry; global.flag_parity = flag_parity; global.flag_adjust = flag_adjust;
    global.flag_zero = flag_zero; global.flag_sign = flag_sign; global.flag_trap = flag_trap;
    global.flag_interrupt = flag_interrupt; global.flag_direction = flag_direction; global.flag_overflow = flag_overflow;
    global.OPSIZE_8 = OPSIZE_8; global.OPSIZE_16 = OPSIZE_16; global.OPSIZE_32 = OPSIZE_32;
    global.REPEAT_STRING_PREFIX_NONE = REPEAT_STRING_PREFIX_NONE;
    global.REPEAT_STRING_PREFIX_Z = REPEAT_STRING_PREFIX_Z;
    global.REPEAT_STRING_PREFIX_NZ = REPEAT_STRING_PREFIX_NZ;

    // Tamanho da memória (320 MB deve ser suficiente)
    const MEMORY_SIZE = 320 * 1024 * 1024;

    /**
     * Classe Memory - gerencia a memória do emulador
     */
    class Memory {
        constructor(size) {
            this.buffer = new ArrayBuffer(size);
            this.mem8 = new Uint8Array(this.buffer);
            this.mem16 = new Uint16Array(this.buffer);
            this.mem32s = new Int32Array(this.buffer);
            this.mem32 = new Uint32Array(this.buffer);
        }

        read8(addr) {
            return this.mem8[addr];
        }

        read8s(addr) {
            return this.mem8[addr] << 24 >> 24;
        }

        read16(addr) {
            return this.mem8[addr] | (this.mem8[addr + 1] << 8);
        }

        read16s(addr) {
            return (this.mem8[addr] | (this.mem8[addr + 1] << 8)) << 16 >> 16;
        }

        read32s(addr) {
            return this.mem8[addr] | (this.mem8[addr + 1] << 8) |
                   (this.mem8[addr + 2] << 16) | (this.mem8[addr + 3] << 24);
        }

        read32(addr) {
            return (this.mem8[addr] | (this.mem8[addr + 1] << 8) |
                   (this.mem8[addr + 2] << 16) | (this.mem8[addr + 3] << 24)) >>> 0;
        }

        write8(addr, value) {
            this.mem8[addr] = value;
        }

        write16(addr, value) {
            this.mem8[addr] = value;
            this.mem8[addr + 1] = value >> 8;
        }

        write32(addr, value) {
            this.mem8[addr] = value;
            this.mem8[addr + 1] = value >> 8;
            this.mem8[addr + 2] = value >> 16;
            this.mem8[addr + 3] = value >> 24;
        }

        write_aligned32(addr, value) {
            this.mem32s[addr] = value;
        }

        read_string(addr) {
            let str = '';
            let c;
            while ((c = this.mem8[addr++]) !== 0) {
                str += String.fromCharCode(c);
            }
            return str;
        }
    }

    /**
     * Classe CPU - emulador x86 simplificado
     */
    class CPU {
        constructor() {
            this.memory = new Memory(MEMORY_SIZE);
            
            // Registradores de 32 bits
            this.reg32 = new Uint32Array(8);
            this.reg32s = new Int32Array(this.reg32.buffer);
            
            // Registradores de 16 bits (view dos 32 bits)
            this.reg16 = new Uint16Array(this.reg32.buffer);
            this.reg16s = new Int16Array(this.reg32.buffer);
            
            // Registradores de 8 bits
            this.reg8 = new Uint8Array(this.reg32.buffer);
            this.reg8s = new Int8Array(this.reg32.buffer);
            
            // Registradores de segmento
            this.sreg = new Uint16Array(8);
            this.segment_offsets = new Int32Array(8);
            this.segment_limits = new Uint32Array(8);
            
            // Flags
            this.flags = 0;
            this.flags_changed = 0;
            this.last_op1 = 0;
            this.last_op2 = 0;
            this.last_op_size = 0;
            this.last_result = 0;
            
            // Estado
            this.instruction_pointer = 0;
            this.previous_ip = 0;
            this.last_instr_jump = false;
            this.repeat_string_prefix = REPEAT_STRING_PREFIX_NONE;
            this.paging = false;
            this.is_32 = true;
            this.address_size_32 = true;
            this.operand_size_32 = true;
            this.stack_size_32 = true;
            this.protected_mode = false;
            
            // Aliases usados pelo pe_env.js
            this.regv = this.reg32s;
            this.reg_vsp = reg_esp;
            this.reg_vbp = reg_ebp;
            this.reg_vdi = reg_edi;
            this.reg_vsi = reg_esi;
            this.reg_vcx = reg_ecx;
            this.stack_reg = this.reg32s;
            
            // Tabela de instruções
            this.table32 = {};
            this.table16 = {};
            
            this._initInstructionTable();
        }

        init(settings) {
            // Inicialização básica - configurar segmentos padrão
            for (let i = 0; i < 8; i++) {
                this.segment_offsets[i] = 0;
                this.segment_limits[i] = 0xFFFFFFFF;
            }
            
            // Flags iniciais
            this.flags = flag_interrupt | 2;
            
            console.log("v86 legacy CPU initialized");
        }

        // Métodos de tradução de endereço (simplificados - sem paginação real)
        translate_address_read(addr) {
            // Verificar se addr é válido antes de traduzir
            if (addr === 0) {
                console.error("translate_address_read: Attempting to translate NULL address!");
                console.error("  This usually means a function returned to address 0");
                console.error("  or a jump/call went to an invalid address");
            }
            return addr >>> 0;
        }

        translate_address_write(addr) {
            return addr >>> 0;
        }

        translate_address_user_read(addr) {
            return addr >>> 0;
        }

        translate_address_user_write(addr) {
            return addr >>> 0;
        }

        translate_address_system_read(addr) {
            return addr >>> 0;
        }

        translate_address_system_write(addr) {
            return addr >>> 0;
        }

        // Acesso a segmentos
        get_seg(reg) {
            return this.segment_offsets[reg];
        }

        switch_seg(reg, value) {
            this.sreg[reg] = value;
            this.segment_offsets[reg] = value << 4;
            if (this.protected_mode) {
                this.segment_offsets[reg] = 0;
            }
        }

        // Obter EIP real
        get_real_eip() {
            return this.instruction_pointer;
        }

        // Stack operations
        get_stack_pointer(offset) {
            return (this.reg32[reg_esp] + offset) >>> 0;
        }

        push32(value) {
            this.reg32[reg_esp] = (this.reg32[reg_esp] - 4) >>> 0;
            const addr = this.translate_address_write(this.reg32[reg_esp]);
            this.memory.write32(addr, value);
        }

        pop32() {
            const addr = this.translate_address_read(this.reg32[reg_esp]);
            const value = this.memory.read32s(addr);
            this.reg32[reg_esp] = (this.reg32[reg_esp] + 4) >>> 0;
            return value;
        }

        push16(value) {
            this.reg32[reg_esp] = (this.reg32[reg_esp] - 2) >>> 0;
            const addr = this.translate_address_write(this.reg32[reg_esp]);
            this.memory.write16(addr, value);
        }

        pop16() {
            const addr = this.translate_address_read(this.reg32[reg_esp]);
            const value = this.memory.read16(addr);
            this.reg32[reg_esp] = (this.reg32[reg_esp] + 2) >>> 0;
            return value;
        }

        // Leitura de instruções
        read_imm8() {
            // Traduzir endereço virtual para físico
            const phys_addr = this.translate_address_read(this.instruction_pointer);
            
            if (phys_addr < 0 || phys_addr >= this.memory.mem8.length) {
                console.error(`read_imm8: physical address out of bounds`);
                console.error(`  Virtual IP: 0x${this.instruction_pointer.toString(16)}`);
                console.error(`  Physical addr: 0x${phys_addr.toString(16)} (${phys_addr})`);
                console.error(`  Memory size: ${this.memory.mem8.length} bytes (0x${this.memory.mem8.length.toString(16)})`);
                throw new Error(`Physical address out of bounds: 0x${phys_addr.toString(16)}`);
            }
            
            const value = this.memory.mem8[phys_addr];
            this.instruction_pointer++;
            return value;
        }

        read_imm8s() {
            const phys_addr = this.translate_address_read(this.instruction_pointer);
            const value = this.memory.read8s(phys_addr);
            this.instruction_pointer++;
            return value;
        }

        read_imm16() {
            const phys_addr = this.translate_address_read(this.instruction_pointer);
            const value = this.memory.read16(phys_addr);
            this.instruction_pointer += 2;
            return value;
        }

        read_imm16s() {
            const phys_addr = this.translate_address_read(this.instruction_pointer);
            const value = this.memory.read16s(phys_addr);
            this.instruction_pointer += 2;
            return value;
        }

        read_imm32() {
            const phys_addr = this.translate_address_read(this.instruction_pointer);
            const value = this.memory.read32(phys_addr);
            this.instruction_pointer += 4;
            return value;
        }

        read_imm32s() {
            const phys_addr = this.translate_address_read(this.instruction_pointer);
            const value = this.memory.read32s(phys_addr);
            this.instruction_pointer += 4;
            return value;
        }

        // Safe read/write (com tradução de endereço)
        safe_read8(addr) {
            return this.memory.read8(this.translate_address_read(addr));
        }

        safe_read16(addr) {
            return this.memory.read16(this.translate_address_read(addr));
        }

        safe_read32s(addr) {
            return this.memory.read32s(this.translate_address_read(addr));
        }

        safe_write8(addr, value) {
            this.memory.write8(this.translate_address_write(addr), value);
        }

        safe_write16(addr, value) {
            this.memory.write16(this.translate_address_write(addr), value);
        }

        safe_write32(addr, value) {
            this.memory.write32(this.translate_address_write(addr), value);
        }

        // Boundary read/write (para acessos não alinhados através de páginas)
        virt_boundary_read32s(low, high) {
            return this.memory.read32s(low);
        }

        virt_boundary_write32(low, high, value) {
            this.memory.write32(low, value);
        }

        // Operações aritméticas com flags
        inc(value, size) {
            const result = (value + 1) | 0;
            // Simplificado - não atualiza todas as flags
            return result;
        }

        dec(value, size) {
            const result = (value - 1) | 0;
            return result;
        }

        // ModRM resolution
        modrm_resolve(modrm) {
            const mod = modrm >> 6;
            const rm = modrm & 7;
            
            let addr = 0;
            
            if (mod === 0) {
                if (rm === 4) {
                    // SIB byte
                    return this._resolve_sib(this.read_imm8(), 0);
                } else if (rm === 5) {
                    // disp32
                    return this.read_imm32s();
                } else {
                    return this.reg32s[rm];
                }
            } else if (mod === 1) {
                if (rm === 4) {
                    return this._resolve_sib(this.read_imm8(), this.read_imm8s());
                } else {
                    return (this.reg32s[rm] + this.read_imm8s()) | 0;
                }
            } else if (mod === 2) {
                if (rm === 4) {
                    return this._resolve_sib(this.read_imm8(), this.read_imm32s());
                } else {
                    return (this.reg32s[rm] + this.read_imm32s()) | 0;
                }
            }
            
            return addr;
        }

        _resolve_sib(sib, displacement) {
            const scale = 1 << (sib >> 6);
            const index = (sib >> 3) & 7;
            const base = sib & 7;
            
            let addr = displacement;
            
            if (base !== 5) {
                addr += this.reg32s[base];
            }
            
            if (index !== 4) {
                addr += this.reg32s[index] * scale;
            }
            
            return addr | 0;
        }

        // Métodos auxiliares
        writable_or_pagefault(addr, size) {
            // Simplificado - sem verificação de página
        }

        trigger_ud() {
            throw new Error("Undefined instruction");
        }

        update_operand_size() {
            // Noop no modo simplificado
        }

        update_address_size() {
            // Noop no modo simplificado
        }

        // Ciclo principal de execução
        cycle() {
            this.previous_ip = this.instruction_pointer;
            this.last_instr_jump = false;
            this.repeat_string_prefix = REPEAT_STRING_PREFIX_NONE;
            
            // Debug: rastrear últimas instruções
            if (!this._trace) this._trace = [];
            this._trace.push({
                ip: this.instruction_pointer,
                esp: this.reg32[reg_esp],
                eax: this.reg32[reg_eax]
            });
            if (this._trace.length > 50) this._trace.shift();
            
            // Debug: se IP estiver fora do range válido, mostrar trace
            // Range válido: 0x10000000 - 0x14000000
            if (this.instruction_pointer < 0x10000000 || this.instruction_pointer >= 0x14000000) {
                console.error("=== TRACE: IP out of valid range ===");
                console.error("Current IP: 0x" + this.instruction_pointer.toString(16));
                console.error("Last 20 instructions:");
                const start = Math.max(0, this._trace.length - 20);
                for (let i = start; i < this._trace.length; i++) {
                    const t = this._trace[i];
                    console.error(`  IP=0x${t.ip.toString(16)}, ESP=0x${t.esp.toString(16)}, EAX=0x${(t.eax >>> 0).toString(16)}`);
                }
                throw new Error("Instruction pointer out of valid range: 0x" + this.instruction_pointer.toString(16));
            }
            
            const opcode = this.read_imm8();
            
            // Checar prefixos
            if (opcode === 0xF2) {
                this.repeat_string_prefix = REPEAT_STRING_PREFIX_NZ;
                this._execute_next();
                return;
            } else if (opcode === 0xF3) {
                this.repeat_string_prefix = REPEAT_STRING_PREFIX_Z;
                this._execute_next();
                return;
            }
            
            this._execute_opcode(opcode);
        }

        _execute_next() {
            const opcode = this.read_imm8();
            this._execute_opcode(opcode);
        }

        _execute_opcode(opcode) {
            const handler = this.table32[opcode];
            if (handler) {
                handler(this);
            } else {
                // Debug: mostrar contexto da memória
                const ip = this.instruction_pointer - 1;
                const phys_ip = this.translate_address_read(ip);
                console.error(`Unimplemented opcode: 0x${opcode.toString(16)} at Virtual IP=0x${ip.toString(16)}, Physical=0x${phys_ip.toString(16)}`);
                console.error(`Memory at Physical IP (16 bytes): ${Array.from(this.memory.mem8.slice(phys_ip, phys_ip + 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
                console.error(`Registers: EAX=0x${this.reg32[0].toString(16)}, ECX=0x${this.reg32[1].toString(16)}, EDX=0x${this.reg32[2].toString(16)}, EBX=0x${this.reg32[3].toString(16)}`);
                console.error(`          ESP=0x${this.reg32[4].toString(16)}, EBP=0x${this.reg32[5].toString(16)}, ESI=0x${this.reg32[6].toString(16)}, EDI=0x${this.reg32[7].toString(16)}`);
                
                throw new Error(`Unimplemented opcode: 0x${opcode.toString(16)}`);
            }
        }

        _initInstructionTable() {
            const cpu = this;
            const t = this.table32;

            // NOP
            t[0x90] = () => {};

            // PUSH r32
            for (let i = 0; i < 8; i++) {
                t[0x50 + i] = ((r) => () => cpu.push32(cpu.reg32s[r]))(i);
            }

            // POP r32
            for (let i = 0; i < 8; i++) {
                t[0x58 + i] = ((r) => () => { cpu.reg32s[r] = cpu.pop32(); })(i);
            }

            // MOV r32, imm32
            for (let i = 0; i < 8; i++) {
                t[0xB8 + i] = ((r) => () => { cpu.reg32s[r] = cpu.read_imm32s(); })(i);
            }

            // MOV r8, imm8
            for (let i = 0; i < 8; i++) {
                t[0xB0 + i] = ((r) => () => { cpu.reg8[r] = cpu.read_imm8(); })(i);
            }

            // RET near
            t[0xC3] = () => {
                const return_addr = cpu.pop32();
                if (return_addr === 0) {
                    console.error("RET: Returning to address 0!");
                    console.error("  ESP after pop: 0x" + cpu.reg32[reg_esp].toString(16));
                    console.error("  EBP: 0x" + cpu.reg32[reg_ebp].toString(16));
                    // Dump stack
                    const esp = cpu.reg32[reg_esp];
                    const esp_phys = cpu.translate_address_read(esp);
                    console.error("  Stack around ESP:");
                    for (let i = -16; i <= 16; i += 4) {
                        const addr = esp_phys + i;
                        if (addr >= 0 && addr < cpu.memory.mem8.length - 4) {
                            const val = cpu.memory.mem32s[addr / 4];
                            console.error(`    [ESP${i >= 0 ? '+' : ''}${i}] = 0x${(val >>> 0).toString(16)}`);
                        }
                    }
                }
                cpu.instruction_pointer = return_addr;
                cpu.last_instr_jump = true;
            };

            // RET near imm16
            t[0xC2] = () => {
                const imm = cpu.read_imm16();
                const return_addr = cpu.pop32();
                if (return_addr === 0) {
                    console.error("RET imm16: Returning to address 0!");
                    console.error("  imm16: " + imm);
                    console.error("  ESP after pop: 0x" + cpu.reg32[reg_esp].toString(16));
                }
                cpu.instruction_pointer = return_addr;
                cpu.reg32[reg_esp] = (cpu.reg32[reg_esp] + imm) >>> 0;
                cpu.last_instr_jump = true;
            };

            // CALL rel32
            t[0xE8] = () => {
                const rel = cpu.read_imm32s();
                cpu.push32(cpu.instruction_pointer);
                cpu.instruction_pointer = (cpu.instruction_pointer + rel) | 0;
                cpu.last_instr_jump = true;
            };

            // JMP rel32
            t[0xE9] = () => {
                const rel = cpu.read_imm32s();
                cpu.instruction_pointer = (cpu.instruction_pointer + rel) | 0;
                cpu.last_instr_jump = true;
            };

            // JMP rel8
            t[0xEB] = () => {
                const rel = cpu.read_imm8s();
                cpu.instruction_pointer = (cpu.instruction_pointer + rel) | 0;
                cpu.last_instr_jump = true;
            };

            // MOV r/m32, r32
            t[0x89] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg32s[modrm & 7] = cpu.reg32s[reg];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write32(addr, cpu.reg32s[reg]);
                }
            };

            // MOV r32, r/m32
            t[0x8B] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg32s[reg] = cpu.reg32s[modrm & 7];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.reg32s[reg] = cpu.safe_read32s(addr);
                }
            };

            // MOV r/m8, r8
            t[0x88] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg8[modrm & 7] = cpu.reg8[reg];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write8(addr, cpu.reg8[reg]);
                }
            };

            // MOV r8, r/m8
            t[0x8A] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg8[reg] = cpu.reg8[modrm & 7];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.reg8[reg] = cpu.safe_read8(addr);
                }
            };

            // ADD, OR, ADC, SBB, AND, SUB, XOR, CMP r/m32, imm32
            t[0x81] = () => {
                const modrm = cpu.read_imm8();
                const op = (modrm >> 3) & 7;
                let value;
                if (modrm >= 0xC0) {
                    value = cpu.reg32s[modrm & 7];
                } else {
                    value = cpu.safe_read32s(cpu.modrm_resolve(modrm));
                }
                const imm = cpu.read_imm32s();
                let result;
                switch (op) {
                    case 0: result = (value + imm) | 0; break; // ADD
                    case 1: result = value | imm; break; // OR
                    case 4: result = value & imm; break; // AND
                    case 5: result = (value - imm) | 0; break; // SUB
                    case 6: result = value ^ imm; break; // XOR
                    case 7: return; // CMP (só afeta flags)
                    default: throw new Error(`Unimplemented 0x81 op: ${op}`);
                }
                if (modrm >= 0xC0) {
                    cpu.reg32s[modrm & 7] = result;
                } else {
                    cpu.safe_write32(cpu.modrm_resolve(modrm), result);
                }
            };

            // ADD r/m32, r32
            t[0x01] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg32s[modrm & 7] = (cpu.reg32s[modrm & 7] + cpu.reg32s[reg]) | 0;
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write32(addr, (cpu.safe_read32s(addr) + cpu.reg32s[reg]) | 0);
                }
            };

            // ADD r32, r/m32
            t[0x03] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg32s[reg] = (cpu.reg32s[reg] + cpu.reg32s[modrm & 7]) | 0;
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.reg32s[reg] = (cpu.reg32s[reg] + cpu.safe_read32s(addr)) | 0;
                }
            };

            // SUB r/m32, r32
            t[0x29] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg32s[modrm & 7] = (cpu.reg32s[modrm & 7] - cpu.reg32s[reg]) | 0;
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write32(addr, (cpu.safe_read32s(addr) - cpu.reg32s[reg]) | 0);
                }
            };

            // SUB r32, r/m32
            t[0x2B] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg32s[reg] = (cpu.reg32s[reg] - cpu.reg32s[modrm & 7]) | 0;
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.reg32s[reg] = (cpu.reg32s[reg] - cpu.safe_read32s(addr)) | 0;
                }
            };

            // XOR r/m32, r32
            t[0x31] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg32s[modrm & 7] ^= cpu.reg32s[reg];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write32(addr, cpu.safe_read32s(addr) ^ cpu.reg32s[reg]);
                }
            };

            // XOR r32, r/m32
            t[0x33] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg32s[reg] ^= cpu.reg32s[modrm & 7];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.reg32s[reg] ^= cpu.safe_read32s(addr);
                }
            };

            // AND r/m32, r32
            t[0x21] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg32s[modrm & 7] &= cpu.reg32s[reg];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write32(addr, cpu.safe_read32s(addr) & cpu.reg32s[reg]);
                }
            };

            // AND r32, r/m32
            t[0x23] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg32s[reg] &= cpu.reg32s[modrm & 7];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.reg32s[reg] &= cpu.safe_read32s(addr);
                }
            };

            // OR r/m32, r32
            t[0x09] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg32s[modrm & 7] |= cpu.reg32s[reg];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write32(addr, cpu.safe_read32s(addr) | cpu.reg32s[reg]);
                }
            };

            // OR r32, r/m32
            t[0x0B] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg32s[reg] |= cpu.reg32s[modrm & 7];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.reg32s[reg] |= cpu.safe_read32s(addr);
                }
            };

            // CMP r/m32, r32
            t[0x39] = () => {
                const modrm = cpu.read_imm8();
                // CMP só afeta flags, não implementamos flags completas
            };

            // CMP r32, r/m32
            t[0x3B] = () => {
                const modrm = cpu.read_imm8();
                // CMP só afeta flags
            };

            // TEST r/m32, r32
            t[0x85] = () => {
                const modrm = cpu.read_imm8();
                // TEST só afeta flags
            };

            // LEA r32, m
            t[0x8D] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                const addr = cpu.modrm_resolve(modrm);
                cpu.reg32s[reg] = addr;
            };

            // INC r32
            for (let i = 0; i < 8; i++) {
                t[0x40 + i] = ((r) => () => { cpu.reg32s[r] = (cpu.reg32s[r] + 1) | 0; })(i);
            }

            // DEC r32
            for (let i = 0; i < 8; i++) {
                t[0x48 + i] = ((r) => () => { cpu.reg32s[r] = (cpu.reg32s[r] - 1) | 0; })(i);
            }

            // Conditional jumps (Jcc rel8)
            const jcc8 = [0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77,
                         0x78, 0x79, 0x7A, 0x7B, 0x7C, 0x7D, 0x7E, 0x7F];
            for (const op of jcc8) {
                t[op] = () => {
                    const rel = cpu.read_imm8s();
                    // Simplificado - sempre pula ou nunca pula baseado em flags simplificadas
                    // Em produção, precisaria verificar cpu.flags corretamente
                };
            }

            // MOVZX r32, r/m8
            t[0x0F] = () => {
                const op2 = cpu.read_imm8();
                switch (op2) {
                    case 0xB6: { // MOVZX r32, r/m8
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        if (modrm >= 0xC0) {
                            cpu.reg32s[reg] = cpu.reg8[modrm & 7];
                        } else {
                            const addr = cpu.modrm_resolve(modrm);
                            cpu.reg32s[reg] = cpu.safe_read8(addr);
                        }
                        break;
                    }
                    case 0xB7: { // MOVZX r32, r/m16
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        if (modrm >= 0xC0) {
                            cpu.reg32s[reg] = cpu.reg16[modrm & 7];
                        } else {
                            const addr = cpu.modrm_resolve(modrm);
                            cpu.reg32s[reg] = cpu.safe_read16(addr);
                        }
                        break;
                    }
                    case 0xBE: { // MOVSX r32, r/m8
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        if (modrm >= 0xC0) {
                            cpu.reg32s[reg] = cpu.reg8s[modrm & 7];
                        } else {
                            const addr = cpu.modrm_resolve(modrm);
                            cpu.reg32s[reg] = cpu.memory.read8s(cpu.translate_address_read(addr));
                        }
                        break;
                    }
                    case 0xBF: { // MOVSX r32, r/m16
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        if (modrm >= 0xC0) {
                            cpu.reg32s[reg] = cpu.reg16s[modrm & 7];
                        } else {
                            const addr = cpu.modrm_resolve(modrm);
                            cpu.reg32s[reg] = cpu.memory.read16s(cpu.translate_address_read(addr));
                        }
                        break;
                    }
                    case 0xAF: { // IMUL r32, r/m32
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        let value;
                        if (modrm >= 0xC0) {
                            value = cpu.reg32s[modrm & 7];
                        } else {
                            value = cpu.safe_read32s(cpu.modrm_resolve(modrm));
                        }
                        cpu.reg32s[reg] = Math.imul(cpu.reg32s[reg], value);
                        break;
                    }
                    
                    // RDTSC - Read Time Stamp Counter (0x0F 0x31)
                    case 0x31: {
                        // Retorna um timestamp em EDX:EAX
                        const timestamp = BigInt(Date.now()) * 1000000n; // Simular ciclos
                        cpu.reg32[reg_eax] = Number(timestamp & 0xFFFFFFFFn);
                        cpu.reg32[reg_edx] = Number((timestamp >> 32n) & 0xFFFFFFFFn);
                        break;
                    }
                    
                    // CPUID (0x0F 0xA2)
                    case 0xA2: {
                        // Simular CPUID básico
                        const func = cpu.reg32[reg_eax];
                        if (func === 0) {
                            // Vendor ID
                            cpu.reg32[reg_eax] = 1; // Max function
                            cpu.reg32[reg_ebx] = 0x756E6547; // "Genu"
                            cpu.reg32[reg_edx] = 0x49656E69; // "ineI"
                            cpu.reg32[reg_ecx] = 0x6C65746E; // "ntel"
                        } else if (func === 1) {
                            // Feature flags
                            cpu.reg32[reg_eax] = 0x00000601; // Family 6, Model 0, Stepping 1
                            cpu.reg32[reg_ebx] = 0;
                            cpu.reg32[reg_ecx] = 0; // SSE3, etc (disabled)
                            cpu.reg32[reg_edx] = 0x00000001; // FPU present
                        } else {
                            cpu.reg32[reg_eax] = 0;
                            cpu.reg32[reg_ebx] = 0;
                            cpu.reg32[reg_ecx] = 0;
                            cpu.reg32[reg_edx] = 0;
                        }
                        break;
                    }
                    
                    // SETcc instructions (0x0F 0x90-0x9F)
                    case 0x90: case 0x91: case 0x92: case 0x93:
                    case 0x94: case 0x95: case 0x96: case 0x97:
                    case 0x98: case 0x99: case 0x9A: case 0x9B:
                    case 0x9C: case 0x9D: case 0x9E: case 0x9F: {
                        const modrm = cpu.read_imm8();
                        // SETcc sets byte to 0 or 1 based on condition
                        // For simplicity, always set to 0 (condition not met)
                        // A proper implementation would check flags
                        if (modrm >= 0xC0) {
                            cpu.reg8[modrm & 7] = 0;
                        } else {
                            const addr = cpu.modrm_resolve(modrm);
                            cpu.safe_write8(addr, 0);
                        }
                        break;
                    }
                    
                    // CMOVcc - Conditional move (0x0F 0x40-0x4F)
                    case 0x40: case 0x41: case 0x42: case 0x43:
                    case 0x44: case 0x45: case 0x46: case 0x47:
                    case 0x48: case 0x49: case 0x4A: case 0x4B:
                    case 0x4C: case 0x4D: case 0x4E: case 0x4F: {
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        // For simplicity, never move (condition not met)
                        // Just read the value to advance past the instruction
                        if (modrm < 0xC0) {
                            cpu.modrm_resolve(modrm);
                        }
                        break;
                    }
                    
                    // BSF - Bit Scan Forward (0x0F 0xBC)
                    case 0xBC: {
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        let value;
                        if (modrm >= 0xC0) {
                            value = cpu.reg32[modrm & 7];
                        } else {
                            value = cpu.safe_read32s(cpu.modrm_resolve(modrm)) >>> 0;
                        }
                        if (value === 0) {
                            // ZF = 1, result undefined
                            cpu.flags |= flag_zero;
                        } else {
                            cpu.flags &= ~flag_zero;
                            let bit = 0;
                            while ((value & (1 << bit)) === 0) bit++;
                            cpu.reg32s[reg] = bit;
                        }
                        break;
                    }
                    
                    // BSR - Bit Scan Reverse (0x0F 0xBD)
                    case 0xBD: {
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        let value;
                        if (modrm >= 0xC0) {
                            value = cpu.reg32[modrm & 7];
                        } else {
                            value = cpu.safe_read32s(cpu.modrm_resolve(modrm)) >>> 0;
                        }
                        if (value === 0) {
                            cpu.flags |= flag_zero;
                        } else {
                            cpu.flags &= ~flag_zero;
                            let bit = 31;
                            while ((value & (1 << bit)) === 0) bit--;
                            cpu.reg32s[reg] = bit;
                        }
                        break;
                    }
                    
                    // BT - Bit Test (0x0F 0xA3)
                    case 0xA3: {
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        const bit = cpu.reg32[reg] & 31;
                        let value;
                        if (modrm >= 0xC0) {
                            value = cpu.reg32[modrm & 7];
                        } else {
                            value = cpu.safe_read32s(cpu.modrm_resolve(modrm)) >>> 0;
                        }
                        if (value & (1 << bit)) {
                            cpu.flags |= flag_carry;
                        } else {
                            cpu.flags &= ~flag_carry;
                        }
                        break;
                    }
                    
                    // BTS - Bit Test and Set (0x0F 0xAB)
                    case 0xAB: {
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        const bit = cpu.reg32[reg] & 31;
                        if (modrm >= 0xC0) {
                            const value = cpu.reg32[modrm & 7];
                            if (value & (1 << bit)) cpu.flags |= flag_carry;
                            else cpu.flags &= ~flag_carry;
                            cpu.reg32[modrm & 7] = value | (1 << bit);
                        } else {
                            const addr = cpu.modrm_resolve(modrm);
                            const value = cpu.safe_read32s(addr) >>> 0;
                            if (value & (1 << bit)) cpu.flags |= flag_carry;
                            else cpu.flags &= ~flag_carry;
                            cpu.safe_write32(addr, value | (1 << bit));
                        }
                        break;
                    }
                    
                    // BTR - Bit Test and Reset (0x0F 0xB3)
                    case 0xB3: {
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        const bit = cpu.reg32[reg] & 31;
                        if (modrm >= 0xC0) {
                            const value = cpu.reg32[modrm & 7];
                            if (value & (1 << bit)) cpu.flags |= flag_carry;
                            else cpu.flags &= ~flag_carry;
                            cpu.reg32[modrm & 7] = value & ~(1 << bit);
                        } else {
                            const addr = cpu.modrm_resolve(modrm);
                            const value = cpu.safe_read32s(addr) >>> 0;
                            if (value & (1 << bit)) cpu.flags |= flag_carry;
                            else cpu.flags &= ~flag_carry;
                            cpu.safe_write32(addr, value & ~(1 << bit));
                        }
                        break;
                    }
                    
                    // BTC - Bit Test and Complement (0x0F 0xBB)
                    case 0xBB: {
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        const bit = cpu.reg32[reg] & 31;
                        if (modrm >= 0xC0) {
                            const value = cpu.reg32[modrm & 7];
                            if (value & (1 << bit)) cpu.flags |= flag_carry;
                            else cpu.flags &= ~flag_carry;
                            cpu.reg32[modrm & 7] = value ^ (1 << bit);
                        } else {
                            const addr = cpu.modrm_resolve(modrm);
                            const value = cpu.safe_read32s(addr) >>> 0;
                            if (value & (1 << bit)) cpu.flags |= flag_carry;
                            else cpu.flags &= ~flag_carry;
                            cpu.safe_write32(addr, value ^ (1 << bit));
                        }
                        break;
                    }
                    
                    // SHLD (0x0F 0xA4, 0x0F 0xA5)
                    case 0xA4: { // SHLD r/m32, r32, imm8
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        const count = cpu.read_imm8() & 31;
                        let dest;
                        if (modrm >= 0xC0) {
                            dest = cpu.reg32[modrm & 7];
                        } else {
                            dest = cpu.safe_read32s(cpu.modrm_resolve(modrm)) >>> 0;
                        }
                        const src = cpu.reg32[reg];
                        const result = ((dest << count) | (src >>> (32 - count))) >>> 0;
                        if (modrm >= 0xC0) {
                            cpu.reg32[modrm & 7] = result;
                        } else {
                            cpu.safe_write32(cpu.modrm_resolve(modrm), result);
                        }
                        break;
                    }
                    case 0xA5: { // SHLD r/m32, r32, CL
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        const count = cpu.reg8[reg_ecx] & 31;
                        let dest;
                        if (modrm >= 0xC0) {
                            dest = cpu.reg32[modrm & 7];
                        } else {
                            dest = cpu.safe_read32s(cpu.modrm_resolve(modrm)) >>> 0;
                        }
                        const src = cpu.reg32[reg];
                        const result = ((dest << count) | (src >>> (32 - count))) >>> 0;
                        if (modrm >= 0xC0) {
                            cpu.reg32[modrm & 7] = result;
                        } else {
                            cpu.safe_write32(cpu.modrm_resolve(modrm), result);
                        }
                        break;
                    }
                    
                    // SHRD (0x0F 0xAC, 0x0F 0xAD)
                    case 0xAC: { // SHRD r/m32, r32, imm8
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        const count = cpu.read_imm8() & 31;
                        let dest;
                        if (modrm >= 0xC0) {
                            dest = cpu.reg32[modrm & 7];
                        } else {
                            dest = cpu.safe_read32s(cpu.modrm_resolve(modrm)) >>> 0;
                        }
                        const src = cpu.reg32[reg];
                        const result = ((dest >>> count) | (src << (32 - count))) >>> 0;
                        if (modrm >= 0xC0) {
                            cpu.reg32[modrm & 7] = result;
                        } else {
                            cpu.safe_write32(cpu.modrm_resolve(modrm), result);
                        }
                        break;
                    }
                    case 0xAD: { // SHRD r/m32, r32, CL
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        const count = cpu.reg8[reg_ecx] & 31;
                        let dest;
                        if (modrm >= 0xC0) {
                            dest = cpu.reg32[modrm & 7];
                        } else {
                            dest = cpu.safe_read32s(cpu.modrm_resolve(modrm)) >>> 0;
                        }
                        const src = cpu.reg32[reg];
                        const result = ((dest >>> count) | (src << (32 - count))) >>> 0;
                        if (modrm >= 0xC0) {
                            cpu.reg32[modrm & 7] = result;
                        } else {
                            cpu.safe_write32(cpu.modrm_resolve(modrm), result);
                        }
                        break;
                    }
                    
                    // BSWAP (0x0F 0xC8-0xCF)
                    case 0xC8: case 0xC9: case 0xCA: case 0xCB:
                    case 0xCC: case 0xCD: case 0xCE: case 0xCF: {
                        const reg = op2 & 7;
                        const val = cpu.reg32[reg];
                        cpu.reg32[reg] = ((val & 0xFF) << 24) | ((val & 0xFF00) << 8) |
                                        ((val >> 8) & 0xFF00) | ((val >> 24) & 0xFF);
                        break;
                    }
                    
                    // XADD (0x0F 0xC0, 0x0F 0xC1)
                    case 0xC0: { // XADD r/m8, r8
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        if (modrm >= 0xC0) {
                            const tmp = cpu.reg8[modrm & 7];
                            cpu.reg8[modrm & 7] = (tmp + cpu.reg8[reg]) & 0xFF;
                            cpu.reg8[reg] = tmp;
                        } else {
                            const addr = cpu.modrm_resolve(modrm);
                            const tmp = cpu.safe_read8(addr);
                            cpu.safe_write8(addr, (tmp + cpu.reg8[reg]) & 0xFF);
                            cpu.reg8[reg] = tmp;
                        }
                        break;
                    }
                    case 0xC1: { // XADD r/m32, r32
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        if (modrm >= 0xC0) {
                            const tmp = cpu.reg32s[modrm & 7];
                            cpu.reg32s[modrm & 7] = (tmp + cpu.reg32s[reg]) | 0;
                            cpu.reg32s[reg] = tmp;
                        } else {
                            const addr = cpu.modrm_resolve(modrm);
                            const tmp = cpu.safe_read32s(addr);
                            cpu.safe_write32(addr, (tmp + cpu.reg32s[reg]) | 0);
                            cpu.reg32s[reg] = tmp;
                        }
                        break;
                    }
                    
                    // CMPXCHG (0x0F 0xB0, 0x0F 0xB1)
                    case 0xB0: { // CMPXCHG r/m8, r8
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        let dest;
                        if (modrm >= 0xC0) {
                            dest = cpu.reg8[modrm & 7];
                        } else {
                            dest = cpu.safe_read8(cpu.modrm_resolve(modrm));
                        }
                        if (cpu.reg8[reg_eax] === dest) {
                            cpu.flags |= flag_zero;
                            if (modrm >= 0xC0) {
                                cpu.reg8[modrm & 7] = cpu.reg8[reg];
                            } else {
                                cpu.safe_write8(cpu.modrm_resolve(modrm), cpu.reg8[reg]);
                            }
                        } else {
                            cpu.flags &= ~flag_zero;
                            cpu.reg8[reg_eax] = dest;
                        }
                        break;
                    }
                    case 0xB1: { // CMPXCHG r/m32, r32
                        const modrm = cpu.read_imm8();
                        const reg = (modrm >> 3) & 7;
                        let dest;
                        let addr;
                        if (modrm >= 0xC0) {
                            dest = cpu.reg32s[modrm & 7];
                        } else {
                            addr = cpu.modrm_resolve(modrm);
                            dest = cpu.safe_read32s(addr);
                        }
                        if (cpu.reg32s[reg_eax] === dest) {
                            cpu.flags |= flag_zero;
                            if (modrm >= 0xC0) {
                                cpu.reg32s[modrm & 7] = cpu.reg32s[reg];
                            } else {
                                cpu.safe_write32(addr, cpu.reg32s[reg]);
                            }
                        } else {
                            cpu.flags &= ~flag_zero;
                            cpu.reg32s[reg_eax] = dest;
                        }
                        break;
                    }
                    
                    // Group 8 - BT/BTS/BTR/BTC with imm8 (0x0F 0xBA)
                    case 0xBA: {
                        const modrm = cpu.read_imm8();
                        const op = (modrm >> 3) & 7;
                        const bit = cpu.read_imm8() & 31;
                        let value;
                        let addr;
                        
                        if (modrm >= 0xC0) {
                            value = cpu.reg32[modrm & 7];
                        } else {
                            addr = cpu.modrm_resolve(modrm);
                            value = cpu.safe_read32s(addr) >>> 0;
                        }
                        
                        // Set CF based on bit
                        if (value & (1 << bit)) {
                            cpu.flags |= flag_carry;
                        } else {
                            cpu.flags &= ~flag_carry;
                        }
                        
                        let result = value;
                        switch (op) {
                            case 4: // BT - just test, no modification
                                break;
                            case 5: // BTS - set bit
                                result = value | (1 << bit);
                                break;
                            case 6: // BTR - reset bit
                                result = value & ~(1 << bit);
                                break;
                            case 7: // BTC - complement bit
                                result = value ^ (1 << bit);
                                break;
                            default:
                                throw new Error(`Unimplemented 0x0F 0xBA op: ${op}`);
                        }
                        
                        if (op !== 4) { // BT doesn't write
                            if (modrm >= 0xC0) {
                                cpu.reg32[modrm & 7] = result;
                            } else {
                                cpu.safe_write32(addr, result);
                            }
                        }
                        break;
                    }
                    
                    // Jcc rel32
                    case 0x80: case 0x81: case 0x82: case 0x83:
                    case 0x84: case 0x85: case 0x86: case 0x87:
                    case 0x88: case 0x89: case 0x8A: case 0x8B:
                    case 0x8C: case 0x8D: case 0x8E: case 0x8F: {
                        const rel = cpu.read_imm32s();
                        // Simplificado - não salta (precisaria verificar flags)
                        break;
                    }
                    default:
                        throw new Error(`Unimplemented 0x0F opcode: 0x${op2.toString(16)}`);
                }
            };

            // IMUL r32, r/m32, imm32
            t[0x69] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                let value;
                if (modrm >= 0xC0) {
                    value = cpu.reg32s[modrm & 7];
                } else {
                    value = cpu.safe_read32s(cpu.modrm_resolve(modrm));
                }
                const imm = cpu.read_imm32s();
                cpu.reg32s[reg] = Math.imul(value, imm);
            };

            // IMUL r32, r/m32, imm8
            t[0x6B] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                let value;
                if (modrm >= 0xC0) {
                    value = cpu.reg32s[modrm & 7];
                } else {
                    value = cpu.safe_read32s(cpu.modrm_resolve(modrm));
                }
                const imm = cpu.read_imm8s();
                cpu.reg32s[reg] = Math.imul(value, imm);
            };

            // SHL/SHR/SAR r/m32, imm8 (Group 2)
            t[0xC1] = () => {
                const modrm = cpu.read_imm8();
                const op = (modrm >> 3) & 7;
                const imm = cpu.read_imm8() & 31;
                let value;
                let addr;
                
                if (modrm >= 0xC0) {
                    value = cpu.reg32s[modrm & 7];
                } else {
                    addr = cpu.modrm_resolve(modrm);
                    value = cpu.safe_read32s(addr);
                }
                
                let result;
                switch (op) {
                    case 4: result = value << imm; break; // SHL
                    case 5: result = value >>> imm; break; // SHR
                    case 7: result = value >> imm; break; // SAR
                    default: throw new Error(`Unimplemented 0xC1 op: ${op}`);
                }
                
                if (modrm >= 0xC0) {
                    cpu.reg32s[modrm & 7] = result;
                } else {
                    cpu.safe_write32(addr, result);
                }
            };

            // MOV r/m32, imm32
            t[0xC7] = () => {
                const modrm = cpu.read_imm8();
                const imm = cpu.read_imm32s();
                if (modrm >= 0xC0) {
                    cpu.reg32s[modrm & 7] = imm;
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write32(addr, imm);
                }
            };

            // MOV r/m8, imm8
            t[0xC6] = () => {
                const modrm = cpu.read_imm8();
                const imm = cpu.read_imm8();
                if (modrm >= 0xC0) {
                    cpu.reg8[modrm & 7] = imm;
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write8(addr, imm);
                }
            };

            // Group 5 (INC, DEC, CALL, JMP, PUSH)
            t[0xFF] = () => {
                const modrm = cpu.read_imm8();
                const op = (modrm >> 3) & 7;
                let value;
                let addr;
                
                if (modrm >= 0xC0) {
                    value = cpu.reg32s[modrm & 7];
                } else {
                    addr = cpu.modrm_resolve(modrm);
                    value = cpu.safe_read32s(addr);
                }
                
                switch (op) {
                    case 0: // INC
                        if (modrm >= 0xC0) {
                            cpu.reg32s[modrm & 7] = (value + 1) | 0;
                        } else {
                            cpu.safe_write32(addr, (value + 1) | 0);
                        }
                        break;
                    case 1: // DEC
                        if (modrm >= 0xC0) {
                            cpu.reg32s[modrm & 7] = (value - 1) | 0;
                        } else {
                            cpu.safe_write32(addr, (value - 1) | 0);
                        }
                        break;
                    case 2: // CALL near
                        cpu.push32(cpu.instruction_pointer);
                        cpu.instruction_pointer = value;
                        cpu.last_instr_jump = true;
                        break;
                    case 4: // JMP near
                        cpu.instruction_pointer = value;
                        cpu.last_instr_jump = true;
                        break;
                    case 6: // PUSH
                        cpu.push32(value);
                        break;
                    default:
                        throw new Error(`Unimplemented 0xFF op: ${op}`);
                }
            };

            // ADD/OR/ADC/SBB/AND/SUB/XOR/CMP r/m32, imm8
            t[0x83] = () => {
                const modrm = cpu.read_imm8();
                const op = (modrm >> 3) & 7;
                let value;
                let addr;
                
                if (modrm >= 0xC0) {
                    value = cpu.reg32s[modrm & 7];
                } else {
                    addr = cpu.modrm_resolve(modrm);
                    value = cpu.safe_read32s(addr);
                }
                
                const imm = cpu.read_imm8s();
                let result;
                
                switch (op) {
                    case 0: result = (value + imm) | 0; break; // ADD
                    case 1: result = value | imm; break; // OR
                    case 4: result = value & imm; break; // AND
                    case 5: result = (value - imm) | 0; break; // SUB
                    case 6: result = value ^ imm; break; // XOR
                    case 7: return; // CMP
                    default: throw new Error(`Unimplemented 0x83 op: ${op}`);
                }
                
                if (modrm >= 0xC0) {
                    cpu.reg32s[modrm & 7] = result;
                } else {
                    cpu.safe_write32(addr, result);
                }
            };

            // LEAVE
            t[0xC9] = () => {
                cpu.reg32[reg_esp] = cpu.reg32[reg_ebp];
                cpu.reg32s[reg_ebp] = cpu.pop32();
            };

            // CDQ
            t[0x99] = () => {
                cpu.reg32s[reg_edx] = cpu.reg32s[reg_eax] >> 31;
            };

            // IDIV r/m32 (F7 /7)
            t[0xF7] = () => {
                const modrm = cpu.read_imm8();
                const op = (modrm >> 3) & 7;
                let value;
                
                if (modrm >= 0xC0) {
                    value = cpu.reg32s[modrm & 7];
                } else {
                    value = cpu.safe_read32s(cpu.modrm_resolve(modrm));
                }
                
                switch (op) {
                    case 0: // TEST r/m32, imm32
                        cpu.read_imm32();
                        break;
                    case 2: // NOT
                        if (modrm >= 0xC0) {
                            cpu.reg32s[modrm & 7] = ~value;
                        } else {
                            cpu.safe_write32(cpu.modrm_resolve(modrm), ~value);
                        }
                        break;
                    case 3: // NEG
                        if (modrm >= 0xC0) {
                            cpu.reg32s[modrm & 7] = -value;
                        } else {
                            cpu.safe_write32(cpu.modrm_resolve(modrm), -value);
                        }
                        break;
                    case 4: // MUL
                        {
                            const result = BigInt(cpu.reg32[reg_eax]) * BigInt(value >>> 0);
                            cpu.reg32[reg_eax] = Number(result & 0xFFFFFFFFn);
                            cpu.reg32[reg_edx] = Number(result >> 32n);
                        }
                        break;
                    case 5: // IMUL
                        {
                            const result = BigInt(cpu.reg32s[reg_eax]) * BigInt(value);
                            cpu.reg32s[reg_eax] = Number(result & 0xFFFFFFFFn);
                            cpu.reg32s[reg_edx] = Number(result >> 32n);
                        }
                        break;
                    case 6: // DIV
                        {
                            const dividend = (BigInt(cpu.reg32[reg_edx]) << 32n) | BigInt(cpu.reg32[reg_eax]);
                            const divisor = BigInt(value >>> 0);
                            if (divisor === 0n) throw new Error("Division by zero");
                            cpu.reg32[reg_eax] = Number(dividend / divisor);
                            cpu.reg32[reg_edx] = Number(dividend % divisor);
                        }
                        break;
                    case 7: // IDIV
                        {
                            const dividend = (BigInt(cpu.reg32s[reg_edx]) << 32n) | BigInt(cpu.reg32[reg_eax]);
                            const divisor = BigInt(value);
                            if (divisor === 0n) throw new Error("Division by zero");
                            cpu.reg32s[reg_eax] = Number(dividend / divisor);
                            cpu.reg32s[reg_edx] = Number(dividend % divisor);
                        }
                        break;
                    default:
                        throw new Error(`Unimplemented 0xF7 op: ${op}`);
                }
            };

            // REP STOSD / STOSB / etc.
            t[0xAB] = () => { // STOSD
                if (typeof stosd === 'function') {
                    stosd(cpu);
                } else {
                    const dest = cpu.get_seg(reg_es) + cpu.reg32s[reg_edi];
                    cpu.safe_write32(dest, cpu.reg32s[reg_eax]);
                    cpu.reg32s[reg_edi] += (cpu.flags & flag_direction) ? -4 : 4;
                }
            };

            t[0xAA] = () => { // STOSB
                const dest = cpu.get_seg(reg_es) + cpu.reg32s[reg_edi];
                cpu.safe_write8(dest, cpu.reg8[reg_eax]);
                cpu.reg32s[reg_edi] += (cpu.flags & flag_direction) ? -1 : 1;
            };

            // MOVSB / MOVSD
            t[0xA4] = () => { // MOVSB
                const src = cpu.get_seg(reg_ds) + cpu.reg32s[reg_esi];
                const dest = cpu.get_seg(reg_es) + cpu.reg32s[reg_edi];
                cpu.safe_write8(dest, cpu.safe_read8(src));
                const delta = (cpu.flags & flag_direction) ? -1 : 1;
                cpu.reg32s[reg_esi] += delta;
                cpu.reg32s[reg_edi] += delta;
            };

            t[0xA5] = () => { // MOVSD
                const src = cpu.get_seg(reg_ds) + cpu.reg32s[reg_esi];
                const dest = cpu.get_seg(reg_es) + cpu.reg32s[reg_edi];
                cpu.safe_write32(dest, cpu.safe_read32s(src));
                const delta = (cpu.flags & flag_direction) ? -4 : 4;
                cpu.reg32s[reg_esi] += delta;
                cpu.reg32s[reg_edi] += delta;
            };

            // CLD / STD
            t[0xFC] = () => { cpu.flags &= ~flag_direction; }; // CLD
            t[0xFD] = () => { cpu.flags |= flag_direction; }; // STD

            // XCHG EAX, r32
            for (let i = 1; i < 8; i++) {
                t[0x90 + i] = ((r) => () => {
                    const tmp = cpu.reg32s[reg_eax];
                    cpu.reg32s[reg_eax] = cpu.reg32s[r];
                    cpu.reg32s[r] = tmp;
                })(i);
            }

            // ADD r/m8, r8 (0x00)
            t[0x00] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg8[modrm & 7] = (cpu.reg8[modrm & 7] + cpu.reg8[reg]) & 0xFF;
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write8(addr, (cpu.safe_read8(addr) + cpu.reg8[reg]) & 0xFF);
                }
            };

            // ADD r8, r/m8 (0x02)
            t[0x02] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg8[reg] = (cpu.reg8[reg] + cpu.reg8[modrm & 7]) & 0xFF;
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.reg8[reg] = (cpu.reg8[reg] + cpu.safe_read8(addr)) & 0xFF;
                }
            };

            // ADD AL, imm8 (0x04)
            t[0x04] = () => {
                cpu.reg8[reg_eax] = (cpu.reg8[reg_eax] + cpu.read_imm8()) & 0xFF;
            };

            // ADD EAX, imm32 (0x05)
            t[0x05] = () => {
                cpu.reg32s[reg_eax] = (cpu.reg32s[reg_eax] + cpu.read_imm32s()) | 0;
            };

            // OR r/m8, r8 (0x08)
            t[0x08] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg8[modrm & 7] |= cpu.reg8[reg];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write8(addr, cpu.safe_read8(addr) | cpu.reg8[reg]);
                }
            };

            // OR r8, r/m8 (0x0A)
            t[0x0A] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg8[reg] |= cpu.reg8[modrm & 7];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.reg8[reg] |= cpu.safe_read8(addr);
                }
            };

            // OR AL, imm8 (0x0C)
            t[0x0C] = () => {
                cpu.reg8[reg_eax] |= cpu.read_imm8();
            };

            // OR EAX, imm32 (0x0D)
            t[0x0D] = () => {
                cpu.reg32s[reg_eax] |= cpu.read_imm32s();
            };

            // AND r/m8, r8 (0x20)
            t[0x20] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg8[modrm & 7] &= cpu.reg8[reg];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write8(addr, cpu.safe_read8(addr) & cpu.reg8[reg]);
                }
            };

            // AND r8, r/m8 (0x22)
            t[0x22] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg8[reg] &= cpu.reg8[modrm & 7];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.reg8[reg] &= cpu.safe_read8(addr);
                }
            };

            // AND AL, imm8 (0x24)
            t[0x24] = () => {
                cpu.reg8[reg_eax] &= cpu.read_imm8();
            };

            // AND EAX, imm32 (0x25)
            t[0x25] = () => {
                cpu.reg32s[reg_eax] &= cpu.read_imm32s();
            };

            // SUB r/m8, r8 (0x28)
            t[0x28] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg8[modrm & 7] = (cpu.reg8[modrm & 7] - cpu.reg8[reg]) & 0xFF;
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write8(addr, (cpu.safe_read8(addr) - cpu.reg8[reg]) & 0xFF);
                }
            };

            // SUB r8, r/m8 (0x2A)
            t[0x2A] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg8[reg] = (cpu.reg8[reg] - cpu.reg8[modrm & 7]) & 0xFF;
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.reg8[reg] = (cpu.reg8[reg] - cpu.safe_read8(addr)) & 0xFF;
                }
            };

            // SUB AL, imm8 (0x2C)
            t[0x2C] = () => {
                cpu.reg8[reg_eax] = (cpu.reg8[reg_eax] - cpu.read_imm8()) & 0xFF;
            };

            // SUB EAX, imm32 (0x2D)
            t[0x2D] = () => {
                cpu.reg32s[reg_eax] = (cpu.reg32s[reg_eax] - cpu.read_imm32s()) | 0;
            };

            // XOR r/m8, r8 (0x30)
            t[0x30] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg8[modrm & 7] ^= cpu.reg8[reg];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.safe_write8(addr, cpu.safe_read8(addr) ^ cpu.reg8[reg]);
                }
            };

            // XOR r8, r/m8 (0x32)
            t[0x32] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    cpu.reg8[reg] ^= cpu.reg8[modrm & 7];
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    cpu.reg8[reg] ^= cpu.safe_read8(addr);
                }
            };

            // XOR AL, imm8 (0x34)
            t[0x34] = () => {
                cpu.reg8[reg_eax] ^= cpu.read_imm8();
            };

            // XOR EAX, imm32 (0x35)
            t[0x35] = () => {
                cpu.reg32s[reg_eax] ^= cpu.read_imm32s();
            };

            // CMP r/m8, r8 (0x38)
            t[0x38] = () => {
                const modrm = cpu.read_imm8();
                // CMP só afeta flags, apenas avança
            };

            // CMP r8, r/m8 (0x3A)
            t[0x3A] = () => {
                const modrm = cpu.read_imm8();
                // CMP só afeta flags
            };

            // CMP AL, imm8 (0x3C)
            t[0x3C] = () => {
                cpu.read_imm8();
                // CMP só afeta flags
            };

            // CMP EAX, imm32 (0x3D)
            t[0x3D] = () => {
                cpu.read_imm32();
                // CMP só afeta flags
            };

            // PUSH imm32 (0x68)
            t[0x68] = () => {
                cpu.push32(cpu.read_imm32s());
            };

            // PUSH imm8 (0x6A)
            t[0x6A] = () => {
                cpu.push32(cpu.read_imm8s());
            };

            // Group 1 Eb, Ib (0x80)
            t[0x80] = () => {
                const modrm = cpu.read_imm8();
                const op = (modrm >> 3) & 7;
                let value;
                let addr;
                
                if (modrm >= 0xC0) {
                    value = cpu.reg8[modrm & 7];
                } else {
                    addr = cpu.modrm_resolve(modrm);
                    value = cpu.safe_read8(addr);
                }
                
                const imm = cpu.read_imm8();
                let result;
                
                switch (op) {
                    case 0: result = (value + imm) & 0xFF; break; // ADD
                    case 1: result = value | imm; break; // OR
                    case 4: result = value & imm; break; // AND
                    case 5: result = (value - imm) & 0xFF; break; // SUB
                    case 6: result = value ^ imm; break; // XOR
                    case 7: return; // CMP
                    default: throw new Error(`Unimplemented 0x80 op: ${op}`);
                }
                
                if (modrm >= 0xC0) {
                    cpu.reg8[modrm & 7] = result;
                } else {
                    cpu.safe_write8(addr, result);
                }
            };

            // Group 1 Eb, Ib (0x82) - same as 0x80 in 32-bit mode
            t[0x82] = t[0x80];

            // TEST r/m8, r8 (0x84)
            t[0x84] = () => {
                const modrm = cpu.read_imm8();
                // TEST só afeta flags
            };

            // XCHG r/m8, r8 (0x86)
            t[0x86] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    const tmp = cpu.reg8[modrm & 7];
                    cpu.reg8[modrm & 7] = cpu.reg8[reg];
                    cpu.reg8[reg] = tmp;
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    const tmp = cpu.safe_read8(addr);
                    cpu.safe_write8(addr, cpu.reg8[reg]);
                    cpu.reg8[reg] = tmp;
                }
            };

            // XCHG r/m32, r32 (0x87)
            t[0x87] = () => {
                const modrm = cpu.read_imm8();
                const reg = (modrm >> 3) & 7;
                if (modrm >= 0xC0) {
                    const tmp = cpu.reg32s[modrm & 7];
                    cpu.reg32s[modrm & 7] = cpu.reg32s[reg];
                    cpu.reg32s[reg] = tmp;
                } else {
                    const addr = cpu.modrm_resolve(modrm);
                    const tmp = cpu.safe_read32s(addr);
                    cpu.safe_write32(addr, cpu.reg32s[reg]);
                    cpu.reg32s[reg] = tmp;
                }
            };

            // MOV r/m16, r16 - usar segment override ou operand size prefix
            // Para simplificar, assumimos 32-bit mode

            // MOV moffs32, EAX (0xA3)
            t[0xA3] = () => {
                const addr = cpu.read_imm32();
                cpu.safe_write32(addr, cpu.reg32s[reg_eax]);
            };

            // MOV EAX, moffs32 (0xA1)
            t[0xA1] = () => {
                const addr = cpu.read_imm32();
                cpu.reg32s[reg_eax] = cpu.safe_read32s(addr);
            };

            // MOV AL, moffs8 (0xA0)
            t[0xA0] = () => {
                const addr = cpu.read_imm32();
                cpu.reg8[reg_eax] = cpu.safe_read8(addr);
            };

            // MOV moffs8, AL (0xA2)
            t[0xA2] = () => {
                const addr = cpu.read_imm32();
                cpu.safe_write8(addr, cpu.reg8[reg_eax]);
            };

            // TEST AL, imm8 (0xA8)
            t[0xA8] = () => {
                cpu.read_imm8();
                // TEST só afeta flags
            };

            // TEST EAX, imm32 (0xA9)
            t[0xA9] = () => {
                cpu.read_imm32();
                // TEST só afeta flags
            };

            // SHL/SHR/SAR r/m32, 1 (0xD1)
            t[0xD1] = () => {
                const modrm = cpu.read_imm8();
                const op = (modrm >> 3) & 7;
                let value;
                let addr;
                
                if (modrm >= 0xC0) {
                    value = cpu.reg32s[modrm & 7];
                } else {
                    addr = cpu.modrm_resolve(modrm);
                    value = cpu.safe_read32s(addr);
                }
                
                let result;
                switch (op) {
                    case 4: result = value << 1; break; // SHL
                    case 5: result = value >>> 1; break; // SHR
                    case 7: result = value >> 1; break; // SAR
                    default: throw new Error(`Unimplemented 0xD1 op: ${op}`);
                }
                
                if (modrm >= 0xC0) {
                    cpu.reg32s[modrm & 7] = result;
                } else {
                    cpu.safe_write32(addr, result);
                }
            };

            // SHL/SHR/SAR r/m8, 1 (0xD0)
            t[0xD0] = () => {
                const modrm = cpu.read_imm8();
                const op = (modrm >> 3) & 7;
                let value;
                let addr;
                
                if (modrm >= 0xC0) {
                    value = cpu.reg8[modrm & 7];
                } else {
                    addr = cpu.modrm_resolve(modrm);
                    value = cpu.safe_read8(addr);
                }
                
                let result;
                switch (op) {
                    case 4: result = (value << 1) & 0xFF; break; // SHL
                    case 5: result = value >>> 1; break; // SHR
                    case 7: result = (value >> 1) & 0xFF; break; // SAR (with sign)
                    default: throw new Error(`Unimplemented 0xD0 op: ${op}`);
                }
                
                if (modrm >= 0xC0) {
                    cpu.reg8[modrm & 7] = result;
                } else {
                    cpu.safe_write8(addr, result);
                }
            };

            // SHL/SHR/SAR r/m32, CL (0xD3)
            t[0xD3] = () => {
                const modrm = cpu.read_imm8();
                const op = (modrm >> 3) & 7;
                const count = cpu.reg8[reg_ecx] & 31;
                let value;
                let addr;
                
                if (modrm >= 0xC0) {
                    value = cpu.reg32s[modrm & 7];
                } else {
                    addr = cpu.modrm_resolve(modrm);
                    value = cpu.safe_read32s(addr);
                }
                
                let result;
                switch (op) {
                    case 4: result = value << count; break; // SHL
                    case 5: result = value >>> count; break; // SHR
                    case 7: result = value >> count; break; // SAR
                    default: throw new Error(`Unimplemented 0xD3 op: ${op}`);
                }
                
                if (modrm >= 0xC0) {
                    cpu.reg32s[modrm & 7] = result;
                } else {
                    cpu.safe_write32(addr, result);
                }
            };

            // SHL/SHR/SAR r/m8, CL (0xD2)
            t[0xD2] = () => {
                const modrm = cpu.read_imm8();
                const op = (modrm >> 3) & 7;
                const count = cpu.reg8[reg_ecx] & 31;
                let value;
                let addr;
                
                if (modrm >= 0xC0) {
                    value = cpu.reg8[modrm & 7];
                } else {
                    addr = cpu.modrm_resolve(modrm);
                    value = cpu.safe_read8(addr);
                }
                
                let result;
                switch (op) {
                    case 4: result = (value << count) & 0xFF; break; // SHL
                    case 5: result = value >>> count; break; // SHR
                    case 7: result = (value >> count) & 0xFF; break; // SAR
                    default: throw new Error(`Unimplemented 0xD2 op: ${op}`);
                }
                
                if (modrm >= 0xC0) {
                    cpu.reg8[modrm & 7] = result;
                } else {
                    cpu.safe_write8(addr, result);
                }
            };

            // SHL/SHR/SAR r/m8, imm8 (0xC0)
            t[0xC0] = () => {
                const modrm = cpu.read_imm8();
                const op = (modrm >> 3) & 7;
                const imm = cpu.read_imm8() & 31;
                let value;
                let addr;
                
                if (modrm >= 0xC0) {
                    value = cpu.reg8[modrm & 7];
                } else {
                    addr = cpu.modrm_resolve(modrm);
                    value = cpu.safe_read8(addr);
                }
                
                let result;
                switch (op) {
                    case 4: result = (value << imm) & 0xFF; break; // SHL
                    case 5: result = value >>> imm; break; // SHR
                    case 7: result = (value >> imm) & 0xFF; break; // SAR
                    default: throw new Error(`Unimplemented 0xC0 op: ${op}`);
                }
                
                if (modrm >= 0xC0) {
                    cpu.reg8[modrm & 7] = result;
                } else {
                    cpu.safe_write8(addr, result);
                }
            };

            // Group 3 Eb (0xF6)
            t[0xF6] = () => {
                const modrm = cpu.read_imm8();
                const op = (modrm >> 3) & 7;
                let value;
                let addr;
                
                if (modrm >= 0xC0) {
                    value = cpu.reg8[modrm & 7];
                } else {
                    addr = cpu.modrm_resolve(modrm);
                    value = cpu.safe_read8(addr);
                }
                
                switch (op) {
                    case 0: // TEST r/m8, imm8
                        cpu.read_imm8();
                        break;
                    case 2: // NOT
                        if (modrm >= 0xC0) {
                            cpu.reg8[modrm & 7] = (~value) & 0xFF;
                        } else {
                            cpu.safe_write8(addr, (~value) & 0xFF);
                        }
                        break;
                    case 3: // NEG
                        if (modrm >= 0xC0) {
                            cpu.reg8[modrm & 7] = (-value) & 0xFF;
                        } else {
                            cpu.safe_write8(addr, (-value) & 0xFF);
                        }
                        break;
                    case 4: // MUL AL
                        {
                            const result = cpu.reg8[reg_eax] * value;
                            cpu.reg8[reg_eax] = result & 0xFF;
                            cpu.reg8[reg_eax + 4] = (result >> 8) & 0xFF; // AH
                        }
                        break;
                    case 5: // IMUL AL
                        {
                            const result = (cpu.reg8s[reg_eax] * (value << 24 >> 24)) | 0;
                            cpu.reg8[reg_eax] = result & 0xFF;
                            cpu.reg8[reg_eax + 4] = (result >> 8) & 0xFF;
                        }
                        break;
                    case 6: // DIV AL
                        {
                            const ax = cpu.reg16[reg_eax];
                            if (value === 0) throw new Error("Division by zero");
                            cpu.reg8[reg_eax] = (ax / value) & 0xFF;
                            cpu.reg8[reg_eax + 4] = (ax % value) & 0xFF;
                        }
                        break;
                    case 7: // IDIV AL
                        {
                            const ax = cpu.reg16s[reg_eax];
                            if (value === 0) throw new Error("Division by zero");
                            cpu.reg8[reg_eax] = ((ax / (value << 24 >> 24)) | 0) & 0xFF;
                            cpu.reg8[reg_eax + 4] = ((ax % (value << 24 >> 24)) | 0) & 0xFF;
                        }
                        break;
                    default:
                        throw new Error(`Unimplemented 0xF6 op: ${op}`);
                }
            };

            // LODSB (0xAC)
            t[0xAC] = () => {
                const src = cpu.get_seg(reg_ds) + cpu.reg32s[reg_esi];
                cpu.reg8[reg_eax] = cpu.safe_read8(src);
                cpu.reg32s[reg_esi] += (cpu.flags & flag_direction) ? -1 : 1;
            };

            // LODSD (0xAD)
            t[0xAD] = () => {
                const src = cpu.get_seg(reg_ds) + cpu.reg32s[reg_esi];
                cpu.reg32s[reg_eax] = cpu.safe_read32s(src);
                cpu.reg32s[reg_esi] += (cpu.flags & flag_direction) ? -4 : 4;
            };

            // SCASB (0xAE)
            t[0xAE] = () => {
                const dest = cpu.get_seg(reg_es) + cpu.reg32s[reg_edi];
                cpu.safe_read8(dest); // Just read, comparison result in flags
                cpu.reg32s[reg_edi] += (cpu.flags & flag_direction) ? -1 : 1;
            };

            // SCASD (0xAF)
            // Note: 0xAF is also used for IMUL in 0F prefix, handle that separately

            // CMPSB (0xA6)
            t[0xA6] = () => {
                const src = cpu.get_seg(reg_ds) + cpu.reg32s[reg_esi];
                const dest = cpu.get_seg(reg_es) + cpu.reg32s[reg_edi];
                cpu.safe_read8(src);
                cpu.safe_read8(dest);
                const delta = (cpu.flags & flag_direction) ? -1 : 1;
                cpu.reg32s[reg_esi] += delta;
                cpu.reg32s[reg_edi] += delta;
            };

            // CMPSD (0xA7)
            t[0xA7] = () => {
                const src = cpu.get_seg(reg_ds) + cpu.reg32s[reg_esi];
                const dest = cpu.get_seg(reg_es) + cpu.reg32s[reg_edi];
                cpu.safe_read32s(src);
                cpu.safe_read32s(dest);
                const delta = (cpu.flags & flag_direction) ? -4 : 4;
                cpu.reg32s[reg_esi] += delta;
                cpu.reg32s[reg_edi] += delta;
            };

            // CBW/CWDE (0x98)
            t[0x98] = () => {
                // CWDE: sign-extend AX to EAX
                cpu.reg32s[reg_eax] = cpu.reg16s[reg_eax];
            };

            // INT 3 (0xCC)
            t[0xCC] = () => {
                console.log("INT 3 (breakpoint) at 0x" + cpu.instruction_pointer.toString(16));
            };

            // INT imm8 (0xCD)
            t[0xCD] = () => {
                const int_num = cpu.read_imm8();
                console.log("INT " + int_num + " at 0x" + cpu.instruction_pointer.toString(16));
            };

            // CALL far (0x9A) - not commonly used in 32-bit protected mode
            // RETF (0xCB)
            t[0xCB] = () => {
                cpu.instruction_pointer = cpu.pop32();
                cpu.pop32(); // CS (ignore in flat model)
                cpu.last_instr_jump = true;
            };

            // RETF imm16 (0xCA)
            t[0xCA] = () => {
                const imm = cpu.read_imm16();
                cpu.instruction_pointer = cpu.pop32();
                cpu.pop32(); // CS
                cpu.reg32[reg_esp] = (cpu.reg32[reg_esp] + imm) >>> 0;
                cpu.last_instr_jump = true;
            };

            // SAHF (0x9E)
            t[0x9E] = () => {
                const ah = cpu.reg8[reg_eax + 4];
                cpu.flags = (cpu.flags & ~0xFF) | ah;
            };

            // LAHF (0x9F)
            t[0x9F] = () => {
                cpu.reg8[reg_eax + 4] = cpu.flags & 0xFF;
            };

            // PUSHF (0x9C)
            t[0x9C] = () => {
                cpu.push32(cpu.flags);
            };

            // POPF (0x9D)
            t[0x9D] = () => {
                cpu.flags = cpu.pop32();
            };

            // ENTER (0xC8)
            t[0xC8] = () => {
                const size = cpu.read_imm16();
                const nesting = cpu.read_imm8();
                cpu.push32(cpu.reg32s[reg_ebp]);
                cpu.reg32s[reg_ebp] = cpu.reg32s[reg_esp];
                cpu.reg32[reg_esp] = (cpu.reg32[reg_esp] - size) >>> 0;
            };

            // Segment override prefixes (simplified - mostly ignored in flat model)
            t[0x26] = () => { cpu._execute_next(); }; // ES:
            t[0x2E] = () => { cpu._execute_next(); }; // CS:
            t[0x36] = () => { cpu._execute_next(); }; // SS:
            t[0x3E] = () => { cpu._execute_next(); }; // DS:
            t[0x64] = () => { cpu._execute_next(); }; // FS:
            t[0x65] = () => { cpu._execute_next(); }; // GS:

            // Operand size prefix (0x66)
            t[0x66] = () => {
                // For simplicity, just execute next instruction
                // A proper implementation would toggle operand size
                cpu._execute_next();
            };

            // Address size prefix (0x67)
            t[0x67] = () => {
                cpu._execute_next();
            };

            // LOCK prefix (0xF0)
            t[0xF0] = () => {
                cpu._execute_next();
            };

            // REPNE prefix (0xF2) - handled in cycle()
            // REP/REPE prefix (0xF3) - handled in cycle()

            // HLT (0xF4)
            t[0xF4] = () => {
                throw new Error("HLT instruction - CPU halted");
            };

            // CMC (0xF5)
            t[0xF5] = () => {
                cpu.flags ^= flag_carry;
            };

            // CLC (0xF8)
            t[0xF8] = () => {
                cpu.flags &= ~flag_carry;
            };

            // STC (0xF9)
            t[0xF9] = () => {
                cpu.flags |= flag_carry;
            };

            // CLI (0xFA)
            t[0xFA] = () => {
                cpu.flags &= ~flag_interrupt;
            };

            // STI (0xFB)
            t[0xFB] = () => {
                cpu.flags |= flag_interrupt;
            };

            // FPU escape (0xD8-0xDF) - placeholder, would need FPU implementation
            for (let i = 0xD8; i <= 0xDF; i++) {
                t[i] = ((op) => () => {
                    const modrm = cpu.read_imm8();
                    if (modrm < 0xC0) {
                        cpu.modrm_resolve(modrm); // Read address but ignore
                    }
                    // FPU operations are complex - this is a stub
                    // The actual implementation would need a full FPU emulator
                })(i);
            }
        }
    }

    // Criar a tabela global ANTES de criar qualquer CPU
    // O pe_env.js vai modificar esta tabela
    global.table32 = {};
    global.table16 = {};
    
    // Flag para saber se a tabela já foi inicializada
    let tableInitialized = false;

    // Expor globalmente como a API legada esperava
    global.v86 = function() {
        const cpu = new CPU();
        
        // Na primeira vez, inicializar a tabela global com os handlers da CPU
        if (!tableInitialized) {
            // Copiar todos os handlers da CPU para a tabela global
            for (const key in cpu.table32) {
                global.table32[key] = cpu.table32[key];
            }
            tableInitialized = true;
            console.log("v86: table32 initialized with " + Object.keys(global.table32).length + " handlers");
            console.log("v86: table32[0xC3] = " + (global.table32[0xC3] ? "defined" : "undefined"));
        }
        
        // Fazer a CPU usar a tabela global (que pode ser modificada pelo pe_env.js)
        cpu.table32 = global.table32;
        cpu.table16 = global.table16;
        
        return cpu;
    };
    global.V86 = global.v86;
    global.v86WrapperInit = global.v86;

    console.log("v86 legacy compatibility layer loaded");

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : self));
