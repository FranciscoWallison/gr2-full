/**
 * granny2_runtime.js
 * 
 * Wrapper que integra libv86.js + pe_env.js para uso com granny2.js
 * 
 * ORDEM DE CARREGAMENTO:
 * 1. libv86.js (emulador v86)
 * 2. granny2_runtime.js (este arquivo)
 * 3. granny2.js
 * 4. granny2_additions.js (opcional)
 * 
 * OU use granny2_bundle.html que carrega tudo automaticamente
 */

(function(exports) {
    'use strict';

    // ============================================
    // CONSTANTES DE REGISTRADORES
    // ============================================

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

    // Exporta constantes globalmente
    exports.reg_eax = reg_eax;
    exports.reg_ecx = reg_ecx;
    exports.reg_edx = reg_edx;
    exports.reg_ebx = reg_ebx;
    exports.reg_esp = reg_esp;
    exports.reg_ebp = reg_ebp;
    exports.reg_esi = reg_esi;
    exports.reg_edi = reg_edi;

    exports.reg_es = reg_es;
    exports.reg_cs = reg_cs;
    exports.reg_ss = reg_ss;
    exports.reg_ds = reg_ds;
    exports.reg_fs = reg_fs;
    exports.reg_gs = reg_gs;

    exports.flag_carry = flag_carry;
    exports.flag_direction = flag_direction;

    exports.OPSIZE_8 = OPSIZE_8;
    exports.OPSIZE_16 = OPSIZE_16;
    exports.OPSIZE_32 = OPSIZE_32;

    exports.REPEAT_STRING_PREFIX_NONE = REPEAT_STRING_PREFIX_NONE;

    // Debug helpers
    exports.DEBUG = false;
    exports.dbg_assert = function(cond, msg) {
        if (exports.DEBUG && !cond) {
            console.error("Assertion failed:", msg);
        }
    };

    // ============================================
    // CONFIGURAÇÃO
    // ============================================

    var BASE_STACK_ADDR = 0x10158000;
    var MAX_MEM_ADDR = 0x13C00000;
    var MAGIC_RETURN_ADDR = MAX_MEM_ADDR - 1;

    // ============================================
    // CLASSE v86 WRAPPER
    // ============================================

    /**
     * Wrapper para o v86 que fornece interface compatível com pe_env.js
     */
    function v86() {
        // Inicializa memória
        this.memory = {
            buffer: new ArrayBuffer(MAX_MEM_ADDR),
            mem8: null,
            mem16: null,
            mem32s: null,
            memfloat: null
        };

        this.memory.mem8 = new Uint8Array(this.memory.buffer);
        this.memory.mem16 = new Uint16Array(this.memory.buffer);
        this.memory.mem32s = new Int32Array(this.memory.buffer);
        this.memory.memfloat = new Float32Array(this.memory.buffer);

        // Registradores
        this.reg32s = new Int32Array(8);
        this.reg32 = new Uint32Array(this.reg32s.buffer);
        this.reg16s = new Int16Array(this.reg32s.buffer);
        this.reg16 = new Uint16Array(this.reg32s.buffer);
        this.reg8s = new Int8Array(this.reg32s.buffer);
        this.reg8 = new Uint8Array(this.reg32s.buffer);

        // Segmentos
        this.sreg = new Uint16Array(8);
        this.segment_offsets = new Int32Array(8);
        this.segment_limits = new Uint32Array(8);

        // Estado
        this.instruction_pointer = 0;
        this.previous_ip = 0;
        this.flags = 0;
        this.flags_changed = 0;
        this.last_op1 = 0;
        this.last_op2 = 0;
        this.last_op_size = 0;
        this.last_result = 0;
        this.last_add_result = 0;

        // Modo
        this.is_32 = true;
        this.address_size_32 = true;
        this.operand_size_32 = true;
        this.stack_size_32 = true;
        this.protected_mode = true;
        this.paging = false;

        this.timestamp_counter = 0;
        this.repeat_string_prefix = REPEAT_STRING_PREFIX_NONE;
        this.last_instr_jump = false;

        // Aliases
        this.regv = this.reg32s;
        this.reg_vsp = reg_esp;
        this.reg_vbp = reg_ebp;
        this.reg_vdi = reg_edi;
        this.reg_vsi = reg_esi;
        this.reg_vcx = reg_ecx;
        this.stack_reg = this.reg32s;

        // FPU
        this.fpu = new FPU(this);

        // Inicializa limites de segmento
        for (var i = 0; i < 8; i++) {
            this.segment_limits[i] = 0xFFFFFFFF;
        }

        // Adiciona métodos de memória
        var self = this;
        this.memory.read8 = function(addr) { return self.memory.mem8[addr]; };
        this.memory.read16 = function(addr) { 
            return self.memory.mem8[addr] | (self.memory.mem8[addr + 1] << 8); 
        };
        this.memory.read32s = function(addr) {
            return self.memory.mem8[addr] | (self.memory.mem8[addr + 1] << 8) |
                   (self.memory.mem8[addr + 2] << 16) | (self.memory.mem8[addr + 3] << 24);
        };
        this.memory.write8 = function(addr, value) { self.memory.mem8[addr] = value; };
        this.memory.write16 = function(addr, value) {
            self.memory.mem8[addr] = value & 0xFF;
            self.memory.mem8[addr + 1] = (value >> 8) & 0xFF;
        };
        this.memory.write32 = function(addr, value) {
            self.memory.mem8[addr] = value & 0xFF;
            self.memory.mem8[addr + 1] = (value >> 8) & 0xFF;
            self.memory.mem8[addr + 2] = (value >> 16) & 0xFF;
            self.memory.mem8[addr + 3] = (value >> 24) & 0xFF;
        };
        this.memory.write_aligned32 = function(addr, value) {
            self.memory.mem32s[addr] = value;
        };
        this.memory.readFloat = function(phys_addr) {
            if (phys_addr % 4 === 0) return self.memory.memfloat[phys_addr >> 2];
            var bytes = new Uint8Array(4);
            for (var i = 0; i < 4; i++) bytes[i] = self.memory.mem8[phys_addr + i];
            return new Float32Array(bytes.buffer)[0];
        };
        this.memory.read_string = function(addr) {
            var str = '', c;
            while ((c = self.memory.mem8[addr++]) !== 0) str += String.fromCharCode(c);
            return str;
        };

        // Tabela de instruções - usa referência global para pe_env.js poder modificar
        // Inicializa tabelas globais se não existirem
        if (!exports.table32 || exports.table32.length === 0) {
            exports.table32 = new Array(256);
            exports.table16 = new Array(256);
            exports.table0F_32 = new Array(256);
            exports.table0F_16 = new Array(256);
        }
        
        // Aponta para as tabelas globais
        this.table32 = exports.table32;
        this.table16 = exports.table16;
        this.table0F_32 = exports.table0F_32;
        this.table0F_16 = exports.table0F_16;

        this._init_instruction_table();
        
        // Expõe a CPU globalmente para pe_env.js
        exports.cpu = this;
    }

    v86.prototype.init = function(options) {
        // Inicialização adicional
    };

    v86.prototype.switch_seg = function(reg, value) {
        this.sreg[reg] = value;
        this.segment_offsets[reg] = 0;
    };

    v86.prototype.get_seg = function(reg) {
        return this.segment_offsets[reg];
    };

    v86.prototype.update_operand_size = function() {};
    v86.prototype.update_address_size = function() {};

    v86.prototype.get_real_eip = function() {
        return this.instruction_pointer;
    };

    v86.prototype.get_stack_pointer = function(offset) {
        return this.reg32s[reg_esp] + offset;
    };

    v86.prototype.writable_or_pagefault = function(addr, size) {};

    v86.prototype.trigger_ud = function() {
        throw new Error("Undefined instruction at 0x" + this.instruction_pointer.toString(16));
    };

    // Stack operations
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

    // Memory access
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

    // Immediate reads
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

    v86.prototype.read_imm16s = function() {
        var value = this.read_imm16();
        return value < 32768 ? value : value - 65536;
    };

    v86.prototype.read_imm32s = function() {
        var value = this.memory.read32s(this.translate_address_read(this.instruction_pointer));
        this.instruction_pointer += 4;
        return value;
    };

    // Arithmetic with flags
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

    v86.prototype.shl = function(dest, count, size) {
        count &= 31;
        if (count === 0) return dest;
        this.flags_changed = flag_overflow | flag_sign | flag_zero | flag_parity;
        this.last_op_size = size;
        this.last_result = dest << count;
        if (count <= size) {
            if ((dest << (count - 1)) & (1 << size)) {
                this.flags |= flag_carry;
            } else {
                this.flags &= ~flag_carry;
            }
        }
        return this.last_result;
    };

    v86.prototype.shr = function(dest, count, size) {
        count &= 31;
        if (count === 0) return dest;
        this.flags_changed = flag_overflow | flag_sign | flag_zero | flag_parity;
        this.last_op_size = size;
        dest = dest >>> 0;
        this.last_result = dest >>> count;
        if ((dest >>> (count - 1)) & 1) {
            this.flags |= flag_carry;
        } else {
            this.flags &= ~flag_carry;
        }
        return this.last_result;
    };

    v86.prototype.sar = function(dest, count, size) {
        count &= 31;
        if (count === 0) return dest;
        this.flags_changed = flag_overflow | flag_sign | flag_zero | flag_parity;
        this.last_op_size = size;
        this.last_result = dest >> count;
        if ((dest >> (count - 1)) & 1) {
            this.flags |= flag_carry;
        } else {
            this.flags &= ~flag_carry;
        }
        return this.last_result;
    };

    // ModR/M resolution
    v86.prototype.modrm_resolve = function(modrm_byte) {
        var mod = modrm_byte >> 6;
        var rm = modrm_byte & 7;
        var result = 0;

        if (mod === 3) {
            return this.reg32s[rm];
        }

        if (this.address_size_32) {
            if (rm === 4) {
                result = this._sib_resolve(mod);
            } else if (rm === 5 && mod === 0) {
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
            var base_regs = [
                [reg_ebx, reg_esi], [reg_ebx, reg_edi],
                [reg_ebp, reg_esi], [reg_ebp, reg_edi],
                [reg_esi, -1], [reg_edi, -1],
                [reg_ebp, -1], [reg_ebx, -1]
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

    // Cycle
    v86.prototype.cycle = function() {
        this.previous_ip = this.instruction_pointer;
        this.last_instr_jump = false;
        this.timestamp_counter++;

        var opcode = this.read_imm8();
        
        if (this.table32[opcode]) {
            this.table32[opcode](this);
        } else {
            throw new Error("Unimplemented opcode: 0x" + opcode.toString(16) + 
                " at 0x" + this.previous_ip.toString(16));
        }
    };

    // ============================================
    // INSTRUCTION TABLE
    // ============================================

    v86.prototype._init_instruction_table = function() {
        var cpu = this;
        var t = this.table32;

        // Preenche com instrução inválida
        for (var i = 0; i < 256; i++) {
            t[i] = null;
        }

        // 0x00-0x05: ADD
        t[0x00] = function(cpu) { // ADD r/m8, r8
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg8[modrm & 7] = cpu.add(cpu.reg8[modrm & 7], cpu.reg8[reg], OPSIZE_8);
            } else {
                var addr = cpu.modrm_resolve(modrm);
                var val = cpu.safe_read8(addr);
                cpu.safe_write8(addr, cpu.add(val, cpu.reg8[reg], OPSIZE_8));
            }
        };
        t[0x01] = function(cpu) { // ADD r/m32, r32
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = cpu.add(cpu.reg32s[modrm & 7], cpu.reg32s[reg], OPSIZE_32);
            } else {
                var addr = cpu.modrm_resolve(modrm);
                var val = cpu.safe_read32s(addr);
                cpu.safe_write32(addr, cpu.add(val, cpu.reg32s[reg], OPSIZE_32));
            }
        };
        t[0x03] = function(cpu) { // ADD r32, r/m32
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg32s[modrm & 7] : cpu.safe_read32s(cpu.modrm_resolve(modrm));
            cpu.reg32s[reg] = cpu.add(cpu.reg32s[reg], src, OPSIZE_32);
        };
        t[0x05] = function(cpu) { // ADD eax, imm32
            cpu.reg32s[reg_eax] = cpu.add(cpu.reg32s[reg_eax], cpu.read_imm32s(), OPSIZE_32);
        };

        // 0x08-0x0D: OR
        t[0x08] = function(cpu) { // OR r/m8, r8
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg8[modrm & 7] = cpu.or(cpu.reg8[modrm & 7], cpu.reg8[reg], OPSIZE_8);
            } else {
                var addr = cpu.modrm_resolve(modrm);
                cpu.safe_write8(addr, cpu.or(cpu.safe_read8(addr), cpu.reg8[reg], OPSIZE_8));
            }
        };
        t[0x09] = function(cpu) { // OR r/m32, r32
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = cpu.or(cpu.reg32s[modrm & 7], cpu.reg32s[reg], OPSIZE_32);
            } else {
                var addr = cpu.modrm_resolve(modrm);
                cpu.safe_write32(addr, cpu.or(cpu.safe_read32s(addr), cpu.reg32s[reg], OPSIZE_32));
            }
        };
        t[0x0A] = function(cpu) { // OR r8, r/m8
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg8[modrm & 7] : cpu.safe_read8(cpu.modrm_resolve(modrm));
            cpu.reg8[reg] = cpu.or(cpu.reg8[reg], src, OPSIZE_8);
        };
        t[0x0B] = function(cpu) { // OR r32, r/m32
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg32s[modrm & 7] : cpu.safe_read32s(cpu.modrm_resolve(modrm));
            cpu.reg32s[reg] = cpu.or(cpu.reg32s[reg], src, OPSIZE_32);
        };
        t[0x0C] = function(cpu) { // OR al, imm8
            cpu.reg8[reg_eax] = cpu.or(cpu.reg8[reg_eax], cpu.read_imm8(), OPSIZE_8);
        };
        t[0x0D] = function(cpu) { // OR eax, imm32
            cpu.reg32s[reg_eax] = cpu.or(cpu.reg32s[reg_eax], cpu.read_imm32s(), OPSIZE_32);
        };

        // 0x20-0x25: AND
        t[0x20] = function(cpu) { // AND r/m8, r8
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg8[modrm & 7] = cpu.and(cpu.reg8[modrm & 7], cpu.reg8[reg], OPSIZE_8);
            } else {
                var addr = cpu.modrm_resolve(modrm);
                cpu.safe_write8(addr, cpu.and(cpu.safe_read8(addr), cpu.reg8[reg], OPSIZE_8));
            }
        };
        t[0x21] = function(cpu) { // AND r/m32, r32
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = cpu.and(cpu.reg32s[modrm & 7], cpu.reg32s[reg], OPSIZE_32);
            } else {
                var addr = cpu.modrm_resolve(modrm);
                cpu.safe_write32(addr, cpu.and(cpu.safe_read32s(addr), cpu.reg32s[reg], OPSIZE_32));
            }
        };
        t[0x22] = function(cpu) { // AND r8, r/m8
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg8[modrm & 7] : cpu.safe_read8(cpu.modrm_resolve(modrm));
            cpu.reg8[reg] = cpu.and(cpu.reg8[reg], src, OPSIZE_8);
        };
        t[0x23] = function(cpu) { // AND r32, r/m32
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg32s[modrm & 7] : cpu.safe_read32s(cpu.modrm_resolve(modrm));
            cpu.reg32s[reg] = cpu.and(cpu.reg32s[reg], src, OPSIZE_32);
        };
        t[0x24] = function(cpu) { // AND al, imm8
            cpu.reg8[reg_eax] = cpu.and(cpu.reg8[reg_eax], cpu.read_imm8(), OPSIZE_8);
        };
        t[0x25] = function(cpu) { // AND eax, imm32
            cpu.reg32s[reg_eax] = cpu.and(cpu.reg32s[reg_eax], cpu.read_imm32s(), OPSIZE_32);
        };

        // 0x28-0x2D: SUB
        t[0x29] = function(cpu) { // SUB r/m32, r32
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = cpu.sub(cpu.reg32s[modrm & 7], cpu.reg32s[reg], OPSIZE_32);
            } else {
                var addr = cpu.modrm_resolve(modrm);
                cpu.safe_write32(addr, cpu.sub(cpu.safe_read32s(addr), cpu.reg32s[reg], OPSIZE_32));
            }
        };
        t[0x2B] = function(cpu) { // SUB r32, r/m32
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg32s[modrm & 7] : cpu.safe_read32s(cpu.modrm_resolve(modrm));
            cpu.reg32s[reg] = cpu.sub(cpu.reg32s[reg], src, OPSIZE_32);
        };
        t[0x2D] = function(cpu) { // SUB eax, imm32
            cpu.reg32s[reg_eax] = cpu.sub(cpu.reg32s[reg_eax], cpu.read_imm32s(), OPSIZE_32);
        };

        // 0x30-0x35: XOR
        t[0x31] = function(cpu) { // XOR r/m32, r32
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = cpu.xor(cpu.reg32s[modrm & 7], cpu.reg32s[reg], OPSIZE_32);
            } else {
                var addr = cpu.modrm_resolve(modrm);
                cpu.safe_write32(addr, cpu.xor(cpu.safe_read32s(addr), cpu.reg32s[reg], OPSIZE_32));
            }
        };
        t[0x33] = function(cpu) { // XOR r32, r/m32
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg32s[modrm & 7] : cpu.safe_read32s(cpu.modrm_resolve(modrm));
            cpu.reg32s[reg] = cpu.xor(cpu.reg32s[reg], src, OPSIZE_32);
        };
        t[0x35] = function(cpu) { // XOR eax, imm32
            cpu.reg32s[reg_eax] = cpu.xor(cpu.reg32s[reg_eax], cpu.read_imm32s(), OPSIZE_32);
        };

        // 0x38-0x3D: CMP
        t[0x39] = function(cpu) { // CMP r/m32, r32
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var dest = modrm >= 0xC0 ? cpu.reg32s[modrm & 7] : cpu.safe_read32s(cpu.modrm_resolve(modrm));
            cpu.sub(dest, cpu.reg32s[reg], OPSIZE_32);
        };
        t[0x3B] = function(cpu) { // CMP r32, r/m32
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg32s[modrm & 7] : cpu.safe_read32s(cpu.modrm_resolve(modrm));
            cpu.sub(cpu.reg32s[reg], src, OPSIZE_32);
        };
        t[0x3D] = function(cpu) { // CMP eax, imm32
            cpu.sub(cpu.reg32s[reg_eax], cpu.read_imm32s(), OPSIZE_32);
        };

        // 0x40-0x47: INC r32
        for (var i = 0; i < 8; i++) {
            (function(reg) {
                t[0x40 + reg] = function(cpu) {
                    cpu.reg32s[reg] = cpu.inc(cpu.reg32s[reg], OPSIZE_32);
                };
            })(i);
        }

        // 0x48-0x4F: DEC r32
        for (var i = 0; i < 8; i++) {
            (function(reg) {
                t[0x48 + reg] = function(cpu) {
                    cpu.reg32s[reg] = cpu.dec(cpu.reg32s[reg], OPSIZE_32);
                };
            })(i);
        }

        // 0x50-0x57: PUSH r32
        for (var i = 0; i < 8; i++) {
            (function(reg) {
                t[0x50 + reg] = function(cpu) {
                    cpu.push32(cpu.reg32s[reg]);
                };
            })(i);
        }

        // 0x58-0x5F: POP r32
        for (var i = 0; i < 8; i++) {
            (function(reg) {
                t[0x58 + reg] = function(cpu) {
                    cpu.reg32s[reg] = cpu.pop32();
                };
            })(i);
        }

        // 0x68: PUSH imm32
        t[0x68] = function(cpu) {
            cpu.push32(cpu.read_imm32s());
        };

        // 0x6A: PUSH imm8
        t[0x6A] = function(cpu) {
            cpu.push32(cpu.read_imm8s());
        };

        // Conditional jumps rel8 (0x70-0x7F)
        var jcc_conditions = [
            function(cpu) { return (cpu.flags & flag_overflow) !== 0; },      // JO
            function(cpu) { return (cpu.flags & flag_overflow) === 0; },      // JNO
            function(cpu) { return (cpu.flags & flag_carry) !== 0; },         // JB/JC
            function(cpu) { return (cpu.flags & flag_carry) === 0; },         // JAE/JNC
            function(cpu) { return (cpu.flags & flag_zero) !== 0; },          // JE/JZ
            function(cpu) { return (cpu.flags & flag_zero) === 0; },          // JNE/JNZ
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
                t[0x70 + cond] = function(cpu) {
                    var offset = cpu.read_imm8s();
                    if (jcc_conditions[cond](cpu)) {
                        cpu.instruction_pointer += offset;
                        cpu.last_instr_jump = true;
                    }
                };
            })(i);
        }

        // 0x81: Grp1 r/m32, imm32
        t[0x81] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var addr;
            var dest;

            if (modrm >= 0xC0) {
                dest = cpu.reg32s[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read32s(addr);
            }

            var imm = cpu.read_imm32s();
            var result;

            switch (op) {
                case 0: result = cpu.add(dest, imm, OPSIZE_32); break; // ADD
                case 1: result = cpu.or(dest, imm, OPSIZE_32); break;  // OR
                case 4: result = cpu.and(dest, imm, OPSIZE_32); break; // AND
                case 5: result = cpu.sub(dest, imm, OPSIZE_32); break; // SUB
                case 6: result = cpu.xor(dest, imm, OPSIZE_32); break; // XOR
                case 7: cpu.sub(dest, imm, OPSIZE_32); return;         // CMP
                default: throw new Error("Unimplemented 0x81 op: " + op);
            }

            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = result;
            } else {
                cpu.safe_write32(addr, result);
            }
        };

        // 0x83: Grp1 r/m32, imm8
        t[0x83] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var addr;
            var dest;

            if (modrm >= 0xC0) {
                dest = cpu.reg32s[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read32s(addr);
            }

            var imm = cpu.read_imm8s();
            var result;

            switch (op) {
                case 0: result = cpu.add(dest, imm, OPSIZE_32); break;
                case 1: result = cpu.or(dest, imm, OPSIZE_32); break;
                case 4: result = cpu.and(dest, imm, OPSIZE_32); break;
                case 5: result = cpu.sub(dest, imm, OPSIZE_32); break;
                case 6: result = cpu.xor(dest, imm, OPSIZE_32); break;
                case 7: cpu.sub(dest, imm, OPSIZE_32); return;
                default: throw new Error("Unimplemented 0x83 op: " + op);
            }

            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = result;
            } else {
                cpu.safe_write32(addr, result);
            }
        };

        // 0x85: TEST r/m32, r32
        t[0x85] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg32s[modrm & 7] : cpu.safe_read32s(cpu.modrm_resolve(modrm));
            cpu.and(src, cpu.reg32s[reg], OPSIZE_32);
        };

        // 0x89: MOV r/m32, r32
        t[0x89] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = cpu.reg32s[reg];
            } else {
                cpu.safe_write32(cpu.modrm_resolve(modrm), cpu.reg32s[reg]);
            }
        };

        // 0x8B: MOV r32, r/m32
        t[0x8B] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            cpu.reg32s[reg] = modrm >= 0xC0 ? cpu.reg32s[modrm & 7] : cpu.safe_read32s(cpu.modrm_resolve(modrm));
        };

        // 0x8C: MOV r/m16, Sreg
        t[0x8C] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7; // Segment register
            var value = cpu.sreg[reg];
            if (modrm >= 0xC0) {
                cpu.reg16[modrm & 7] = value;
            } else {
                cpu.safe_write16(cpu.modrm_resolve(modrm), value);
            }
        };

        // 0x8D: LEA r32, m
        t[0x8D] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            cpu.reg32s[reg] = cpu.modrm_resolve(modrm);
        };

        // 0x8E: MOV Sreg, r/m16
        t[0x8E] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7; // Segment register
            var value = modrm >= 0xC0 ? cpu.reg16[modrm & 7] : cpu.safe_read16(cpu.modrm_resolve(modrm));
            cpu.switch_seg(reg, value);
        };

        // 0x8F: POP r/m32
        t[0x8F] = function(cpu) {
            var modrm = cpu.read_imm8();
            var value = cpu.pop32();
            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = value;
            } else {
                cpu.safe_write32(cpu.modrm_resolve(modrm), value);
            }
        };

        // 0x90: NOP
        t[0x90] = function(cpu) {};

        // 0xB8-0xBF: MOV r32, imm32
        for (var i = 0; i < 8; i++) {
            (function(reg) {
                t[0xB8 + reg] = function(cpu) {
                    cpu.reg32s[reg] = cpu.read_imm32s();
                };
            })(i);
        }

        // 0xC1: Grp2 r/m32, imm8 (shifts)
        t[0xC1] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var addr;
            var dest;

            if (modrm >= 0xC0) {
                dest = cpu.reg32s[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read32s(addr);
            }

            var count = cpu.read_imm8() & 31;
            var result;

            switch (op) {
                case 4: result = cpu.shl(dest, count, OPSIZE_32); break; // SHL
                case 5: result = cpu.shr(dest, count, OPSIZE_32); break; // SHR
                case 7: result = cpu.sar(dest, count, OPSIZE_32); break; // SAR
                default: throw new Error("Unimplemented 0xC1 op: " + op);
            }

            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = result;
            } else {
                cpu.safe_write32(addr, result);
            }
        };

        // 0xC2: RET imm16
        t[0xC2] = function(cpu) {
            var imm16 = cpu.read_imm16();
            cpu.instruction_pointer = cpu.pop32();
            cpu.reg32s[reg_esp] += imm16;
            cpu.last_instr_jump = true;
        };

        // 0xC3: RET
        t[0xC3] = function(cpu) {
            cpu.instruction_pointer = cpu.pop32();
            cpu.last_instr_jump = true;
        };

        // 0xC7: MOV r/m32, imm32
        t[0xC7] = function(cpu) {
            var modrm = cpu.read_imm8();
            var addr;
            if (modrm < 0xC0) {
                addr = cpu.modrm_resolve(modrm);
            }
            var imm = cpu.read_imm32s();
            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = imm;
            } else {
                cpu.safe_write32(addr, imm);
            }
        };

        // 0xC9: LEAVE
        t[0xC9] = function(cpu) {
            cpu.reg32s[reg_esp] = cpu.reg32s[reg_ebp];
            cpu.reg32s[reg_ebp] = cpu.pop32();
        };

        // 0xE8: CALL rel32
        t[0xE8] = function(cpu) {
            var imm32s = cpu.read_imm32s();
            cpu.push32(cpu.get_real_eip());
            cpu.instruction_pointer = cpu.instruction_pointer + imm32s | 0;
            cpu.last_instr_jump = true;
        };

        // 0xE9: JMP rel32
        t[0xE9] = function(cpu) {
            var imm32s = cpu.read_imm32s();
            cpu.instruction_pointer = cpu.instruction_pointer + imm32s | 0;
            cpu.last_instr_jump = true;
        };

        // 0xEB: JMP rel8
        t[0xEB] = function(cpu) {
            var imm8s = cpu.read_imm8s();
            cpu.instruction_pointer = cpu.instruction_pointer + imm8s | 0;
            cpu.last_instr_jump = true;
        };

        // 0xFF: Grp5
        t[0xFF] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var addr;
            var data;

            if (modrm >= 0xC0) {
                data = cpu.reg32s[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                data = cpu.safe_read32s(addr);
            }

            switch (op) {
                case 0: // INC
                    var result = cpu.inc(data, OPSIZE_32);
                    if (modrm >= 0xC0) cpu.reg32s[modrm & 7] = result;
                    else cpu.safe_write32(addr, result);
                    break;
                case 1: // DEC
                    var result = cpu.dec(data, OPSIZE_32);
                    if (modrm >= 0xC0) cpu.reg32s[modrm & 7] = result;
                    else cpu.safe_write32(addr, result);
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

        // 0x0F prefix - two-byte opcodes
        t[0x0F] = function(cpu) {
            var opcode2 = cpu.read_imm8();
            
            // 0x0F 0x80-0x8F: Jcc rel32
            if (opcode2 >= 0x80 && opcode2 <= 0x8F) {
                var cond = opcode2 - 0x80;
                var offset = cpu.read_imm32s();
                if (jcc_conditions[cond](cpu)) {
                    cpu.instruction_pointer += offset;
                    cpu.last_instr_jump = true;
                }
                return;
            }

            // 0x0F 0xAF: IMUL r32, r/m32
            if (opcode2 === 0xAF) {
                var modrm = cpu.read_imm8();
                var reg = (modrm >> 3) & 7;
                var src = modrm >= 0xC0 ? cpu.reg32s[modrm & 7] : cpu.safe_read32s(cpu.modrm_resolve(modrm));
                cpu.reg32s[reg] = Math.imul(cpu.reg32s[reg], src);
                return;
            }

            // 0x0F 0xB6: MOVZX r32, r/m8
            if (opcode2 === 0xB6) {
                var modrm = cpu.read_imm8();
                var reg = (modrm >> 3) & 7;
                var src = modrm >= 0xC0 ? cpu.reg8[modrm & 7] : cpu.safe_read8(cpu.modrm_resolve(modrm));
                cpu.reg32s[reg] = src & 0xFF;
                return;
            }

            // 0x0F 0xB7: MOVZX r32, r/m16
            if (opcode2 === 0xB7) {
                var modrm = cpu.read_imm8();
                var reg = (modrm >> 3) & 7;
                var src = modrm >= 0xC0 ? cpu.reg16[modrm & 7] : cpu.safe_read16(cpu.modrm_resolve(modrm));
                cpu.reg32s[reg] = src & 0xFFFF;
                return;
            }

            // 0x0F 0xBE: MOVSX r32, r/m8
            if (opcode2 === 0xBE) {
                var modrm = cpu.read_imm8();
                var reg = (modrm >> 3) & 7;
                var src = modrm >= 0xC0 ? cpu.reg8s[modrm & 7] : cpu.safe_read8(cpu.modrm_resolve(modrm));
                cpu.reg32s[reg] = (src << 24) >> 24; // Sign extend
                return;
            }

            // 0x0F 0xBF: MOVSX r32, r/m16
            if (opcode2 === 0xBF) {
                var modrm = cpu.read_imm8();
                var reg = (modrm >> 3) & 7;
                var src = modrm >= 0xC0 ? cpu.reg16s[modrm & 7] : cpu.safe_read16(cpu.modrm_resolve(modrm));
                cpu.reg32s[reg] = (src << 16) >> 16; // Sign extend
                return;
            }

            throw new Error("Unimplemented 0x0F opcode: 0x" + opcode2.toString(16));
        };

        // 0x84: TEST r/m8, r8
        t[0x84] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg8[modrm & 7] : cpu.safe_read8(cpu.modrm_resolve(modrm));
            cpu.and(src, cpu.reg8[reg], OPSIZE_8);
        };

        // 0x88: MOV r/m8, r8
        t[0x88] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg8[modrm & 7] = cpu.reg8[reg];
            } else {
                cpu.safe_write8(cpu.modrm_resolve(modrm), cpu.reg8[reg]);
            }
        };

        // 0x8A: MOV r8, r/m8
        t[0x8A] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            cpu.reg8[reg] = modrm >= 0xC0 ? cpu.reg8[modrm & 7] : cpu.safe_read8(cpu.modrm_resolve(modrm));
        };

        // 0xA1: MOV eax, [moffs32]
        t[0xA1] = function(cpu) {
            var addr = cpu.read_imm32s();
            cpu.reg32s[reg_eax] = cpu.safe_read32s(addr);
        };

        // 0xA3: MOV [moffs32], eax
        t[0xA3] = function(cpu) {
            var addr = cpu.read_imm32s();
            cpu.safe_write32(addr, cpu.reg32s[reg_eax]);
        };

        // 0xB0-0xB7: MOV r8, imm8
        for (var i = 0; i < 8; i++) {
            (function(reg) {
                t[0xB0 + reg] = function(cpu) {
                    cpu.reg8[reg] = cpu.read_imm8();
                };
            })(i);
        }

        // ============================================
        // INSTRUÇÕES ADICIONAIS PARA GRANNY2.DLL
        // ============================================

        // 0x02: ADD r8, r/m8
        t[0x02] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg8[modrm & 7] : cpu.safe_read8(cpu.modrm_resolve(modrm));
            cpu.reg8[reg] = cpu.add(cpu.reg8[reg], src, OPSIZE_8);
        };

        // 0x04: ADD al, imm8
        t[0x04] = function(cpu) {
            cpu.reg8[reg_eax] = cpu.add(cpu.reg8[reg_eax], cpu.read_imm8(), OPSIZE_8);
        };

        // 0x28: SUB r/m8, r8
        t[0x28] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg8[modrm & 7] = cpu.sub(cpu.reg8[modrm & 7], cpu.reg8[reg], OPSIZE_8);
            } else {
                var addr = cpu.modrm_resolve(modrm);
                cpu.safe_write8(addr, cpu.sub(cpu.safe_read8(addr), cpu.reg8[reg], OPSIZE_8));
            }
        };

        // 0x2A: SUB r8, r/m8
        t[0x2A] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg8[modrm & 7] : cpu.safe_read8(cpu.modrm_resolve(modrm));
            cpu.reg8[reg] = cpu.sub(cpu.reg8[reg], src, OPSIZE_8);
        };

        // 0x2C: SUB al, imm8
        t[0x2C] = function(cpu) {
            cpu.reg8[reg_eax] = cpu.sub(cpu.reg8[reg_eax], cpu.read_imm8(), OPSIZE_8);
        };

        // 0x30: XOR r/m8, r8
        t[0x30] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                cpu.reg8[modrm & 7] = cpu.xor(cpu.reg8[modrm & 7], cpu.reg8[reg], OPSIZE_8);
            } else {
                var addr = cpu.modrm_resolve(modrm);
                cpu.safe_write8(addr, cpu.xor(cpu.safe_read8(addr), cpu.reg8[reg], OPSIZE_8));
            }
        };

        // 0x32: XOR r8, r/m8
        t[0x32] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg8[modrm & 7] : cpu.safe_read8(cpu.modrm_resolve(modrm));
            cpu.reg8[reg] = cpu.xor(cpu.reg8[reg], src, OPSIZE_8);
        };

        // 0x34: XOR al, imm8
        t[0x34] = function(cpu) {
            cpu.reg8[reg_eax] = cpu.xor(cpu.reg8[reg_eax], cpu.read_imm8(), OPSIZE_8);
        };

        // 0x38: CMP r/m8, r8
        t[0x38] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var dest = modrm >= 0xC0 ? cpu.reg8[modrm & 7] : cpu.safe_read8(cpu.modrm_resolve(modrm));
            cpu.sub(dest, cpu.reg8[reg], OPSIZE_8);
        };

        // 0x3A: CMP r8, r/m8
        t[0x3A] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg8[modrm & 7] : cpu.safe_read8(cpu.modrm_resolve(modrm));
            cpu.sub(cpu.reg8[reg], src, OPSIZE_8);
        };

        // 0x3C: CMP al, imm8
        t[0x3C] = function(cpu) {
            cpu.sub(cpu.reg8[reg_eax], cpu.read_imm8(), OPSIZE_8);
        };

        // 0x80: Grp1 r/m8, imm8
        t[0x80] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var addr;
            var dest;

            if (modrm >= 0xC0) {
                dest = cpu.reg8[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read8(addr);
            }

            var imm = cpu.read_imm8();
            var result;

            switch (op) {
                case 0: result = cpu.add(dest, imm, OPSIZE_8); break;
                case 1: result = cpu.or(dest, imm, OPSIZE_8); break;
                case 4: result = cpu.and(dest, imm, OPSIZE_8); break;
                case 5: result = cpu.sub(dest, imm, OPSIZE_8); break;
                case 6: result = cpu.xor(dest, imm, OPSIZE_8); break;
                case 7: cpu.sub(dest, imm, OPSIZE_8); return;
                default: throw new Error("Unimplemented 0x80 op: " + op);
            }

            if (modrm >= 0xC0) {
                cpu.reg8[modrm & 7] = result;
            } else {
                cpu.safe_write8(addr, result);
            }
        };

        // 0x86: XCHG r8, r/m8
        t[0x86] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                var tmp = cpu.reg8[modrm & 7];
                cpu.reg8[modrm & 7] = cpu.reg8[reg];
                cpu.reg8[reg] = tmp;
            } else {
                var addr = cpu.modrm_resolve(modrm);
                var tmp = cpu.safe_read8(addr);
                cpu.safe_write8(addr, cpu.reg8[reg]);
                cpu.reg8[reg] = tmp;
            }
        };

        // 0x87: XCHG r32, r/m32
        t[0x87] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            if (modrm >= 0xC0) {
                var tmp = cpu.reg32s[modrm & 7];
                cpu.reg32s[modrm & 7] = cpu.reg32s[reg];
                cpu.reg32s[reg] = tmp;
            } else {
                var addr = cpu.modrm_resolve(modrm);
                var tmp = cpu.safe_read32s(addr);
                cpu.safe_write32(addr, cpu.reg32s[reg]);
                cpu.reg32s[reg] = tmp;
            }
        };

        // 0x91-0x97: XCHG eax, r32
        for (var i = 1; i < 8; i++) {
            (function(reg) {
                t[0x90 + reg] = function(cpu) {
                    var tmp = cpu.reg32s[reg_eax];
                    cpu.reg32s[reg_eax] = cpu.reg32s[reg];
                    cpu.reg32s[reg] = tmp;
                };
            })(i);
        }

        // 0x98: CBW/CWDE
        t[0x98] = function(cpu) {
            cpu.reg32s[reg_eax] = (cpu.reg32s[reg_eax] << 16) >> 16; // Sign extend ax to eax
        };

        // 0x99: CDQ
        t[0x99] = function(cpu) {
            cpu.reg32s[reg_edx] = cpu.reg32s[reg_eax] >> 31; // Sign extend eax to edx:eax
        };

        // 0xA0: MOV al, [moffs8]
        t[0xA0] = function(cpu) {
            var addr = cpu.read_imm32s();
            cpu.reg8[reg_eax] = cpu.safe_read8(addr);
        };

        // 0xA2: MOV [moffs8], al
        t[0xA2] = function(cpu) {
            var addr = cpu.read_imm32s();
            cpu.safe_write8(addr, cpu.reg8[reg_eax]);
        };

        // 0xA4: MOVSB
        t[0xA4] = function(cpu) {
            var src = cpu.reg32s[reg_esi];
            var dst = cpu.reg32s[reg_edi];
            var size = (cpu.flags & flag_direction) ? -1 : 1;
            cpu.safe_write8(dst, cpu.safe_read8(src));
            cpu.reg32s[reg_esi] += size;
            cpu.reg32s[reg_edi] += size;
        };

        // 0xA5: MOVSD
        t[0xA5] = function(cpu) {
            var src = cpu.reg32s[reg_esi];
            var dst = cpu.reg32s[reg_edi];
            var size = (cpu.flags & flag_direction) ? -4 : 4;
            cpu.safe_write32(dst, cpu.safe_read32s(src));
            cpu.reg32s[reg_esi] += size;
            cpu.reg32s[reg_edi] += size;
        };

        // 0xA6: CMPSB
        t[0xA6] = function(cpu) {
            var src = cpu.reg32s[reg_esi];
            var dst = cpu.reg32s[reg_edi];
            var size = (cpu.flags & flag_direction) ? -1 : 1;
            cpu.sub(cpu.safe_read8(src), cpu.safe_read8(dst), OPSIZE_8);
            cpu.reg32s[reg_esi] += size;
            cpu.reg32s[reg_edi] += size;
        };

        // 0xA8: TEST al, imm8
        t[0xA8] = function(cpu) {
            cpu.and(cpu.reg8[reg_eax], cpu.read_imm8(), OPSIZE_8);
        };

        // 0xA9: TEST eax, imm32
        t[0xA9] = function(cpu) {
            cpu.and(cpu.reg32s[reg_eax], cpu.read_imm32s(), OPSIZE_32);
        };

        // 0xAA: STOSB
        t[0xAA] = function(cpu) {
            var dst = cpu.reg32s[reg_edi];
            var size = (cpu.flags & flag_direction) ? -1 : 1;
            cpu.safe_write8(dst, cpu.reg8[reg_eax]);
            cpu.reg32s[reg_edi] += size;
        };

        // 0xAB: STOSD
        t[0xAB] = function(cpu) {
            var dst = cpu.reg32s[reg_edi];
            var size = (cpu.flags & flag_direction) ? -4 : 4;
            cpu.safe_write32(dst, cpu.reg32s[reg_eax]);
            cpu.reg32s[reg_edi] += size;
        };

        // 0xAC: LODSB
        t[0xAC] = function(cpu) {
            var src = cpu.reg32s[reg_esi];
            var size = (cpu.flags & flag_direction) ? -1 : 1;
            cpu.reg8[reg_eax] = cpu.safe_read8(src);
            cpu.reg32s[reg_esi] += size;
        };

        // 0xAD: LODSD
        t[0xAD] = function(cpu) {
            var src = cpu.reg32s[reg_esi];
            var size = (cpu.flags & flag_direction) ? -4 : 4;
            cpu.reg32s[reg_eax] = cpu.safe_read32s(src);
            cpu.reg32s[reg_esi] += size;
        };

        // 0xAE: SCASB
        t[0xAE] = function(cpu) {
            var dst = cpu.reg32s[reg_edi];
            var size = (cpu.flags & flag_direction) ? -1 : 1;
            cpu.sub(cpu.reg8[reg_eax], cpu.safe_read8(dst), OPSIZE_8);
            cpu.reg32s[reg_edi] += size;
        };

        // 0xAF: SCASD
        t[0xAF] = function(cpu) {
            var dst = cpu.reg32s[reg_edi];
            var size = (cpu.flags & flag_direction) ? -4 : 4;
            cpu.sub(cpu.reg32s[reg_eax], cpu.safe_read32s(dst), OPSIZE_32);
            cpu.reg32s[reg_edi] += size;
        };

        // 0xC0: Grp2 r/m8, imm8 (shifts)
        t[0xC0] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var addr;
            var dest;

            if (modrm >= 0xC0) {
                dest = cpu.reg8[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read8(addr);
            }

            var count = cpu.read_imm8() & 31;
            var result;

            switch (op) {
                case 0: // ROL
                    count &= 7;
                    result = ((dest << count) | (dest >>> (8 - count))) & 0xFF;
                    break;
                case 1: // ROR
                    count &= 7;
                    result = ((dest >>> count) | (dest << (8 - count))) & 0xFF;
                    break;
                case 4: result = cpu.shl(dest, count, OPSIZE_8) & 0xFF; break;
                case 5: result = cpu.shr(dest & 0xFF, count, OPSIZE_8); break;
                case 7: result = cpu.sar((dest << 24) >> 24, count, OPSIZE_8) & 0xFF; break;
                default: throw new Error("Unimplemented 0xC0 op: " + op);
            }

            if (modrm >= 0xC0) {
                cpu.reg8[modrm & 7] = result;
            } else {
                cpu.safe_write8(addr, result);
            }
        };

        // 0xC6: MOV r/m8, imm8
        t[0xC6] = function(cpu) {
            var modrm = cpu.read_imm8();
            var addr;
            if (modrm < 0xC0) {
                addr = cpu.modrm_resolve(modrm);
            }
            var imm = cpu.read_imm8();
            if (modrm >= 0xC0) {
                cpu.reg8[modrm & 7] = imm;
            } else {
                cpu.safe_write8(addr, imm);
            }
        };

        // 0xD0: Grp2 r/m8, 1 (shifts by 1)
        t[0xD0] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var addr;
            var dest;

            if (modrm >= 0xC0) {
                dest = cpu.reg8[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read8(addr);
            }

            var result;
            switch (op) {
                case 0: result = ((dest << 1) | (dest >>> 7)) & 0xFF; break; // ROL
                case 1: result = ((dest >>> 1) | (dest << 7)) & 0xFF; break; // ROR
                case 4: result = cpu.shl(dest, 1, OPSIZE_8) & 0xFF; break; // SHL
                case 5: result = cpu.shr(dest & 0xFF, 1, OPSIZE_8); break; // SHR
                case 7: result = cpu.sar((dest << 24) >> 24, 1, OPSIZE_8) & 0xFF; break; // SAR
                default: throw new Error("Unimplemented 0xD0 op: " + op);
            }

            if (modrm >= 0xC0) {
                cpu.reg8[modrm & 7] = result;
            } else {
                cpu.safe_write8(addr, result);
            }
        };

        // 0xD1: Grp2 r/m32, 1 (shifts by 1)
        t[0xD1] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var addr;
            var dest;

            if (modrm >= 0xC0) {
                dest = cpu.reg32s[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read32s(addr);
            }

            var result;
            switch (op) {
                case 0: result = (dest << 1) | (dest >>> 31); break; // ROL
                case 1: result = (dest >>> 1) | (dest << 31); break; // ROR
                case 4: result = cpu.shl(dest, 1, OPSIZE_32); break;
                case 5: result = cpu.shr(dest, 1, OPSIZE_32); break;
                case 7: result = cpu.sar(dest, 1, OPSIZE_32); break;
                default: throw new Error("Unimplemented 0xD1 op: " + op);
            }

            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = result;
            } else {
                cpu.safe_write32(addr, result);
            }
        };

        // 0xD3: Grp2 r/m32, cl (shifts by cl)
        t[0xD3] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var addr;
            var dest;

            if (modrm >= 0xC0) {
                dest = cpu.reg32s[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read32s(addr);
            }

            var count = cpu.reg8[reg_ecx] & 31;
            if (count === 0) return;

            var result;
            switch (op) {
                case 0: result = (dest << count) | (dest >>> (32 - count)); break; // ROL
                case 1: result = (dest >>> count) | (dest << (32 - count)); break; // ROR
                case 4: result = cpu.shl(dest, count, OPSIZE_32); break;
                case 5: result = cpu.shr(dest, count, OPSIZE_32); break;
                case 7: result = cpu.sar(dest, count, OPSIZE_32); break;
                default: throw new Error("Unimplemented 0xD3 op: " + op);
            }

            if (modrm >= 0xC0) {
                cpu.reg32s[modrm & 7] = result;
            } else {
                cpu.safe_write32(addr, result);
            }
        };

        // 0xF6: Grp3 r/m8
        t[0xF6] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var addr;
            var dest;

            if (modrm >= 0xC0) {
                dest = cpu.reg8[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read8(addr);
            }

            switch (op) {
                case 0: // TEST r/m8, imm8
                case 1:
                    cpu.and(dest, cpu.read_imm8(), OPSIZE_8);
                    break;
                case 2: // NOT r/m8
                    var result = ~dest & 0xFF;
                    if (modrm >= 0xC0) cpu.reg8[modrm & 7] = result;
                    else cpu.safe_write8(addr, result);
                    break;
                case 3: // NEG r/m8
                    var result = cpu.sub(0, dest, OPSIZE_8) & 0xFF;
                    if (modrm >= 0xC0) cpu.reg8[modrm & 7] = result;
                    else cpu.safe_write8(addr, result);
                    break;
                case 4: // MUL al, r/m8
                    var result = cpu.reg8[reg_eax] * dest;
                    cpu.reg16[reg_eax] = result & 0xFFFF;
                    break;
                case 5: // IMUL al, r/m8
                    var result = ((cpu.reg8[reg_eax] << 24) >> 24) * ((dest << 24) >> 24);
                    cpu.reg16[reg_eax] = result & 0xFFFF;
                    break;
                case 6: // DIV al, r/m8
                    if (dest === 0) throw new Error("Division by zero");
                    var dividend = cpu.reg16[reg_eax];
                    cpu.reg8[reg_eax] = (dividend / dest) >>> 0;
                    cpu.reg8[reg_eax + 4] = dividend % dest; // AH
                    break;
                case 7: // IDIV al, r/m8
                    if (dest === 0) throw new Error("Division by zero");
                    var dividend = (cpu.reg16[reg_eax] << 16) >> 16;
                    var divisor = (dest << 24) >> 24;
                    cpu.reg8[reg_eax] = (dividend / divisor) | 0;
                    cpu.reg8[reg_eax + 4] = dividend % divisor;
                    break;
            }
        };

        // 0xF7: Grp3 r/m32
        t[0xF7] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var addr;
            var dest;

            if (modrm >= 0xC0) {
                dest = cpu.reg32s[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read32s(addr);
            }

            switch (op) {
                case 0: // TEST r/m32, imm32
                case 1:
                    cpu.and(dest, cpu.read_imm32s(), OPSIZE_32);
                    break;
                case 2: // NOT r/m32
                    var result = ~dest;
                    if (modrm >= 0xC0) cpu.reg32s[modrm & 7] = result;
                    else cpu.safe_write32(addr, result);
                    break;
                case 3: // NEG r/m32
                    var result = cpu.sub(0, dest, OPSIZE_32);
                    if (modrm >= 0xC0) cpu.reg32s[modrm & 7] = result;
                    else cpu.safe_write32(addr, result);
                    break;
                case 4: // MUL eax, r/m32
                    var result = BigInt(cpu.reg32[reg_eax]) * BigInt(dest >>> 0);
                    cpu.reg32[reg_eax] = Number(result & 0xFFFFFFFFn);
                    cpu.reg32[reg_edx] = Number(result >> 32n);
                    break;
                case 5: // IMUL eax, r/m32
                    var result = BigInt(cpu.reg32s[reg_eax]) * BigInt(dest);
                    cpu.reg32s[reg_eax] = Number(result & 0xFFFFFFFFn);
                    cpu.reg32s[reg_edx] = Number(result >> 32n);
                    break;
                case 6: // DIV eax, r/m32
                    if (dest === 0) throw new Error("Division by zero");
                    var dividend = (BigInt(cpu.reg32[reg_edx]) << 32n) | BigInt(cpu.reg32[reg_eax]);
                    var divisor = BigInt(dest >>> 0);
                    cpu.reg32[reg_eax] = Number(dividend / divisor);
                    cpu.reg32[reg_edx] = Number(dividend % divisor);
                    break;
                case 7: // IDIV eax, r/m32
                    if (dest === 0) throw new Error("Division by zero");
                    var dividend = (BigInt(cpu.reg32s[reg_edx]) << 32n) | BigInt(cpu.reg32[reg_eax]);
                    var divisor = BigInt(dest);
                    cpu.reg32s[reg_eax] = Number(dividend / divisor);
                    cpu.reg32s[reg_edx] = Number(dividend % divisor);
                    break;
            }
        };

        // 0xF8: CLC
        t[0xF8] = function(cpu) {
            cpu.flags &= ~flag_carry;
        };

        // 0xF9: STC
        t[0xF9] = function(cpu) {
            cpu.flags |= flag_carry;
        };

        // 0xFC: CLD
        t[0xFC] = function(cpu) {
            cpu.flags &= ~flag_direction;
        };

        // 0xFD: STD
        t[0xFD] = function(cpu) {
            cpu.flags |= flag_direction;
        };

        // 0xFE: Grp4 (INC/DEC r/m8)
        t[0xFE] = function(cpu) {
            var modrm = cpu.read_imm8();
            var op = (modrm >> 3) & 7;
            var addr;
            var dest;

            if (modrm >= 0xC0) {
                dest = cpu.reg8[modrm & 7];
            } else {
                addr = cpu.modrm_resolve(modrm);
                dest = cpu.safe_read8(addr);
            }

            var result;
            switch (op) {
                case 0: result = cpu.inc(dest, OPSIZE_8) & 0xFF; break;
                case 1: result = cpu.dec(dest, OPSIZE_8) & 0xFF; break;
                default: throw new Error("Unimplemented 0xFE op: " + op);
            }

            if (modrm >= 0xC0) {
                cpu.reg8[modrm & 7] = result;
            } else {
                cpu.safe_write8(addr, result);
            }
        };

        // REP prefixes (0xF2, 0xF3) - simplificado
        t[0xF2] = function(cpu) { // REPNE
            cpu.repeat_string_prefix = REPEAT_STRING_PREFIX_NZ;
            var next = cpu.read_imm8();
            if (t[next]) {
                // Executa a instrução seguinte com REP
                var count = cpu.reg32[reg_ecx];
                while (count > 0 && !(cpu.flags & flag_zero)) {
                    cpu.instruction_pointer--; // Volta para re-executar
                    t[next](cpu);
                    count--;
                    cpu.reg32[reg_ecx] = count;
                    if (cpu.last_instr_jump) break;
                }
            }
            cpu.repeat_string_prefix = REPEAT_STRING_PREFIX_NONE;
        };

        t[0xF3] = function(cpu) { // REP/REPE
            cpu.repeat_string_prefix = REPEAT_STRING_PREFIX_Z;
            var next = cpu.read_imm8();
            if (t[next]) {
                var count = cpu.reg32[reg_ecx];
                // String instructions: A4, A5, AA, AB, AC, AD, AE, AF
                if (next === 0xA4 || next === 0xA5 || next === 0xAA || next === 0xAB ||
                    next === 0xAC || next === 0xAD) {
                    // REP MOVS/STOS/LODS
                    while (count > 0) {
                        t[next](cpu);
                        count--;
                        cpu.reg32[reg_ecx] = count;
                    }
                } else if (next === 0xA6 || next === 0xAE || next === 0xAF) {
                    // REPE CMPS/SCAS
                    while (count > 0) {
                        t[next](cpu);
                        count--;
                        cpu.reg32[reg_ecx] = count;
                        if (!(cpu.flags & flag_zero)) break;
                    }
                } else {
                    t[next](cpu);
                }
            }
            cpu.repeat_string_prefix = REPEAT_STRING_PREFIX_NONE;
        };

        // 0x60: PUSHAD
        t[0x60] = function(cpu) {
            var temp = cpu.reg32s[reg_esp];
            cpu.push32(cpu.reg32s[reg_eax]);
            cpu.push32(cpu.reg32s[reg_ecx]);
            cpu.push32(cpu.reg32s[reg_edx]);
            cpu.push32(cpu.reg32s[reg_ebx]);
            cpu.push32(temp);
            cpu.push32(cpu.reg32s[reg_ebp]);
            cpu.push32(cpu.reg32s[reg_esi]);
            cpu.push32(cpu.reg32s[reg_edi]);
        };

        // 0x61: POPAD
        t[0x61] = function(cpu) {
            cpu.reg32s[reg_edi] = cpu.pop32();
            cpu.reg32s[reg_esi] = cpu.pop32();
            cpu.reg32s[reg_ebp] = cpu.pop32();
            cpu.pop32(); // Skip ESP
            cpu.reg32s[reg_ebx] = cpu.pop32();
            cpu.reg32s[reg_edx] = cpu.pop32();
            cpu.reg32s[reg_ecx] = cpu.pop32();
            cpu.reg32s[reg_eax] = cpu.pop32();
        };

        // 0x64: FS segment prefix
        t[0x64] = function(cpu) {
            // Simplificado - apenas executa próxima instrução
            var next = cpu.read_imm8();
            if (t[next]) t[next](cpu);
        };

        // 0x65: GS segment prefix
        t[0x65] = function(cpu) {
            var next = cpu.read_imm8();
            if (t[next]) t[next](cpu);
        };

        // 0x66: Operand size prefix (16-bit)
        t[0x66] = function(cpu) {
            var next = cpu.read_imm8();
            // Execute 16-bit version of instruction
            // Para simplificar, tratamos casos comuns
            switch (next) {
                case 0x89: // MOV r/m16, r16
                    var modrm = cpu.read_imm8();
                    var reg = (modrm >> 3) & 7;
                    if (modrm >= 0xC0) {
                        cpu.reg16[modrm & 7] = cpu.reg16[reg];
                    } else {
                        cpu.safe_write16(cpu.modrm_resolve(modrm), cpu.reg16[reg]);
                    }
                    break;
                case 0x8B: // MOV r16, r/m16
                    var modrm = cpu.read_imm8();
                    var reg = (modrm >> 3) & 7;
                    cpu.reg16[reg] = modrm >= 0xC0 ? cpu.reg16[modrm & 7] : cpu.safe_read16(cpu.modrm_resolve(modrm));
                    break;
                case 0x90: // NOP
                    break;
                case 0xC7: // MOV r/m16, imm16
                    var modrm = cpu.read_imm8();
                    var addr;
                    if (modrm < 0xC0) addr = cpu.modrm_resolve(modrm);
                    var imm = cpu.read_imm16();
                    if (modrm >= 0xC0) {
                        cpu.reg16[modrm & 7] = imm;
                    } else {
                        cpu.safe_write16(addr, imm);
                    }
                    break;
                case 0x0F: // Two-byte opcodes com prefix 66
                    var opcode2 = cpu.read_imm8();
                    // Handle common 0x66 0x0F instructions
                    if (opcode2 >= 0x80 && opcode2 <= 0x8F) {
                        // Jcc rel16
                        var cond = opcode2 - 0x80;
                        var offset = cpu.read_imm16s();
                        // Use same conditions as rel32
                        var jcc = [
                            function(c) { return (c.flags & flag_overflow) !== 0; },
                            function(c) { return (c.flags & flag_overflow) === 0; },
                            function(c) { return (c.flags & flag_carry) !== 0; },
                            function(c) { return (c.flags & flag_carry) === 0; },
                            function(c) { return (c.flags & flag_zero) !== 0; },
                            function(c) { return (c.flags & flag_zero) === 0; },
                            function(c) { return ((c.flags & flag_carry) | (c.flags & flag_zero)) !== 0; },
                            function(c) { return ((c.flags & flag_carry) | (c.flags & flag_zero)) === 0; },
                            function(c) { return (c.flags & flag_sign) !== 0; },
                            function(c) { return (c.flags & flag_sign) === 0; },
                            function(c) { return (c.flags & flag_parity) !== 0; },
                            function(c) { return (c.flags & flag_parity) === 0; },
                            function(c) { return ((c.flags & flag_sign) !== 0) !== ((c.flags & flag_overflow) !== 0); },
                            function(c) { return ((c.flags & flag_sign) !== 0) === ((c.flags & flag_overflow) !== 0); },
                            function(c) { return ((c.flags & flag_zero) !== 0) || (((c.flags & flag_sign) !== 0) !== ((c.flags & flag_overflow) !== 0)); },
                            function(c) { return ((c.flags & flag_zero) === 0) && (((c.flags & flag_sign) !== 0) === ((c.flags & flag_overflow) !== 0)); }
                        ];
                        if (jcc[cond](cpu)) {
                            cpu.instruction_pointer += offset;
                            cpu.last_instr_jump = true;
                        }
                    } else {
                        throw new Error("Unimplemented 0x66 0x0F opcode: 0x" + opcode2.toString(16));
                    }
                    break;
                default:
                    // Fall back to 32-bit version
                    if (t[next]) {
                        cpu.instruction_pointer--;
                        t[next](cpu);
                    } else {
                        throw new Error("Unimplemented 0x66 prefix with opcode: 0x" + next.toString(16));
                    }
            }
        };

        // 0x67: Address size prefix
        t[0x67] = function(cpu) {
            // Simplificado - usa 16-bit addressing
            var savedAddressSize = cpu.address_size_32;
            cpu.address_size_32 = false;
            var next = cpu.read_imm8();
            if (t[next]) t[next](cpu);
            cpu.address_size_32 = savedAddressSize;
        };

        // 0x69: IMUL r32, r/m32, imm32
        t[0x69] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg32s[modrm & 7] : cpu.safe_read32s(cpu.modrm_resolve(modrm));
            var imm = cpu.read_imm32s();
            cpu.reg32s[reg] = Math.imul(src, imm);
        };

        // 0x6B: IMUL r32, r/m32, imm8
        t[0x6B] = function(cpu) {
            var modrm = cpu.read_imm8();
            var reg = (modrm >> 3) & 7;
            var src = modrm >= 0xC0 ? cpu.reg32s[modrm & 7] : cpu.safe_read32s(cpu.modrm_resolve(modrm));
            var imm = cpu.read_imm8s();
            cpu.reg32s[reg] = Math.imul(src, imm);
        };

        // 0x9C: PUSHFD
        t[0x9C] = function(cpu) {
            cpu.push32(cpu.flags);
        };

        // 0x9D: POPFD
        t[0x9D] = function(cpu) {
            cpu.flags = cpu.pop32();
        };

        // 0x9E: SAHF
        t[0x9E] = function(cpu) {
            var ah = cpu.reg8[reg_eax + 4]; // AH
            cpu.flags = (cpu.flags & ~0xFF) | (ah & 0xD5) | 0x02;
        };

        // 0x9F: LAHF
        t[0x9F] = function(cpu) {
            cpu.reg8[reg_eax + 4] = cpu.flags & 0xFF; // AH = flags low byte
        };

        // Copy to table16
        this.table16 = t.slice();
    };

    // ============================================
    // FPU
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

    // Export
    exports.v86 = v86;
    exports.FPU = FPU;
    
    // IMPORTANTE: pe_env.js espera table32 como variável global
    // Criamos uma tabela global que será compartilhada
    exports.table32 = new Array(256);
    exports.table16 = new Array(256);
    exports.table0F_32 = new Array(256);
    exports.table0F_16 = new Array(256);
    
    // Referência global para a CPU atual (pe_env.js precisa disso)
    exports.cpu = null;

    console.log("[granny2_runtime] Loaded - v86 wrapper ready");

})(typeof exports !== 'undefined' ? exports : this);
