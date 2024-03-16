import { Class, DiagnosticCode, Program, Range, Statement, Type } from "assemblyscript/dist/assemblyscript.js";
import { TypeVisitor } from "./TypeVisitor.js";
import { SimpleParser } from "./SimpleParser.js";
import { isPropertyPrototype } from "./guards.js";

export class Deserializer extends TypeVisitor<string, void> {
    constructor(program: Program, range: Range, public offset: number = 0, public stmts: Statement[] = []) {
        super(program, range);
    }

    visitU256(_type: Type, dst: string): void {
        const classInstance = `_u256_${this.offset}`;
        this.stmts.push(
            SimpleParser.parseStatement(`const ${classInstance} = u256.Zero;`, this.range),
            SimpleParser.parseStatement(
                `${classInstance}.hi2 = bswap<u64>(i64.load(inputPtr, ${this.offset}));`,
                this.range
            ),
            SimpleParser.parseStatement(
                `${classInstance}.hi1 = bswap<u64>(i64.load(inputPtr, ${this.offset + 8}));`,
                this.range
            ),
            SimpleParser.parseStatement(
                `${classInstance}.lo2 = bswap<u64>(i64.load(inputPtr, ${this.offset + 16}));`,
                this.range
            ),
            SimpleParser.parseStatement(
                `${classInstance}.lo1 = bswap<u64>(i64.load(inputPtr, ${this.offset + 24}));`,
                this.range
            ),
            SimpleParser.parseStatement(`${dst} = ${classInstance}`, this.range)
        );
        this.offset += 32;
    }

    visitAddress(type: Type, dst: string): void {
        const classInstance = `_address_${this.offset}`;
        this.stmts.push(
            SimpleParser.parseStatement(`const ${classInstance} = Address.Zero;`, this.range),
            SimpleParser.parseStatement(
                `${classInstance}.hi1 = bswap<u32>(i32.load(inputPtr, ${this.offset + 12}));`,
                this.range
            ),
            SimpleParser.parseStatement(
                `${classInstance}.lo2 = bswap<u64>(i64.load(inputPtr, ${this.offset + 16}));`,
                this.range
            ),
            SimpleParser.parseStatement(
                `${classInstance}.lo1 = bswap<u64>(i64.load(inputPtr, ${this.offset + 24}));`,
                this.range
            ),
            SimpleParser.parseStatement(`${dst} = ${classInstance}`, this.range)
        );
        this.offset += 32;
    }

    visitStruct(_type: Type, _class: Class, dst: string): void {
        const classInstance = `_${_class.name}_${this.offset}`;
        this.stmts.push(
            SimpleParser.parseStatement(
                `const ${classInstance} = changetype<${_class.name}>(__new(${_class.nextMemoryOffset}, ${_class.id}));`,
                this.range
            )
        );
        for (const [name, member] of _class.members!.entries()) {
            if (isPropertyPrototype(member)) {
                const prop = member.instance;
                if (prop === null) {
                    // bad, property error
                    return this.error();
                }
                this.visit(prop.type, `${classInstance}.${name}`);
            }
        }
        this.stmts.push(SimpleParser.parseStatement(`${dst} = ${classInstance}`, this.range));
    }

    visitFunction(_type: Type): void {
        return this.error();
    }

    visitBool(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = <bool>i32.load8_u(inputPtr, ${this.offset + 31});`, this.range)
        );
        this.offset += 32;
    }

    visitI8(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = <i8>i32.load8_s(inputPtr, ${this.offset + 31});`, this.range)
        );
        this.offset += 32;
    }

    visitU8(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = <u8>i32.load8_u(inputPtr, ${this.offset + 31});`, this.range)
        );
        this.offset += 32;
    }

    visitI16(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(
                `${dst} = bswap<i16>(<i16>i32.load16_s(inputPtr, ${this.offset + 30}));`,
                this.range
            )
        );
        this.offset += 32;
    }

    visitU16(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(
                `${dst} = bswap<u16>(<u16>i32.load16_u(inputPtr, ${this.offset + 30}));`,
                this.range
            )
        );
        this.offset += 32;
    }

    visitI32(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = bswap<i32>(i32.load(inputPtr, ${this.offset + 28}));`, this.range)
        );
        this.offset += 32;
    }

    visitU32(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = bswap<u32>(i32.load(inputPtr, ${this.offset + 28}));`, this.range)
        );
        this.offset += 32;
    }

    visitI64(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = bswap<i64>(i64.load(inputPtr, ${this.offset + 24}));`, this.range)
        );
        this.offset += 32;
    }

    visitU64(_type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`${dst} = bswap<u64>(i64.load(inputPtr, ${this.offset + 24}));`, this.range)
        );
        this.offset += 32;
    }

    visitIsize(type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(
                `${dst} = bswap<isize>(isize.load(inputPtr, ${this.offset + 32 - type.byteSize}));`,
                this.range
            )
        );
        this.offset += 32;
    }

    visitUsize(type: Type, dst: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(
                `${dst} = bswap<usize>(isize.load(inputPtr, ${this.offset + 32 - type.byteSize}));`,
                this.range
            )
        );
        this.offset += 32;
    }

    visitF32(_type: Type, dst: string): void {
        this.stmts.push(SimpleParser.parseStatement(`${dst} = f32.load(inputPtr, ${this.offset + 28});`, this.range));
        this.offset += 32;
    }

    visitF64(_type: Type, dst: string): void {
        this.stmts.push(SimpleParser.parseStatement(`${dst} = f64.load(inputPtr, ${this.offset + 24});`, this.range));
        this.offset += 32;
    }

    error(): void {
        this.program.error(DiagnosticCode.Transform_0_1, this.range, "stylus-sdk-as", "Cannot deserialize type");
    }
}
