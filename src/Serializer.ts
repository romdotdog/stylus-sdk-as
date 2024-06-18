import { Program, Statement, Range, Type, Class, DiagnosticCode } from "assemblyscript/dist/assemblyscript.js";
import { TypeVisitor } from "./TypeVisitor.js";
import { SimpleParser } from "./SimpleParser.js";
import { isPropertyPrototype } from "./util.js";
import { DynamicChecker } from "./DynamicChecker.js";

interface StackItem {
    offset: number;
    item: () => void;
}

export class Serializer extends TypeVisitor<string, void> {
    private dynamicStack: StackItem[] = [];

    public inlineStruct = false; // TODO: remove
    private startOffset; // TODO: remove

    constructor(
        program: Program,
        public range: Range,
        public offset: number = 0,
        public dynamicSizeStmts: Statement[] = [],
        public stmts: Statement[] = [],
        private maxDynamicSize: string[] = [] // known after `dynamicSizeStmts`
    ) {
        super(program);
        this.startOffset = offset;
    }

    get maxSize(): string {
        return `${this.offset}${this.maxDynamicSize.map(x => ` + ${x}`).join("")}`; // add all the sizes
    }

    get size(): string {
        return `ptr - startPtr + ${this.offset}`;
    }

    visitDynamic(): void {
        this.stmts.push(SimpleParser.parseStatement(`structPtr = ptr;`, this.range));
        for (const { offset, item } of this.dynamicStack) {
            this.encodeUsizeAtOffset("structPtr", `ptr - structPtr + ${this.offset - this.startOffset}`, offset);
            item();
        }
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
        if (_class.prototype.constructorPrototype) {
            this.program.error(
                DiagnosticCode.Transform_0_1,
                this.range,
                "stylus-sdk-as",
                "Cannot serialize types with custom constructors"
            );
            return;
        }

        const dynamic = new DynamicChecker(this.program).visitStruct(_type, _class);

        if (dynamic && !this.inlineStruct) {
            console.log("queueing struct");
            this.dynamicStack.push({ offset: this.offset, item: () => this.encodeStruct(_type, _class, expr) });
            this.offset += 32;
        } else {
            this.encodeStruct(_type, _class, expr);
        }
    }

    encodeStruct(_type: Type, _class: Class, expr: string): void {
        console.log("encodeStruct", _class.name);
        const inlineStruct = this.inlineStruct;

        let serializer;

        if (inlineStruct) {
            serializer = this;
            this.inlineStruct = false;
        } else {
            serializer = new Serializer(
                this.program,
                this.range,
                this.offset,
                this.dynamicSizeStmts,
                this.stmts,
                this.maxDynamicSize
            );
        }

        for (const [name, member] of _class.members!.entries()) {
            if (isPropertyPrototype(member)) {
                const prop = member.instance;
                if (prop === null) {
                    // bad, property error
                    return this.error();
                }
                serializer.visit(prop.type, `${expr}.${name}`);
            }
        }

        if (!inlineStruct) {
            serializer.visitDynamic();
            this.offset = serializer.offset;
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
        let sizeType = this.program.options.isWasm64 ? "i64" : "i32";
        this.stmts.push(
            SimpleParser.parseStatement(
                `${sizeType}.store(ptr, bswap<isize>(${expr}), ${this.offset + 32 - type.byteSize});`,
                this.range
            )
        );
        this.offset += 32;
    }

    visitUsize(type: Type, expr: string): void {
        this.encodeUsizeAtOffset("ptr", expr, this.offset);
        this.offset += 32;
    }

    encodeUsizeAtOffset(ptr: string, expr: string, offset: number): void {
        let sizeType = this.program.options.isWasm64 ? "i64" : "i32";
        let byteSize = this.program.options.isWasm64 ? 8 : 4;
        this.stmts.push(
            SimpleParser.parseStatement(
                `${sizeType}.store(${ptr}, bswap<usize>(${expr}), ${offset + 32 - byteSize});`,
                this.range
            )
        );
    }

    visitString(type: Type, expr: string): void {
        console.log("queueing string");
        this.dynamicStack.push({ offset: this.offset, item: () => this.encodeString(type, expr) });
        this.offset += 32;
    }

    encodeString(type: Type, expr: string): void {
        let maxLen = `maxLength_${this.offset}`;
        this.maxDynamicSize.push(maxLen);
        this.dynamicSizeStmts.push(
            SimpleParser.parseStatement(`let ${maxLen} = align32(${expr}.length << 2);`, this.range)
        );

        let len = `length_${this.offset}`;

        // first write the string at `ptr + offset + 32`
        this.stmts.push(
            SimpleParser.parseStatement(
                `let ${len} = String.UTF8.encodeUnsafe(changetype<usize>(${expr}), ${expr}.length, ptr + ${
                    this.offset + 32
                }, false, String.UTF8.ErrorMode.REPLACE);`, // TODO: review this error mode
                this.range
            )
        );

        // then write the length of the string at `ptr + offset` as usize
        this.visitUsize(type, len);

        // finally, offset the pointer by the dynamic length
        this.stmts.push(SimpleParser.parseStatement(`ptr += align32(${len});`, this.range));
    }

    error(): void {
        this.program.error(DiagnosticCode.Transform_0_1, this.range, "stylus-sdk-as", "Cannot serialize type");
    }
}
