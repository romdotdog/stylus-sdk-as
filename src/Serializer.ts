import { Program, Statement, Range, Type, Class, DeclaredElement, DiagnosticCode } from "assemblyscript";
import { TypeVisitor } from "./TypeVisitor.js";
import { SimpleParser } from "./SimpleParser.js";
import { isPropertyPrototype } from "./guards.js";

// TODO: sign extend?
export class Serializer extends TypeVisitor<string, void> {
    constructor(program: Program, range: Range, public offset: number = 0, public stmts: Statement[] = []) {
        super(program, range);
    }

    visitU256(_type: Type, expr: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`i64.store(ptr, bswap<u64>(${expr}.hi2), ${this.offset});`, this.range),
            SimpleParser.parseStatement(`i64.store(ptr, bswap<u64>(${expr}.hi1), ${this.offset + 8});`, this.range),
            SimpleParser.parseStatement(`i64.store(ptr, bswap<u64>(${expr}.lo2), ${this.offset + 16});`, this.range),
            SimpleParser.parseStatement(`i64.store(ptr, bswap<u64>(${expr}.lo1), ${this.offset + 24});`, this.range)
        );
        this.offset += 32;
    }

    visitAddress(_type: Type, expr: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`i32.store(ptr, bswap<u32>(${expr}.hi1), ${this.offset + 12});`, this.range),
            SimpleParser.parseStatement(`i64.store(ptr, bswap<u64>(${expr}.lo2), ${this.offset + 16});`, this.range),
            SimpleParser.parseStatement(`i64.store(ptr, bswap<u64>(${expr}.lo1), ${this.offset + 24});`, this.range)
        );
        this.offset += 32;
    }

    visitStruct(_type: Type, _class: Class, expr: string): void {
        for (const [name, member] of _class.members!.entries()) {
            if (isPropertyPrototype(member)) {
                const prop = member.instance;
                if (prop === null) {
                    // bad, property error
                    return this.error();
                }
                this.visit(prop.type, `${expr}.${name}`);
            }
        }
    }

    visitFunction(_type: Type, _expr: string): void {
        return this.error();
    }

    visitBool(_type: Type, expr: string): void {
        this.stmts.push(SimpleParser.parseStatement(`i32.store8(ptr, ${expr}, ${this.offset + 31});`, this.range));
        this.offset += 32;
    }

    visitI8(_type: Type, expr: string): void {
        this.stmts.push(SimpleParser.parseStatement(`i32.store8(ptr, ${expr}, ${this.offset + 31});`, this.range));
        this.offset += 32;
    }

    visitU8(_type: Type, expr: string): void {
        this.stmts.push(SimpleParser.parseStatement(`i32.store8(ptr, ${expr}, ${this.offset + 31});`, this.range));
        this.offset += 32;
    }

    visitI16(_type: Type, expr: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`i32.store16(ptr, bswap<i16>(${expr}), ${this.offset + 30});`, this.range)
        );
        this.offset += 32;
    }

    visitU16(_type: Type, expr: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`i32.store16(ptr, bswap<u16>(${expr}), ${this.offset + 30});`, this.range)
        );
        this.offset += 32;
    }

    visitI32(_type: Type, expr: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`i32.store(ptr, bswap<i32>(${expr}), ${this.offset + 28});`, this.range)
        );
        this.offset += 32;
    }

    visitU32(_type: Type, expr: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`i32.store(ptr, bswap<u32>(${expr}), ${this.offset + 28});`, this.range)
        );
        this.offset += 32;
    }

    visitI64(_type: Type, expr: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`i64.store(ptr, bswap<i64>(${expr}), ${this.offset + 24});`, this.range)
        );
        this.offset += 32;
    }

    visitU64(_type: Type, expr: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(`i64.store(ptr, bswap<u64>(${expr}), ${this.offset + 24});`, this.range)
        );
        this.offset += 32;
    }

    visitIsize(type: Type, expr: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(
                `isize.store(ptr, bswap<isize>(${expr}), ${this.offset + 32 - type.byteSize});`,
                this.range
            )
        );
        this.offset += 32;
    }

    visitUsize(type: Type, expr: string): void {
        this.stmts.push(
            SimpleParser.parseStatement(
                `isize.store(ptr, bswap<usize>(${expr}), ${this.offset + 32 - type.byteSize});`,
                this.range
            )
        );
        this.offset += 32;
    }

    visitF32(_type: Type, expr: string): void {
        this.stmts.push(SimpleParser.parseStatement(`f32.store(ptr, ${expr}, ${this.offset + 28});`, this.range));
        this.offset += 32;
    }

    visitF64(_type: Type, expr: string): void {
        this.stmts.push(SimpleParser.parseStatement(`f64.store(ptr, ${expr}, ${this.offset + 24});`, this.range));
        this.offset += 32;
    }

    error(): void {
        this.program.error(DiagnosticCode.Transform_0_1, this.range, "stylus-sdk-as", "Cannot serialize type");
    }
}
