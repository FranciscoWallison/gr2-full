/**
 * win32runtime.js
 * 
 * Runtime Win32 para emulação de DLLs em JavaScript
 * Baseado em v86 CPU emulator
 * 
 * Este arquivo combina:
 * - Emulador de CPU x86 (v86 simplificado)
 * - Win32 API stubs
 * - Memory allocator
 * - PE loader básico
 * 
 * @version 1.0.0
 * @license MIT
 */

(function(exports) {

    'use strict';

    // ============================================
    // CONSTANTES
    // ============================================

    var BASE_STACK_ADDR = 0x10158000; // ~1MB stack size
    var MAX_MEM_ADDR = 0x13C00000;
    var MAGIC_RETURN_ADDR = MAX_MEM_ADDR - 1;

    // Registradores x86
    var reg_eax = 0,
        reg_ecx = 1,
        reg_edx = 2,
        reg_ebx = 3,
        reg_esp = 4,
        reg_ebp = 5,
        reg_esi = 6,
        reg_edi = 7;

    var reg_es = 0,
        reg_cs = 1,
        reg_ss = 2,
        reg_ds = 3,
        reg_fs = 4,
        reg_gs = 5;

    // Flags
    var flag_carry = 1,
        flag_parity = 4,
        flag_adjust = 16,
        flag_zero = 64,
        flag_sign = 128,
        flag_trap = 256,
        flag_interrupt = 512,
        flag_direction = 1024,
        flag_overflow = 2048;

    var OPSIZE_8 = 7,
        OPSIZE_16 = 15,
        OPSIZE_32 = 31;

    var REPEAT_STRING_PREFIX_NONE = 0,
        REPEAT_STRING_PREFIX_NZ = 1,
        REPEAT_STRING_PREFIX_Z = 2;

    // Debug flag
    var DEBUG = false;

    function dbg_assert(condition, msg) {
        if (DEBUG && !condition) {
            console.error("Assertion failed:", msg);
            throw new Error(msg);
        }
    }

    function dbg_trace() {
        if (DEBUG) console.trace();
    }

    // ============================================
    // MEMORY
    // ============================================

    function Memory(size) {
        this.size = size;
        this.buffer = new ArrayBuffer(size);
        this.mem8 = new Uint8Array(this.buffer);
        this.mem16 = new Uint16Array(this.buffer);
        this.mem32s = new Int32Array(this.buffer);
        this.memfloat = new Float32Array(this.buffer);
    }

    Memory.prototype.read8 = function(addr) {
        return this.mem8[addr];
    };

    Memory.prototype.read16 = function(addr) {
        return this.mem8[addr] | (this.mem8[addr + 1] << 8);
    };

    Memory.prototype.read32s = function(addr) {
        return this.mem8[addr] | (this.mem8[addr + 1] << 8) |
               (this.mem8[addr + 2] << 16) | (this.mem8[addr + 3] << 24);
    };

    Memory.prototype.write8 = function(addr, value) {
        this.mem8[addr] = value;
    };

    Memory.prototype.write16 = function(addr, value) {
        this.mem8[addr] = value & 0xFF;
        this.mem8[addr + 1] = (value >> 8) & 0xFF;
    };

    Memory.prototype.write32 = function(addr, value) {
        this.mem8[addr] = value & 0xFF;
        this.mem8[addr + 1] = (value >> 8) & 0xFF;
        this.mem8[addr + 2] = (value >> 16) & 0xFF;
        this.mem8[addr + 3] = (value >> 24) & 0xFF;
    };

    Memory.prototype.write_aligned32 = function(addr, value) {
        this.mem32s[addr] = value;
    };

    Memory.prototype.readFloat = function(phys_addr) {
        if (phys_addr % 4 === 0)
            return this.memfloat[phys_addr >> 2];
        else {
            var bytes = new Uint8Array(4);
            for (var i = 0; i < 4; i++) bytes[i] = this.mem8[phys_addr + i];
            return new Float32Array(bytes.buffer)[0];
        }
    };

    Memory.prototype.read_string = function(addr) {
        var str = '';
        var c;
        while ((c = this.mem8[addr++]) !== 0) {
            str += String.fromCharCode(c);
        }
        return str;
    };

    // ============================================
    // FPU (FLOATING POINT UNIT) - BÁSICO
    // ============================================

    function FPU(cpu) {
        this.cpu = cpu;
        this.st = new Float64Array(8);
        this.st_ptr = 0;
        this.control_word = 0x37F;
        this.status_word = 0;
        this.tag_word = 0xFFFF;
    }

    FPU.prototype.push = function(value) {
        this.st_ptr = (this.st_ptr - 1) & 7;
        this.st[this.st_ptr] = value;
    };

    FPU.prototype.pop = function() {
        var value = this.st[this.st_ptr];
        this.st_ptr = (this.st_ptr + 1) & 7;
        return value;
    };

    FPU.prototype.get_st = function(i) {
        return this.st[(this.st_ptr + i) & 7];
    };

    FPU.prototype.set_st = function(i, value) {
        this.st[(this.st_ptr + i) & 7] = value;
    };

    // ============================================
    // CPU (v86 SIMPLIFICADO)
    // ============================================

    function v86() {
        this.memory = new Memory(MAX_MEM_ADDR);
        this.reg32s = new Int32Array(8);
        this.reg32 = new Uint32Array(this.reg32s.buffer);
        this.reg16s = new Int16Array(this.reg32s.buffer);
        this.reg16 = new Uint16Array(this.reg32s.buffer);
        this.reg8s = new Int8Array(this.reg32s.buffer);
        this.reg8 = new Uint8Array(this.reg32s.buffer);
        
        this.sreg = new Uint16Array(8);
        this.segment_offsets = new Int32Array(8);
        this.segment_limits = new Uint32Array(8);
        
        this.instruction_pointer = 0;
        this.previous_ip = 0;
        this.flags = 0;
        this.flags_changed = 0;
        this.last_op1 = 0;
        this.last_op2 = 0;
        this.last_op_size = 0;
        this.last_result = 0;
        this.last_add_result = 0;
        
        this.is_32 = true;
        this.address_size_32 = true;
        this.operand_size_32 = true;
        this.stack_size_32 = true;
        this.protected_mode = true;
        this.paging = false;
        
        this.timestamp_counter = 0;
        this.repeat_string_prefix = REPEAT_STRING_PREFIX_NONE;
        this.last_instr_jump = false;
        
        this.regv = this.reg32s;
        this.reg_vsp = reg_esp;
        this.reg_vbp = reg_ebp;
        this.reg_vdi = reg_edi;
        this.reg_vsi = reg_esi;
        this.reg_vcx = reg_ecx;
        this.stack_reg = this.reg32s;
        
        this.fpu = null;
        
        // Tabela de instruções
        this.table32 = [];
        this.table16 = [];
        this.table0F_32 = [];
        this.table0F_16 = [];
        
        this._init_tables();
    }

    v86.prototype.init = function(options) {
        // Inicialização adicional se necessário
        for (var i = 0; i < 8; i++) {
            this.segment_limits[i] = 0xFFFFFFFF;
        }
    };

    v86.prototype.switch_seg = function(reg, value) {
        this.sreg[reg] = value;
        this.segment_offsets[reg] = 0;
    };

    v86.prototype.get_seg = function(reg) {
        return this.segment_offsets[reg];
    };

    v86.prototype.update_operand_size = function() {
        // Placeholder
    };

    v86.prototype.update_address_size = function() {
        // Placeholder
    };

    v86.prototype.get_real_eip = function() {
        return this.instruction_pointer;
    };

    v86.prototype.get_stack_pointer = function(offset) {
        return this.reg32s[reg_esp] + offset;
    };

    v86.prototype.writable_or_pagefault = function(addr, size) {
        // Simplificado - sempre permite
    };

    v86.prototype.trigger_ud = function() {
        throw new Error("Undefined instruction");
    };

    v86.prototype.push32 = function(value) {
        this.reg32s[reg_esp] -= 4;
        this.safe_write32(this.reg32s[reg_esp], value);
    };

    v86.prototype.pop32 = function() {
        var value = this.safe_read32s(this.reg32s[reg_esp]);
        this.reg32s[reg_esp] += 4;
        return value;
    };

    v86.prototype.push16 = function(value) {
        this.reg32s[reg_esp] -= 2;
        this.safe_write16(this.reg32s[reg_esp], value);
    };

    v86.prototype.pop16 = function() {
        var value = this.safe_read16(this.reg32s[reg_esp]);
        this.reg32s[reg_esp] += 2;
        return value;
    };

    v86.prototype.safe_read8 = function(addr) {
        return this.memory.read8(this.translate_address_read(addr));
    };

    v86.prototype.safe_read16 = function(addr) {
        return this.memory.read16(this.translate_address_read(addr));
    };

    v86.prototype.safe_read32s = function(addr) {
        return this.memory.read32s(this.translate_address_read(addr));
    };

    v86.prototype.safe_write8 = function(addr, value) {
        this.memory.write8(this.translate_address_write(addr), value);
    };

    v86.prototype.safe_write16 = function(addr, value) {
        this.memory.write16(this.translate_address_write(addr), value);
    };

    v86.prototype.safe_write32 = function(addr, value) {
        this.memory.write32(this.translate_address_write(addr), value);
    };

    v86.prototype.read_imm8 = function() {
        var value = this.memory.read8(this.translate_address_read(this.instruction_pointer));
        this.instruction_pointer++;
        return value;
    };

    v86.prototype.read_imm8s = function() {
        var value = this.read_imm8();
        return value < 128 ? value : value - 256;
    };

    v86.prototype.read_imm16 = function() {
        var value = this.memory.read16(this.translate_address_read(this.instruction_pointer));
        this.instruction_pointer += 2;
        return value;
    };

    v86.prototype.read_imm32s = function() {
        var value = this.memory.read32s(this.translate_address_read(this.instruction_pointer));
        this.instruction_pointer += 4;
        return value;
    };

    // Arithmetic operations com flags
    v86.prototype.inc = function(value, size) {
        this.flags_changed = flag_overflow | flag_sign | flag_zero | flag_adjust | flag_parity;
        this.last_op1 = value;
        this.last_op_size = size;
        this.last_result = value + 1;
        return this.last_result;
    };

    v86.prototype.dec = function(value, size) {
        this.flags_changed = flag_overflow | flag_sign | flag_zero | flag_adjust | flag_parity;
        this.last_op1 = value;
        this.last_op_size = size;
        this.last_result = value - 1;
        return this.last_result;
    };

    v86.prototype.add = function(dest, src, size) {
        this.flags_changed = flag_overflow | flag_sign | flag_zero | flag_adjust | flag_carry | flag_parity;
        this.last_op1 = dest;
        this.last_op2 = src;
        this.last_op_size = size;
        this.last_add_result = this.last_result = dest + src;
        return this.last_result;
    };

    v86.prototype.sub = function(dest, src, size) {
        this.flags_changed = flag_overflow | flag_sign | flag_zero | flag_adjust | flag_carry | flag_parity;
        this.last_op1 = dest;
        this.last_op2 = src;
        this.last_op_size = size;
        this.last_add_result = this.last_result = dest - src;
        return this.last_result;
    };

    v86.prototype.and = function(dest, src, size) {
        this.flags_changed = flag_sign | flag_zero | flag_parity;
        this.flags &= ~(flag_overflow | flag_carry);
        this.last_op_size = size;
        this.last_result = dest & src;
        return this.last_result;
    };

    v86.prototype.or = function(dest, src, size) {
        this.flags_changed = flag_sign | flag_zero | flag_parity;
        this.flags &= ~(flag_overflow | flag_carry);
        this.last_op_size = size;
        this.last_result = dest | src;
        return this.last_result;
    };

    v86.prototype.xor = function(dest, src, size) {
        this.flags_changed = flag_sign | flag_zero | flag_parity;
        this.flags &= ~(flag_overflow | flag_carry);
        this.last_op_size = size;
        this.last_result = dest ^ src;
        return this.last_result;
    };

    // ModR/M byte resolution
    v86.prototype.modrm_resolve = function(modrm_byte) {
        var mod = modrm_byte >> 6;
        var rm = modrm_byte & 7;
        var result = 0;

        if (mod === 3) {
            return this.reg32s[rm];
        }

        if (this.address_size_32) {
            // 32-bit addressing
            if (rm === 4) {
                // SIB byte
                result = this._sib_resolve(mod);
            } else if (rm === 5 && mod === 0) {
                // disp32
                result = this.read_imm32s();
            } else {
                result = this.reg32s[rm];
            }

            if (mod === 1) {
                result += this.read_imm8s();
            } else if (mod === 2) {
                result += this.read_imm32s();
            }
        } else {
            // 16-bit addressing
            var base_regs = [
                [reg_ebx, reg_esi],
                [reg_ebx, reg_edi],
                [reg_ebp, reg_esi],
                [reg_ebp, reg_edi],
                [reg_esi, -1],
                [reg_edi, -1],
                [reg_ebp, -1],
                [reg_ebx, -1]
            ];

            if (rm === 6 && mod === 0) {
                result = this.read_imm16();
            } else {
                var pair = base_regs[rm];
                result = this.reg32s[pair[0]];
                if (pair[1] !== -1) result += this.reg32s[pair[1]];
            }

            if (mod === 1) {
                result += this.read_imm8s();
            } else if (mod === 2) {
                result += this.read_imm16();
            }
        }

        return result;
    };

    v86.prototype._sib_resolve = function(mod) {
        var sib = this.read_imm8();
        var scale = 1 << (sib >> 6);
        var index = (sib >> 3) & 7;
        var base = sib & 7;

        var result = 0;

        if (base === 5 && mod === 0) {
            result = this.read_imm32s();
        } else {
            result = this.reg32s[base];
        }

        if (index !== 4) {
            result += this.reg32s[index] * scale;
        }

        return result;
    };

    v86.prototype.virt_boundary_read32s = function(low, high) {
        return this.memory.read32s(low);
    };

    v86.prototype.virt_boundary_write32 = function(low, high, value) {
        this.memory.write32(low, value);
    };

    // ============================================
    // INSTRUCTION TABLE INITIALIZATION
    // ============================================

    v86.prototype._init_tables = function() {
        var cpu = this;
        var t = this.table32;

        // Preencher com instrução inválida
        for (var i = 0; i < 256; i++) {
            t[i] = function(cpu) {
                throw new Error("Unimplemented instruction: 0x" + 
                    cpu.memory.read8(cpu.translate_address_read(cpu.instruction_pointer - 1)).toString(16));
            };
        }

        // NOP
        t[0x90] = function(cpu) {};

        // MOV reg, imm32
        for (var i = 0; i < 8; i++) {
            (function(reg) {
                t[0xB8 + reg] = function(cpu) {
                    cpu.reg32s[reg] = cpu.read_imm32s();
                };
            })(i);
        }

        // PUSH reg
        for (var i = 0; i < 8; i++) {
            (function(reg) {
                t[0x50 + reg] = function(cpu) {
                    cpu.push32(cpu.reg32s[reg]);
                };
            })(i);
        }

        // POP reg
        for (var i = 0; i < 8; i++) {
            (function(reg) {
                t[0x58 + reg] = function(cpu) {
                    cpu.reg32s[reg] = cpu.pop32();
                };
            })(i);
        }

        // RET near
        t[0xC3] = function(cpu) {
            cpu.instruction_pointer = cpu.pop32();
            cpu.last_instr_jump = true;
        };

        // RET near imm16
        t[0xC2] = function(cpu) {
            var imm16 = cpu.read_imm16();
            cpu.instruction_pointer = cpu.pop32();
            cpu.reg32s[reg_esp] += imm16;
            cpu.last_instr_jump = true;
        };

        // CALL rel32
        t[0xE8] = function(cpu) {
            var imm32s = cpu.read_imm32s();
            cpu.push32(cpu.get_real_eip());
            cpu.instruction_pointer = cpu.instruction_pointer + imm32s | 0;
            cpu.last_instr_jump = true;
        };

        // JMP rel32
        t[0xE9] = function(cpu) {
            var imm32s = cpu.read_imm32s();
            cpu.instruction_pointer = cpu.instruction_pointer + imm32s | 0;
            cpu.last_instr_jump = true;
        };

        // JMP rel8
        t[0xEB] = function(cpu) {
            var imm8s = cpu.read_imm8s();
            cpu.instruction_pointer = cpu.instruction_pointer + imm8s | 0;
            cpu.last_instr_jump = true;
        };

        // Conditional jumps rel8
        var jcc_rel8 = [
            function(cpu) { return (cpu.flags & flag_overflow) !== 0; },      // JO
            function(cpu) { return (cpu.flags & flag_overflow) === 0; },      // JNO
            function(cpu) { return (cpu.flags & flag_carry) !== 0; },         // JB
            function(cpu) { return (cpu.flags & flag_carry) === 0; },         // JAE
            function(cpu) { return (cpu.flags & flag_zero) !== 0; },          // JE
            function(cpu) { return (cpu.flags & flag_zero) === 0; },          // JNE
            function(cpu) { return ((cpu.flags & flag_carry) | (cpu.flags & flag_zero)) !== 0; }, // JBE
            function(cpu) { return ((cpu.flags & flag_carry) | (cpu.flags & flag_zero)) === 0; }, // JA
            function(cpu) { return (cpu.flags & flag_sign) !== 0; },          // JS
            function(cpu) { return (cpu.flags & flag_sign) === 0; },          // JNS
            function(cpu) { return (cpu.flags & flag_parity) !== 0; },        // JP
            function(cpu) { return (cpu.flags & flag_parity) === 0; },        // JNP
            function(cpu) { return ((cpu.flags & flag_sign) !== 0) !== ((cpu.flags & flag_overflow) !== 0); }, // JL
            function(cpu) { return ((cpu.flags & flag_sign) !== 0) === ((cpu.flags & flag_overflow) !== 0); }, // JGE
            function(cpu) { return ((cpu.flags & flag_zero) !== 0) || (((cpu.flags & flag_sign) !== 0) !== ((cpu.flags & flag_overflow) !== 0)); }, // JLE
            function(cpu) { return ((cpu.flags & flag_zero) === 0) && (((cpu.flags & flag_sign) !== 0) === ((cpu.flags & flag_overflow) !== 0)); }  // JG
        ];

        for (var i = 0; i < 16; i++) {
            (function(cond) {
                t[0x70 + i] = function(cpu) {
                    var imm8s = cpu.read_imm8s();
                    if (jcc_rel8[cond](cpu)) {
                        cpu.instruction_pointer = cpu.instruction_pointer + imm8s | 0;
                        cpu.last_instr_jump = true;
                    }
                };
            })(i);
        }

        // MOV r/m32, r32
        t[0x89] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = cpu.reg32s[reg];
            } else {
                var addr = cpu.modrm_resolve(modrm);
                cpu.safe_write32(addr, cpu.reg32s[reg]);
            }
        };

        // MOV r32, r/m32
        t[0x8B] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg32s[reg] = cpu.reg32s[modrm & 7];
            } else {
                var addr = cpu.modrm_resolve(modrm);
                cpu.reg32s[reg] = cpu.safe_read32s(addr);
            }
        };

        // ADD, OR, ADC, SBB, AND, SUB, XOR, CMP r/m32, imm32
        t[0x81] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var imm = cpu.read_imm32s();
            var dest;

            if (modrm >= 0xC0) {
                dest = cpu.reg32s[modrm & 7];
            } else {
                var addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read32s(addr);
            }

            var result;
            switch (op) {
                case 0: result = cpu.add(dest, imm, OPSIZE_32); break; // ADD
                case 1: result = cpu.or(dest, imm, OPSIZE_32); break;  // OR
                case 4: result = cpu.and(dest, imm, OPSIZE_32); break; // AND
                case 5: result = cpu.sub(dest, imm, OPSIZE_32); break; // SUB
                case 6: result = cpu.xor(dest, imm, OPSIZE_32); break; // XOR
                case 7: cpu.sub(dest, imm, OPSIZE_32); return;         // CMP
                default:
                    throw new Error("Unimplemented 0x81 op: " + op);
            }

            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = result;
            } else {
                cpu.safe_write32(addr, result);
            }
        };

        // ADD, OR, ADC, SBB, AND, SUB, XOR, CMP r/m32, imm8
        t[0x83] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var imm = cpu.read_imm8s();
            var dest;
            var addr;

            if (modrm >= 0xC0) {
                dest = cpu.reg32s[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read32s(addr);
            }

            var result;
            switch (op) {
                case 0: result = cpu.add(dest, imm, OPSIZE_32); break;
                case 1: result = cpu.or(dest, imm, OPSIZE_32); break;
                case 4: result = cpu.and(dest, imm, OPSIZE_32); break;
                case 5: result = cpu.sub(dest, imm, OPSIZE_32); break;
                case 6: result = cpu.xor(dest, imm, OPSIZE_32); break;
                case 7: cpu.sub(dest, imm, OPSIZE_32); return;
                default:
                    throw new Error("Unimplemented 0x83 op: " + op);
            }

            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = result;
            } else {
                cpu.safe_write32(addr, result);
            }
        };

        // XOR r32, r/m32
        t[0x33] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src;
            if (modrm >= 0xC0) {
                src = cpu.reg32s[modrm & 7];
            } else {
                var addr = cpu.modrm_resolve(modrm);
                src = cpu.safe_read32s(addr);
            }
            cpu.reg32s[reg] = cpu.xor(cpu.reg32s[reg], src, OPSIZE_32);
        };

        // TEST r/m32, r32
        t[0x85] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src;
            if (modrm >= 0xC0) {
                src = cpu.reg32s[modrm & 7];
            } else {
                var addr = cpu.modrm_resolve(modrm);
                src = cpu.safe_read32s(addr);
            }
            cpu.and(src, cpu.reg32s[reg], OPSIZE_32);
        };

        // CMP r/m32, r32
        t[0x39] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var dest;
            if (modrm >= 0xC0) {
                dest = cpu.reg32s[modrm & 7];
            } else {
                var addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read32s(addr);
            }
            cpu.sub(dest, cpu.reg32s[reg], OPSIZE_32);
        };

        // CMP r32, r/m32
        t[0x3B] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src;
            if (modrm >= 0xC0) {
                src = cpu.reg32s[modrm & 7];
            } else {
                var addr = cpu.modrm_resolve(modrm);
                src = cpu.safe_read32s(addr);
            }
            cpu.sub(cpu.reg32s[reg], src, OPSIZE_32);
        };

        // LEA r32, m
        t[0x8D] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var addr = cpu.modrm_resolve(modrm);
            cpu.reg32s[reg] = addr;
        };

        // INC/DEC r32 (0x40-0x47, 0x48-0x4F)
        for (var i = 0; i < 8; i++) {
            (function(reg) {
                t[0x40 + reg] = function(cpu) {
                    cpu.reg32s[reg] = cpu.inc(cpu.reg32s[reg], OPSIZE_32);
                };
                t[0x48 + reg] = function(cpu) {
                    cpu.reg32s[reg] = cpu.dec(cpu.reg32s[reg], OPSIZE_32);
                };
            })(i);
        }

        // 0xFF - INC/DEC/CALL/JMP group
        t[0xFF] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var data;

            if (modrm >= 0xC0) {
                data = cpu.reg32s[modrm & 7];
            } else {
                var addr = cpu.modrm_resolve(modrm);
                data = cpu.safe_read32s(addr);
            }

            switch (op) {
                case 0: // INC
                    var result = cpu.inc(data, OPSIZE_32);
                    if (modrm >= 0xC0) {
                        cpu.reg32s[modrm & 7] = result;
                    } else {
                        cpu.safe_write32(addr, result);
                    }
                    break;
                case 1: // DEC
                    var result = cpu.dec(data, OPSIZE_32);
                    if (modrm >= 0xC0) {
                        cpu.reg32s[modrm & 7] = result;
                    } else {
                        cpu.safe_write32(addr, result);
                    }
                    break;
                case 2: // CALL near
                    cpu.push32(cpu.get_real_eip());
                    cpu.instruction_pointer = cpu.get_seg(reg_cs) + data | 0;
                    cpu.last_instr_jump = true;
                    break;
                case 4: // JMP near
                    cpu.instruction_pointer = cpu.get_seg(reg_cs) + data | 0;
                    cpu.last_instr_jump = true;
                    break;
                case 6: // PUSH
                    cpu.push32(data);
                    break;
                default:
                    throw new Error("Unimplemented 0xFF op: " + op);
            }
        };

        // LEAVE
        t[0xC9] = function(cpu) {
            cpu.reg32s[reg_esp] = cpu.reg32s[reg_ebp];
            cpu.reg32s[reg_ebp] = cpu.pop32();
        };

        // Copiar tabela
        this.table16 = t.slice();
    };

    v86.prototype.cycle = function() {
        this.previous_ip = this.instruction_pointer;
        this.last_instr_jump = false;
        this.timestamp_counter++;

        var opcode = this.read_imm8();
        this.table32[opcode](this);
    };

    // Export v86
    exports.v86 = v86;

    // ============================================
    // WIN32 API STUBS
    // ============================================

    var WIN32API = {

        GetProcessHeap: function(runtime, cpu) {
            runtime.cpu.reg32[reg_eax] = 1; // PROCESS_HEAP handle
            runtime.instruction_ret(0);
        },

        HeapAlloc: function(runtime, cpu) {
            var hHeap = runtime.get_arg(1);
            var dwFlags = runtime.get_arg(2);
            var dwBytes = runtime.get_arg(3);

            runtime.cpu.reg32[reg_eax] = runtime.allocator.alloc(dwBytes);
            runtime.instruction_ret(3 * 4);
        },

        HeapFree: function(runtime, cpu) {
            var hHeap = runtime.get_arg(1);
            var dwFlags = runtime.get_arg(2);
            var lpMem = runtime.get_arg(3);

            var ret_val = runtime.allocator.free(lpMem) ? 1 : 0;
            runtime.cpu.reg32[reg_eax] = ret_val;
            runtime.instruction_ret(3 * 4);
        },

        GetSystemDirectoryA: function(runtime, cpu) {
            var lpBuffer = runtime.get_arg(1);
            var uSize = runtime.get_arg(2);
            var sysDir = "C:\\Windows\\System32";

            if (lpBuffer && uSize > 0) {
                for (var i = 0; i < sysDir.length && i < uSize - 1; i++) {
                    runtime.cpu.memory.mem8[runtime.cpu.translate_address_write(lpBuffer + i)] = sysDir.charCodeAt(i);
                }
                runtime.cpu.memory.mem8[runtime.cpu.translate_address_write(lpBuffer + Math.min(sysDir.length, uSize - 1))] = 0;
            }

            runtime.cpu.reg32[reg_eax] = sysDir.length;
            runtime.instruction_ret(2 * 4);
        },

        GetWindowsDirectoryA: function(runtime, cpu) {
            var lpBuffer = runtime.get_arg(1);
            var uSize = runtime.get_arg(2);
            var winDir = "C:\\Windows";

            if (lpBuffer && uSize > 0) {
                for (var i = 0; i < winDir.length && i < uSize - 1; i++) {
                    runtime.cpu.memory.mem8[runtime.cpu.translate_address_write(lpBuffer + i)] = winDir.charCodeAt(i);
                }
                runtime.cpu.memory.mem8[runtime.cpu.translate_address_write(lpBuffer + Math.min(winDir.length, uSize - 1))] = 0;
            }

            runtime.cpu.reg32[reg_eax] = winDir.length;
            runtime.instruction_ret(2 * 4);
        },

        QueryPerformanceCounter: function(runtime, cpu) {
            var lpPerformanceCount = runtime.get_arg(1);
            var now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 1000000;
            var countLow = now >>> 0;
            var countHigh = (now / 0x100000000) >>> 0;

            if (lpPerformanceCount) {
                var addr = runtime.cpu.translate_address_write(lpPerformanceCount);
                runtime.cpu.memory.mem32s[addr / 4] = countLow;
                runtime.cpu.memory.mem32s[addr / 4 + 1] = countHigh;
            }

            runtime.cpu.reg32[reg_eax] = 1;
            runtime.instruction_ret(1 * 4);
        },

        QueryPerformanceFrequency: function(runtime, cpu) {
            var lpFrequency = runtime.get_arg(1);

            if (lpFrequency) {
                var addr = runtime.cpu.translate_address_write(lpFrequency);
                runtime.cpu.memory.mem32s[addr / 4] = 1000000000;
                runtime.cpu.memory.mem32s[addr / 4 + 1] = 0;
            }

            runtime.cpu.reg32[reg_eax] = 1;
            runtime.instruction_ret(1 * 4);
        },

        DisableThreadLibraryCalls: function(runtime, cpu) {
            runtime.cpu.reg32[reg_eax] = 1;
            runtime.instruction_ret(1 * 4);
        },

        GetModuleFileNameA: function(runtime, cpu) {
            var hModule = runtime.get_arg(1);
            var lpFilename = runtime.get_arg(2);
            var nSize = runtime.get_arg(3);
            var filename = "granny2.dll";

            if (lpFilename && nSize > 0) {
                for (var i = 0; i < filename.length && i < nSize - 1; i++) {
                    runtime.cpu.memory.mem8[runtime.cpu.translate_address_write(lpFilename + i)] = filename.charCodeAt(i);
                }
                runtime.cpu.memory.mem8[runtime.cpu.translate_address_write(lpFilename + Math.min(filename.length, nSize - 1))] = 0;
            }

            runtime.cpu.reg32[reg_eax] = filename.length;
            runtime.instruction_ret(3 * 4);
        },

        Sleep: function(runtime, cpu) {
            runtime.instruction_ret(1 * 4);
        },

        LocalFree: function(runtime, cpu) {
            var hMem = runtime.get_arg(1);
            if (hMem) runtime.allocator.free(hMem);
            runtime.cpu.reg32[reg_eax] = 0;
            runtime.instruction_ret(1 * 4);
        },

        GetLastError: function(runtime, cpu) {
            runtime.cpu.reg32[reg_eax] = 0;
            runtime.instruction_ret(0);
        },

        FormatMessageA: function(runtime, cpu) {
            runtime.cpu.reg32[reg_eax] = 0;
            runtime.instruction_ret(7 * 4);
        },

        MessageBoxA: function(runtime, cpu) {
            var lpText = runtime.get_arg(2);
            var lpCaption = runtime.get_arg(3);

            var text = "", caption = "";
            if (lpText) {
                var addr = runtime.cpu.translate_address_read(lpText);
                var c;
                while ((c = runtime.cpu.memory.mem8[addr++]) !== 0) text += String.fromCharCode(c);
            }
            if (lpCaption) {
                var addr = runtime.cpu.translate_address_read(lpCaption);
                var c;
                while ((c = runtime.cpu.memory.mem8[addr++]) !== 0) caption += String.fromCharCode(c);
            }

            console.log("MessageBox: [" + caption + "] " + text);
            runtime.cpu.reg32[reg_eax] = 1;
            runtime.instruction_ret(4 * 4);
        },

        CreateFileA: function(runtime, cpu) {
            runtime.cpu.reg32[reg_eax] = 0xFFFFFFFF; // INVALID_HANDLE_VALUE
            runtime.instruction_ret(7 * 4);
        },

        CloseHandle: function(runtime, cpu) {
            runtime.cpu.reg32[reg_eax] = 1;
            runtime.instruction_ret(1 * 4);
        },

        DeleteFileA: function(runtime, cpu) {
            runtime.cpu.reg32[reg_eax] = 1;
            runtime.instruction_ret(1 * 4);
        },

        ReadFile: function(runtime, cpu) {
            runtime.cpu.reg32[reg_eax] = 0;
            runtime.instruction_ret(5 * 4);
        },

        WriteFile: function(runtime, cpu) {
            runtime.cpu.reg32[reg_eax] = 0;
            runtime.instruction_ret(5 * 4);
        },

        SetFilePointer: function(runtime, cpu) {
            runtime.cpu.reg32[reg_eax] = 0xFFFFFFFF;
            runtime.instruction_ret(4 * 4);
        }

    };

    // ============================================
    // WIN32 RUNTIME
    // ============================================

    function Win32Runtime(bin, base_addr, import_offsets, exports) {
        this.imports = {};
        this.exports = exports;
        this.base_addr = base_addr;
        this.stack_addr = BASE_STACK_ADDR;

        this.init_cpu();

        // Copia imagem para memória do emulador
        this.cpu.memory.mem8.set(new Uint8Array(bin), 0);

        this.insert_hooks(import_offsets);

        // Referência privada para memória
        this.mem32 = this.cpu.memory.mem32s;

        // Allocator
        var self = this;
        this.allocator = new (function() {
            function alloc_entry(begin, end) {
                return [begin, end];
            }

            var MIN_BOUND = base_addr;
            var MAX_BOUND = MAX_MEM_ADDR;
            var map = [];

            this._map = map;

            // PE Image
            map.push(alloc_entry(base_addr, base_addr + bin.byteLength));
            console.log("Image loaded from 0x" + map[0][0].toString(16) + " to 0x" + map[0][1].toString(16));

            // Stack
            map.push(alloc_entry(map[0][1], BASE_STACK_ADDR + 4 * 10));
            console.log("Stack range 0x" + map[1][0].toString(16) + " to 0x" + map[1][1].toString(16));

            this.realloc = function(ptr, size) {
                if (ptr === 0) {
                    return this.alloc(size);
                }

                var map_idx = -1;
                for (var i = 0; i < map.length; i++) {
                    if (map[i][0] === ptr) {
                        map_idx = i;
                        break;
                    }
                }

                if (map_idx === -1) {
                    throw "Tried to reallocate invalid pointer!";
                }

                if (map_idx === map.length - 1) {
                    if (map[map_idx][0] + size > MAX_BOUND) {
                        throw "Out of memory!";
                    }
                    map[map_idx][1] = map[map_idx][0] + size;
                    return ptr;
                } else if (map[map_idx][0] + size < map[map_idx + 1][0]) {
                    map[map_idx][1] = map[map_idx][0] + size;
                    return ptr;
                } else {
                    this.free(ptr);
                    return this.alloc(size);
                }
            };

            this.alloc = function(size) {
                var curr, last;

                // Alinha tamanho para 4 bytes
                size = Math.ceil(size / 4) * 4;

                // Tenta encontrar espaço entre alocações existentes
                for (var i = 1; i < map.length; i++) {
                    last = map[i - 1];
                    curr = map[i];

                    if (curr[0] - last[1] >= size) {
                        map.splice(i, 0, alloc_entry(last[1], last[1] + size));
                        return last[1];
                    }
                }

                // Coloca no final
                last = map[map.length - 1];

                if (last[1] + size > MAX_BOUND) {
                    throw "Out of memory";
                }

                map.push(alloc_entry(last[1], last[1] + size));
                return last[1];
            };

            this.free = function(addr) {
                for (var i = 0; i < map.length; i++) {
                    if (map[i][0] === addr) {
                        map.splice(i, 1);
                        return true;
                    }
                }
                return false;
            };

            this.getAllocCount = function() {
                return map.length;
            };
        })();
    }

    var fn = Win32Runtime.prototype;

    fn.init_cpu = function() {
        var cpu = this.cpu = new v86();
        var base_addr = this.base_addr;

        // Simplifica tradução de endereços
        cpu.translate_address_write =
        cpu.translate_address_user_write =
        cpu.translate_address_user_read =
        cpu.translate_address_system_write =
        cpu.translate_address_system_read =
        cpu.translate_address_read = function(addr) {
            return addr - base_addr;
        };

        cpu.init({});

        cpu.fpu = new FPU(cpu);

        cpu.switch_seg(reg_cs, 0);
        cpu.switch_seg(reg_ss, 0);
        cpu.switch_seg(reg_ds, 0);
        cpu.switch_seg(reg_es, 0);
        cpu.switch_seg(reg_gs, 0);
        cpu.switch_seg(reg_fs, 0);

        cpu.is_32 = true;
        cpu.address_size_32 = true;
        cpu.operand_size_32 = true;
        cpu.stack_size_32 = true;
        cpu.protected_mode = true;

        cpu.update_operand_size();
        cpu.update_address_size();

        cpu.regv = cpu.reg32s;
        cpu.reg_vsp = reg_esp;
        cpu.reg_vbp = reg_ebp;

        cpu.paging = true;
        cpu.stack_reg = cpu.reg32s;
        cpu.reg32[reg_esp] = this.stack_addr;
    };

    fn.get_arg = function(n) {
        var esp_addr = this.cpu.translate_address_read(this.cpu.reg32[reg_esp]);
        return this.cpu.memory.mem32s[(esp_addr / 4) + n];
    };

    fn.instruction_ret = function(arg_size) {
        this.cpu.instruction_pointer = this.get_arg(0);
        this.cpu.reg32[reg_esp] += 4 + arg_size;
    };

    fn.get_byte_ptr = function(va) {
        var a = this.cpu.translate_address_read(va);
        return this.cpu.memory.mem8[a];
    };

    fn.get_word_ptr = function(va) {
        var a = this.cpu.translate_address_read(va);
        return this.cpu.memory.mem8[a] | this.cpu.memory.mem8[a + 1] << 8;
    };

    fn.set_word_ptr = function(va, value) {
        this.cpu.memory.mem16[this.cpu.translate_address_read(va) / 2] = value;
    };

    fn.get_dword_ptr = function(va) {
        var a = this.cpu.translate_address_read(va);
        return (this.cpu.memory.mem8[a] | this.cpu.memory.mem8[a + 1] << 8 |
            this.cpu.memory.mem8[a + 2] << 16 | this.cpu.memory.mem8[a + 3] << 24) >>> 0;
    };

    fn.set_dword_ptr = function(va, value) {
        var a = this.cpu.translate_address_read(va);
        this.cpu.memory.mem32s[a / 4] = value;
    };

    fn.copy_to_mem = function(dst_address, array) {
        var phys_addr = this.cpu.translate_address_write(dst_address);
        this.cpu.memory.mem8.set(array, phys_addr);
    };

    fn.copy_from_mem = function(src_address, array) {
        var phys_addr = this.cpu.translate_address_read(src_address);
        array.set(this.cpu.memory.mem8.subarray(phys_addr, phys_addr + array.length));
    };

    fn.add_hook = function(va, hookFn) {
        var hook_name = "_hook_" + va.toString(16);
        WIN32API[hook_name] = hookFn;
        this.imports[va] = hook_name;
    };

    fn.insert_hooks = function(import_offsets) {
        var self = this;

        // Setup endereços virtuais reais para imports
        for (var addr in import_offsets) {
            var real_addr = this.cpu.translate_address_read(addr);

            if (real_addr % 4 !== 0) {
                throw "Alignment error at 0x" + addr.toString(16);
            }

            var virtual_addr = this.cpu.memory.mem32s[real_addr / 4];
            this.imports[virtual_addr] = import_offsets[addr];
        }

        // Hook de chamadas
        var original_call = this.cpu.table32[0xE8];
        this.cpu.table32[0xE8] = function(cpu) {
            var imm32s = cpu.read_imm32s();
            cpu.push32(cpu.get_real_eip());
            cpu.instruction_pointer = cpu.instruction_pointer + imm32s | 0;
            cpu.last_instr_jump = true;

            // Verifica se é uma função importada
            if (self.imports[cpu.instruction_pointer] !== undefined) {
                var method_name = self.imports[cpu.instruction_pointer];
                if (method_name in WIN32API) {
                    WIN32API[method_name](self, cpu);
                } else {
                    self.halt_instructions = true;
                    throw "Called unimplemented imported function: " + method_name;
                }
            }
        };

        // Hook para CALL indirect (0xFF /2)
        var original_ff = this.cpu.table32[0xFF];
        this.cpu.table32[0xFF] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;

            if (op === 2) { // CALL near indirect
                var data;
                if (modrm >= 0xC0) {
                    data = cpu.reg32s[modrm & 7];
                } else {
                    var addr = cpu.modrm_resolve(modrm);
                    data = cpu.safe_read32s(addr);
                }

                cpu.push32(cpu.get_real_eip());
                cpu.instruction_pointer = cpu.get_seg(reg_cs) + data | 0;
                cpu.last_instr_jump = true;

                // Verifica se é uma função importada
                if (self.imports[cpu.instruction_pointer] !== undefined) {
                    var method_name = self.imports[cpu.instruction_pointer];
                    if (method_name in WIN32API) {
                        WIN32API[method_name](self, cpu);
                    } else {
                        self.halt_instructions = true;
                        throw "Called unimplemented imported function: " + method_name;
                    }
                }
            } else {
                // Re-executa a instrução normalmente
                cpu.instruction_pointer--; // Volta o ponteiro
                original_ff(cpu);
            }
        };

        // Hook de retorno para detectar fim de execução
        var original_ret = this.cpu.table32[0xC3];
        this.cpu.table32[0xC3] = function(cpu) {
            original_ret(cpu);
            if (cpu.instruction_pointer === MAGIC_RETURN_ADDR) {
                self.halt_instructions = true;
                self.function_call_done = true;
            }
        };

        var original_ret_imm = this.cpu.table32[0xC2];
        this.cpu.table32[0xC2] = function(cpu) {
            original_ret_imm(cpu);
            if (cpu.instruction_pointer === MAGIC_RETURN_ADDR) {
                self.halt_instructions = true;
                self.function_call_done = true;
            }
        };
    };

    fn.stdcall = function(address) {
        // Reset estado
        this.stack_addr = BASE_STACK_ADDR;
        this.function_call_done = false;
        this.halt_instructions = false;

        var cpu = this.cpu;

        if (!address || address === 0) {
            throw "stdcall: Invalid function address";
        }

        // Número de argumentos (excluindo o address)
        var num_args = arguments.length - 1;

        // Ajusta ESP
        cpu.reg32[reg_esp] -= 4; // Espaço para return address
        cpu.reg32[reg_esp] -= num_args * 4; // Espaço para argumentos

        var sp_phys = cpu.translate_address_read(cpu.reg32[reg_esp]);

        // Escreve argumentos
        for (var i = num_args; i >= 1; i--) {
            cpu.memory.mem32s[sp_phys / 4] = arguments[i];
            sp_phys += 4;
        }

        // Escreve return address
        cpu.memory.mem32s[sp_phys / 4] = MAGIC_RETURN_ADDR;

        // Jump para função
        cpu.instruction_pointer = address;

        // Executa
        var max_cycles = 100000000; // Limite de segurança
        var cycles = 0;

        while (!this.function_call_done && !this.halt_instructions && cycles < max_cycles) {
            cpu.cycle();
            cycles++;
        }

        if (this.function_call_done) {
            return cpu.reg32[reg_eax];
        } else if (cycles >= max_cycles) {
            throw "Execution timeout - possible infinite loop";
        } else {
            throw "Execution failed";
        }
    };

    // Export
    exports.Win32Runtime = Win32Runtime;
    exports.WIN32API = WIN32API;

    // Expor constantes de registradores
    exports.reg_eax = reg_eax;
    exports.reg_ecx = reg_ecx;
    exports.reg_edx = reg_edx;
    exports.reg_ebx = reg_ebx;
    exports.reg_esp = reg_esp;
    exports.reg_ebp = reg_ebp;
    exports.reg_esi = reg_esi;
    exports.reg_edi = reg_edi;

})(typeof exports !== 'undefined' ? exports : this);
